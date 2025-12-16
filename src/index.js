const WebSocket = require('ws');
var https = require('follow-redirects').https;
var fs = require('fs');
var dns = require('dns');

let reconnectInterval = 500; // millisecond

async function WsConnection(CoinArray, ChannelType, messageCallback, options = {}) {
    const Ws = 'wss://wspri.okx.com:8443/ws/v5/ipublic';

    // If no coins provided, default to BTC-USDT
    const coins = (Array.isArray(CoinArray) && CoinArray.length > 0) ? CoinArray : ["BTC-USDT"];
    const BATCH_SIZE = 20;

    function chunkArray(arr, size) {
        const chunks = [];
        for (let i = 0; i < arr.length; i += size) {
            chunks.push(arr.slice(i, i + size));
        }
        return chunks;
    }

    const batches = chunkArray(coins, BATCH_SIZE);

    // Options and internal queues to avoid unbounded memory growth
    const opts = Object.assign({ maxQueue: 10000, processPerTick: 1000, processIntervalMs: 50, statsIntervalMs: 60000, dropOnFull: true, onStats: null }, options);
    const messageQueues = new Map(); // key -> Array of messages
    const droppedCounts = new Map(); // key -> number dropped

    // Parser worker pool (optional). Use worker_threads if available.
    const parserWorkers = [];
    const parserTaskQueue = [];
    const parserCallbacks = new Map();
    const parserTimeouts = new Map();
    let nextParserId = 1;
    let scheduleParse = null;
    let numParserWorkers = opts.parserWorkers || 0;
    try {
        const os = require('os');
        if (!numParserWorkers) numParserWorkers = Math.max(1, Math.min( Math.max(1, (os.cpus() || []).length - 1), 4));
    } catch (e) { numParserWorkers = numParserWorkers || 1; }

    let Worker;
    try { Worker = require('worker_threads').Worker; } catch (e) { Worker = null; }

    if (Worker) {
        const path = require('path');
        for (let i = 0; i < numParserWorkers; i++) {
            try {
                const w = new Worker(path.join(__dirname, 'parser-worker.js'));
                if (w.unref) try { w.unref(); } catch (e) {}
                w._busy = false;
                w.on('message', (msg) => {
                    try {
                        const cb = parserCallbacks.get(msg.id);
                        if (cb) {
                            parserCallbacks.delete(msg.id);
                            const t = parserTimeouts.get(msg.id);
                            if (t) { clearTimeout(t); parserTimeouts.delete(msg.id); }
                            cb(msg);
                        }
                    } catch (e) {}
                    // mark free and assign next
                    w._busy = false;
                    const next = parserTaskQueue.shift();
                    if (next) assignTask(w, next);
                });
                w.on('error', () => { w._busy = false; });
                w.on('exit', () => { w._busy = false; });
                parserWorkers.push(w);
            } catch (e) {}
        }

        function assignTask(worker, task) {
            try {
                worker._busy = true;
                parserCallbacks.set(task.id, task.callback);
                // create a timeout to avoid leaking callbacks if worker dies
                const to = setTimeout(() => {
                    try {
                        if (parserCallbacks.has(task.id)) {
                            const cb = parserCallbacks.get(task.id);
                            parserCallbacks.delete(task.id);
                            try { cb({ error: 'parser timeout' }); } catch (e) {}
                        }
                    } catch (e) {}
                    parserTimeouts.delete(task.id);
                }, opts.parserTimeoutMs || 10000);
                parserTimeouts.set(task.id, to);
                worker.postMessage({ id: task.id, payload: task.payload });
            } catch (e) {
                worker._busy = false;
                parserTaskQueue.unshift(task);
            }
        }

        scheduleParse = function(payload, cb) {
            const id = nextParserId++;
            const task = { id, payload, callback: cb };
            const free = parserWorkers.find(w => !w._busy);
            if (free) assignTask(free, task); else parserTaskQueue.push(task);
        };
    } else {
        // fallback: parse synchronously in main thread
        scheduleParse = function(payload, cb) {
            try {
                let res = payload;
                if (typeof payload === 'string') {
                    const c = payload.charCodeAt(0);
                    if (c === 123 || c === 91) res = JSON.parse(payload);
                }
                cb({ result: res });
            } catch (e) { cb({ error: e && e.message ? e.message : String(e) }); }
        };
    }

    // Worker that drains queues in controlled batches to avoid spikes and OOM
    // Use a head index to avoid O(n) cost of Array.shift on large queues.
    const processingTimer = setInterval(() => {
        try {
            messageQueues.forEach((queueObj, qkey) => {
                if (!queueObj || !Array.isArray(queueObj.arr)) return;
                const available = queueObj.arr.length - queueObj.head;
                if (available <= 0) {
                    messageQueues.delete(qkey);
                    return;
                }
                let toProcess = Math.min(available, opts.processPerTick);
                // if we have parser workers, send batches to them to reduce IPC overhead
                if (scheduleParse && typeof scheduleParse === 'function' && parserWorkers.length > 0) {
                    const batchMax = opts.parseBatchSize || 256;
                    while (toProcess > 0) {
                        const take = Math.min(toProcess, batchMax);
                        const batch = new Array(take);
                        for (let j = 0; j < take; j++) batch[j] = queueObj.arr[queueObj.head++];
                        // schedule parse for the whole batch; callback has closure over `batch`
                        scheduleParse(batch, (msg) => {
                            try {
                                const results = (msg && Array.isArray(msg.result)) ? msg.result : [];
                                for (let k = 0; k < results.length; k++) {
                                    const r = results[k];
                                    if (r && r.result !== undefined) {
                                        try {
                                            const out = (Buffer.isBuffer(r.result) || r.result instanceof Uint8Array) ? r.result.toString() : r.result;
                                            messageCallback(out);
                                        } catch (e) {}
                                    } else {
                                        // parsing failed or not parsed: fallback to raw (convert Buffer to string)
                                        try {
                                            const raw = batch[k];
                                            const out = (Buffer.isBuffer(raw) || raw instanceof Uint8Array) ? raw.toString() : raw;
                                            messageCallback(out);
                                        } catch (e) {}
                                    }
                                }
                            } catch (e) {}
                        });
                        toProcess -= take;
                    }
                } else {
                    for (let i = 0; i < toProcess; i++) {
                        const item = queueObj.arr[queueObj.head++];
                        let payload = item;
                        if (Buffer.isBuffer(payload) || payload instanceof Uint8Array) {
                            // convert buffer/Uint8Array to string before further processing
                            payload = payload.toString();
                        }
                        if (typeof payload === 'string') {
                            const c = payload.charCodeAt(0);
                            if (c === 123 || c === 91) { // '{' or '[' -> likely JSON
                                try { payload = JSON.parse(payload); } catch (e) { /* keep raw */ }
                            }
                        }
                        try { messageCallback(payload); } catch (e) {}
                    }
                }

                // compact array occasionally to free consumed slots
                if (queueObj.head > 1024) {
                    queueObj.arr = queueObj.arr.slice(queueObj.head);
                    queueObj.head = 0;
                }

                const remaining = queueObj.arr.length - queueObj.head;
                if (remaining <= 0) messageQueues.delete(qkey);
            });
        } catch (e) {}
    }, opts.processIntervalMs);

    // Optional periodic stats callback
    let statsTimer = null;
    if (typeof opts.onStats === 'function') {
        statsTimer = setInterval(() => {
            const stats = {};
            messageQueues.forEach((q, k) => stats[k] = { queued: (q && Array.isArray(q.arr) ? Math.max(0, q.arr.length - q.head) : 0), dropped: droppedCounts.get(k) || 0 });
            try { opts.onStats(stats); } catch (e) {}
        }, opts.statsIntervalMs);
    }

    // Build single subscribe message per batch (reduces allocations and messages)
    function buildSubscribeMessage(batchCoins) {
        const args = batchCoins.map(inst => ({ channel: ChannelType, instId: inst.toUpperCase() }));
        return JSON.stringify({ op: 'subscribe', args });
    }

    // Track connections so we can cleanup and avoid leaking timers/listeners
    const connections = new Map(); // key: batchKey string -> { ws, timer, backoff }

    function createConnection(batchCoins) {
        const key = batchCoins.join(',');
        const subscribeMsgCache = buildSubscribeMessage(batchCoins);
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
                if (ws.readyState === WebSocket.OPEN) ws.send(subscribeMsgCache);
            });

            ws.on('message', (data) => {
                // ignore simple connection/heartbeat messages to avoid unnecessary queueing
                if (data === 'Connected') return;
                try {
                    if ((typeof data === 'string' || Buffer.isBuffer(data)) && data.length < 8) {
                        const s = Buffer.isBuffer(data) ? data.toString() : data;
                        if (s === 'pong' || s === 'ping' || s === 'heartbeat') return;
                    }
                } catch (e) {}
                // push raw payload (Buffer or string) into queue; parsing is deferred to the worker
                try {
                    const raw = data; // keep Buffer as-is to avoid main-thread string allocations
                    let qobj = messageQueues.get(key);
                    if (!qobj) {
                        qobj = { arr: [], head: 0 };
                        messageQueues.set(key, qobj);
                    }
                    qobj.arr.push(raw);
                    // enforce max queue size (measured as available items)
                    const size = qobj.arr.length - qobj.head;
                    // notify backpressure when queue grows near capacity
                    try {
                        if (size > Math.floor(opts.maxQueue * 0.9) && typeof opts.onBackpressure === 'function') {
                            try { opts.onBackpressure({ key, size }); } catch (e) {}
                        }
                    } catch (e) {}
                    if (size > opts.maxQueue) {
                        if (opts.dropOnFull) {
                            // drop oldest by advancing head and free reference to allow GC
                            try { qobj.arr[qobj.head] = null; } catch (e) {}
                            qobj.head++;
                            droppedCounts.set(key, (droppedCounts.get(key) || 0) + 1);
                        } else {
                            // cap by slicing
                            qobj.arr = qobj.arr.slice(qobj.arr.length - opts.maxQueue);
                            qobj.head = 0;
                        }
                    }
                } catch (e) {}
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
        // stop processing timer and stats timer, clear queues
        try { if (typeof processingTimer !== 'undefined') clearInterval(processingTimer); } catch (e) {}
        try { if (typeof statsTimer !== 'undefined' && statsTimer) clearInterval(statsTimer); } catch (e) {}
        try { if (typeof messageQueues !== 'undefined') messageQueues.clear(); } catch (e) {}
        try { if (typeof droppedCounts !== 'undefined') droppedCounts.clear(); } catch (e) {}
        // terminate parser workers if any
        try {
            if (parserWorkers && parserWorkers.length) {
                parserWorkers.forEach(w => {
                    try { w.terminate && w.terminate(); } catch (e) {}
                });
            }
        } catch (e) {}
        try { parserTaskQueue.length = 0; } catch (e) {}
        try { parserCallbacks.clear && parserCallbacks.clear(); } catch (e) {}
        try { parserTimeouts.forEach && parserTimeouts.forEach(t => clearTimeout(t)); parserTimeouts.clear && parserTimeouts.clear(); } catch (e) {}
    }

    if (typeof process !== 'undefined' && process && process.once) {
        process.once('exit', cleanup);
        process.once('SIGINT', () => { cleanup(); process.exit(0); });
        // also handle SIGTERM in long-running environments
        try { process.on && process.on('SIGTERM', () => { cleanup(); process.exit(0); }); } catch (e) {}
    }
    // return control object so caller can close connections or read stats
    return {
        close: cleanup,
        getStats: () => {
            const stats = {};
            messageQueues.forEach((q, k) => { stats[k] = { queued: (q && Array.isArray(q.arr) ? Math.max(0, q.arr.length - q.head) : 0), dropped: droppedCounts.get(k) || 0 }; });
            return stats;
        }
    };
}

async function OKXWsAggregate(CoinArray, messageCallback, options) {
    const ChannelType = 'aggregated-trades';
    return WsConnection(CoinArray, ChannelType, messageCallback, options);
}

async function OKXWsIndexTickers(CoinArray, messageCallback, options) {
    const ChannelType = 'index-tickers';
    return WsConnection(CoinArray, ChannelType, messageCallback, options);
}

async function OKXWsMarkPrice(CoinArray, messageCallback, options) {
    const ChannelType = 'mark-price';
    return WsConnection(CoinArray, ChannelType, messageCallback, options);
}

async function OKXWsTickers(CoinArray, messageCallback, options) {
    const ChannelType = 'tickers';
    return WsConnection(CoinArray, ChannelType, messageCallback, options);
}

async function OKXWsOptimizedBooks(CoinArray, messageCallback, options) {
    const ChannelType = 'optimized-books';
    return WsConnection(CoinArray, ChannelType, messageCallback, options);
}

async function OKXWsFundingRate(CoinArray, messageCallback, options) {
    const ChannelType = 'funding-rate';
    return WsConnection(CoinArray, ChannelType, messageCallback, options);
}


function GetCoinName($TYPE) {
    return new Promise((resolve, reject) => {

        var options = {
            'method': 'GET',
            'hostname': 'www.okx.com',
            'path': `/priapi/v5/public/simpleProduct?instType=${$TYPE}&includeType=1&t=${Date.now()}`,
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
module.exports = { OKXWsFundingRate,OKXWsAggregate, OKXWsIndexTickers, OKXWsMarkPrice, OKXWsTickers, OKXWsOptimizedBooks, SpotCoin, SwapCoin, FuturesCoin, Aggregate, IndexTickers, Tickers, MarkPrice, OptimizedBooks };
