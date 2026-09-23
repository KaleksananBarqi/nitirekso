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
import { mapClosedPosition, mapFill, mapFundingFee } from './mapper'

const DEFAULT_PAGE_SIZE = 100
const MAX_PAGES = 200

export class BybitAdapter implements ExchangeAdapter {
    readonly id = 'bybit' as const
    readonly displayName = 'Bybit Futures'

    private client: unknown

    constructor(credentials: ExchangeCredentials) {
        this.client = createClient(credentials)
    }

    async fetchClosedPositions(
        cursor: SyncCursor,
        options: FetchOptions = {}
    ): Promise<RawClosedPosition[]> {
        const pageSize = options.limit ?? DEFAULT_PAGE_SIZE
        const collected: RawClosedPosition[] = []
        const maxPages = cursor.lastExitTime === null ? MAX_PAGES : 3

        let currentCursor: string | undefined = undefined

        for (let page = 1; page <= maxPages; page += 1) {
            const pageResult = await this.fetchPositionPage(pageSize, currentCursor, options)
            const positions = pageResult.list

            if (!positions || positions.length === 0) break

            let reachedCursor = false
            for (const position of positions) {
                // Info raw dari Bybit closed-pnl ada di item langsung atau di position.info
                const rawObj = (position && typeof position === 'object' && 'info' in position)
                    ? (position.info as Record<string, unknown>)
                    : (position as Record<string, unknown>)

                const mapped = mapClosedPosition(rawObj)
                if (mapped === null) continue

                if (cursor.lastExitTime !== null && mapped.exitTime <= cursor.lastExitTime) {
                    reachedCursor = true
                    continue
                }
                collected.push(mapped)
            }

            if (reachedCursor) break
            if (!pageResult.nextCursor) break
            currentCursor = pageResult.nextCursor
        }

        return collected
    }

    private async fetchPositionPage(
        pageSize: number,
        nextCursor: string | undefined,
        options: FetchOptions
    ): Promise<{ list: unknown[]; nextCursor?: string }> {
        return withRetry(
            async () => {
                const client = this.client as {
                    fetchPositionsHistory?: (
                        symbols?: string[],
                        since?: number,
                        limit?: number,
                        params?: Record<string, unknown>
                    ) => Promise<unknown[]>
                    privateGetV5PositionClosedPnl?: (
                        params?: Record<string, unknown>
                    ) => Promise<{ result?: { list?: unknown[]; nextPageCursor?: string } }>
                }

                const params: Record<string, unknown> = {
                    category: 'linear',
                    limit: pageSize
                }
                if (nextCursor) {
                    params['cursor'] = nextCursor
                }

                if (typeof client.fetchPositionsHistory === 'function') {
                    const res = await client.fetchPositionsHistory(undefined, undefined, pageSize, params)
                    return { list: res || [] }
                }

                if (typeof client.privateGetV5PositionClosedPnl === 'function') {
                    const res = await client.privateGetV5PositionClosedPnl(params)
                    return {
                        list: res?.result?.list || [],
                        nextCursor: res?.result?.nextPageCursor
                    }
                }

                return { list: [] }
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
                const client = this.client as {
                    fetchMyTrades?: (
                        symbol?: string,
                        since?: number,
                        limit?: number,
                        params?: Record<string, unknown>
                    ) => Promise<unknown[]>
                }

                if (typeof client.fetchMyTrades !== 'function') return []

                const since = cursor.lastExitTime !== null ? cursor.lastExitTime + 1 : undefined
                const rawTrades = await client.fetchMyTrades(undefined, since, options.limit ?? 100, {
                    category: 'linear'
                })

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
                const client = this.client as {
                    fetchFundingHistory?: (
                        symbol?: string,
                        since?: number,
                        limit?: number,
                        params?: Record<string, unknown>
                    ) => Promise<unknown[]>
                }

                if (typeof client.fetchFundingHistory !== 'function') return []

                const since = cursor.lastExitTime !== null ? cursor.lastExitTime + 1 : undefined
                const rawFees = await client.fetchFundingHistory(undefined, since, options.limit ?? 100, {
                    category: 'linear'
                })

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
                const client = this.client as {
                    fetchBalance?: (params?: Record<string, unknown>) => Promise<Record<string, unknown>>
                }

                if (typeof client.fetchBalance !== 'function') return []

                const raw = await client.fetchBalance({ accountType: 'UNIFIED' })
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
                        exchange: 'bybit',
                        asset,
                        total,
                        available,
                        unrealizedPnl: 0,
                        updatedAt: now
                    })
                }

                if (result.length === 0) {
                    result.push({
                        exchange: 'bybit',
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
        `[bybit] percobaan ${attempt} gagal (${error.kind}): ${error.message}. ` +
        `Mencoba lagi dalam ${delay} ms.`
    )
}

function createClient(credentials: ExchangeCredentials): unknown {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const ccxt = require('ccxt') as Record<string, unknown>
    const BybitClass = ccxt['bybit'] as (new (config: Record<string, unknown>) => unknown) | undefined

    if (!BybitClass) {
        throw new ExchangeError(
            'ccxt tidak mengenali exchange "bybit". Periksa versi ccxt yang terpasang.',
            'bybit',
            'unsupported',
            false
        )
    }

    const proxy = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.https_proxy || process.env.http_proxy

    return new BybitClass({
        apiKey: credentials.apiKey,
        secret: credentials.apiSecret,
        options: {
            defaultType: 'swap',
            adjustForTimeDifference: true
        },
        enableRateLimit: true,
        timeout: 20_000,
        httpsProxy: proxy || undefined
    })
}
