const WebSocket = require('ws');
const https = require('follow-redirects').https;
const ApiPublic = require("./api/public/index.js");
const ApiRubik = require("./api/rubik/index.js");
var fs = require('fs');
var dns = require('dns');

let reconnectInterval = 900; // millisecond

async function WsConnection(CoinArray, ChannelType, messageCallback, options = {}) {
    // ✅ FIXED: URL yang benar
    const Ws = 'wss://wspri.okx.com:8443/ws/v5/ipublic';

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

    const opts = Object.assign({
        maxQueue: 20000,
        processPerTick: 1200,
        processIntervalMs: 50,
        statsIntervalMs: 60000,
        dropOnFull: false,
        onBackpressure: null,
        onStats: null,
        onError: null, // ✅ ADDED: dedicated error callback
        parserWorkers: 3,
        // resubscribe options
        resubscribeThresholdMs: 5000,
        resubscribeIntervalMs: 2000,
        resubscribeThrottleMs: 10000,
        // limit how many stale instruments to resubscribe per connection per check
        resubscribeBatchLimit: 20
    }, options);

    const messageQueues = new Map();
    const droppedCounts = new Map();
    const lastSeen = new Map(); // instId -> timestamp
    const instToConnKey = new Map(); // instId -> connection key
    const lastResubscribe = new Map(); // instId -> timestamp
    const subscribedState = new Map(); // instId -> { state, ts }

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
            // createParserWorker: encapsulate worker creation, logging and restart-on-failure
            function createParserWorker() {
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
                        try {
                            console.error('Parser worker error:', err && err.stack ? err.stack : err);
                        } catch (e) { }
                        w._busy = false;
                    });

                    w.on('exit', (code) => {
                        try {
                            const idInfo = (w.threadId !== undefined) ? (' threadId=' + w.threadId) : '';
                            console.warn('Parser worker exit: code=' + code + idInfo);
                        } catch (e) { }
                        w._busy = false;

                        // remove from pool
                        try {
                            const idx = parserWorkers.indexOf(w);
                            if (idx !== -1) parserWorkers.splice(idx, 1);
                        } catch (e) { }

                        // restart non-zero-exit workers unless cleanup is running
                        if (code !== 0 && !cleanupCalled) {
                            const retryDelay = Math.min(3000, reconnectInterval * 2) || 500;
                            setTimeout(() => {
                                try { createParserWorker(); } catch (e) { console.warn('Failed to restart parser worker:', e && e.message ? e.message : e); }
                            }, retryDelay);
                        }
                    });

                    parserWorkers.push(w);
                } catch (e) {
                    console.warn('Failed to create parser worker:', e && e.message ? e.message : e);
                }
            }

            for (let i = 0; i < numParserWorkers; i++) createParserWorker();
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
                                const now = Date.now();
                                for (let k = 0; k < results.length; k++) {
                                    const r = results[k];
                                    let out = null;
                                    if (r && r.result !== undefined) {
                                        out = (Buffer.isBuffer(r.result) || r.result instanceof Uint8Array)
                                            ? r.result.toString()
                                            : r.result;
                                    } else {
                                        const raw = batch[k];
                                        out = (Buffer.isBuffer(raw) || raw instanceof Uint8Array)
                                            ? raw.toString()
                                            : raw;
                                    }
                                    try {
                                        // update lastSeen if instId present
                                        const ids = extractInstIds(out);
                                        ids.forEach(id => lastSeen.set(id, now));
                                    } catch (e) { }
                                    try { messageCallback(out); } catch (e) { }
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

                        try {
                            try {
                                const ids = extractInstIds(payload);
                                const now = Date.now();
                                ids.forEach(id => lastSeen.set(id, now));
                            } catch (e) { }
                            messageCallback(payload);
                        }
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

    // helper to extract instId(s) from various OKX message shapes
    function extractInstIds(msg) {
        const ids = [];
        try {
            if (!msg) return ids;
            if (typeof msg === 'string') return ids;
            if (Array.isArray(msg)) {
                msg.forEach(m => {
                    extractInstIds(m).forEach(i => ids.push(i));
                });
                return ids;
            }
            if (typeof msg === 'object') {
                if (msg.arg && msg.arg.instId) ids.push(String(msg.arg.instId).toUpperCase());
                if (msg.instId) ids.push(String(msg.instId).toUpperCase());
                if (msg.args && Array.isArray(msg.args)) msg.args.forEach(a => { if (a.instId) ids.push(String(a.instId).toUpperCase()); });
                if (msg.data && Array.isArray(msg.data)) msg.data.forEach(d => { if (d.instId) ids.push(String(d.instId).toUpperCase()); });
                if (msg.data && msg.data.instId) ids.push(String(msg.data.instId).toUpperCase());
            }
        } catch (e) { }
        return ids;
    }

    function buildSubscribeMessage(batchCoins) {
        const args = batchCoins.map(inst => ({
            channel: ChannelType,
            instId: inst.toUpperCase()
        }));
        return JSON.stringify({ op: 'subscribe', args });
    }

    function buildUnsubscribeMessage(batchCoins) {
        const args = batchCoins.map(inst => ({
            channel: ChannelType,
            instId: inst.toUpperCase()
        }));
        return JSON.stringify({ op: 'unsubscribe', args });
    }

    const connections = new Map();

    function createConnection(batchCoins) {
        const key = batchCoins.join(',');
        const subscribeMsgCache = buildSubscribeMessage(batchCoins);
        let conn = connections.get(key) || {
            ws: null,
            timer: null,
            backoff: reconnectInterval,
            batchCoins: batchCoins.slice()
        };

        // register inst -> key mapping for resubscribe lookup
        try {
            batchCoins.forEach(i => instToConnKey.set(String(i).toUpperCase(), key));
        } catch (e) { }

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
                // try { console.info('[okx-ws] open', key); } catch (e) { }
                if (ws.readyState === WebSocket.OPEN) {
                    try { ws.send(subscribeMsgCache); } catch (e) { }
                    // try { console.info('[okx-ws] subscribe sent', key); } catch (e) { }
                }

                // subscribe-retry: resend if no incoming data within X ms
                try { conn._subscribed = false; } catch (e) { }
                try { if (conn._subscribeTimer) clearTimeout(conn._subscribeTimer); } catch (e) { }
                conn._subscribeTimer = setTimeout(() => {
                    try {
                        if (!conn._subscribed && conn.ws && conn.ws.readyState === WebSocket.OPEN) {
                            try { conn.ws.send(subscribeMsgCache); } catch (e) { }
                            // try { console.warn('[okx-ws] subscribe retry', key); } catch (e) { }
                        }
                    } catch (e) { }
                }, 2000);

                // mark per-instrument state as pending_subscribe for this initial batch
                try {
                    const now = Date.now();
                    (conn.batchCoins || batchCoins).forEach(i => {
                        const id = String(i).toUpperCase();
                        const s = subscribedState.get(id);
                        if (!s || s.state !== 'subscribed') subscribedState.set(id, { state: 'pending_subscribe', ts: now });
                    });
                } catch (e) { }
            });

            ws.on('message', (data) => {
                if (data === 'Connected') return;

                try {
                    if (conn._subscribeTimer) { clearTimeout(conn._subscribeTimer); conn._subscribeTimer = null; }
                    conn._subscribed = true;
                } catch (e) { }

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

                    // optimistic update: if message contains instId(s), update lastSeen
                    try {
                        let parsed = raw;
                        if (Buffer.isBuffer(raw) || raw instanceof Uint8Array) parsed = raw.toString();
                        if (typeof parsed === 'string') {
                            const c = parsed.charCodeAt(0);
                            if (c === 123 || c === 91) {
                                try { parsed = JSON.parse(parsed); } catch (e) { }
                            }
                        }
                        const ids = extractInstIds(parsed);
                        const now = Date.now();
                        ids.forEach(id => {
                            lastSeen.set(id, now);
                            try {
                                const cur = subscribedState.get(id);
                                if (!cur || cur.state !== 'subscribed') subscribedState.set(id, { state: 'subscribed', ts: now });
                            } catch (e) { }
                        });
                    } catch (e) { }

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
                // try { console.warn('[okx-ws] close', key, code, (reason ? reason.toString() : undefined)); } catch (e) { }
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
                const em = err && err.message ? err.message : String(err);
                // try { console.error('[okx-ws] error', key, em); } catch (e) { }
                if (typeof opts.onError === 'function') {
                    try { opts.onError({ type: 'error', error: em, batch: batchCoins }); } catch (e) { }
                }

                // If server returns 503 (Service Unavailable), apply a stronger backoff and suspend
                try {
                    const is503 = (typeof em === 'string' && (em.indexOf('503') !== -1 || /status code:? ?503/i.test(em)));
                    if (is503) {
                        // increase backoff multiplicatively but cap
                        conn.backoff = Math.min((conn.backoff || reconnectInterval) * 4, 60000);
                        // suspend reconnect attempts for a short cooldown (30s)
                        conn.suspendedUntil = Date.now() + 30000;
                        if (conn.timer) clearTimeout(conn.timer);
                        conn.timer = setTimeout(() => {
                            try { connect(); } catch (e) { }
                        }, conn.backoff);
                        return;
                    }
                } catch (e) { }

                if (!conn.timer) scheduleReconnect();
            });
        }

        connections.set(key, conn);
        connect();
    }

    // periodic resubscribe checker for stale instruments
    let resubscribeTimer = null;
    if (opts.resubscribeIntervalMs > 0) {
        resubscribeTimer = setInterval(() => {
            try {
                const now = Date.now();
                // collect stale insts grouped by connection key
                const groups = new Map();
                lastSeen.forEach((ts, inst) => {
                    try {
                        if ((now - ts) > (opts.resubscribeThresholdMs || 5000)) {
                            const last = lastResubscribe.get(inst) || 0;
                            if ((now - last) > (opts.resubscribeThrottleMs || 10000)) {
                                const key = instToConnKey.get(inst);
                                if (key) {
                                    if (!groups.has(key)) groups.set(key, []);
                                    groups.get(key).push(inst);
                                }
                            }
                        }
                    } catch (e) { }
                });

                // perform grouped resubscribe per connection
                groups.forEach((insts, key) => {
                    try {
                        if (!Array.isArray(insts) || insts.length === 0) return;
                        const conn = connections.get(key);
                        if (!conn || !conn.ws || conn.ws.readyState !== WebSocket.OPEN) return;

                        // limit batch size per connection
                        const limit = Math.max(1, Math.min(insts.length, opts.resubscribeBatchLimit || 20));
                        const batch = insts.slice(0, limit).map(i => String(i).toUpperCase());

                        // pick insts to actually resubscribe: avoid those already subscribed or already pending
                        const nowMark = Date.now();
                        const toProcess = [];
                        for (let inst of batch) {
                            try {
                                const cur = subscribedState.get(inst);
                                if (cur && (cur.state === 'subscribed' || cur.state === 'pending_subscribe')) {
                                    // already subscribed or subscribe in-flight - skip
                                    continue;
                                }
                                toProcess.push(inst);
                                lastResubscribe.set(inst, nowMark);
                                // mark as pending_unsub so we don't duplicate
                                subscribedState.set(inst, { state: 'pending_unsub', ts: nowMark });
                            } catch (e) { }
                        }

                        if (toProcess.length === 0) return;

                        try {
                            try { conn.ws.send(buildUnsubscribeMessage(toProcess)); } catch (e) { }
                            setTimeout(() => {
                                try {
                                    // before sending subscribe, set pending_subscribe and filter again
                                    const willSub = [];
                                    toProcess.forEach(i => {
                                        try {
                                            const cur = subscribedState.get(i);
                                            if (!cur || cur.state === 'pending_unsub') {
                                                subscribedState.set(i, { state: 'pending_subscribe', ts: Date.now() });
                                                willSub.push(i);
                                            }
                                        } catch (e) { }
                                    });
                                    if (willSub.length) try { conn.ws.send(buildSubscribeMessage(willSub)); } catch (e) { }
                                } catch (e) { }
                            }, 120);
                            // try { console.warn('[okx-ws] grouped resubscribe', toProcess.length, 'insts on', key); } catch (e) { }
                        } catch (e) { }
                    } catch (e) { }
                });
            } catch (e) { }
        }, opts.resubscribeIntervalMs || 2000);
    }

    // stagger connection creation to avoid bursts/rate-limits
    batches.forEach((batch, i) => {
        const delay = i * 50 + Math.floor(Math.random() * 100);
        setTimeout(() => createConnection(batch), delay);
    });

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
        try { lastSeen.clear(); } catch (e) { }
        try { instToConnKey.clear(); } catch (e) { }
        try { lastResubscribe.clear(); } catch (e) { }

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
        try { if (resubscribeTimer) clearInterval(resubscribeTimer); } catch (e) { }
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