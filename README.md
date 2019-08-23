# Kappa View Query

> provides a querying interface for custom indexes – inspired by [ssb-query](https://github.com/ssbc/ssb-query) which uses [map-filter-reduce](https://github.com/dominictarr/map-filter-reduce) and [flumeview-query](https://github.com/flumedb/flumeview-query) – as a kappa-core materialised view.

## Usage

```js
const kappa = require('kappa-core')
const Query = require('kappa-view-pull-query')
const ram = require('random-access-memory')

const memdb = require('memdb')
const level = require('level') 

const pull = require('pull-stream')

const core = kappa(ram, { valueEncoding: 'json'  })

// either memdb for a memoryDown level instance, or
// write indexes to a leveldb instance stored as files 
const db = memdb() || level('/tmp/db')

// custom validator enabling you to write your own message schemas
const validator = function (msg) {
  if (typeof msg !== 'object') return null
  if (typeof msg.value !== 'object') return null
  if (typeof msg.value.timestamp !== 'number') return null
  if (typeof msg.value.type !== 'string') return null
  return msg
}

// some example indexes, ported over from ssb-query
const indexes = [
  // indexes all messages from all feeds by timestamp 
  { key: 'log', value: ['value', 'timestamp'] },
  // indexes all messages from all feeds by message type, then by timestamp 
  { key: 'typ', value: [['value', 'type'], ['value', 'timestamp']] }
] 

core.use('query', Query(db, core, { indexes, validator })) 

core.ready(() => {
  core.writer('local', (err, feed) => {
    // append messages to feed in the 'wrong' order
    const data = [{
      type: 'chat/message',
      timestamp: 1561996331739,
      content: { body: 'First message' } 
    }, {
      type: 'user/about',
      timestamp: 1561996331739,
      content: { name: 'Grace' }
    }, {
    }, {
      type: 'chat/message',
      timestamp: 1561996331741,
      content: { body: 'Third message' } 
    }, {
      type: 'chat/message',
      timestamp: 1561996331740,
      content: { body: 'Second message' } 
    }, {
      type: 'user/about',
      timestamp: 1561996331754,
      content: { name: 'Poison Ivy' }
    }]

    feed.append(data)
  })

  // get all messages of type 'chat/message', and order by timestamp
  const query = [{ $filter: { value: { type: 'chat/message' } } }]

  pull(
    // the view will use flumeview-query's scoring system to choose 
    // the most relevant index, in this case, the second index – 'typ'
    core.api.query.read({ live: true, reverse: true, query }),
    pull.drain(console.log)
  )

  // logs each message filtered by type then ordered by timestamp 
  // {
  //   key: 'd20dff5a33bbd35596bf355ece0142af2e81aebf192dcbccbc672b964fb374d7',
  //   seq: 3,
  //   value: {
  //     type: 'chat/message',
  //       timestamp: 1561996331741,
  //       content: { body: 'Third message'  }
  //   }
  // }
  // {
  //   key: 'd20dff5a33bbd35596bf355ece0142af2e81aebf192dcbccbc672b964fb374d7',
  //   seq: 4,
  //   value: {
  //     type: 'chat/message',
  //       timestamp: 1561996331740,
  //       content: { body: 'Second message'  }
  //   }
  // }
  // {
  //   key: 'd20dff5a33bbd35596bf355ece0142af2e81aebf192dcbccbc672b964fb374d7',
  //   seq: 0,
  //   value: { type: 'chat/message',
  //       timestamp: 1561996331739,
  //       content: { body: 'First message'  }
  //   }
  // }
})
```

## API

```
const View = require('kappa-view-pull-query')
```

Expects a LevelUP or LevelDOWN instance `leveldb`.

```js
// returns a source to be used by pull-stream
core.api.query.read(opts)

// returns information about index performance
core.api.query.explain(opts)

// append an index onto existing set
core.api.query.add(opts)
```

## Install

```bash
$ npm install kappa-view-pull-query
```

## Acknowledgments
kappa-view-pull-query was inspired by flumeview-query and programmed by [@kieran](https://github.com/KGibb8/) and [@dominictarr](https://github.com/dominictarr).
