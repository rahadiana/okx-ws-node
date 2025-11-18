const { parentPort } = require('worker_threads');

function tryParseOne(payload) {
    // normalize payload to string and apply tolerant parsing
    try {
        let str = null;
        if (Buffer.isBuffer(payload)) str = payload.toString('utf8');
        else if (payload instanceof Uint8Array) str = Buffer.from(payload).toString('utf8');
        else if (Array.isArray(payload) && payload.length && typeof payload[0] === 'number') str = Buffer.from(payload).toString('utf8');
        else if (typeof payload === 'string') str = payload;

        if (!str) return { result: payload };

        str = str.trim();

        // quick attempt
        try { return { result: JSON.parse(str) }; } catch (e) {}

        // remove any leading garbage before first { or [
        const first = str.search(/[\{\[]/);
        if (first > 0) str = str.slice(first);

        // try removing trailing commas like ',]' or ',}'
        let s2 = str.replace(/,\s*([\]\}])/g, '$1');
        try { return { result: JSON.parse(s2) }; } catch (e) {}

        // try joining consecutive objects into an array
        const s3 = '[' + s2.replace(/}\s*\{/g, '},{') + ']';
        try { return { result: JSON.parse(s3) }; } catch (e) {}

        // fallback: try extracting balanced { ... } objects while respecting string quotes
        const objects = [];
        let depth = 0;
        let inString = false;
        let esc = false;
        let start = -1;
        for (let i = 0; i < str.length; i++) {
            const ch = str[i];
            if (inString) {
                if (esc) { esc = false; continue; }
                if (ch === '\\') { esc = true; continue; }
                if (ch === inString) { inString = false; continue; }
                continue;
            }
            if (ch === '"' || ch === '\'') { inString = ch; continue; }
            if (ch === '{') {
                if (depth === 0) start = i;
                depth++;
                continue;
            }
            if (ch === '}') {
                depth--;
                if (depth === 0 && start >= 0) {
                    objects.push(str.slice(start, i + 1));
                    start = -1;
                }
            }
        }

        if (objects.length === 1) {
            try { return { result: JSON.parse(objects[0]) }; } catch (e) {}
        }
        if (objects.length > 1) {
            const parsed = [];
            for (let o of objects) {
                try { parsed.push(JSON.parse(o)); } catch (e) {}
            }
            if (parsed.length) return { result: parsed };
        }

        return { error: 'unable to parse payload' };
    } catch (e) {
        return { error: e && e.message ? e.message : String(e) };
    }
}

parentPort.on('message', (data) => {
    const id = data && data.id;
    const payload = data && data.payload;
    try {
        if (Array.isArray(payload)) {
            const out = payload.map(p => tryParseOne(p));
            // map to either result or error preserved
            parentPort.postMessage({ id, result: out });
            return;
        }

        const res = tryParseOne(payload);
        if (res.error) parentPort.postMessage({ id, error: res.error });
        else parentPort.postMessage({ id, result: res.result });
    } catch (e) {
        parentPort.postMessage({ id, error: e && e.message ? e.message : String(e) });
    }
});
