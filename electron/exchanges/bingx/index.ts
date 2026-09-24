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
import { mapClosedIncome, mapFill, mapFundingFee } from './mapper'

const DEFAULT_PAGE_SIZE = 100

export class BingxAdapter implements ExchangeAdapter {
    readonly id = 'bingx' as const
    readonly displayName = 'BingX Futures'

    private client: Promise<unknown> | null = null
    private credentials: ExchangeCredentials

    constructor(credentials: ExchangeCredentials) {
        this.credentials = credentials
    }

    private getClient(): Promise<unknown> {
        if (!this.client) {
            this.client = createClient(this.credentials)
        }
        return this.client
    }

    async fetchClosedPositions(
        cursor: SyncCursor,
        options: FetchOptions = {}
    ): Promise<RawClosedPosition[]> {
        return withRetry(
            async () => {
                const resolvedClient = await this.getClient()
                const client = resolvedClient as {
                    swapV2PrivateGetUserIncome?: (params?: Record<string, unknown>) => Promise<{ data?: unknown[] } | unknown[]>
                }

                if (typeof client.swapV2PrivateGetUserIncome !== 'function') return []

                const params: Record<string, unknown> = {
                    incomeType: 'REALIZED_PNL',
                    limit: options.limit ?? DEFAULT_PAGE_SIZE
                }

                if (cursor.lastExitTime !== null) {
                    params['startTime'] = cursor.lastExitTime + 1
                }

                const res = await client.swapV2PrivateGetUserIncome(params)
                const list = Array.isArray(res) ? res : (res && typeof res === 'object' && 'data' in res && Array.isArray((res as { data?: unknown[] }).data)) ? (res as { data?: unknown[] }).data! : []

                const positions: RawClosedPosition[] = []
                for (const raw of list) {
                    const mapped = mapClosedIncome(raw as Record<string, unknown>)
                    if (mapped) positions.push(mapped)
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
                const resolvedClient = await this.getClient()
                const client = resolvedClient as {
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
                const resolvedClient = await this.getClient()
                const client = resolvedClient as {
                    swapV2PrivateGetUserIncome?: (params?: Record<string, unknown>) => Promise<{ data?: unknown[] } | unknown[]>
                }

                if (typeof client.swapV2PrivateGetUserIncome !== 'function') return []

                const params: Record<string, unknown> = {
                    incomeType: 'FUNDING_FEE',
                    limit: options.limit ?? 100
                }

                if (cursor.lastExitTime !== null) {
                    params['startTime'] = cursor.lastExitTime + 1
                }

                const res = await client.swapV2PrivateGetUserIncome(params)
                const list = Array.isArray(res) ? res : (res && typeof res === 'object' && 'data' in res && Array.isArray((res as { data?: unknown[] }).data)) ? (res as { data?: unknown[] }).data! : []

                const fees: RawFundingFee[] = []
                for (const raw of list) {
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
                const resolvedClient = await this.getClient()
                const client = resolvedClient as {
                    fetchBalance?: (params?: Record<string, unknown>) => Promise<Record<string, unknown>>
                }

                if (typeof client.fetchBalance !== 'function') return []

                const raw = await client.fetchBalance({ type: 'swap' })
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
                        exchange: 'bingx',
                        asset,
                        total,
                        available,
                        unrealizedPnl: 0,
                        updatedAt: now
                    })
                }

                if (result.length === 0) {
                    result.push({
                        exchange: 'bingx',
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
        `[bingx] percobaan ${attempt} gagal (${error.kind}): ${error.message}. ` +
        `Mencoba lagi dalam ${delay} ms.`
    )
}

async function createClient(credentials: ExchangeCredentials): Promise<unknown> {
    const imported = await import('ccxt')
    const ccxt = (imported.default || imported) as Record<string, unknown>
    const BingxClass = ccxt['bingx'] as (new (config: Record<string, unknown>) => unknown) | undefined

    if (!BingxClass) {
        throw new ExchangeError(
            'ccxt tidak mengenali exchange "bingx". Periksa versi ccxt yang terpasang.',
            'bingx',
            'unsupported',
            false
        )
    }

    const proxy = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.https_proxy || process.env.http_proxy

    return new BingxClass({
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
