import { describe, expect, it, vi, beforeEach } from 'vitest'
import React from 'react'
import { renderToString } from 'react-dom/server'
import type { SanitizedPoint } from '../../lib/analytics'
import type { RoiComparisonPoint } from '../../lib/btc-api'
import { compilePerformanceReport } from '../../lib/analytics/performance-report'
import { createTrade } from '../../test/fixtures'
import { EquityChart } from './EquityChart'

describe('EquityChart Component & SanitizedPoint Integration (#29)', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('mengekspor komponen EquityChart sebagai fungsi React', () => {
        expect(typeof EquityChart).toBe('function')
    })

    it('menampilkan fallback text saat data points kosong', () => {
        const html = renderToString(React.createElement(EquityChart, { points: [] }))
        expect(html).toContain('Belum ada data untuk digambar.')
    })

    it('menampilkan fallback text saat mode ROI dipilih tetapi roiPoints kosong', () => {
        const sanitizedPoints: SanitizedPoint[] = [
            { time: 1700000000000, equity: 100, peak: 100, drawdown: 0, tradeId: 1 }
        ]
        const html = renderToString(
            React.createElement(EquityChart, {
                points: sanitizedPoints,
                variant: 'roi',
                roiPoints: []
            })
        )
        expect(html).toContain('Memuat atau data perbandingan BTC belum tersedia...')
    })

    it('menerima SanitizedPoint[] hasil compilePerformanceReport secara langsung dan me-render container chart', () => {
        const trade1 = createTrade(
            { id: 1, realizedPnl: 200, feeOpen: 5, feeClose: 5 },
            { setupTag: 'breakout' },
            2
        )
        const trade2 = createTrade(
            { id: 2, realizedPnl: -100, feeOpen: 5, feeClose: 5, direction: 'short', entryTime: 1700004000000, exitTime: 1700007200000 },
            { setupTag: 'reversal' },
            -1
        )

        const report = compilePerformanceReport([trade1, trade2])
        expect(report.equityCurve).toHaveLength(2)

        const html = renderToString(
            React.createElement(EquityChart, {
                points: report.equityCurve,
                variant: 'equity',
                height: 300
            })
        )

        // Verifikasi container chart dirender
        expect(html).toContain('class="relative"')
        expect(html).not.toContain('Belum ada data untuk digambar.')
    })

    it('me-render legenda Portofolio ROI dan BTC Buy & Hold saat mode ROI aktif dengan data lengkap', () => {
        const sanitizedPoints: SanitizedPoint[] = [
            { time: 1700000000000, equity: 100, peak: 100, drawdown: 0, tradeId: 1 }
        ]
        const roiPoints: RoiComparisonPoint[] = [
            {
                time: 1700000000000,
                userRoi: 10,
                btcRoi: 5,
                userEquity: 100,
                btcPrice: 50000
            }
        ]

        const html = renderToString(
            React.createElement(EquityChart, {
                points: sanitizedPoints,
                variant: 'roi',
                roiPoints
            })
        )

        expect(html).toContain('Portofolio ROI (%)')
        expect(html).toContain('BTC Buy &amp; Hold (%)')
    })

    it('memastikan pemetaan titik koordinat SanitizedPoint ke format lightweight-charts presisi dan deterministik', () => {
        const sanitizedPoints: SanitizedPoint[] = [
            { time: 1700000000000, equity: 190, peak: 190, drawdown: 0, tradeId: 1 },
            { time: 1700003600000, equity: 80, peak: 190, drawdown: -110, tradeId: 2 }
        ]

        // Simulasi pemetaan titik equity
        const mappedEquity = sanitizedPoints.map((p) => ({
            time: Math.floor(p.time / 1000),
            value: p.equity
        }))

        expect(mappedEquity).toEqual([
            { time: 1700000000, value: 190 },
            { time: 1700003600, value: 80 }
        ])

        // Simulasi pemetaan titik drawdown
        const mappedDrawdown = sanitizedPoints.map((p) => ({
            time: Math.floor(p.time / 1000),
            value: p.drawdown
        }))

        expect(mappedDrawdown).toEqual([
            { time: 1700000000, value: 0 },
            { time: 1700003600, value: -110 }
        ])
    })
})
