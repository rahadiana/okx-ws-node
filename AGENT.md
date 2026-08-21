# AGENT.md — Panduan Navigasi AI

Repositori: `okx-ws-node` (package `@nusantaracode/okx-ws-node`)
Bahasa: JavaScript · Main: `./src/index.js` · Deps: `@rahadiana/node_response_standard, follow-redirects, ws`

> Sumber kebenaran untuk AI agent. Baca sebelum ubah kode — dokumentasi request/response lengkap di bawah.
Status verifikasi 2026-08-19: **✅ Berfungsi — SwapCoin + WS OK**

---

## 1. Ringkasan Proyek

okx-ws-node

Entry: `./src/index.js` · Modules: `ApiPublic, ApiRubik`

---

## 2. Perintah Penting

```bash
npm install
npm test 2>&1 | head -100
# atau
node test/*.js 2>&1 | head -100
node -c src/index.js
```

Wajib probe sebelum & sesudah ubah.

---

## 3. Peta Direktori

```
.gitignore
.git
src
package.json
package-lock.json
README.md
LICENSE
run-test.js
AGENT.md
index.js
src/
src/parser-worker.js
src/index.js
src/api/public/index.js
src/api/rubik/index.js
```

---

## 4. Format Return

```js
{ code: 200, data: {...}, message: "success" }
{ code: 422, data: "", message: "validation" }
{ code: 404, data: "", message: "not found" }
{ code: 500, data: error, message: "failed" }
```

Semua fungsi resolve dengan `ResponseHandler`. Cek `code`.

---

## 5. Daftar Endpoint & Contoh Request/Response

> **Setiap endpoint di bawah diambil dari test.js / src/*.js — ganti dengan hasil probe nyata saat visit.**

Modul utama: `ApiPublic, ApiRubik`

Lihat contoh pemanggilan nyata dari test/src:

```js
const { parentPort } = require('worker_threads');

if (!parentPort) process.exit(0);

// startup log for easier tracing
try { console.log('parser worker started'); } catch (e) { }

// robust parsing helper: attempts multiple strategies to JSON-parse messy payloads
function tryParseOne(payload) {
    try {
        let str = null;
        if (Buffer.isBuffer(payload)) str = payload.toString('utf8');
        else if (payload instanceof Uint8Array) str = Buffer.from(payload).toString('utf8');
        else if (Array.isArray(payload) && payload.length && typeof payload[0] === 'number') str = Buffer.from(payload).toString('utf8');
        else if (typeof payload === 'string') str = payload;

        if (!str) return { result: payload };
        str = str.trim();

        // simplest parse
        try { return { result: JSON.parse(str) }; } catch (e) {}

        // strip leading garbage before first object/array
        const first = str.search(/[{[]/);
        if (first > 0) str = str.slice(f

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

    const coins = (Array.isArray(CoinArray) 
```

Untuk tiap fungsi, pola umum:

```js
const mod = require('./src');
const res = await mod.FunctionName({ param: "value", page: 0, limit: 10, languagecode: 'en' });
console.log(res.code, res.data);
```

Buka file di `src/` untuk lihat validasi `req.xxx` wajib.


---

## 6. Contoh Lengkap End-to-End

```js
// Contoh untuk okx-ws-node — sesuaikan dengan endpoint di atas
const mod = require('./src');
// const res = await mod.SomeFunction({ query: "jakarta", limit: 5 });
// if(res.code===200) console.log(res.data);
```

---

## 7. Catatan Auth & Error

*   Cek header di `src/*.js` — banyak repo hardcode key/cookie.
*   Jika 403/410/500 karena anti-bot (Cloudflare/X5/PerimeterX) → butuh fallback proxy `r.jina.ai` + `curl`.
*   Jangan commit kredensial.

---

## 8. Checklist Agent

```
□ npm install && probe test/*.js
□ Verifikasi tiap endpoint dengan param nyata, copy request/response ke Section 5
□ Jangan ubah ResponseHandler format
□ Jika endpoint berubah → update src/*.js
□ Push: git add AGENT.md && git commit -m "docs: update AGENT.md - visit detail ..." && git push
```
