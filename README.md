# okx-ws-node
Lightweight Node.js helper to subscribe to OKX public WebSocket channels in batches.
This module opens one WebSocket connection per batch of instruments (default 5 instruments per connection), automatically reconnects with exponential backoff, and includes memory-safety measures (cleanup of listeners/timers) to avoid leaks when subscribing to many instruments.
**Main features**
- Batch subscriptions (max 5 instruments per connection)
- Exponential backoff for reconnects
- Automatic cleanup of listeners and timers to reduce memory usage
- Simple callback-based API for streaming messages

**Status**: stable for public market data use-cases. Use responsibly and respect OKX rate limits.

## Installation

Clone the repo or install as a dependency (if published):

```bash
# clone
# okx-ws-node

Lightweight, high-throughput helper for OKX public WebSocket feeds.

This repository provides a simple WebSocket consumer with several performance and safety improvements for long-running HFT-style consumers:

- Bounded, head-indexed per-connection queues to avoid O(n) shifting and unbounded memory growth.
- Batch processing and a worker-thread parser pool to offload `JSON.parse` from the main event loop.
- Tolerant JSON recovery (worker attempts to repair malformed fragments and extract objects).
- Tunable options for queue sizes, batch sizes and parser workers.
- Safe cleanup of timers, sockets and worker threads.

Files of interest
- `src/index.js` — main library: exported helpers like `OKXWsAggregate`, `IndexTickers`, `MarkPrice`, etc.
- `src/parser-worker.js` — worker used to parse/decode incoming messages (supports batch parsing and tolerant recovery).
- `index.js` — example/starter that uses `SwapCoin()` to fetch instruments and start an `OKXWsAggregate` consumer.
- `run-test.js` — small runner to exercise the flow and log memory + stats for profiling.

Requirements
- Node.js 14+ recommended (worker_threads and modern V8 performance). 16+ preferred for best stability.
- `npm install` to fetch dependencies used in the project (`ws`, `follow-redirects`, etc.).

Quick start

1. Install dependencies

```bash
npm install
```

2. Run the example consumer

```bash
node index.js
```

3. Run with GC exposed (recommended for profiling memory)

```bash
node --expose-gc index.js
```

4. Use inspector for CPU/heap profiling

```bash
node --inspect-brk --expose-gc index.js
# open chrome://inspect in Chrome
```

Library usage

Example call (from `index.js`):

```js
const { OKXWsAggregate, SwapCoin } = require('./src');

async function main() {
  const coinList = await SwapCoin(); // no param
  const groups = coinList.data.map(d => d.instId);

  OKXWsAggregate(groups, processFunction, {
    maxQueue: 5000,           // cap in-memory queue per connection
    processPerTick: 2000,     // how many messages processed per tick
    processIntervalMs: 25,    // worker tick interval (lower -> lower latency)
    parserWorkers: 2,         // offload parsing to worker threads
    parseBatchSize: 256,      // messages per IPC to worker
    dropOnFull: true,
    onStats: (s) => console.log('[ws-stats]', JSON.stringify(s))
  });
}

main();
```

Options (summary)
- `maxQueue` (number): maximum queued messages per connection (default `10000`).
- `processPerTick` (number): how many messages are processed per `processIntervalMs` tick (default `1000`).
- `processIntervalMs` (ms): interval for processing loop (default `50`).
- `parserWorkers` (number): number of worker threads for JSON parsing; 0 means synchronous parse in main thread. Default: computed from CPU.
- `parseBatchSize` (number): batch size sent per IPC to worker (default `256`). Larger improves throughput, increases latency slightly.
- `dropOnFull` (bool): when queue is full drop oldest messages (`true`) or cap queue by slicing (`false`).
- `onStats` (function): periodic report of per-connection `queued` and `dropped` counts.

Why these choices
- JSON.parse is costly and will block the event loop when message rates are high. Offloading parse to `worker_threads` and sending batches reduces the main-thread GC and CPU work.
- Batching worker IPC reduces context-switch and serialization costs.
- Head-indexed arrays avoid `Array.shift()` costs.

Tolerant parsing
- The worker tries multiple strategies when parsing fails:
  - direct `JSON.parse`
  - strip leading garbage before first `{`/`[` and retry
  - remove trailing commas like `,]` or `,}` and retry
  - join consecutive objects `}{` → `},{` and parse as an array
  - fallback extraction of balanced `{...}` blocks (respecting quoted strings) and parse each
- If reparations succeed, the worker returns parsed objects; otherwise it returns an error for that payload.

Debugging / Troubleshooting
- If you see binary blobs (`Uint8Array`) in your logs, ensure your `messageCallback` isn't `console.log`-ing Buffers directly. The library converts Buffers/Uint8Array into strings/objects before calling the callback, but you may still receive unparsed raw data if the worker couldn't recover it.
- To inspect problematic raw blobs, run with `run-test.js` and use the inspector or add a small logging hook in the worker (not recommended in production due to high I/O cost).

Profiling tips
- Start with `parserWorkers: 2` and `parseBatchSize: 256`.
- If parsing is CPU-bound, increase `parserWorkers` (up to `cpus - 1`) and benchmark.
- If latency is most important, reduce `processIntervalMs` and `parseBatchSize` but watch CPU.
- Use `node --inspect` and Chrome DevTools CPU profile to find hotspots (`JSON.parse`, worker IPC).

Next steps / Improvements you can make
- Zero-copy transfers: move to transferring ArrayBuffers to workers (requires careful buffer slicing but avoids copies).
- Native fast JSON parsers: integrate `@simdjson/simdjson` inside worker for faster parsing.
- If you control producer side, move to binary format (MessagePack/Protobuf/FlatBuffers) for smaller, faster payloads.

Contributing
- Please open issues or pull requests. Keep changes focused and benchmark any parser-related change.

License
- MIT (see `LICENSE`)


---
Generated README for the `okx-ws-node` project. If you want, I can also add a small `Makefile` or `npm` scripts to run the test and profiling commands.
# okx-ws-node
