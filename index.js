const { ApiPublic, SpotCoin, FuturesCoin, SwapCoin, Aggregate, IndexTickers, Tickers, MarkPrice, OptimizedBooks, OKXWsFundingRate } = require('./src');

// Fungsi untuk memproses setiap pesan yang diterima dari WebSocket
function processFunction(message) {
  // console.log(message);
}

async function name(params) {
  const coinList = await ApiPublic.Instrument('swap', 1);

  if (coinList.code == '0') {

    Aggregate(coinList.data.map(d => d.instId).slice(0,900), processFunction, {
      parserWorkers: 2,
      processIntervalMs: 10,
      processPerTick: 3000,
      onStats: s => console.log('STATS', s),
      onBackpressure: b => console.warn('BP', b)
    });

    // console.log(coinList)

  } else {
    console.log(coinList)
  }

}


name('sad')