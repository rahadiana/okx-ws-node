function optionTakerBlockVolume({
    ccy,
    period
}) {
    if (!ccy) {
        return {
            status: 400,
            message: 'ccy is required'
        };
    }
    let params = [`ccy=${encodeURIComponent(ccy)}`];
    if (period) params.push(`period=${encodeURIComponent(period)}`);
    return CallHttp(`option/taker-block-volume?${params.join('&')}`);
}

function optionOpenInterestVolumeStrike({
    ccy,
    expTime,
    period
}) {
    if (!ccy) {
        return {
            status: 400,
            message: 'ccy is required'
        };
    }
    if (!expTime) {
        return {
            status: 400,
            message: 'expTime is required'
        };
    }
    let params = [`ccy=${encodeURIComponent(ccy)}`, `expTime=${encodeURIComponent(expTime)}`];
    if (period) params.push(`period=${encodeURIComponent(period)}`);
    return CallHttp(`option/open-interest-volume-strike?${params.join('&')}`);
}

function optionOpenInterestVolumeExpiry({
    ccy,
    period
}) {
    if (!ccy) {
        return {
            status: 400,
            message: 'ccy is required'
        };
    }
    let params = [`ccy=${encodeURIComponent(ccy)}`];
    if (period) params.push(`period=${encodeURIComponent(period)}`);
    return CallHttp(`option/open-interest-volume-expiry?${params.join('&')}`);
}

function optionOpenInterestVolumeRatio({
    ccy,
    period
}) {
    if (!ccy) {
        return {
            status: 400,
            message: 'ccy is required'
        };
    }
    let params = [`ccy=${encodeURIComponent(ccy)}`];
    if (period) params.push(`period=${encodeURIComponent(period)}`);
    return CallHttp(`option/open-interest-volume-ratio?${params.join('&')}`);
}

function optionOpenInterestVolume({
    ccy,
    period
}) {
    if (!ccy) {
        return {
            status: 400,
            message: 'ccy is required'
        };
    }
    let params = [`ccy=${encodeURIComponent(ccy)}`];
    if (period) params.push(`period=${encodeURIComponent(period)}`);
    return CallHttp(`option/open-interest-volume?${params.join('&')}`);
}

function openInterestVolume({
    ccy,
    begin,
    end,
    period
}) {
    if (!ccy) {
        return {
            status: 400,
            message: 'ccy is required'
        };
    }
    let params = [`ccy=${encodeURIComponent(ccy)}`];
    if (begin) params.push(`begin=${encodeURIComponent(begin)}`);
    if (end) params.push(`end=${encodeURIComponent(end)}`);
    if (period) params.push(`period=${encodeURIComponent(period)}`);
    return CallHttp(`contracts/open-interest-volume?${params.join('&')}`);
}

function longShortAccountRatio({
    ccy,
    begin,
    end,
    period
}) {
    if (!ccy) {
        return {
            status: 400,
            message: 'ccy is required'
        };
    }
    let params = [`ccy=${encodeURIComponent(ccy)}`];
    if (begin) params.push(`begin=${encodeURIComponent(begin)}`);
    if (end) params.push(`end=${encodeURIComponent(end)}`);
    if (period) params.push(`period=${encodeURIComponent(period)}`);
    return CallHttp(`contracts/long-short-account-ratio?${params.join('&')}`);
}

function longShortAccountRatioContract({
    instId,
    period,
    end,
    begin,
    limit
}) {
    if (!instId) {
        return {
            status: 400,
            message: 'instId is required'
        };
    }
    let params = [`instId=${encodeURIComponent(instId)}`];
    if (period) params.push(`period=${encodeURIComponent(period)}`);
    if (end) params.push(`end=${encodeURIComponent(end)}`);
    if (begin) params.push(`begin=${encodeURIComponent(begin)}`);
    if (limit) params.push(`limit=${encodeURIComponent(limit)}`);
    return CallHttp(`contracts/long-short-account-ratio-contract?${params.join('&')}`);
}

function longShortPositionRatioContractTopTrader({
    instId,
    period,
    end,
    begin,
    limit
}) {
    if (!instId) {
        return {
            status: 400,
            message: 'instId is required'
        };
    }
    let params = [`instId=${encodeURIComponent(instId)}`];
    if (period) params.push(`period=${encodeURIComponent(period)}`);
    if (end) params.push(`end=${encodeURIComponent(end)}`);
    if (begin) params.push(`begin=${encodeURIComponent(begin)}`);
    if (limit) params.push(`limit=${encodeURIComponent(limit)}`);
    return CallHttp(`contracts/long-short-position-ratio-contract-top-trader?${params.join('&')}`);
}

function longShortAccountRatioContractTopTrader({
    instId,
    period,
    end,
    begin,
    limit
}) {
    if (!instId) {
        return {
            status: 400,
            message: 'instId is required'
        };
    }
    let params = [`instId=${encodeURIComponent(instId)}`];
    if (period) params.push(`period=${encodeURIComponent(period)}`);
    if (end) params.push(`end=${encodeURIComponent(end)}`);
    if (begin) params.push(`begin=${encodeURIComponent(begin)}`);
    if (limit) params.push(`limit=${encodeURIComponent(limit)}`);
    return CallHttp(`contracts/long-short-account-ratio-contract-top-trader?${params.join('&')}`);
}

function marginLoanRatio({
    ccy,
    begin,
    end,
    period
}) {
    if (!ccy) {
        return {
            status: 400,
            message: 'ccy is required'
        };
    }
    let params = [`ccy=${encodeURIComponent(ccy)}`];
    if (begin) params.push(`begin=${encodeURIComponent(begin)}`);
    if (end) params.push(`end=${encodeURIComponent(end)}`);
    if (period) params.push(`period=${encodeURIComponent(period)}`);
    return CallHttp(`margin/loan-ratio?${params.join('&')}`);
}

function takerVolumeContract({
    instId,
    period,
    unit,
    end,
    begin,
    limit
}) {
    if (!instId) {
        return {
            status: 400,
            message: 'instId is required'
        };
    }
    let params = [`instId=${encodeURIComponent(instId)}`];
    if (period) params.push(`period=${encodeURIComponent(period)}`);
    if (unit) params.push(`unit=${encodeURIComponent(unit)}`);
    if (end) params.push(`end=${encodeURIComponent(end)}`);
    if (begin) params.push(`begin=${encodeURIComponent(begin)}`);
    if (limit) params.push(`limit=${encodeURIComponent(limit)}`);
    return CallHttp(`taker-volume-contract?${params.join('&')}`);
}

function takerVolume({
    ccy,
    instType,
    begin,
    end,
    period
}) {
    if (!ccy) {
        return {
            status: 400,
            message: 'ccy is required'
        };
    }
    if (!instType) {
        return {
            status: 400,
            message: 'instType is required'
        };
    }
    let params = [`ccy=${encodeURIComponent(ccy)}`, `instType=${encodeURIComponent(instType)}`];
    if (begin) params.push(`begin=${encodeURIComponent(begin)}`);
    if (end) params.push(`end=${encodeURIComponent(end)}`);
    if (period) params.push(`period=${encodeURIComponent(period)}`);
    return CallHttp(`taker-volume?${params.join('&')}`);
}

function contractsOpenInterestHistory({
    instId,
    period,
    end,
    begin,
    limit
}) {
    if (!instId) {
        return {
            status: 400,
            message: 'instId is required'
        };
    }
    let params = [`instId=${encodeURIComponent(instId)}`];
    if (period) params.push(`period=${encodeURIComponent(period)}`);
    if (end) params.push(`end=${encodeURIComponent(end)}`);
    if (begin) params.push(`begin=${encodeURIComponent(begin)}`);
    if (limit) params.push(`limit=${encodeURIComponent(limit)}`);
    return CallHttp(`contracts/open-interest-history?${params.join('&')}`);
}

function tradingDataSupportCoin() {
    return CallHttp('trading-data/support-coin');
}

function CallHttp($Query) {
    return new Promise((resolve, reject) => {
        const options = {
            'method': 'GET',
            'hostname': 'www.okx.com',
            'path': `/api/v5/rubik/stat/${$Query}`,
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
                    resolve({
                        status: 200,
                        data: parsed.data,
                        message: 'success'
                    });
                } catch (e) {
                    resolve({
                        status: 500,
                        message: 'Invalid JSON response'
                    });
                }
            });
        });
        req.on('error', (e) => {
            resolve({
                status: 500,
                message: e.message || String(e)
            });
        });
        req.on('timeout', () => {
            resolve({
                status: 408,
                message: 'timeout'
            });
            req.destroy();
        });
        req.end();
    });
}

module.exports = {
    tradingDataSupportCoin,
    contractsOpenInterestHistory,
    takerVolume,
    takerVolumeContract,
    marginLoanRatio,
    longShortAccountRatioContractTopTrader,
    longShortPositionRatioContractTopTrader,
    longShortAccountRatioContract,
    longShortAccountRatio,
    openInterestVolume,
    optionOpenInterestVolume,
    optionOpenInterestVolumeRatio,
    optionOpenInterestVolumeExpiry,
    optionOpenInterestVolumeStrike,
    optionTakerBlockVolume
};