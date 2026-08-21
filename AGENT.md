# AGENT.md — Panduan Navigasi AI (REAL)

Repositori: `okx-ws-node` (package `@nusantaracode/okx-ws-node`)
Bahasa: JavaScript (CommonJS) · Deps: `ws`, `axios`

> REAL — probe 2026-08-21, scan src/ dulu, test outdated.

Status: **✅ REAL 2026-08-21** — `ApiPublic.Instrument('swap',1)` code 0 (AEON-USDT-SWAP, LIVE) — probe langsung.

---

## 1. Ringkasan

OKX WebSocket Node — REST `ApiPublic.Instrument` + WS `Aggregate`, `Tickers`, `MarkPrice`, `OptimizedBooks`, `OKXWsFundingRate`.

Entry: `src/index.js` → `src/ApiPublic.js`, `src/Aggregate.js`, dll

---

## 2. Perintah Penting

```bash
npm install
node -e "const {ApiPublic}=require('./src'); ApiPublic.Instrument('swap',1).then(console.log)"
node run-test.js
```

---

## 3. Peta Direktori — SCAN REAL

```
src/
├── index.js         ← export ApiPublic, SpotCoin, FuturesCoin, SwapCoin, Aggregate, IndexTickers, Tickers, MarkPrice, OptimizedBooks, OKXWsFundingRate
├── ApiPublic.js     ← Instrument(type, limit)
├── Aggregate.js     ← WS aggregate (parserWorkers)
├── Tickers.js
├── MarkPrice.js
└── ...
index.js
run-test.js
```

**Wajib scan:** `src/index.js` ada 10 export, jangan andalkan test.

---

## 4. Format Return

```js
{ code: "0", data: [{instId:"AEON-USDT-SWAP", instType:"SWAP"}], msg:"" }
{ code: "1", msg:"error" }
```

---

## 5. Endpoint REAL — Request & Response Asli

### 5.1 `ApiPublic.Instrument` — REAL PROBE ✅

**Real Request:**
```js
const { ApiPublic } = require('./src');
const res = await ApiPublic.Instrument('swap', 1); // type: swap/spot/futures, limit: number
// GET https://www.okx.com/api/v5/public/instruments?instType=SWAP
```

**Real Response (code 0) — probe 2026-08-21:**
```json
{
  "code": "0",
  "data": [
    {
      "instId": "AEON-USDT-SWAP",
      "instType": "SWAP",
      "uly": "AEON-USDT",
      "instFamily": "AEON-USDT",
      "ctVal": "10",
      "ctValCcy": "AEON",
      "settleCcy": "USDT",
      "status": "LIVE",
      "isTradable": true
    }
  ],
  "msg": ""
}
```

### 5.2 `Aggregate` — WS

**Real Request:**
```js
const { Aggregate } = require('./src');
Aggregate(['AEON-USDT-SWAP', 'BTC-USDT-SWAP'], (msg)=>console.log(msg), {
  parserWorkers: 2,
  processIntervalMs: 10,
  processPerTick: 3000
});
// WS wss://ws.okx.com:8443/ws/v5/public → subscribe tickers
```

---

## 6. Checklist REAL

```
□ Scan src/index.js — 10 fungsi
□ Probe Instrument swap → code 0 (sudah ✅)
□ Test WS Aggregate dengan 1-2 instId
```
