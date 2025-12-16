# okx-ws-node

Lightweight Node.js helper to subscribe to OKX public WebSocket channels in batches — optimized for high-throughput public market data consumers.

This library opens one WebSocket connection per batch of instruments (configurable batch size), handles reconnects with exponential backoff, and applies multiple memory- and CPU-safety measures to make long-running consumers stable.

**Project layout**
- [src/index.js](src/index.js) — core library and exported helpers.
- [src/parser-worker.js](src/parser-worker.js) — tolerant JSON parser used by worker threads.
- [index.js](index.js) — small example starter.
- [run-test.js](run-test.js) — stress / profiling runner used to validate memory/throughput.

## Instalasi

```bash
npm install
```

## Ringkasan Fitur

- Batching: buka koneksi WebSocket per batch instrumen (default batch size = 20).
- Backpressure-safe queues: head-indexed arrays untuk operasi O(1) dan kontrol ukuran dengan `maxQueue`.
- Parser worker pool: offload `JSON.parse` ke worker threads dan kirimkan payload dalam batch untuk mengurangi IPC overhead.
- Tolerant parsing: `parser-worker.js` mencoba recover JSON rusak dan mengekstrak objek berguna.
- Hooks & observability: `onStats` dan `onBackpressure` untuk metrik runtime.
- Safe cleanup: mematikan timer, socket, dan worker saat exit.

## Quick Start

1) Install dependencies

```bash
npm install
```

2) Jalankan contoh

```bash
node index.js
```

3) Profiling / test runner

```bash
npm run run-test
```

## API Reference

Semua fungsi utama diekspor di `src/index.js`. Fungsi-fungsi ini memulai koneksi WebSocket ke kanal OKX yang relevan dan menerima callback pesan.

- `OKXWsAggregate(coinArray, messageCallback, options)` — subscribe ke kanal `aggregated-trades`.
- `OKXWsIndexTickers(coinArray, messageCallback, options)` — subscribe ke kanal `index-tickers`.
- `OKXWsMarkPrice(coinArray, messageCallback, options)` — subscribe ke kanal `mark-price`.
- `OKXWsTickers(coinArray, messageCallback, options)` — subscribe ke kanal `tickers`.
- `OKXWsOptimizedBooks(coinArray, messageCallback, options)` — subscribe ke kanal `optimized-books`.
- `OKXWsFundingRate(coinArray, messageCallback, options)` — subscribe ke kanal `funding-rate`.

Kembalian dari fungsi-fungsi `OKXWs*` adalah objek kontrol dengan minimal API:

- `close()` — hentikan koneksi dan bersihkan resource.
- `getStats()` — dapatkan statistik antrian per-batch (queued/dropped).

Alias helper (fetch instrumen):

- `SpotCoin()` — ambil daftar produk SPOT dari OKX.
- `SwapCoin()` — ambil daftar produk SWAP dari OKX.
- `FuturesCoin()` — ambil daftar produk FUTURES dari OKX.

Helper convenience wrappers (memanggil `OKXWs*` lalu meneruskan pesan ke `processFunction`):

- `Aggregate(initialGroups, processFunction)`
- `IndexTickers(initialGroups, processFunction)`
- `MarkPrice(initialGroups, processFunction)`
- `Tickers(initialGroups, processFunction)`
- `OptimizedBooks(initialGroups, processFunction)`

### Contoh penggunaan

```js
const { OKXWsAggregate, SwapCoin } = require('./src');

async function main() {
  const coinList = await SwapCoin();
  if (!coinList || coinList.status !== 200) throw new Error('failed to fetch swaps');

  const groups = coinList.data.map(d => d.instId);

  const controller = await OKXWsAggregate(groups, (message) => {
    // lakukan pemrosesan ringan dan non-blocking di sini
  }, {
    maxQueue: 5000,
    processPerTick: 2000,
    processIntervalMs: 25,
    parserWorkers: 2,
    parseBatchSize: 256,
    dropOnFull: true,
    parserTimeoutMs: 10000,
    onStats: (s) => console.log('[ws-stats]', JSON.stringify(s)),
    onBackpressure: ({ key, size }) => console.warn('backpressure', key, size)
  });

  // controller.close(); // hentikan ketika perlu
}

main();
```

## Opsi (ringkasan dan nilai default)

- `maxQueue` (number) — maksimum pesan yang disimpan per koneksi (default `10000`).
- `processPerTick` (number) — berapa banyak pesan diproses tiap tick (default `1000`).
- `processIntervalMs` (number) — interval pemrosesan (ms) (default `50`).
- `statsIntervalMs` (number) — interval pelaporan `onStats` (ms) (default `60000`).
- `parserWorkers` (number) — jumlah worker threads untuk parsing; jika `0`, parsing dilakukan sinkron di main thread. Default: dihitung dari CPU jika tidak di-set.
- `parseBatchSize` (number) — ukuran batch yang dikirim ke worker untuk parsing (default `256`).
- `parserTimeoutMs` (number) — timeout ms sebelum callback parser dianggap gagal (default `10000`).
- `dropOnFull` (boolean) — saat antrian penuh, `true` = drop terlama (default `true`), `false` = potong slice terakhir.
- `onStats` (function) — callback periodik menerima objek stats per-batch.
- `onBackpressure` (function) — dipanggil saat antrian > ~90% `maxQueue`.

## Desain & Perilaku Penting

- Queue menggunakan head-indexed array untuk menghindari biaya `Array.shift()` dan memungkinkan kompaksi periodik.
- Payload diterima sebagai Buffer/Uint8Array bila memungkinkan dan hanya diubah menjadi string/JSON di tahap parsing.
- Jika worker threads tersedia, parsing dilakukan asinkron di worker untuk mengurangi GC dan beban CPU pada main thread.
- Koneksi melakukan reconnect dengan exponential backoff; subscribe message di-cache per-batch untuk efisiensi.

## Parser Worker (tolerant parsing)

`src/parser-worker.js` mencoba beberapa teknik untuk memulihkan atau mengekstrak objek JSON dari payload yang bermasalah:

- Parsing cepat `JSON.parse`.
- Menghapus karakter sebelum `{` atau `[` pertama.
- Memperbaiki trailing commas.
- Menggabungkan objek-objek terpisah menjadi array.
- Mengekstrak objek berimbang dari payload bila mungkin.

Hasil parsing bisa berupa objek tunggal, array objek (untuk batch), atau error.

## Debugging & Profiling

- Gunakan `run-test.js` untuk contoh runner yang memonitor memory dan statistik.
- Untuk profiling mendalam jalankan Node dengan flag `--inspect` dan/atau `--expose-gc`.

## Contoh menjalankan profiling

```bash
node --inspect-brk --expose-gc run-test.js
```

## Kontribusi

Silakan buka issue atau PR. Perubahan pada parser harus disertai benchmark sederhana.

## Lisensi

MIT (lihat LICENSE)
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
