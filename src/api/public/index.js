const https = require('follow-redirects').https;

function CallHttp($Query) {
    return new Promise((resolve, reject) => {
        const options = {
            'method': 'GET',
            'hostname': 'www.okx.com',
            'path': `/priapi/v5/public/${$Query}`,
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

function marketDataHistory({ module, instType, instIdList, instFamilyList, dateAggrType, begin, end }) {
    if (!module) {
        return { status: 400, message: 'module is required' };
    }
    if (!instType) {
        return { status: 400, message: 'instType is required' };
    }
    if (!dateAggrType) {
        return { status: 400, message: 'dateAggrType is required' };
    }
    if (!begin) {
        return { status: 400, message: 'begin is required' };
    }
    if (!end) {
        return { status: 400, message: 'end is required' };
    }
    let params = [`module=${encodeURIComponent(module)}`,
    `instType=${encodeURIComponent(instType)}`,
    `dateAggrType=${encodeURIComponent(dateAggrType)}`,
    `begin=${encodeURIComponent(begin)}`,
    `end=${encodeURIComponent(end)}`];
    if (instIdList) params.push(`instIdList=${encodeURIComponent(instIdList)}`);
    if (instFamilyList) params.push(`instFamilyList=${encodeURIComponent(instFamilyList)}`);
    return CallHttp(`market-data-history?${params.join('&')}`);
}
function economicCalendar({ region, importance, before, after, limit } = {}) {
    let params = [];
    if (region) params.push(`region=${encodeURIComponent(region)}`);
    if (importance) params.push(`importance=${encodeURIComponent(importance)}`);
    if (before) params.push(`before=${encodeURIComponent(before)}`);
    if (after) params.push(`after=${encodeURIComponent(after)}`);
    if (limit) params.push(`limit=${encodeURIComponent(limit)}`);
    const query = params.length ? `?${params.join('&')}` : '';
    return CallHttp(`economic-calendar${query}`);
}
function indexComponents(index) {
    if (!index) {
        return { status: 400, message: 'index is required' };
    }
    return CallHttp(`../market/index-components?index=${encodeURIComponent(index)}`);
}
function exchangeRate() {
    return CallHttp('../market/exchange-rate');
}
function historyMarkPriceCandles({ instId, after, before, bar, limit }) {
    if (!instId) {
        return { status: 400, message: 'instId is required' };
    }
    let params = [`instId=${encodeURIComponent(instId)}`];
    if (after) params.push(`after=${encodeURIComponent(after)}`);
    if (before) params.push(`before=${encodeURIComponent(before)}`);
    if (bar) params.push(`bar=${encodeURIComponent(bar)}`);
    if (limit) params.push(`limit=${encodeURIComponent(limit)}`);
    return CallHttp(`../market/history-mark-price-candles?${params.join('&')}`);
}
function markPriceCandles({ instId, after, before, bar, limit }) {
    if (!instId) {
        return { status: 400, message: 'instId is required' };
    }
    let params = [`instId=${encodeURIComponent(instId)}`];
    if (after) params.push(`after=${encodeURIComponent(after)}`);
    if (before) params.push(`before=${encodeURIComponent(before)}`);
    if (bar) params.push(`bar=${encodeURIComponent(bar)}`);
    if (limit) params.push(`limit=${encodeURIComponent(limit)}`);
    return CallHttp(`../market/mark-price-candles?${params.join('&')}`);
}
function historyIndexCandles({ instId, after, before, bar, limit }) {
    if (!instId) {
        return { status: 400, message: 'instId is required' };
    }
    let params = [`instId=${encodeURIComponent(instId)}`];
    if (after) params.push(`after=${encodeURIComponent(after)}`);
    if (before) params.push(`before=${encodeURIComponent(before)}`);
    if (bar) params.push(`bar=${encodeURIComponent(bar)}`);
    if (limit) params.push(`limit=${encodeURIComponent(limit)}`);
    return CallHttp(`../market/history-index-candles?${params.join('&')}`);
}
function indexCandles({ instId, after, before, bar, limit }) {
    if (!instId) {
        return { status: 400, message: 'instId is required' };
    }
    let params = [`instId=${encodeURIComponent(instId)}`];
    if (after) params.push(`after=${encodeURIComponent(after)}`);
    if (before) params.push(`before=${encodeURIComponent(before)}`);
    if (bar) params.push(`bar=${encodeURIComponent(bar)}`);
    if (limit) params.push(`limit=${encodeURIComponent(limit)}`);
    return CallHttp(`../market/index-candles?${params.join('&')}`);
}
function indexTickers({ quoteCcy, instId }) {
    if (!quoteCcy && !instId) {
        return { status: 400, message: 'Either quoteCcy or instId is required' };
    }
    let params = [];
    if (quoteCcy) params.push(`quoteCcy=${encodeURIComponent(quoteCcy)}`);
    if (instId) params.push(`instId=${encodeURIComponent(instId)}`);
    return CallHttp(`../market/index-tickers?${params.join('&')}`);
}
function premiumHistory(instId, after, before, limit) {
    if (!instId) {
        return { status: 400, message: 'Instrument ID is required' };
    }
    let params = [`instId=${encodeURIComponent(instId)}`];
    if (after) params.push(`after=${encodeURIComponent(after)}`);
    if (before) params.push(`before=${encodeURIComponent(before)}`);
    if (limit) params.push(`limit=${encodeURIComponent(limit)}`);
    return CallHttp(`premium-history?${params.join('&')}`);
}
function instrumentTickBands(instType, instFamily) {
    if (!instType) {
        return { status: 400, message: 'Instrument type is required' };
    }
    let params = [`instType=${encodeURIComponent(instType)}`];
    if (instFamily) params.push(`instFamily=${encodeURIComponent(instFamily)}`);
    return CallHttp(`instrument-tick-bands?${params.join('&')}`);
}
function convertContractCoin({ instId, sz, px, type, unit, opType }) {
    if (!instId) {
        return { status: 400, message: 'Instrument ID is required' };
    }
    if (!sz) {
        return { status: 400, message: 'Quantity (sz) is required' };
    }
    let params = [`instId=${encodeURIComponent(instId)}`, `sz=${encodeURIComponent(sz)}`];
    if (px) params.push(`px=${encodeURIComponent(px)}`);
    if (type) params.push(`type=${encodeURIComponent(type)}`);
    if (unit) params.push(`unit=${encodeURIComponent(unit)}`);
    if (opType) params.push(`opType=${encodeURIComponent(opType)}`);
    return CallHttp(`convert-contract-coin?${params.join('&')}`);
}
function insuranceFund({ instType, type, instFamily, ccy, before, after, limit }) {
    if (!instType) {
        return { status: 400, message: 'Instrument type is required' };
    }
    let params = [`instType=${encodeURIComponent(instType)}`];
    if (type) params.push(`type=${encodeURIComponent(type)}`);
    if (instFamily) params.push(`instFamily=${encodeURIComponent(instFamily)}`);
    if (ccy) params.push(`ccy=${encodeURIComponent(ccy)}`);
    if (before) params.push(`before=${encodeURIComponent(before)}`);
    if (after) params.push(`after=${encodeURIComponent(after)}`);
    if (limit) params.push(`limit=${encodeURIComponent(limit)}`);
    return CallHttp(`insurance-fund?${params.join('&')}`);
}
function underlying(instType) {
    if (!instType) {
        return { status: 400, message: 'Instrument type is required' };
    }
    return CallHttp(`underlying?instType=${encodeURIComponent(instType)}`);
}
function interestRateLoanQuota() {
    return CallHttp('interest-rate-loan-quota');
}
function positionTiers(instType, tdMode, instFamily, instId, ccy, tier) {
    if (!instType) {
        return { status: 400, message: 'Instrument type is required' };
    }
    if (!tdMode) {
        return { status: 400, message: 'Trade mode is required' };
    }
    let params = [`instType=${encodeURIComponent(instType)}`, `tdMode=${encodeURIComponent(tdMode)}`];
    if (instFamily) params.push(`instFamily=${encodeURIComponent(instFamily)}`);
    if (instId) params.push(`instId=${encodeURIComponent(instId)}`);
    if (ccy) params.push(`ccy=${encodeURIComponent(ccy)}`);
    if (tier) params.push(`tier=${encodeURIComponent(tier)}`);
    return CallHttp(`position-tiers?${params.join('&')}`);
}
function markPrice(instType, instFamily, instId) {
    if (!instType) {
        return { status: 400, message: 'Instrument type is required' };
    }
    let params = [`instType=${encodeURIComponent(instType)}`];
    if (instFamily) params.push(`instFamily=${encodeURIComponent(instFamily)}`);
    if (instId) params.push(`instId=${encodeURIComponent(instId)}`);
    return CallHttp(`mark-price?${params.join('&')}`);
}
function time() {
    return CallHttp('time');
}
function discountRateInterestFreeQuota(ccy, discountLv) {
    let params = [];
    if (ccy) params.push(`ccy=${encodeURIComponent(ccy)}`);
    if (discountLv) params.push(`discountLv=${encodeURIComponent(discountLv)}`);
    const query = params.length ? `?${params.join('&')}` : '';
    return CallHttp(`discount-rate-interest-free-quota${query}`);
}
function optSummary(instFamily, expTime) {
    if (!instFamily) {
        return { status: 400, message: 'Instrument family is required' };
    }
    let params = [`instFamily=${encodeURIComponent(instFamily)}`];
    if (expTime) params.push(`expTime=${encodeURIComponent(expTime)}`);
    return CallHttp(`opt-summary?${params.join('&')}`);
}
function priceLimit(instId) {
    if (!instId) {
        return { status: 400, message: 'Instrument ID is required' };
    }
    return CallHttp(`price-limit?instId=${encodeURIComponent(instId)}`);
}
function openInterest(instType, instFamily, instId) {
    if (!instType) {
        return { status: 400, message: 'Instrument type is required' };
    }
    let params = [`instType=${encodeURIComponent(instType)}`];
    if (instFamily) params.push(`instFamily=${encodeURIComponent(instFamily)}`);
    if (instId) params.push(`instId=${encodeURIComponent(instId)}`);
    return CallHttp(`open-interest?${params.join('&')}`);
}
function fundingRateHistory(instId, before, after, limit) {
    if (!instId) {
        return { status: 400, message: 'Instrument ID is required' };
    }
    let params = [`instId=${encodeURIComponent(instId)}`];
    if (before) params.push(`before=${encodeURIComponent(before)}`);
    if (after) params.push(`after=${encodeURIComponent(after)}`);
    if (limit) params.push(`limit=${encodeURIComponent(limit)}`);
    return CallHttp(`funding-rate-history?${params.join('&')}`);
}

function Instrument($instType = 'FUTURES', $includeType = 1) {
    // Instrument type
    // SPOT: Spot
    // MARGIN: Margin
    // SWAP: Perpetual Futures
    // FUTURES: Expiry Futures
    // OPTION: Option
    return CallHttp(`simpleProduct?instType=${$instType.toUpperCase()}&includeType=${$includeType}&t=${Date.now()}`);
}

function EstimatedPrice($CoinName) {

    if (!$CoinName) {
        return { status: 400, message: 'Coin name is required' };
    }

    return CallHttp(`estimated-price?instId=${$CoinName}`);
}

function deliveryExerciseHistory($instType, instFamily) {

    if (!$instType) {
        return { status: 400, message: 'Instrument type is required' };
    }
    if (!instFamily) {
        return { status: 400, message: 'Instrument family is required' };
    }

    if (!$instType || !instFamily) {
        return { status: 400, message: 'instType and instFamily are required' };
    }

    return CallHttp(`delivery-exercise-history?instType=${$instType}&instFamily=${instFamily}&limit=100`);
}


function EstimatedSettlementInfo($instId) {

    if (!$instId) {
        return { status: 400, message: 'Instrument ID  is required' };
    }

    return CallHttp(`estimated-settlement-info?instId=${$instId}`);
}


function settlementHistory(instFamily, after, before, limit) {
    if (!instFamily) {
        return { status: 400, message: 'Instrument family is required' };
    }
    let params = [`instFamily=${encodeURIComponent(instFamily)}`];
    if (after) params.push(`after=${encodeURIComponent(after)}`);
    if (before) params.push(`before=${encodeURIComponent(before)}`);
    if (limit) params.push(`limit=${encodeURIComponent(limit)}`);
    return CallHttp(`settlement-history?${params.join('&')}`);
}

function fundingRate(instId) {
    if (!instId) {
        return { status: 400, message: 'Instrument ID is required' };
    }
    return CallHttp(`funding-rate?instId=${encodeURIComponent(instId)}`);
}

module.exports = {
    Instrument,
    EstimatedPrice,
    deliveryExerciseHistory,
    EstimatedSettlementInfo,
    settlementHistory,
    fundingRate,
    fundingRateHistory,
    openInterest,
    priceLimit,
    optSummary,
    discountRateInterestFreeQuota,
    time,
    markPrice,
    positionTiers,
    interestRateLoanQuota,
    underlying,
    insuranceFund,
    convertContractCoin,
    instrumentTickBands,
    premiumHistory,
    indexTickers,
    indexCandles,
    historyIndexCandles,
    markPriceCandles,
    historyMarkPriceCandles,
    exchangeRate,
    indexComponents,
    economicCalendar,
    marketDataHistory
};