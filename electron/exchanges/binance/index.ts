import type {
    ExchangeAdapter,
    ExchangeCredentials,
    FetchOptions,
    RawClosedPosition,
    RawFill,
    RawFundingFee,
    SyncCursor
} from '../types'
import type { AccountBalance } from '../../../shared/domain'
import { ExchangeError, withRetry } from '../types'
import { mapClosedTrade, mapFill, mapFundingFee } from './mapper'

const DEFAULT_PAGE_SIZE = 100

export class BinanceAdapter implements ExchangeAdapter {
    readonly id = 'binance' as const
    readonly displayName = 'Binance Futures'

    private clientPromise: Promise<unknown>

    constructor(credentials: ExchangeCredentials) {
        this.clientPromise = createClient(credentials).catch((err) => {
            console.error('[binance] Failed to initialize ccxt:', err)
            throw err
        })
    }

    async fetchClosedPositions(
        cursor: SyncCursor,
        options: FetchOptions = {}
    ): Promise<RawClosedPosition[]> {
        return withRetry(
            async () => {
                const client = (await this.clientPromise) as {
                    fetchMyTrades?: (
                        symbol?: string,
                        since?: number,
                        limit?: number,
                        params?: Record<string, unknown>
                    ) => Promise<unknown[]>
                }

                if (typeof client.fetchMyTrades !== 'function') return []

                const since = cursor.lastExitTime !== null ? cursor.lastExitTime + 1 : undefined
                const rawTrades = await client.fetchMyTrades(undefined, since, options.limit ?? DEFAULT_PAGE_SIZE)

                const positions: RawClosedPosition[] = []
                for (const raw of rawTrades || []) {
                    const rawObj = (raw && typeof raw === 'object' && 'info' in raw)
                        ? (raw.info as Record<string, unknown>)
                        : (raw as Record<string, unknown>)

                    // PnL != 0 menandakan fill closing posisi di Binance Futures
                    const pnlVal = Number(rawObj['realizedPnl'])
                    if (Number.isFinite(pnlVal) && pnlVal !== 0) {
                        const mapped = mapClosedTrade(rawObj)
                        if (mapped) positions.push(mapped)
                    }
                }

                return positions
            },
            this.id,
            {
                signal: options.signal,
                onRetry: logRetry
            }
        )
    }

    async fetchFills(
        cursor: SyncCursor,
        options: FetchOptions = {}
    ): Promise<RawFill[]> {
        return withRetry(
            async () => {
                const client = (await this.clientPromise) as {
                    fetchMyTrades?: (
                        symbol?: string,
                        since?: number,
                        limit?: number,
                        params?: Record<string, unknown>
                    ) => Promise<unknown[]>
                }

                if (typeof client.fetchMyTrades !== 'function') return []

                const since = cursor.lastExitTime !== null ? cursor.lastExitTime + 1 : undefined
                const rawTrades = await client.fetchMyTrades(undefined, since, options.limit ?? 100)

                const fills: RawFill[] = []
                for (const raw of rawTrades || []) {
                    const mapped = mapFill(raw as Record<string, unknown>)
                    if (mapped) fills.push(mapped)
                }
                return fills
            },
            this.id,
            {
                signal: options.signal,
                onRetry: logRetry
            }
        )
    }

    async fetchFundingFees(
        cursor: SyncCursor,
        options: FetchOptions = {}
    ): Promise<RawFundingFee[]> {
        return withRetry(
            async () => {
                const client = (await this.clientPromise) as {
                    fetchFundingHistory?: (
                        symbol?: string,
                        since?: number,
                        limit?: number,
                        params?: Record<string, unknown>
                    ) => Promise<unknown[]>
                }

                if (typeof client.fetchFundingHistory !== 'function') return []

                const since = cursor.lastExitTime !== null ? cursor.lastExitTime + 1 : undefined
                const rawFees = await client.fetchFundingHistory(undefined, since, options.limit ?? 100)

                const fees: RawFundingFee[] = []
                for (const raw of rawFees || []) {
                    const mapped = mapFundingFee(raw as Record<string, unknown>)
                    if (mapped) fees.push(mapped)
                }
                return fees
            },
            this.id,
            {
                signal: options.signal,
                onRetry: logRetry
            }
        )
    }

    async fetchBalances(options: FetchOptions = {}): Promise<AccountBalance[]> {
        return withRetry(
            async () => {
                const client = (await this.clientPromise) as {
                    fetchBalance?: (params?: Record<string, unknown>) => Promise<Record<string, unknown>>
                }

                if (typeof client.fetchBalance !== 'function') return []

                const raw = await client.fetchBalance()
                const now = Date.now()
                const result: AccountBalance[] = []

                const totalMap = (raw['total'] || {}) as Record<string, unknown>
                const freeMap = (raw['free'] || {}) as Record<string, unknown>

                const assets = Object.keys(totalMap).filter((asset) => {
                    const val = Number(totalMap[asset])
                    return Number.isFinite(val) && (val > 0 || asset === 'USDT')
                })

                for (const asset of assets) {
                    const total = Number(totalMap[asset]) || 0
                    const available = Number(freeMap[asset]) || 0
                    result.push({
                        exchange: 'binance',
                        asset,
                        total,
                        available,
                        unrealizedPnl: 0,
                        updatedAt: now
                    })
                }

                if (result.length === 0) {
                    result.push({
                        exchange: 'binance',
                        asset: 'USDT',
                        total: 0,
                        available: 0,
                        unrealizedPnl: 0,
                        updatedAt: now
                    })
                }

                return result
            },
            this.id,
            {
                signal: options.signal,
                onRetry: logRetry
            }
        )
    }
}

function logRetry(attempt: number, delay: number, error: ExchangeError): void {
    console.warn(
        `[binance] percobaan ${attempt} gagal (${error.kind}): ${error.message}. ` +
        `Mencoba lagi dalam ${delay} ms.`
    )
}

async function createClient(credentials: ExchangeCredentials): Promise<unknown> {
    const ccxtModule = await import('ccxt')
    const ccxt = (ccxtModule.default || ccxtModule) as Record<string, unknown>
    const BinanceClass = (ccxt['binanceusdm'] || ccxt['binance']) as
        | (new (config: Record<string, unknown>) => unknown)
        | undefined

    if (!BinanceClass) {
        throw new ExchangeError(
            'ccxt tidak mengenali exchange "binanceusdm". Periksa versi ccxt yang terpasang.',
            'binance',
            'unsupported',
            false
        )
    }

    const proxy = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.https_proxy || process.env.http_proxy

    return new BinanceClass({
        apiKey: credentials.apiKey,
        secret: credentials.apiSecret,
        options: {
            defaultType: 'future',
            adjustForTimeDifference: true
        },
        enableRateLimit: true,
        timeout: 20_000,
        httpsProxy: proxy || undefined
    })
}
