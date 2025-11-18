const WebSocket = require('ws');
var https = require('follow-redirects').https;
var fs = require('fs');
var dns = require('dns');

let reconnectInterval = 500; // millisecond

async function WsConnection(CoinArray, ChannelType, messageCallback) {
    const Ws = 'wss://wspri.okx.com:8443/ws/v5/ipublic';

    // If no coins provided, default to BTC-USDT
    const coins = (Array.isArray(CoinArray) && CoinArray.length > 0) ? CoinArray : ["BTC-USDT"];
    const BATCH_SIZE = 5;

    function chunkArray(arr, size) {
        const chunks = [];
        for (let i = 0; i < arr.length; i += size) {
            chunks.push(arr.slice(i, i + size));
        }
        return chunks;
    }

    const batches = chunkArray(coins, BATCH_SIZE);

    // Build single subscribe message per batch (reduces allocations and messages)
    function buildSubscribeMessage(batchCoins) {
        const args = batchCoins.map(inst => ({ channel: ChannelType, instId: inst.toUpperCase() }));
        return JSON.stringify({ op: 'subscribe', args });
    }

    // Track connections so we can cleanup and avoid leaking timers/listeners
    const connections = new Map(); // key: batchKey string -> { ws, timer, backoff }

    function createConnection(batchCoins) {
        const key = batchCoins.join(',');
        let conn = connections.get(key) || { ws: null, timer: null, backoff: reconnectInterval };

        function connect() {
            // clear previous timer if any
            if (conn.timer) {
                clearTimeout(conn.timer);
                conn.timer = null;
            }

            // Clean up old websocket listeners/instance to avoid leaks
            if (conn.ws) {
                try {
                    conn.ws.removeAllListeners();
                    conn.ws.terminate();
                } catch (e) {}
                conn.ws = null;
            }

            const ws = new WebSocket(Ws);
            conn.ws = ws;

            ws.once('open', () => {
                // reset backoff after successful open
                conn.backoff = reconnectInterval;
                const subscribeMsg = buildSubscribeMessage(batchCoins);
                if (ws.readyState === WebSocket.OPEN) ws.send(subscribeMsg);
            });

            ws.on('message', (data) => {
                if (data !== 'Connected') {
                    try {
                        const parsed = JSON.parse(data);
                        messageCallback(parsed);
                    } catch (e) {
                        // forward raw if not JSON
                        messageCallback(data);
                    }
                }
            });

            const scheduleReconnect = () => {
                // exponential backoff to avoid busy reconnect loops
                conn.backoff = Math.min(conn.backoff * 2, 30000);
                if (conn.timer) clearTimeout(conn.timer);
                conn.timer = setTimeout(connect, conn.backoff);
            };

            ws.once('close', (code, reason) => {
                messageCallback({ message: 'ws close', batch: batchCoins, code, reason });
                scheduleReconnect();
            });

            ws.once('error', (err) => {
                messageCallback({ message: 'ws error', error: err && err.message ? err.message : err, batch: batchCoins });
                // schedule reconnect (if not already scheduled)
                if (!conn.timer) scheduleReconnect();
            });
        }

        connections.set(key, conn);
        connect();
    }

    // Start connections for each batch
    batches.forEach(batch => createConnection(batch));

    // Ensure cleanup on process exit to free timers and sockets
    function cleanup() {
        connections.forEach((conn) => {
            if (conn.timer) clearTimeout(conn.timer);
            if (conn.ws) {
                try {
                    conn.ws.removeAllListeners();
                    conn.ws.terminate();
                } catch (e) {}
            }
        });
        connections.clear();
    }

    if (typeof process !== 'undefined' && process && process.once) {
        process.once('exit', cleanup);
        process.once('SIGINT', () => { cleanup(); process.exit(0); });
    }
}

async function OKXWsAggregate(CoinArray, messageCallback) {
    const ChannelType = 'aggregated-trades';
    WsConnection(CoinArray, ChannelType, messageCallback);
}

async function OKXWsIndexTickers(CoinArray, messageCallback) {
    const ChannelType = 'index-tickers';
    WsConnection(CoinArray, ChannelType, messageCallback);
}

async function OKXWsMarkPrice(CoinArray, messageCallback) {
    const ChannelType = 'mark-price';
    WsConnection(CoinArray, ChannelType, messageCallback);
}

async function OKXWsTickers(CoinArray, messageCallback) {
    const ChannelType = 'tickers';
    WsConnection(CoinArray, ChannelType, messageCallback);
}

async function OKXWsOptimizedBooks(CoinArray, messageCallback) {
    const ChannelType = 'optimized-books';
    WsConnection(CoinArray, ChannelType, messageCallback);
}


function GetCoinName($TYPE) {
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
            'path': `/priapi/v5/public/simpleProduct?instType=${$TYPE}&includeType=1&t=${Date.now()}`,
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
                resolve({ status: 200, data: JSON.parse(data).data, message: 'success' });
            });
        });

        req.on('error', (e) => {
            resolve({ status: 500, message: e });
        });

        req.on('timeout', () => {
            resolve({ status: 408, message: 'timeout' });
            req.destroy();
        });

        req.end();
    });
}


function SpotCoin() {
    return new Promise((resolve, reject) => {

        GetCoinName('SPOT').then(result => {
            resolve(result);
        }).catch(error => {
            reject(error);
        });
    });
}


function SwapCoin() {
    return new Promise((resolve, reject) => {

        GetCoinName('SWAP').then(result => {
            resolve(result);
        }).catch(error => {
            reject(error);
        });
    });
}

function FuturesCoin() {
    return new Promise((resolve, reject) => {

        GetCoinName('FUTURES').then(result => {
            resolve(result);
        }).catch(error => {
            reject(error);
        });
    });
}


async function Aggregate(initialGroups, processFunction) {
    // Memulai WebSocket dan menerima pesan secara streaming
    OKXWsAggregate(initialGroups, (message) => {
        processFunction(message);
    });
}

async function IndexTickers(initialGroups, processFunction) {
    // Memulai WebSocket dan menerima pesan secara streaming
    OKXWsIndexTickers(initialGroups, (message) => {
        processFunction(message);
    });
}

async function MarkPrice(initialGroups, processFunction) {
    // Memulai WebSocket dan menerima pesan secara streaming
    OKXWsMarkPrice(initialGroups, (message) => {
        processFunction(message);
    });
}

async function Tickers(initialGroups, processFunction) {
    // Memulai WebSocket dan menerima pesan secara streaming
    OKXWsTickers(initialGroups, (message) => {
        processFunction(message);
    });
}

async function OptimizedBooks(initialGroups, processFunction) {
    // Memulai WebSocket dan menerima pesan secara streaming
    OKXWsOptimizedBooks(initialGroups, (message) => {
        processFunction(message);
    });
}


// {"op":"subscribe","args":[{"channel":"tickers","instId":"BTC-USDT"},{"ccy":"USDT","channel":"cup-tickers-3s"},{"channel":"mark-price","instId":"BTC-USDT"},{"channel":"index-tickers","instId":"BTC-USDT"}]}

// Export the OKXWsAggregate function
module.exports = { OKXWsAggregate, SpotCoin, SwapCoin, FuturesCoin, Aggregate, IndexTickers, Tickers, MarkPrice, OptimizedBooks };
