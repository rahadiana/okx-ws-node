# AGENT.md — Panduan Navigasi AI

Repositori: `okx-ws-node` (package `@nusantaracode/okx-ws-node`)
Bahasa: JavaScript · Main: `./src/index.js` · Deps: `@rahadiana/node_response_standard, follow-redirects, ws`

> Sumber kebenaran untuk AI agent. Baca sebelum ubah kode.
Status verifikasi 2026-08-19: **✅ Berfungsi — SwapCoin + WS OK**

---

## 1. Ringkasan Proyek

okx-ws-node

Entry: `./src/index.js` · Src: `src/api/public/index.js, src/api/rubik/index.js, src/index.js, src/parser-worker.js`

---

## 2. Perintah Penting

```bash
npm install
# test
npm test 2>&1 | head -50
# atau
node test/*.js 2>&1 | head -100
# syntax check
node -c src/index.js
```

---

## 3. Peta Direktori

```
.git\n.gitignore\nAGENT.md\nLICENSE\nREADME.md\nindex.js\npackage-lock.json\npackage.json\nrun-test.js\nsrc
src/
api\nindex.js\nparser-worker.js
```

---

## 4. Format Return

Semua fungsi resolve via `ResponseHandler(code, data, message)`:

```js
{ code: 200, data: {...}, message: "success" }
{ code: 422, data: "", message: "validation error" }
{ code: 404, data: "", message: "not found" }
{ code: 500, data: error, message: "failed" }
```
Cek `code`. Jangan ubah format.

---

## 5. Daftar Endpoint / Fungsi Utama

Ter-deteksi dari `src/index.js`:

- `OKXWsFundingRate`
- `OKXWsAggregate`
- `OKXWsIndexTickers`
- `OKXWsMarkPrice`
- `OKXWsTickers`
- `OKXWsOptimizedBooks`
- `SpotCoin`
- `SwapCoin`
- `FuturesCoin`
- `Aggregate`
- `IndexTickers`
- `Tickers`
- `MarkPrice`
- `OptimizedBooks`
- `ApiPublic`

### Cara Pakai Umum

```js
const mod = require('./src');
// atau require('./src/index.js') tergantung repo
// contoh generic:
const res = await mod.SomeFunction({ param: "value", page: 0, limit: 10 });
console.log(res.code, res.data);
```

Lihat file di `src/` untuk field `req` wajib tiap fungsi — biasanya `req.query`, `req.url`, `req.id`, `req.page`.

#### Contoh dari test/ atau index.js:
```js
const { OKXWsAggregate, SwapCoin } = require('./src');

// Lightweight message processor for high-throughput
let msgCount = 0;
function processFunction(message) {
  msgCount++;
  // keep processing minimal — avoid heavy sync work or unbounded in-memory storage
  if ((msgCount & 0x3FFF) === 0) { // sample log roughly every 16384 messages
    if (typeof message === 'object') console.log('sample:', JSON.stringify(message).slice(0, 200));
    else console.log('sample:', String(message).slice(0, 200));
  }
}

async function main() {
  try {
    const coinList = await SwapCoin(); // no param
    if (coinList && coinList.status === 200 && Array.isArray(coinList.data)) {
      const groups = coinLis
```

---

## 6. Contoh Request & Response (Wajib Diisi Agent Setelah Verifikasi)

> **Template — agent yang visit WAJIB ganti dengan hasil probe nyata.**

**Request:**
```js
const { SomeFunction } = require('./src');
const res = await SomeFunction({ query: "jakarta", page: 1, limit: 10 });
```

**Response Sukses:**
```json
{
  "code": 200,
  "data": { "example": "isi data nyata dari API target" },
  "message": "success"
}
```

**Response Gagal:**
```json
{
  "code": 422,
  "data": "",
  "message": "validation error / api unreachable"
}
```

*Catatan: Untuk repo ini, cek `src/api/public/index.js` untuk endpoint spesifik, dan update section ini dengan contoh real setelah `node test` berhasil.*

---

## 7. Catatan Auth & Rate Limit

*   Cek `src/*.js` header — banyak repo hardcode cookie/key (misal RajaOngkir, 1688 X5, TikTok, Waze).
*   Jika 403/410 X5/Cloudflare → butuh cookie segar, lihat issue di `apisell_agent_rules/rules/06-verification-report.md`.
*   Jangan commit kredensial baru tanpa dokumentasi.

---

## 8. Checklist Agent

```
□ npm install && probe fungsi utama (lihat test/)
□ Baca src/index.js sampai paham req → API target
□ Jangan ubah ResponseHandler format
□ Jika parser/endpoint berubah → update src/*.js
□ Isi Section 6 dengan request/response nyata setelah verifikasi
□ Push: git add AGENT.md && git commit -m "docs: update AGENT.md - visit detail ..." && git push
```
