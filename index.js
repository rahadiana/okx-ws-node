const { ApiPublic,OKXWsFundingRate,SpotCoin,FuturesCoin,SwapCoin,Aggregate,IndexTickers,Tickers,MarkPrice,OptimizedBooks } = require('./src');

// Fungsi untuk memproses setiap pesan yang diterima dari WebSocket
function processFunction(message) {
    console.log(message);
 }

async function name(params) {
  const coinList = await ApiPublic.Instrument('swap',1);

  if(coinList.status == 200){
    Tickers(coinList.data.map(d=> d.instId ), processFunction);
    // console.log(coinList)

  }else{
    console.log(coinList)
  }
 
}


name('sad')

 
