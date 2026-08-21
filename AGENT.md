# AGENT.md — Panduan Navigasi AI

Repositori: `okx-ws-node` (package `@nusantaracode/okx-ws-node`)
Bahasa: JavaScript · Main: `./src/index.js` · Deps: `@rahadiana/node_response_standard, follow-redirects, ws` · Test: `-`

> Sumber kebenaran untuk AI agent. Baca sebelum ubah kode.

Status verifikasi 2026-08-19: **✅ Berfungsi — SwapCoin + WS OK**

---

## 1. Ringkasan Proyek

okx-ws-node

Entry: `./src/index.js` · Direktori src: `api, index.js, parser-worker.js`

> README snippet: # okx-ws-node  Lightweight Node.js helper to subscribe to OKX public WebSocket channels in batches — optimized for high-throughput public market data consumers.  This library opens one WebSocket conne...


---

## 2. Perintah Penting

```bash
npm install
# test (sesuai package.json)
npm test  # atau node test/test.js / node _test.js
# syntax check
node -c src/index.js
node -c ./src/index.js
```

Wajib jalankan test sebelum & sesudah ubah kode.

---

## 3. Peta Direktori

```
.git\n.gitignore\nLICENSE\nREADME.md\nindex.js\npackage-lock.json\npackage.json\nrun-test.js\nsrc
src/
api\nindex.js\nparser-worker.js
```

Lihat `src/index.js` sebagai entry point re-export.

---

## 4. Format Return (Invariant)

Semua fungsi resolve dengan `ResponseHandler(code, data, message)` dari `@rahadiana/node_response_standard`:

```js
// Sukses
{ code: 200, data: {...}, message: "success" }
// Gagal
{ code: 422, data: "", message: "platform not supported" }
{ code: 404, data: "", message: "data not found" }
{ code: 500, data: error, message: "failed" }
```
Cek `code` bukan `success`. Jangan ubah format — downstream apisell_master bergantung.

---

## 5. Daftar Endpoint / Fungsi Utama

Fungsi terdeteksi (auto-scan src):

- `CallHttp`
- `marketDataHistory`
- `economicCalendar`
- `indexComponents`
- `exchangeRate`
- `historyMarkPriceCandles`
- `markPriceCandles`
- `historyIndexCandles`
- `indexCandles`
- `indexTickers`
- `premiumHistory`
- `instrumentTickBands`
- `convertContractCoin`
- `insuranceFund`
- `underlying`
- `interestRateLoanQuota`
- `positionTiers`
- `markPrice`
- `time`
- `discountRateInterestFreeQuota`

### Cara Temukan Request/Response Lengkap

Buka `src/index.js` dan file di `src/` — setiap fungsi biasanya:

```js
const Foo = async (req) => {
  return new Promise(async (resolve) => {
    // validasi req.xxx
    // axios/cloudscraper request ke API target
    // resolve(ResponseHandler(200, data, "success"))
  })
}
module.exports = { Foo }
```

**Pattern Request umum:**
```js
// Contoh generic — sesuaikan field req sesuai fungsi
const { Foo } = require('./src');
const res = await Foo({
  // lihat src/<file>.js untuk field wajib: req.url, req.query, req.id, dll
  // contoh: url, keyword, page, limit, country, lang
});
console.log(res);
```

**Response Sukses:** `{code:200, data:{...}, message:"success"}`
**Response Gagal:** `{code:422/404/500, data:"", message:"..."}`

> Untuk dokumentasi **spesifik per fungsi**, lihat contoh di `test/` dan baca JSDoc di `src/`.

---

## 6. Contoh Request & Response (Template Wajib Agent Isi)

> **Agent yang memperbaiki repo ini WAJIB update bagian ini dengan contoh nyata setelah verifikasi.**

#### Contoh Sukses (ganti dengan hasil real):

**Request:**
```js
const mod = require('./src');
const res = await mod.SomeFunction({ param: "value" });
```

**Response:**
```json
{
  "code": 200,
  "data": { "example": "hasil nyata dari API target" },
  "message": "success"
}
```

#### Contoh Gagal:

```json
{
  "code": 500,
  "data": "",
  "message": "failed get data"
}
```

---

## 7. Catatan Auth & Rate Limit

*   Cek `src/index.js` header — banyak scraper pakai hardcoded cookie / api key / header okhttp.
*   Jika butuh cookie segar (X5, Cloudflare, 403), lihat issue di `rules/06-verification-report.md` di repo `apisell_agent_rules`.
*   Jangan hardcode kredensial baru tanpa dokumentasi.

---

## 8. Checklist Agent

```
□ npm install && npm test (atau node test/test.js) — harus hijau sebelum ubah
□ Baca src/index.js sampai paham mapping req → API target
□ Jangan ubah format ResponseHandler / success
□ Jika parser gagal (selector/endpoint berubah) → update src/*.js
□ Verifikasi dengan parameter realistis, catat contoh request/response nyata di section 6
□ Push dengan pesan `fix: ...` atau `docs: tambah AGENT.md`
```
