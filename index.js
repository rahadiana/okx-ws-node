const { startListening,SpotCoin } = require('./src');

// Fungsi untuk memproses setiap pesan yang diterima dari WebSocket
function processFunction(message) {
    console.log(message);
 }

async function name(params) {
  const coinList = await SpotCoin('asd')

  if(coinList.status == 200){
    startListening(coinList.data.map(d=> d.instId ), processFunction);

  }else{
    console.log(coinList)
  }
 
}


name('sad')

 