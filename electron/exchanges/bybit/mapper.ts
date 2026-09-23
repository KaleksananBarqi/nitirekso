import type { RawClosedPosition, RawFill, RawFundingFee } from '../types'

/**
 * Mapper Bybit V5: response mentah ccxt -> bentuk ternormalisasi internal.
 */

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
 * Di Bybit V5 closed-pnl:
 * `side`: 'Sell' berarti closing order adalah Sell, jadi posisi aslinya adalah 'long'.
 * `side`: 'Buy' berarti closing order adalah Buy, jadi posisi aslinya adalah 'short'.
 */
function parseDirection(side: unknown): 'long' | 'short' {
    const s = String(side).toLowerCase()
    if (s === 'sell') return 'long'
    if (s === 'buy') return 'short'
    return 'long'
}

/**
 * Normalisasi satu posisi tertutup dari Bybit V5 closed-pnl (`position.info`).
 */
export function mapClosedPosition(raw: Record<string, unknown>): RawClosedPosition | null {
    const orderId = toStringOrNull(raw['orderId']) || toStringOrNull(raw['id'])
    const rawSymbol = toStringOrNull(raw['symbol'])
    const updatedTime = toNumberOrNull(raw['updatedTime']) || toNumberOrNull(raw['createdTime'])

    if (!orderId || !rawSymbol || !updatedTime) {
        return null
    }

    const createdTime = toNumberOrNull(raw['createdTime']) || updatedTime
    const avgEntryPrice = toNumber(raw['avgEntryPrice'] || raw['entryPrice'])
    const avgExitPrice = toNumber(raw['avgExitPrice'] || raw['orderPrice'] || avgEntryPrice)
    const closedSize = toNumber(raw['closedSize'] || raw['qty'] || raw['size'])
    const leverage = toNumber(raw['leverage']) || 1
    const closedPnl = toNumber(raw['closedPnl'])
    const openFee = toNumber(raw['openFee'])
    const closeFee = toNumber(raw['closeFee'])

    return {
        externalId: orderId,
        symbol: normalizeSymbol(rawSymbol),
        direction: parseDirection(raw['side']),
        entryPrice: avgEntryPrice,
        exitPrice: avgExitPrice,
        entryTime: createdTime,
        exitTime: updatedTime,
        size: closedSize,
        leverage,
        marginMode: null,
        realizedPnl: closedPnl,
        feeOpen: openFee,
        feeClose: closeFee,
        fundingFee: 0,
        raw
    }
}

/**
 * Normalisasi satu fill (eksekusi) Bybit dari ccxt `trade`.
 */
export function mapFill(trade: Record<string, unknown>): RawFill | null {
    const id = toStringOrNull(trade['id'])
    const symbol = toStringOrNull(trade['symbol'])
    const timestamp = toNumberOrNull(trade['timestamp'])
    const price = toNumberOrNull(trade['price'])
    const amount = toNumberOrNull(trade['amount'])
    const side = toStringOrNull(trade['side'])

    if (!id || !symbol || !timestamp || price === null || amount === null || !side) {
        return null
    }

    let feeAmount = 0
    if (trade['fee'] && typeof trade['fee'] === 'object') {
        const feeObj = trade['fee'] as Record<string, unknown>
        feeAmount = toNumber(feeObj['cost'])
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
 * Normalisasi satu catatan funding fee dari ccxt `fetchFundingHistory`.
 */
export function mapFundingFee(raw: Record<string, unknown>): RawFundingFee | null {
    const id = toStringOrNull(raw['id']) || `funding-${raw['symbol']}-${raw['timestamp']}`
    const symbol = toStringOrNull(raw['symbol'])
    const timestamp = toNumberOrNull(raw['timestamp'])
    const amount = toNumberOrNull(raw['amount'])

    if (!id || !symbol || !timestamp || amount === null) {
        return null
    }

    let rate: number | null = null
    if (raw['info'] && typeof raw['info'] === 'object') {
        const info = raw['info'] as Record<string, unknown>
        rate = toNumberOrNull(info['fundingRate'])
    }

    return {
        externalId: id,
        symbol: normalizeSymbol(symbol),
        amount,
        rate,
        chargedAt: timestamp
    }
}
