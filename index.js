const toPull = require('stream-to-pull-stream')
const defer = require('pull-defer')
const pull = require('pull-stream')
const memdb = require('memdb')
const charwise = require('charwise')
const FlumeViewQuery = require('flumeview-query/inject')
const many = require('pull-many')
const { EventEmitter } = require('events')
const debug = require('debug')('kappa-view-pull-query')

module.exports = function KappaViewQuery (db, opts = {}) {
  var events = new EventEmitter()

  var {
    indexes = [],
    validator = (msg) => msg,
    keyEncoding = charwise,
  } = opts

  var query
  var view = {
    maxBatch: opts.maxBatch || 100,

    map: (msgs, next) => {
      const ops = []

      msgs.forEach((msg) => {
        if (!validator(msg)) return
        var msgId = `${msg.key}@${msg.seq}`

        indexes.forEach((idx) => {
          var indexKeys = getIndexValues(msg, idx.value)

          if (indexKeys.length) {
            ops.push({
              type: 'put',
              key: [idx.key, ...indexKeys],
              value: msgId,
              keyEncoding,
            })
          }

          function getIndexValues (msg, value) {
            var child = value[0]
            if (Array.isArray(child)) {
              return value
                .map((val) => getIndexValues(msg, val))
                .reduce((acc, arr) => [...acc, ...arr], [])
                .filter(Boolean)
            } else if (typeof child === 'string') {
              return [value.reduce((obj, val) => obj[val], msg)]
                .filter(Boolean)
            } else return []
          }
        })
      })

      debug(`[INDEXING] ${JSON.stringify(ops)}`)

      db.batch(ops, next)
    },
    indexed: (msgs) => {
      msgs.forEach((msg) => events.emit('update', msg))
    },
    api: {
      read: (core, _opts) => {
        var __opts = view.api.explain(core, _opts)
        var source = __opts.createStream(__opts)
        return source
      },
      explain: (core, _opts) => {
        query = query || FlumeViewQuery({
          stream: (__opts) => {
            var source = defer.source()
            core.ready(() => {
              source.resolve(
                pull(
                  many(
                    core.feeds().map((feed) => (
                      pull(
                        toPull(feed.createReadStream(_opts)),
                        pull.map((value) => ({ value }))
                      )
                    ))
                  )
                )
              )
            })
            return source
          }
        }, indexes.map((idx) => ({
          key: idx.key,
          value: idx.value,
          exact: 'boolean' === typeof idx.exact ? idx.exact : false,
          createStream: (_opts) => (
            pull(
              toPull(db.createReadStream(Object.assign(_opts, {
                lte: [idx.key, ..._opts.lte],
                gte: [idx.key, ..._opts.gte],
                keyEncoding,
                keys: true,
                values: true
              }))),
              pull.asyncMap((msg, next) => {
                var msgId = msg.value
                var [ feedId, sequence ] = msgId.split('@')
                var feed = core._logs.feed(feedId)
                var seq = Number(sequence) 

                feed.get(seq, (err, value) => {
                  if (err) return next(err)

                  next(null, {
                    key: feed.key.toString('hex'),
                    seq,
                    value
                  })
                })
              })
            )
          )
        })))

        return query.explain(_opts)
      },
      add: (core, _opts) => {
        if(!(opts && isFunction(opts.createStream) && Array.isArray(opts.index || opts.value))) {
          throw new Error('kappa-view-pull-query.add: expected { index, createStream }')
        }
        opts.value = opts.index || opts.value
        indexes.push(opts)
        events.emit('add-index')
      },
      events
    },
    onUpdate: (core, cb) => {
      events.on('update', cb)
    },
    storeState: (state, cb) => {
      state = state.toString('base64')
      db.put('state', state, cb)
    },
    fetchState: (cb) => {
      db.get('state', function (err, state) {
        if (err && err.notFound) cb()
        else if (err) cb(err)
        else cb(null, Buffer.from(state, 'base64'))
      })
    }
  }

  return view
}

function isFunction (variable) {
  return typeof variable === 'function'
}
