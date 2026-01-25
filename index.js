const { ApiPublic,SpotCoin,FuturesCoin,SwapCoin,Aggregate,IndexTickers,Tickers,MarkPrice,OptimizedBooks,OKXWsFundingRate } = require('./src');

// Fungsi untuk memproses setiap pesan yang diterima dari WebSocket
function processFunction(message) {
    console.log(message);
 }

async function name(params) {
  const coinList = await ApiPublic.Instrument('swap',1);

  if(coinList.code == '0'){
    Aggregate(coinList.data.map(d=> d.instId ), processFunction);
    // console.log(coinList)

  }else{
    console.log(coinList)
  }
 
}


name('sad')

 
