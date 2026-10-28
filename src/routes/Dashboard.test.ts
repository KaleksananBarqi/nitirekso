import { describe, expect, it } from 'vitest'
import React from 'react'
import { renderToString } from 'react-dom/server'
import type { Trade, TradeDetail, TradeJournal } from '../../shared/domain'
import { Dashboard } from './Dashboard'
import { compilePerformanceReport } from '../lib/analytics'

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

describe('Dashboard Route Integration with PerformanceReport (#30)', () => {
    it('mengekspor komponen Dashboard sebagai fungsi React', () => {
        expect(typeof Dashboard).toBe('function')
    })

    it('menampilkan EmptyState saat daftar trades bernilai kosong', () => {
        const html = renderToString(React.createElement(Dashboard, { trades: [], hidePnl: false }))
        expect(html).toContain('Belum ada data')
        expect(html).toContain('Dashboard akan menampilkan metrik performa setelah ada trade tercatat')
    })

    it('mengintegrasikan compilePerformanceReport untuk me-render headline metrics secara konsisten', () => {
        const trades: TradeDetail[] = [
            createTrade(
                { id: 1, symbol: 'BTCUSDT', realizedPnl: 300, feeOpen: 5, feeClose: 5, fundingFee: 10 },
                { setupTag: 'trend-pullback', executionGrade: 'A' },
                2.5
            ),
            createTrade(
                {
                    id: 2,
                    symbol: 'ETHUSDT',
                    direction: 'short',
                    entryTime: 1700010000000,
                    exitTime: 1700013600000,
                    realizedPnl: -100,
                    feeOpen: 4,
                    feeClose: 4,
                    fundingFee: 0
                },
                { setupTag: 'breakout', executionGrade: 'B' },
                -1.0
            )
        ]

        const report = compilePerformanceReport(trades)
        expect(report.summary.totalTrades).toBe(2)
        expect(report.summary.wins).toBe(1)
        expect(report.summary.losses).toBe(1)
        expect(report.summary.winRate).toBe(0.5)

        const html = renderToString(React.createElement(Dashboard, { trades, hidePnl: false }))

        // Header menampilkan total trades
        expect(html).toContain('Berdasarkan 2 trade')

        // Metric Card labels
        expect(html).toContain('Win Rate')
        expect(html).toContain('50.0%')
        expect(html).toContain('1W / 1L')

        expect(html).toContain('Profit Factor')
        expect(html).toContain('Expectancy')
        expect(html).toContain('P&amp;L Bersih')
        expect(html).toContain('Max Drawdown')
        expect(html).toContain('Durasi Drawdown')
        expect(html).toContain('Funding Fee')
        expect(html).toContain('R Valid')
        expect(html).toContain('2 / 2')
        expect(html).toContain('Total R')
        expect(html).toContain('Expectancy (R)')
        expect(html).toContain('Recovery Factor')
        expect(html).toContain('Streak Maksimal')
    })

    it('me-render kurva ekuitas SVG sparkline saat terdapat 2 trade atau lebih', () => {
        const trades: TradeDetail[] = [
            createTrade({ id: 1, realizedPnl: 150, feeOpen: 0, feeClose: 0, fundingFee: 0 }),
            createTrade({
                id: 2,
                entryTime: 1700020000000,
                exitTime: 1700023600000,
                realizedPnl: 250,
                feeOpen: 0,
                feeClose: 0,
                fundingFee: 0
            })
        ]

        const html = renderToString(React.createElement(Dashboard, { trades, hidePnl: false }))
        expect(html).toContain('Kurva Equity')
        expect(html).toContain('aria-label="Kurva equity kumulatif"')
        expect(html).not.toContain('Butuh minimal 2 trade untuk menggambar kurva equity.')
    })

    it('menampilkan pesan fallback saat trade kurang dari 2 untuk sparkline', () => {
        const trades: TradeDetail[] = [
            createTrade({ id: 1, realizedPnl: 100, feeOpen: 0, feeClose: 0, fundingFee: 0 })
        ]

        const html = renderToString(React.createElement(Dashboard, { trades, hidePnl: false }))
        expect(html).toContain('Kurva Equity')
        expect(html).toContain('Butuh minimal 2 trade untuk menggambar kurva equity.')
    })

    it('me-render daftar Trade Terakhir dengan arah posisi dan setup tag', () => {
        const trades: TradeDetail[] = [
            createTrade(
                { id: 1, symbol: 'SOLUSDT', direction: 'long', realizedPnl: 80 },
                { setupTag: 'breakout', executionGrade: 'A' },
                1.5
            )
        ]

        const html = renderToString(React.createElement(Dashboard, { trades, hidePnl: false }))
        expect(html).toContain('Trade Terakhir')
        expect(html).toContain('SOLUSDT')
        expect(html).toContain('Long')
        expect(html).toContain('breakout')
        expect(html).toContain('Grade')
        expect(html).toContain('A')
    })

    it('menghormati opsi privasi hidePnl dengan menyamarkan nominal finansial', () => {
        const trades: TradeDetail[] = [
            createTrade({ id: 1, realizedPnl: 500, feeOpen: 5, feeClose: 5, fundingFee: 0 })
        ]

        const htmlHidden = renderToString(React.createElement(Dashboard, { trades, hidePnl: true }))
        expect(htmlHidden).toContain('••••')
    })

    it('menangani trade impas (breakEven) dengan benar tanpa mendistorsi win rate', () => {
        const trades: TradeDetail[] = [
            createTrade({ id: 1, realizedPnl: 200, feeOpen: 5, feeClose: 5, fundingFee: 0 }),
            createTrade({
                id: 2,
                entryTime: 1700010000000,
                exitTime: 1700013600000,
                realizedPnl: 10,
                feeOpen: 5,
                feeClose: 5,
                fundingFee: 0
            }) // netPnl = 10 - 5 - 5 - 0 = 0 (breakEven)
        ]

        const report = compilePerformanceReport(trades)
        expect(report.summary.totalTrades).toBe(2)
        expect(report.summary.wins).toBe(1)
        expect(report.summary.breakEven).toBe(1)
        expect(report.summary.losses).toBe(0)
        expect(report.summary.winRate).toBe(1.0) // 1 win / 1 directional trade

        const html = renderToString(React.createElement(Dashboard, { trades, hidePnl: false }))
        expect(html).toContain('1W / 0L · 1 flat dikecualikan')
        expect(html).toContain('100.0%')
    })
})
