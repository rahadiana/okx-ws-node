const WebSocket = require('ws');
const https = require('follow-redirects').https;
const ApiPublic = require("./api/public/index.js");
const ApiRubik = require("./api/rubik/index.js");
var fs = require('fs');
var dns = require('dns');

let reconnectInterval = 500; // millisecond

async function WsConnection(CoinArray, ChannelType, messageCallback, options = {}) {
    // ✅ FIXED: URL yang benar
    const Ws = 'wss://wspri.okx.com:8443/ws/v5/ipublic';

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

    const opts = Object.assign({
        maxQueue: 10000,
        processPerTick: 1000,
        processIntervalMs: 50,
        statsIntervalMs: 60000,
        dropOnFull: true,
        onStats: null,
        onError: null  // ✅ ADDED: dedicated error callback
    }, options);

    const messageQueues = new Map();
    const droppedCounts = new Map();

    // Parser worker pool
    const parserWorkers = [];
    const parserTaskQueue = [];
    const parserCallbacks = new Map();
    const parserTimeouts = new Map();
    let nextParserId = 1;
    let scheduleParse = null;
    let numParserWorkers = opts.parserWorkers || 0;

    try {
        const os = require('os');
        if (!numParserWorkers) numParserWorkers = Math.max(1, Math.min(Math.max(1, (os.cpus() || []).length - 1), 4));
    } catch (e) {
        numParserWorkers = numParserWorkers || 1;
    }

    let Worker;
    try {
        Worker = require('worker_threads').Worker;
    } catch (e) {
        Worker = null;
    }

    if (Worker) {
        const path = require('path');
        const fs = require('fs');

        // ✅ FIXED: Check if parser-worker.js exists before creating workers
        const workerPath = path.join(__dirname, 'parser-worker.js');
        let workerExists = false;
        try {
            workerExists = fs.existsSync(workerPath);
        } catch (e) {
            console.warn('Cannot check parser-worker.js existence:', e.message);
        }

        if (workerExists) {
            for (let i = 0; i < numParserWorkers; i++) {
                try {
                    const w = new Worker(workerPath);
                    if (w.unref) try { w.unref(); } catch (e) { }
                    w._busy = false;

                    w.on('message', (msg) => {
                        try {
                            const cb = parserCallbacks.get(msg.id);
                            if (cb) {
                                parserCallbacks.delete(msg.id);
                                const t = parserTimeouts.get(msg.id);
                                if (t) {
                                    clearTimeout(t);
                                    parserTimeouts.delete(msg.id);
                                }
                                cb(msg);
                            }
                        } catch (e) { }

                        w._busy = false;
                        const next = parserTaskQueue.shift();
                        if (next) assignTask(w, next);
                    });

                    w.on('error', (err) => {
                        console.error('Parser worker error:', err);
                        w._busy = false;
                    });

                    w.on('exit', (code) => {
                        if (code !== 0) console.warn('Parser worker exit:', code);
                        w._busy = false;
                    });

                    parserWorkers.push(w);
                } catch (e) {
                    console.warn('Failed to create parser worker:', e.message);
                }
            }
        }

        function assignTask(worker, task) {
            try {
                worker._busy = true;
                parserCallbacks.set(task.id, task.callback);

                const to = setTimeout(() => {
                    try {
                        if (parserCallbacks.has(task.id)) {
                            const cb = parserCallbacks.get(task.id);
                            parserCallbacks.delete(task.id);
                            try { cb({ error: 'parser timeout' }); } catch (e) { }
                        }
                    } catch (e) { }
                    parserTimeouts.delete(task.id);
                }, opts.parserTimeoutMs || 10000);

                parserTimeouts.set(task.id, to);
                worker.postMessage({ id: task.id, payload: task.payload });
            } catch (e) {
                worker._busy = false;
                parserTaskQueue.unshift(task);
            }
        }

        if (parserWorkers.length > 0) {
            scheduleParse = function (payload, cb) {
                const id = nextParserId++;
                const task = { id, payload, callback: cb };
                const free = parserWorkers.find(w => !w._busy);
                if (free) assignTask(free, task);
                else parserTaskQueue.push(task);
            };
        }
    }

    // ✅ Fallback always available
    if (!scheduleParse) {
        scheduleParse = function (payload, cb) {
            try {
                let res = payload;
                if (typeof payload === 'string') {
                    const c = payload.charCodeAt(0);
                    if (c === 123 || c === 91) res = JSON.parse(payload);
                }
                cb({ result: res });
            } catch (e) {
                cb({ error: e && e.message ? e.message : String(e) });
            }
        };
    }

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

                if (scheduleParse && typeof scheduleParse === 'function' && parserWorkers.length > 0) {
                    const batchMax = opts.parseBatchSize || 256;
                    while (toProcess > 0) {
                        const take = Math.min(toProcess, batchMax);
                        const batch = new Array(take);
                        for (let j = 0; j < take; j++) batch[j] = queueObj.arr[queueObj.head++];

                        scheduleParse(batch, (msg) => {
                            try {
                                const results = (msg && Array.isArray(msg.result)) ? msg.result : [];
                                for (let k = 0; k < results.length; k++) {
                                    const r = results[k];
                                    if (r && r.result !== undefined) {
                                        try {
                                            const out = (Buffer.isBuffer(r.result) || r.result instanceof Uint8Array)
                                                ? r.result.toString()
                                                : r.result;
                                            messageCallback(out);
                                        } catch (e) { }
                                    } else {
                                        try {
                                            const raw = batch[k];
                                            const out = (Buffer.isBuffer(raw) || raw instanceof Uint8Array)
                                                ? raw.toString()
                                                : raw;
                                            messageCallback(out);
                                        } catch (e) { }
                                    }
                                }
                            } catch (e) { }
                        });
                        toProcess -= take;
                    }
                } else {
                    for (let i = 0; i < toProcess; i++) {
                        const item = queueObj.arr[queueObj.head++];
                        let payload = item;

                        if (Buffer.isBuffer(payload) || payload instanceof Uint8Array) {
                            payload = payload.toString();
                        }

                        if (typeof payload === 'string') {
                            const c = payload.charCodeAt(0);
                            if (c === 123 || c === 91) {
                                try { payload = JSON.parse(payload); }
                                catch (e) { /* keep raw */ }
                            }
                        }

                        try { messageCallback(payload); }
                        catch (e) { }
                    }
                }

                if (queueObj.head > 1024) {
                    queueObj.arr = queueObj.arr.slice(queueObj.head);
                    queueObj.head = 0;
                }

                const remaining = queueObj.arr.length - queueObj.head;
                if (remaining <= 0) messageQueues.delete(qkey);
            });
        } catch (e) { }
    }, opts.processIntervalMs);

    let statsTimer = null;
    if (typeof opts.onStats === 'function') {
        statsTimer = setInterval(() => {
            const stats = {};
            messageQueues.forEach((q, k) => {
                stats[k] = {
                    queued: (q && Array.isArray(q.arr) ? Math.max(0, q.arr.length - q.head) : 0),
                    dropped: droppedCounts.get(k) || 0
                };
            });
            try { opts.onStats(stats); } catch (e) { }
        }, opts.statsIntervalMs);
    }

    function buildSubscribeMessage(batchCoins) {
        const args = batchCoins.map(inst => ({
            channel: ChannelType,
            instId: inst.toUpperCase()
        }));
        return JSON.stringify({ op: 'subscribe', args });
    }

    const connections = new Map();

    function createConnection(batchCoins) {
        const key = batchCoins.join(',');
        const subscribeMsgCache = buildSubscribeMessage(batchCoins);
        let conn = connections.get(key) || {
            ws: null,
            timer: null,
            backoff: reconnectInterval
        };

        function connect() {
            if (conn.timer) {
                clearTimeout(conn.timer);
                conn.timer = null;
            }

            if (conn.ws) {
                try {
                    conn.ws.removeAllListeners();
                    conn.ws.terminate();
                } catch (e) { }
                conn.ws = null;
            }

            const ws = new WebSocket(Ws);
            conn.ws = ws;

            ws.once('open', () => {
                conn.backoff = reconnectInterval;
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send(subscribeMsgCache);
                }
            });

            ws.on('message', (data) => {
                if (data === 'Connected') return;

                try {
                    if ((typeof data === 'string' || Buffer.isBuffer(data)) && data.length < 8) {
                        const s = Buffer.isBuffer(data) ? data.toString() : data;
                        if (s === 'pong' || s === 'ping' || s === 'heartbeat') return;
                    }
                } catch (e) { }

                try {
                    const raw = data;
                    let qobj = messageQueues.get(key);
                    if (!qobj) {
                        qobj = { arr: [], head: 0 };
                        messageQueues.set(key, qobj);
                    }
                    qobj.arr.push(raw);

                    const size = qobj.arr.length - qobj.head;

                    try {
                        if (size > Math.floor(opts.maxQueue * 0.9) && typeof opts.onBackpressure === 'function') {
                            try { opts.onBackpressure({ key, size }); } catch (e) { }
                        }
                    } catch (e) { }

                    if (size > opts.maxQueue) {
                        if (opts.dropOnFull) {
                            try { qobj.arr[qobj.head] = null; } catch (e) { }
                            qobj.head++;
                            droppedCounts.set(key, (droppedCounts.get(key) || 0) + 1);
                        } else {
                            qobj.arr = qobj.arr.slice(qobj.arr.length - opts.maxQueue);
                            qobj.head = 0;
                        }
                    }
                } catch (e) { }
            });

            const scheduleReconnect = () => {
                conn.backoff = Math.min(conn.backoff * 2, 30000);
                if (conn.timer) clearTimeout(conn.timer);
                conn.timer = setTimeout(connect, conn.backoff);
            };

            ws.once('close', (code, reason) => {
                // ✅ FIXED: Use dedicated error callback
                if (typeof opts.onError === 'function') {
                    try {
                        opts.onError({
                            type: 'close',
                            batch: batchCoins,
                            code,
                            reason: reason ? reason.toString() : undefined
                        });
                    } catch (e) { }
                }
                scheduleReconnect();
            });

            ws.once('error', (err) => {
                // ✅ FIXED: Use dedicated error callback
                if (typeof opts.onError === 'function') {
                    try {
                        opts.onError({
                            type: 'error',
                            error: err && err.message ? err.message : String(err),
                            batch: batchCoins
                        });
                    } catch (e) { }
                }
                if (!conn.timer) scheduleReconnect();
            });
        }

        connections.set(key, conn);
        connect();
    }

    batches.forEach(batch => createConnection(batch));

    // ✅ FIXED: Prevent multiple cleanup calls
    let cleanupCalled = false;
    function cleanup() {
        if (cleanupCalled) return;
        cleanupCalled = true;

        connections.forEach((conn) => {
            if (conn.timer) clearTimeout(conn.timer);
            if (conn.ws) {
                try {
                    conn.ws.removeAllListeners();
                    conn.ws.terminate();
                } catch (e) { }
            }
        });
        connections.clear();

        try { clearInterval(processingTimer); } catch (e) { }
        try { if (statsTimer) clearInterval(statsTimer); } catch (e) { }
        try { messageQueues.clear(); } catch (e) { }
        try { droppedCounts.clear(); } catch (e) { }

        try {
            if (parserWorkers && parserWorkers.length) {
                parserWorkers.forEach(w => {
                    try { if (w.terminate) w.terminate(); } catch (e) { }
                });
            }
        } catch (e) { }

        try { parserTaskQueue.length = 0; } catch (e) { }
        try { if (parserCallbacks.clear) parserCallbacks.clear(); } catch (e) { }
        try {
            if (parserTimeouts.forEach) {
                parserTimeouts.forEach(t => clearTimeout(t));
                if (parserTimeouts.clear) parserTimeouts.clear();
            }
        } catch (e) { }
    }

    if (typeof process !== 'undefined' && process && process.once) {
        process.once('exit', cleanup);
        process.once('SIGINT', () => { cleanup(); process.exit(0); });
        try {
            if (process.on) process.on('SIGTERM', () => { cleanup(); process.exit(0); });
        } catch (e) { }
    }

    return {
        close: cleanup,
        getStats: () => {
            const stats = {};
            messageQueues.forEach((q, k) => {
                stats[k] = {
                    queued: (q && Array.isArray(q.arr) ? Math.max(0, q.arr.length - q.head) : 0),
                    dropped: droppedCounts.get(k) || 0
                };
            });
            return stats;
        }
    };
}

// Rest of the functions remain the same...

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


        const customLookup = (hostname, options, callback) => {
            if (hostname === 'www.okx.com') {
                callback(null, '172.64.144.82', 4); // Using the provided IP address
            } else {
                dns.lookup(hostname, options, callback); // Fallback to the default DNS lookup
            }
        };

        const options = {
            'method': 'GET',
            'hostname': 'www.okx.com',
            'path': `/priapi/v5/public/simpleProduct?instType=${$TYPE}&includeType=1&t=${Date.now()}`,
            // 'lookup': customLookup,  // Use the custom DNS lookup function
            'maxRedirects': 10,
            'timeout': 9000
        };

        const req = https.request(options, (res) => {
            let data = '';

            res.on('data', (chunk) => {
                data += chunk;
            });

            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    resolve({ status: 200, data: parsed.data, message: 'success' });
                } catch (e) {
                    resolve({ status: 500, message: 'Invalid JSON response' });
                }
            });
        });

        req.on('error', (e) => {
            resolve({ status: 500, message: e.message || String(e) });
        });

        req.on('timeout', () => {
            resolve({ status: 408, message: 'timeout' });
            req.destroy();
        });

        req.end();
    });
}

function SpotCoin() {
    return GetCoinName('SPOT');
}

function SwapCoin() {
    return GetCoinName('SWAP');
}

function FuturesCoin() {
    return GetCoinName('FUTURES');
}

async function Aggregate(initialGroups, processFunction) {
    return OKXWsAggregate(initialGroups, processFunction);
}

async function IndexTickers(initialGroups, processFunction) {
    return OKXWsIndexTickers(initialGroups, processFunction);
}

async function MarkPrice(initialGroups, processFunction) {
    return OKXWsMarkPrice(initialGroups, processFunction);
}

async function Tickers(initialGroups, processFunction) {
    return OKXWsTickers(initialGroups, processFunction);
}

async function OptimizedBooks(initialGroups, processFunction) {
    return OKXWsOptimizedBooks(initialGroups, processFunction);
}

module.exports = {
    OKXWsFundingRate,
    OKXWsAggregate,
    OKXWsIndexTickers,
    OKXWsMarkPrice,
    OKXWsTickers,
    OKXWsOptimizedBooks,
    SpotCoin,
    SwapCoin,
    FuturesCoin,
    Aggregate,
    IndexTickers,
    Tickers,
    MarkPrice,
    OptimizedBooks,
    ApiPublic, ApiRubik
};  