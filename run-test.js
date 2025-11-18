const { OKXWsAggregate, SwapCoin } = require('./src');

// Lightweight message processor for high-throughput
let msgCount = 0;
function processFunction(message) {
  msgCount++;
  // keep processing minimal — avoid heavy sync work or unbounded in-memory storage
  if ((msgCount & 0x3FFF) === 0) { // sample log roughly every 16384 messages
    if (typeof message === 'object') console.log('sample:', JSON.stringify(message).slice(0, 200));
    else console.log('sample:', String(message).slice(0, 200));
  }
}

async function main() {
  try {
    const coinList = await SwapCoin(); // no param
    if (coinList && coinList.status === 200 && Array.isArray(coinList.data)) {
      const groups = coinList.data.map(d => d.instId);

      OKXWsAggregate(groups, processFunction, {
        maxQueue: 5000,
        processPerTick: 2000,
        processIntervalMs: 25,
        parserWorkers: 2,
        dropOnFull: true,
        onStats: (s) => console.log('[ws-stats]', JSON.stringify(s))
      });

      // optional memory logging (run with --expose-gc to force GC)
      setInterval(() => {
        if (global.gc) global.gc();
        const mu = process.memoryUsage();
        console.log('[mem]', Math.round(mu.heapUsed/1024/1024) + 'MB', 'count', msgCount);
      }, 15000);

    } else {
      console.error('Failed to load swap coins:', coinList);
      process.exit(1);
    }
  } catch (err) {
    console.error('Fatal error in main:', err);
    process.exit(2);
  }
}

main();


