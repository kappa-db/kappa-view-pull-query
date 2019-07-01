# Kappa View Query

> provides a querying interface for custom indexes – using [map-filter-reduce](https://github.com/dominictarr/map-filter-reduce) and [flumeview-query](https://github.com/flumedb/flumeview-query) – as a kappa-core materialised view.

## Usage

```js
const kappa = require('kappa-core')
const View = require('kappa-view-query')
const ram = require('random-access-memory')

const memdb = require('memdb')
const level = require('level') 

const pull = require('pull-stream')

const core = kappa(ram, { valueEncoding: 'json'  })

// either memdb for a memoryDown level instance, or
// write indexes to a leveldb instance stored as files 
const db = memdb() || level('/tmp/db')

// example indexes, brought over from ssb-query 
const indexes = [
  // indexes all messages from all feeds by timestamp 
  { key: 'log', value: ['value', 'timestamp'] },
  // indexes all messages from all feeds by message type, then by timestamp 
  { key: 'typ', value: [['value', 'type'], ['value', 'timestamp']] }
] 

core.use('query', View(db, core, { indexes })) 

core.ready(function () {
  core.writer(function (err, feed) => {
    // append messages to feed in the 'wrong' order
    const data = [{
      type: 'chat/message',
      timestamp: Date.now(),
      content: { body: 'First message' } 
    }, {
      type: 'user/about',
      timestamp: Date.now(),
      content: { name: 'Grace' }
    }, {
    }, {
      type: 'chat/message',
      timestamp: Date.now() + 2,
      content: { body: 'Third message' } 
    }, {
      type: 'chat/message',
      timestamp: Date.now() + 1,
      content: { body: 'Second message' } 
    }, {
      type: 'user/about',
      timestamp: Date.now(),
      content: { name: 'Poison Ivy' }
    }]

    feed.append(data)
  })

  // use the second index ('typ') that was passed when initialising the view to
  // get all messages of type 'chat/message', and order by timestamp
  const query = [{ $filter: { value: { type: 'chat/message' } } }]

  pull(
    core.api.query.read({ live: true, reverse: true, query }),
    pull.collect((err, msgs) => {
      console.log(msgs)
      // [{
      //   type: 'chat/message',
      //   timestamp: Date.now(),
      //   content: { body: 'First message' } 
      // }, {
      //   type: 'chat/message',
      //   timestamp: ...,
      //   content: { body: 'Second message' } 
      // }, {
      //   type: 'chat/message',
      //   timestamp: ...,
      //   content: { body: 'Third message' } 
      // }]
    })
  )
})
```

## API

```
const View = require('kappa-view-query') 
```

Expects a LevelUP or LevelDOWN instance `leveldb`.

## Install

```bash
$ npm install kappa-view-query 
```

## Acknowledgments 
kappa-view-query was inspired by flumeview-query and programmed by [@kieran](https://github.com/KGibb8/) and [@dominictarr](https://github.com/dominictarr).