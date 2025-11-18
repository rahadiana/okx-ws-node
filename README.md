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
git clone https://github.com/rahadiana/okx-ws-node.git

# if published to npm
# npm install okx-ws-node
```

## Quick Start

Example usage (from the repository root):

```javascript
const {
	OKXWsAggregate,
	SpotCoin,
	SwapCoin,
	FuturesCoin,
	Aggregate,
	IndexTickers,
	Tickers,
	MarkPrice,
	OptimizedBooks
} = require('./src'); // or require('okx-ws-node') when installed

function processFunction(message) {
	console.log(message);
}

async function start() {
	// Example: fetch swap instruments and subscribe to aggregated-trades
	const coinList = await SwapCoin();
	if (coinList.status === 200) {
	const instIds = coinList.data.map(d => d.instId);
	// OKXWsAggregate will split instIds into batches of 5 and open one WS per batch
	OKXWsAggregate(instIds, processFunction);
	} else {
	console.error('Failed to fetch instruments:', coinList);
	}
}

start();
```

## Exported functions

- `OKXWsAggregate(CoinArray, messageCallback)` — subscribe to `aggregated-trades` for the instruments in `CoinArray`.
- `OKXWsIndexTickers(CoinArray, messageCallback)` — subscribe to `index-tickers`.
- `OKXWsMarkPrice(CoinArray, messageCallback)` — subscribe to `mark-price`.
- `OKXWsTickers(CoinArray, messageCallback)` — subscribe to `tickers`.
- `OKXWsOptimizedBooks(CoinArray, messageCallback)` — subscribe to `optimized-books`.
- `SpotCoin()` — returns a promise resolving to `{ status, data, message }` with instrument list for SPOT.
- `SwapCoin()` — same for SWAP instruments.
- `FuturesCoin()` — same for FUTURES instruments.
- `Aggregate(initialGroups, processFunction)` — convenience wrapper to start `aggregated-trades` streaming.
- `IndexTickers(initialGroups, processFunction)` — convenience wrapper for `index-tickers`.
- `MarkPrice(initialGroups, processFunction)` — convenience wrapper for `mark-price`.
- `Tickers(initialGroups, processFunction)` — convenience wrapper for `tickers`.
- `OptimizedBooks(initialGroups, processFunction)` — convenience wrapper for `optimized-books`.

All WebSocket functions accept:
- `CoinArray`: array of instrument strings (e.g. `['BTC-USDT','ETH-USDT']`). If empty or not provided, defaults to `['BTC-USDT']`.
- `messageCallback`: function called for every received message or internal event.

## Message format

- Messages received from OKX (JSON) are parsed and forwarded to `messageCallback` as objects.
- Internal events (close/error) are forwarded as objects, e.g.

```json
{ "message": "ws close", "batch": ["BTC-USDT","ETH-USDT"], "code": 1006, "reason": "" }

{ "message": "ws error", "error": "ECONNRESET", "batch": ["..."] }
```

If you prefer string-only events, adjust your `messageCallback` accordingly or modify the code to stringify internal events.

## Batching & memory optimizations

- The implementation splits the requested instruments into batches of up to 5 instruments and opens one WebSocket per batch. This reduces the number of connections while keeping subscribe payloads reasonably small.
- Each batch sends a single combined subscribe message (one JSON with multiple args) to reduce allocation and network overhead.
- Connections are tracked in a Map; before reconnecting the previous socket is terminated and its listeners removed to avoid accumulating event handlers.
- An exponential backoff (capped at 30s) is used for reconnect attempts to avoid busy restart loops and excessive resource use.

## Configuration

Currently batch size and other internals are hard-coded in `src/index.js`:
- `BATCH_SIZE` is set to `5`.
- `reconnectInterval` is defined at the top of `src/index.js` (default `500` ms) and used as the base backoff.

If you need runtime configuration, consider modifying `src/index.js` to accept an options object or submit a PR.

## Error handling

- Network, timeout, and JSON parse errors are forwarded to `messageCallback` as objects. Inspect `message` or `error` fields to determine the type.
- The HTTP helper functions (`SpotCoin`, `SwapCoin`, `FuturesCoin`) resolve with `{ status, data?, message }` where `status` can be `200` on success or an error code on failure.

## Development & testing

To run a quick smoke test, edit `index.js` at the repo root or create a small script using the Quick Start example above, then run:

```bash
node index.js
```

Make sure you have dependencies installed (the repo uses `ws` and `follow-redirects`):

```bash
npm install
```

## Contributing

If you want features (configurable batch size, pause/resume, metrics, or TypeScript types), open an issue or send a PR. Keep changes small and add tests/examples.

## License

This project is provided under the repository license — see `LICENSE`.

## Contact

Open issues or PRs on the GitHub repository: https://github.com/rahadiana/okx-ws-node

# okx-ws-node
okx-ws-node
