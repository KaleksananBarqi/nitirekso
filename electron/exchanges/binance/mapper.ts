import type { RawClosedPosition, RawFill, RawFundingFee } from '../types'

function toNumber(value: unknown): number {
    if (typeof value === 'number') return value
    if (typeof value === 'string') {
        const parsed = Number(value)
        return Number.isFinite(parsed) ? parsed : 0
    }
    return 0
}

function toNumberOrNull(value: unknown): number | null {
    if (value === null || value === undefined || value === '') return null
    const parsed = toNumber(value)
    return Number.isFinite(parsed) ? parsed : null
}

function toStringOrNull(value: unknown): string | null {
    if (value === null || value === undefined) return null
    const text = String(value).trim()
    return text === '' ? null : text
}

function normalizeSymbol(rawSymbol: string): string {
    return rawSymbol.replace(/[_-]/g, '').replace(/\//g, '')
}

/**
 * Di Binance Futures user trades:
 * Jika order penutupan adalah 'SELL', posisi aslinya adalah 'long'.
 * Jika order penutupan adalah 'BUY', posisi aslinya adalah 'short'.
 */
function parseDirectionFromClosingSide(side: unknown): 'long' | 'short' {
    const s = String(side).toUpperCase()
    if (s === 'SELL') return 'long'
    if (s === 'BUY') return 'short'
    return 'long'
}

/**
 * Normalisasi satu closing trade dari Binance Futures (`/fapi/v1/userTrades`).
 */
export function mapClosedTrade(raw: Record<string, unknown>): RawClosedPosition | null {
    const id = toStringOrNull(raw['id'])
    const symbol = toStringOrNull(raw['symbol'])
    const time = toNumberOrNull(raw['time']) || toNumberOrNull(raw['timestamp'])

    if (!id || !symbol || !time) return null

    const pnl = toNumber(raw['realizedPnl'])
    // Abaikan jika bukan fill yang merealisasikan PnL (pnl === 0 biasanya fill pembuka)
    if (pnl === 0 && raw['realizedPnl'] === undefined) return null

    const price = toNumber(raw['price'])
    const qty = toNumber(raw['qty'] || raw['amount'])
    const commission = Math.abs(toNumber(raw['commission'] || raw['fee']))
    const side = raw['side'] || (raw['buyer'] === true ? 'BUY' : 'SELL')

    return {
        externalId: String(id),
        symbol: normalizeSymbol(symbol),
        direction: parseDirectionFromClosingSide(side),
        entryPrice: price, // Entry price estimasi jika tidak ada average open
        exitPrice: price,
        entryTime: time,
        exitTime: time,
        size: qty,
        leverage: 1,
        marginMode: null,
        realizedPnl: pnl,
        feeOpen: 0,
        feeClose: commission,
        fundingFee: 0,
        raw
    }
}

/**
 * Normalisasi fill individual Binance Futures.
 */
export function mapFill(trade: Record<string, unknown>): RawFill | null {
    const id = toStringOrNull(trade['id'])
    const symbol = toStringOrNull(trade['symbol'])
    const timestamp = toNumberOrNull(trade['timestamp']) || toNumberOrNull(trade['time'])
    const price = toNumberOrNull(trade['price'])
    const amount = toNumberOrNull(trade['amount']) || toNumberOrNull(trade['qty'])
    const side = toStringOrNull(trade['side'])

    if (!id || !symbol || !timestamp || price === null || amount === null || !side) {
        return null
    }

    let feeAmount = 0
    if (trade['fee'] && typeof trade['fee'] === 'object') {
        const feeObj = trade['fee'] as Record<string, unknown>
        feeAmount = Math.abs(toNumber(feeObj['cost']))
    } else if (trade['commission'] !== undefined) {
        feeAmount = Math.abs(toNumber(trade['commission']))
    }

    return {
        externalId: id,
        symbol: normalizeSymbol(symbol),
        side: side.toLowerCase() === 'buy' ? 'buy' : 'sell',
        price,
        qty: amount,
        fee: feeAmount,
        isMaker: trade['maker'] === true ? true : trade['maker'] === false ? false : null,
        filledAt: timestamp
    }
}

/**
 * Normalisasi funding fee dari income Binance Futures.
 */
export function mapFundingFee(raw: Record<string, unknown>): RawFundingFee | null {
    const id = toStringOrNull(raw['tranId']) || toStringOrNull(raw['id']) || `funding-${raw['symbol']}-${raw['time']}`
    const symbol = toStringOrNull(raw['symbol'])
    const time = toNumberOrNull(raw['time']) || toNumberOrNull(raw['timestamp'])
    const income = toNumberOrNull(raw['income']) || toNumberOrNull(raw['amount'])

    if (!id || !symbol || !time || income === null) {
        return null
    }

    return {
        externalId: id,
        symbol: normalizeSymbol(symbol),
        amount: income,
        rate: null,
        chargedAt: time
    }
}
