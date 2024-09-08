const WebSocket = require('ws');
var https = require('follow-redirects').https;
var fs = require('fs');
var dns = require('dns');

let reconnectInterval = 3000; // millisecond

async function OKXWsAggregate(CoinArray, messageCallback) {
    let Ws = 'wss://wspri.okx.com:8443/ws/v5/ipublic';
    let ws;

    function GetJsonArray(coinName) {
        return `{"op":"subscribe","args":[{"channel":"aggregated-trades","instId":"${coinName.toUpperCase()}"}]}`
    }

    const WsSend = CoinArray.length > 0
        ? CoinArray.map(d => GetJsonArray(d))
        : [GetJsonArray("BTC-USDT")];

    function connectWebSocket() {
        ws = new WebSocket(Ws);

        ws.on('open', function open() {
            WsSend.forEach(d => {
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send(d);
                }
            });
        });

        ws.on('close', function () {
            const message = '{message:"ws close"}';
            messageCallback(message);
            setTimeout(connectWebSocket, reconnectInterval);
        });

        ws.on('error', function (error) {
            setTimeout(connectWebSocket, reconnectInterval);
            const errorMessage = '{message:"ws error"}';
            messageCallback(errorMessage);
        });

        ws.on('message', function incoming(data) {
            if (data !== "Connected") {
                const parsedData = JSON.parse(data);
                messageCallback(parsedData);
            }
        });
    }

    connectWebSocket();
}

function SpotCoin() {
    return new Promise((resolve, reject) => {
        
        // Custom DNS resolution
        const customLookup = (hostname, options, callback) => {
          if (hostname === 'www.okx.com') {
            callback(null, '104.18.43.174', 4); // Using the provided IP address
          } else {
            dns.lookup(hostname, options, callback); // Fallback to the default DNS lookup
          }
        };
        
        var options = {
          'method': 'GET',
          'hostname': 'www.okx.com',
          'path': `/priapi/v5/public/simpleProduct?instType=SPOT&includeType=1&t=${Date.now()}`,
          'lookup': customLookup,  // Use the custom DNS lookup function
          'maxRedirects': 10,
          'timeout': 9000
        };
        
        const req = https.request(options, (res) => {
            let data = '';

            res.on('data', (chunk) => {
                data += chunk;
            });

            res.on('end', () => {
                resolve({status: 200, data:JSON.parse(data).data,message:'success' });
            });
        });

        req.on('error', (e) => {
            resolve({status: 500, message:e });
        });

        req.on('timeout', () => {
            resolve({status: 408,message:'timeout'});
            req.destroy();
        });

        req.end();
    });
}

async function startListening(initialGroups, processFunction) {
    // Memulai WebSocket dan menerima pesan secara streaming
    OKXWsAggregate(initialGroups, (message) => {
        processFunction(message);
    });
}

// Export the OKXWsAggregate function
module.exports = { OKXWsAggregate,SpotCoin,startListening };
