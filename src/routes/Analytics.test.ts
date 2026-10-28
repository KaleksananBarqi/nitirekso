import { describe, expect, it } from 'vitest'
import React from 'react'
import { renderToString } from 'react-dom/server'
import type { Trade, TradeDetail, TradeJournal } from '../../shared/domain'
import { Analytics } from './Analytics'
import { compilePerformanceReport } from '../lib/analytics/performance-report'

function createTrade(
    overrides: Partial<Trade> = {},
    journalOverrides: Partial<TradeJournal> = {},
    rMultiple: number | null = null
): TradeDetail {
    const id = overrides.id ?? 1
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

describe('Analytics Route Integration with PerformanceReport (#29)', () => {
    it('mengekspor komponen Analytics sebagai fungsi React', () => {
        expect(typeof Analytics).toBe('function')
    })

    it('menampilkan EmptyState saat trades bernilai kosong', () => {
        const html = renderToString(React.createElement(Analytics, { trades: [], hidePnl: false }))
        expect(html).toContain('Belum ada data untuk dianalisis')
    })

    it('mengintegrasikan compilePerformanceReport untuk me-render headline metrics dan breakdown', () => {
        const trades: TradeDetail[] = [
            createTrade(
                { id: 1, symbol: 'BTCUSDT', realizedPnl: 250, feeOpen: 5, feeClose: 5, fundingFee: 0 },
                { setupTag: 'breakout', executionGrade: 'A', emotionTag: 'calm' },
                2
            ),
            createTrade(
                {
                    id: 2,
                    symbol: 'ETHUSDT',
                    exchange: 'bybit',
                    direction: 'short',
                    entryTime: 1700004000000,
                    exitTime: 1700007200000,
                    realizedPnl: -100,
                    feeOpen: 5,
                    feeClose: 5,
                    fundingFee: 0
                },
                { setupTag: 'reversal', executionGrade: 'B', emotionTag: 'fomo' },
                -1
            )
        ]

        // Jalankan engine analitik langsung untuk memverifikasi nilai harapan
        const report = compilePerformanceReport(trades)
        expect(report.summary.totalTrades).toBe(2)
        expect(report.summary.wins).toBe(1)
        expect(report.summary.losses).toBe(1)
        expect(report.summary.winRate).toBe(0.5)
        expect(report.equityCurve).toHaveLength(2)
        expect(report.rDistribution.withR).toBe(2)

        const html = renderToString(
            React.createElement(Analytics, { trades, hidePnl: false })
        )

        // Verifikasi elemen antarmuka yang bersumber dari report
        expect(html).toContain('Win Rate')
        expect(html).toContain('50.0%')
        expect(html).toContain('Profit Factor')
        expect(html).toContain('P&amp;L Bersih')
        expect(html).toContain('Max Drawdown')
        expect(html).toContain('Distribusi R-Multiple')
        expect(html).toContain('Breakdown')
    })
})
