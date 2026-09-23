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
 * Normalisasi income realized PnL dari BingX Swap v2 user income.
 */
export function mapClosedIncome(raw: Record<string, unknown>): RawClosedPosition | null {
    const tranId = toStringOrNull(raw['tranId']) || toStringOrNull(raw['id']) || toStringOrNull(raw['tradeId'])
    const rawSymbol = toStringOrNull(raw['symbol'])
    const time = toNumberOrNull(raw['time']) || toNumberOrNull(raw['timestamp'])

    if (!tranId || !rawSymbol || !time) return null

    const income = toNumber(raw['income'] || raw['amount'])

    return {
        externalId: tranId,
        symbol: normalizeSymbol(rawSymbol),
        direction: income >= 0 ? 'long' : 'short', // fallback arah
        entryPrice: 0,
        exitPrice: 0,
        entryTime: time,
        exitTime: time,
        size: 0,
        leverage: 1,
        marginMode: null,
        realizedPnl: income,
        feeOpen: 0,
        feeClose: 0,
        fundingFee: 0,
        raw
    }
}

/**
 * Normalisasi fill individual BingX Swap.
 */
export function mapFill(trade: Record<string, unknown>): RawFill | null {
    const id = toStringOrNull(trade['id']) || toStringOrNull(trade['orderId'])
    const symbol = toStringOrNull(trade['symbol'])
    const timestamp = toNumberOrNull(trade['timestamp']) || (trade['filledTime'] ? new Date(String(trade['filledTime'])).getTime() : null)
    const price = toNumberOrNull(trade['price'])
    const amount = toNumberOrNull(trade['amount']) || toNumberOrNull(trade['volume'])
    const side = toStringOrNull(trade['side']) || 'buy'

    if (!id || !symbol || !timestamp || price === null || amount === null) {
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
        side: String(side).toLowerCase() === 'sell' ? 'sell' : 'buy',
        price,
        qty: amount,
        fee: feeAmount,
        isMaker: trade['maker'] === true ? true : trade['maker'] === false ? false : null,
        filledAt: timestamp
    }
}

/**
 * Normalisasi funding fee dari BingX Swap.
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
