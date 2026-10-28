import type { Trade, TradeDetail, TradeJournal } from '../../shared/domain'

let mockIdCounter = 100

/**
 * Fixture pembantu untuk membuat objek TradeDetail tiruan yang lengkap dan konsisten
 * dalam pengujian unit maupun integrasi analitik.
 */
export function createTrade(
    overrides: Partial<Trade> = {},
    journalOverrides: Partial<TradeJournal> = {},
    rMultiple: number | null = null
): TradeDetail {
    const id = overrides.id ?? ++mockIdCounter
    const entryTime = overrides.entryTime ?? 1700000000000
    const exitTime = overrides.exitTime ?? entryTime + 3600000

    return {
        trade: {
            id,
            exchange: 'binance',
            externalId: `pos-${id}`,
            symbol: 'BTCUSDT',
            direction: 'long',
            entryPrice: 50000,
            exitPrice: 51000,
            entryTime,
            exitTime,
            size: 1,
            leverage: 10,
            marginMode: 'isolated',
            realizedPnl: 100,
            pnlSource: 'exchange_reported',
            feeOpen: 2,
            feeClose: 2,
            feeOpenMaker: null,
            feeCloseMaker: null,
            fundingFee: 0,
            createdAt: entryTime,
            updatedAt: exitTime,
            ...overrides
        },
        journal: {
            tradeId: id,
            setupTag: 'breakout',
            preTradeThesis: 'Rencana breakout',
            postTradeReview: 'Target tercapai',
            emotionTag: 'calm',
            executionGrade: 'A',
            screenshotPath: null,
            updatedAt: exitTime,
            ...journalOverrides
        },
        plannedRisk: null,
        checklist: [],
        tags: [],
        rMultiple
    }
}
