# okx-ws-node
Lightweight Node.js helper to subscribe to OKX public WebSocket channels in batches.

This module opens one WebSocket connection per batch of instruments (batch size configurable), automatically reconnects with exponential backoff, and includes memory-safety measures (cleanup of listeners/timers) to avoid leaks when subscribing to many instruments.

Main features
- Bounded, head-indexed per-connection queues (avoid Array.shift cost and unbounded growth).
- Batch processing and a worker-thread parser pool to offload `JSON.parse` from the main event loop.
- Tolerant JSON recovery in the worker (attempts to repair malformed fragments and extract objects).
- Tunable options and operational hooks for stats and backpressure.
- Safe cleanup of timers, sockets and worker threads.

Status: stable for public market data use-cases. Use responsibly and respect OKX rate limits.

## Installation

```bash
npm install
```

Files of interest
- `src/index.js` — main library (helpers like `OKXWsAggregate`, `OKXWsIndexTickers`, `OKXWsMarkPrice`, etc.).
- `src/parser-worker.js` — worker that parses incoming messages (supports batch parsing and tolerant recovery).
- `index.js` — example/starter that fetches instruments and starts a consumer.
- `run-test.js` — runner that logs memory and stats for profiling.

Requirements
- Node.js 14+ recommended; Node.js 16+ preferred. Worker threads are used when available.

Quick start

1. Install dependencies

```bash
npm install
```

2. Run the example consumer

```bash
node index.js
```

3. Run the test runner (includes memory logging)

```bash
npm run run-test
```

Library usage

Example (modern usage — `OKXWs*` returns a control object with `close()` and `getStats()`):

```js
const { OKXWsAggregate, SwapCoin } = require('./src');

async function main() {
  const coinList = await SwapCoin();
  const groups = coinList.data.map(d => d.instId);

  const controller = await OKXWsAggregate(groups, (message) => {
    // minimal, non-blocking processing here
    // message may be object or string
  }, {
    maxQueue: 5000,
    processPerTick: 2000,
    processIntervalMs: 25,
    parserWorkers: 2,
    parseBatchSize: 256,
    dropOnFull: true,
    parserTimeoutMs: 10000, // ms to wait for worker response before fallback
    onStats: (s) => console.log('[ws-stats]', JSON.stringify(s)),
    onBackpressure: ({ key, size }) => console.warn('backpressure', key, size)
  });

  // later, to stop:
  // controller.close();
}

main();
```

Important behavior changes / operational notes
- The library now skips tiny heartbeat messages (e.g. `pong`/`ping`) before enqueueing to reduce unnecessary load.
- Subscribe messages are cached per-batch to avoid repeated `JSON.stringify` on reconnect.
- Worker threads (when available) are `unref()`-ed and each parser task has a timeout (`parserTimeoutMs`) to avoid leaking callbacks if a worker dies.
- `onBackpressure` hook is called when a queue grows near capacity (default threshold ~90%).

Options (summary)
- `maxQueue` (number): maximum queued messages per connection (default `10000`).
- `processPerTick` (number): how many messages are processed per `processIntervalMs` tick (default `1000`).
- `processIntervalMs` (ms): interval for processing loop (default `50`).
- `parserWorkers` (number): number of worker threads for JSON parsing; 0 means synchronous parse in main thread. Default: computed from CPU.
- `parseBatchSize` (number): batch size sent per IPC to worker (default `256`).
- `dropOnFull` (bool): when queue is full drop oldest messages (`true`) or cap queue by slicing (`false`).
- `onStats` (function): periodic report of per-connection `queued` and `dropped` counts.
- `onBackpressure` (function): called when queue size exceeds ~90% of `maxQueue`.
- `parserTimeoutMs` (number): ms to wait for worker reply before calling callback with `{ error: 'parser timeout' }` (default `10000`).

Why these choices
- Offloading JSON.parse to workers and batching IPC reduces main-thread CPU and GC pressure.
- Head-indexed arrays avoid `Array.shift()` costs and keep queue operations O(1).

Tolerant parsing
- See `src/parser-worker.js` for details. Worker tries multiple strategies to recover malformed JSON and can return arrays of parsed objects for a batch.

Debugging / Troubleshooting
- Use `run-test.js` and `onStats`/`onBackpressure` hooks for runtime visibility.
- If you need deep profiling, run with `--inspect`/`--expose-gc` and take heap snapshots.

Contributing
- Open issues or PRs. Benchmark parser changes.

License
- MIT (see `LICENSE`)
