import { describe, expect, it } from 'vitest'
import type { Trade, TradeDetail, TradeJournal } from '../../../shared/domain'
import { compilePerformanceReport } from './performance-report'
import type { PricePoint } from './types'

let mockIdCounter = 100

function createTrade(
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
            fundingFee: 1,
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

describe('Trading Analytics Engine - compilePerformanceReport (#28)', () => {
    describe('Ringkasan Statistik (Summary Stats)', () => {
        it('menghitung metrik performa normal dengan tepat (winRate, profitFactor, netPnlTotal, expectancy, recoveryFactor)', () => {
            // Trade 1: Win netPnl = 105 - 2 - 2 - 1 = 100
            const t1 = createTrade({
                id: 1,
                realizedPnl: 105,
                feeOpen: 2,
                feeClose: 2,
                fundingFee: 1,
                exitTime: 1700000000000
            }, {}, 2)

            // Trade 2: Loss netPnl = -45 - 2 - 2 - 1 = -50
            const t2 = createTrade({
                id: 2,
                realizedPnl: -45,
                feeOpen: 2,
                feeClose: 2,
                fundingFee: 1,
                exitTime: 1700003600000
            }, {}, -1)

            // Trade 3: Win netPnl = 205 - 2 - 2 - 1 = 200
            const t3 = createTrade({
                id: 3,
                realizedPnl: 205,
                feeOpen: 2,
                feeClose: 2,
                fundingFee: 1,
                exitTime: 1700007200000
            }, {}, 4)

            const report = compilePerformanceReport([t1, t2, t3])
            const { summary } = report

            expect(summary.totalTrades).toBe(3)
            expect(summary.wins).toBe(2)
            expect(summary.losses).toBe(1)
            expect(summary.breakEven).toBe(0)

            // Win rate = 2 / 3
            expect(summary.winRate).toBeCloseTo(2 / 3, 5)

            // Gross profit = 100 + 200 = 300, Gross loss = 50
            // Profit Factor = 300 / 50 = 6.0
            expect(summary.profitFactor).toBeCloseTo(6.0, 5)

            // Net PnL Total = 300 - 50 = 250
            expect(summary.netPnlTotal).toBe(250)

            // Gross PnL Total = 105 - 45 + 205 = 265
            expect(summary.grossPnlTotal).toBe(265)

            // Total fees = (4 * 3) = 12, Funding fee = (1 * 3) = 3
            expect(summary.feeTotal).toBe(12)
            expect(summary.fundingFeeTotal).toBe(3)

            // Expectancy = (winRate * avgWin) - (lossRate * avgLoss)
            // = (2/3 * 150) - (1/3 * 50) = 100 - 16.66667 = 83.33333
            expect(summary.avgWin).toBe(150)
            expect(summary.avgLoss).toBe(50)
            expect(summary.expectancy).toBeCloseTo(83.33333, 4)

            // Drawdown kurva:
            // Point 1: eq 100, peak 100, dd 0
            // Point 2: eq 50, peak 100, dd -50 (max DD = -50)
            // Point 3: eq 250, peak 250, dd 0 (pulih)
            expect(report.drawdownStats.maxDrawdown).toBe(-50)

            // Recovery factor = netPnlTotal / |maxDrawdown| = 250 / 50 = 5.0
            expect(summary.recoveryFactor).toBeCloseTo(5.0, 5)

            // Streaks
            expect(summary.maxConsecutiveWins).toBe(1)
            expect(summary.maxConsecutiveLosses).toBe(1)
        })

        it('menangani portofolio kosong dengan nilai awal yang aman', () => {
            const report = compilePerformanceReport([])
            expect(report.summary.totalTrades).toBe(0)
            expect(report.summary.wins).toBe(0)
            expect(report.summary.losses).toBe(0)
            expect(report.summary.breakEven).toBe(0)
            expect(report.summary.winRate).toBeNull()
            expect(report.summary.profitFactor).toBe(Number.POSITIVE_INFINITY)
            expect(report.summary.expectancy).toBeNull()
            expect(report.summary.recoveryFactor).toBeNull()
            expect(report.summary.netPnlTotal).toBe(0)
            expect(report.equityCurve).toHaveLength(0)
            expect(report.drawdownStats.maxDrawdown).toBe(0)
            expect(report.rDistribution.total).toBe(0)
            expect(report.rDistribution.withR).toBe(0)
        })
    })

    describe('Trade Impas (Break-even Trades)', () => {
        it('mengecualikan trade impas (netPnl === 0) dari penyebut kalkulasi win rate', () => {
            // Trade 1: Win netPnl = 100
            const t1 = createTrade({
                id: 1,
                realizedPnl: 100,
                feeOpen: 0,
                feeClose: 0,
                fundingFee: 0,
                exitTime: 1700000000000
            })

            // Trade 2: Loss netPnl = -50
            const t2 = createTrade({
                id: 2,
                realizedPnl: -50,
                feeOpen: 0,
                feeClose: 0,
                fundingFee: 0,
                exitTime: 1700001000000
            })

            // Trade 3: Break-even netPnl = 5 - 2 - 2 - 1 = 0
            const t3 = createTrade({
                id: 3,
                realizedPnl: 5,
                feeOpen: 2,
                feeClose: 2,
                fundingFee: 1,
                exitTime: 1700002000000
            })

            // Trade 4: Break-even netPnl = 0
            const t4 = createTrade({
                id: 4,
                realizedPnl: 0,
                feeOpen: 0,
                feeClose: 0,
                fundingFee: 0,
                exitTime: 1700003000000
            })

            const report = compilePerformanceReport([t1, t2, t3, t4])
            const { summary } = report

            expect(summary.totalTrades).toBe(4)
            expect(summary.wins).toBe(1)
            expect(summary.losses).toBe(1)
            expect(summary.breakEven).toBe(2)

            // Win rate harus 1 / (1 + 1) = 0.5 (50%), BUKAN 1 / 4 (25%)
            expect(summary.winRate).toBe(0.5)
        })

        it('menghasilkan winRate null dan expectancy null jika seluruh trade impas', () => {
            const t1 = createTrade({ id: 1, realizedPnl: 0, feeOpen: 0, feeClose: 0, fundingFee: 0 })
            const t2 = createTrade({ id: 2, realizedPnl: 10, feeOpen: 5, feeClose: 5, fundingFee: 0 })

            const report = compilePerformanceReport([t1, t2])
            expect(report.summary.totalTrades).toBe(2)
            expect(report.summary.breakEven).toBe(2)
            expect(report.summary.wins).toBe(0)
            expect(report.summary.losses).toBe(0)
            expect(report.summary.winRate).toBeNull()
            expect(report.summary.expectancy).toBeNull()
            expect(report.summary.recoveryFactor).toBeNull()
        })
    })

    describe('Portofolio Tanpa Kerugian (Zero Loss)', () => {
        it('menghasilkan profitFactor = Infinity dan recoveryFactor = Infinity pada akun 100% win', () => {
            const t1 = createTrade({ id: 1, realizedPnl: 100, feeOpen: 0, feeClose: 0, fundingFee: 0, exitTime: 1000 })
            const t2 = createTrade({ id: 2, realizedPnl: 200, feeOpen: 0, feeClose: 0, fundingFee: 0, exitTime: 2000 })

            const report = compilePerformanceReport([t1, t2])
            const { summary } = report

            expect(summary.wins).toBe(2)
            expect(summary.losses).toBe(0)
            expect(summary.winRate).toBe(1.0)
            expect(summary.profitFactor).toBe(Number.POSITIVE_INFINITY)
            expect(report.drawdownStats.maxDrawdown).toBe(0)
            expect(summary.recoveryFactor).toBe(Number.POSITIVE_INFINITY)
        })
    })

    describe('Sanitasi Titik Ekuitas (Sanitized Equity Points)', () => {
        it('mengurutkan transaksi secara kronologis deterministik berdasarkan exitTime dan id', () => {
            const t3 = createTrade({ id: 3, exitTime: 3000, realizedPnl: 30, feeOpen: 0, feeClose: 0, fundingFee: 0 })
            const t1 = createTrade({ id: 1, exitTime: 1000, realizedPnl: 10, feeOpen: 0, feeClose: 0, fundingFee: 0 })
            const t2 = createTrade({ id: 2, exitTime: 2000, realizedPnl: 20, feeOpen: 0, feeClose: 0, fundingFee: 0 })

            // Berikan array dengan urutan acak
            const report = compilePerformanceReport([t3, t1, t2])
            const times = report.equityCurve.map((p) => p.time)

            expect(times).toEqual([1000, 2000, 3000])
            expect(report.equityCurve.map((p) => p.equity)).toEqual([10, 30, 60])
        })

        it('membersihkan nilai NaN dan data korup dari kurva ekuitas', () => {
            const validTrade1 = createTrade({ id: 1, exitTime: 1000, realizedPnl: 50, feeOpen: 0, feeClose: 0, fundingFee: 0 })
            const nanExitTimeTrade = createTrade({ id: 2, exitTime: Number.NaN, realizedPnl: 50 })
            const nanPnlTrade = createTrade({ id: 3, exitTime: 2000, realizedPnl: Number.NaN, feeOpen: 0, feeClose: 0, fundingFee: 0 })
            const validTrade2 = createTrade({ id: 4, exitTime: 3000, realizedPnl: 30, feeOpen: 0, feeClose: 0, fundingFee: 0 })

            const report = compilePerformanceReport([validTrade1, nanExitTimeTrade, nanPnlTrade, validTrade2])

            // Trade dengan exitTime NaN harus dieliminasi, trade dengan PnL NaN dinormalisasi / dilewati
            for (const point of report.equityCurve) {
                expect(Number.isFinite(point.time)).toBe(true)
                expect(Number.isFinite(point.equity)).toBe(true)
                expect(Number.isFinite(point.peak)).toBe(true)
                expect(Number.isFinite(point.drawdown)).toBe(true)
            }
        })

        it('mendeduplikasi timestamp pada detik yang sama untuk kepatuhan lightweight-charts', () => {
            // Tiga trade yang exit pada detik yang sama (detik 1700000)
            const t1 = createTrade({ id: 1, exitTime: 1700000100, realizedPnl: 20, feeOpen: 0, feeClose: 0, fundingFee: 0 })
            const t2 = createTrade({ id: 2, exitTime: 1700000500, realizedPnl: 30, feeOpen: 0, feeClose: 0, fundingFee: 0 })
            const t3 = createTrade({ id: 3, exitTime: 1700000900, realizedPnl: -10, feeOpen: 0, feeClose: 0, fundingFee: 0 })

            // Trade pada detik berikutnya
            const t4 = createTrade({ id: 4, exitTime: 1700001200, realizedPnl: 50, feeOpen: 0, feeClose: 0, fundingFee: 0 })

            const report = compilePerformanceReport([t1, t2, t3, t4])

            // Harus hanya ada 2 titik: 1 untuk detik 1700000 dan 1 untuk detik 1700001
            expect(report.equityCurve).toHaveLength(2)

            // Titik pertama mewakili akumulasi trade 1, 2, dan 3: 20 + 30 - 10 = 40
            expect(report.equityCurve[0]?.equity).toBe(40)
            expect(report.equityCurve[0]?.tradeId).toBe(3)

            // Titik kedua mewakili trade 4: 40 + 50 = 90
            expect(report.equityCurve[1]?.equity).toBe(90)
            expect(report.equityCurve[1]?.tradeId).toBe(4)

            // Pastikan timestamp detik strictly increasing
            const seconds = report.equityCurve.map((p) => Math.floor(p.time / 1000))
            for (let i = 1; i < seconds.length; i++) {
                expect(seconds[i]).toBeGreaterThan(seconds[i - 1]!)
            }
        })
    })

    describe('Kurva Drawdown dan Max Drawdown', () => {
        it('menghitung max drawdown dan durasi pemulihan dengan benar', () => {
            // Kurva:
            // 0: +100 -> eq: 100, peak: 100 (t: 1000)
            // 1: -60  -> eq: 40,  peak: 100, dd: -60 (t: 2000)
            // 2: -20  -> eq: 20,  peak: 100, dd: -80 -> Max DD (t: 3000)
            // 3: +30  -> eq: 50,  peak: 100, dd: -50 (t: 4000)
            // 4: +60  -> eq: 110, peak: 110, dd: 0  -> Pulih! (t: 5000)
            const t1 = createTrade({ id: 1, exitTime: 1000, realizedPnl: 100, feeOpen: 0, feeClose: 0, fundingFee: 0 })
            const t2 = createTrade({ id: 2, exitTime: 2000, realizedPnl: -60, feeOpen: 0, feeClose: 0, fundingFee: 0 })
            const t3 = createTrade({ id: 3, exitTime: 3000, realizedPnl: -20, feeOpen: 0, feeClose: 0, fundingFee: 0 })
            const t4 = createTrade({ id: 4, exitTime: 4000, realizedPnl: 30, feeOpen: 0, feeClose: 0, fundingFee: 0 })
            const t5 = createTrade({ id: 5, exitTime: 5000, realizedPnl: 60, feeOpen: 0, feeClose: 0, fundingFee: 0 })

            const report = compilePerformanceReport([t1, t2, t3, t4, t5])

            expect(report.drawdownStats.maxDrawdown).toBe(-80)
            expect(report.drawdownStats.maxDrawdownTime).toBe(3000)
            // Durasi dihitung dari titik puncak (t: 1000) hingga titik pemulihan (t: 5000) = 4000 ms
            expect(report.drawdownStats.maxDrawdownDurationMs).toBe(4000)
        })

        it('mengembalikan duration null jika drawdown belum pulih hingga trade terakhir', () => {
            const t1 = createTrade({ id: 1, exitTime: 1000, realizedPnl: 100, feeOpen: 0, feeClose: 0, fundingFee: 0 })
            const t2 = createTrade({ id: 2, exitTime: 2000, realizedPnl: -50, feeOpen: 0, feeClose: 0, fundingFee: 0 })

            const report = compilePerformanceReport([t1, t2])

            expect(report.drawdownStats.maxDrawdown).toBe(-50)
            expect(report.drawdownStats.maxDrawdownDurationMs).toBeNull()
        })
    })

    describe('Distribusi R-Multiple (R Distribution)', () => {
        it('mengagregasi bucket R-multiple dan metrik turunan dengan tepat', () => {
            const trades = [
                createTrade({ id: 1 }, {}, -2.5),  // < -2R
                createTrade({ id: 2 }, {}, -1.5),  // -2R…-1R
                createTrade({ id: 3 }, {}, -0.5),  // -1R…0R
                createTrade({ id: 4 }, {}, 0.5),   // 0R…1R
                createTrade({ id: 5 }, {}, 1.5),   // 1R…2R
                createTrade({ id: 6 }, {}, 2.5),   // 2R…3R
                createTrade({ id: 7 }, {}, 4.0),   // > 3R
                createTrade({ id: 8 }, {}, null)   // tanpa R
            ]

            const report = compilePerformanceReport(trades)
            const { rDistribution, summary } = report

            expect(rDistribution.total).toBe(8)
            expect(rDistribution.withR).toBe(7)
            expect(summary.tradesWithR).toBe(7)

            // Setiap bucket dari 7 bucket harus berisi 1 trade
            for (const bucket of rDistribution.buckets) {
                expect(bucket.count).toBe(1)
            }

            // Total R = -2.5 - 1.5 - 0.5 + 0.5 + 1.5 + 2.5 + 4.0 = 4.0
            expect(summary.totalR).toBeCloseTo(4.0, 5)
            // Avg R = 4.0 / 7
            expect(summary.avgR).toBeCloseTo(4.0 / 7, 5)
        })
    })

    describe('Rincian Per Dimensi (getBreakdown)', () => {
        it('mendukung breakdown dimensi Exchange, Pair, Setup, Grade, Emotion, dan Side', () => {
            const t1 = createTrade(
                { id: 1, exchange: 'mexc', symbol: 'ETHUSDT', direction: 'long', realizedPnl: 100, feeOpen: 0, feeClose: 0, fundingFee: 0 },
                { setupTag: 'pullback', executionGrade: 'A', emotionTag: 'calm' },
                2.0
            )
            const t2 = createTrade(
                { id: 2, exchange: 'binance', symbol: 'BTCUSDT', direction: 'short', realizedPnl: -50, feeOpen: 0, feeClose: 0, fundingFee: 0 },
                { setupTag: 'breakout', executionGrade: 'B', emotionTag: 'fomo' },
                -1.0
            )
            const t3 = createTrade(
                { id: 3, exchange: 'mexc', symbol: 'BTCUSDT', direction: 'long', realizedPnl: 0, feeOpen: 0, feeClose: 0, fundingFee: 0 },
                { setupTag: null, executionGrade: null, emotionTag: null },
                null
            )

            const report = compilePerformanceReport([t1, t2, t3])

            // 1. Exchange
            const exchangeBreakdown = report.getBreakdown('Exchange')
            expect(exchangeBreakdown).toHaveLength(2)
            expect(exchangeBreakdown[0]?.label).toBe('MEXC')
            expect(exchangeBreakdown[0]?.netPnl).toBe(100) // 100 + 0
            expect(exchangeBreakdown[0]?.wins).toBe(1)
            expect(exchangeBreakdown[0]?.breakEven).toBe(1)
            expect(exchangeBreakdown[0]?.winRate).toBe(1.0) // 1 / (1 + 0)

            // 2. Pair / Symbol
            const pairBreakdown = report.getBreakdown('Pair')
            expect(pairBreakdown.some((b) => b.label === 'ETHUSDT')).toBe(true)
            expect(pairBreakdown.some((b) => b.label === 'BTCUSDT')).toBe(true)

            // 3. Setup
            const setupBreakdown = report.getBreakdown('Setup')
            expect(setupBreakdown.find((b) => b.label === 'pullback')?.netPnl).toBe(100)
            expect(setupBreakdown.find((b) => b.label === 'breakout')?.netPnl).toBe(-50)
            expect(setupBreakdown.find((b) => b.label === '(tanpa setup)')?.netPnl).toBe(0)

            // 4. Grade
            const gradeBreakdown = report.getBreakdown('Grade')
            expect(gradeBreakdown.find((b) => b.label === 'Grade A')?.netPnl).toBe(100)
            expect(gradeBreakdown.find((b) => b.label === 'Grade B')?.netPnl).toBe(-50)
            expect(gradeBreakdown.find((b) => b.label === '(belum digrade)')?.netPnl).toBe(0)

            // 5. Emotion
            const emotionBreakdown = report.getBreakdown('Emotion')
            expect(emotionBreakdown.find((b) => b.label === 'calm')?.netPnl).toBe(100)
            expect(emotionBreakdown.find((b) => b.label === 'fomo')?.netPnl).toBe(-50)
            expect(emotionBreakdown.find((b) => b.label === '(tanpa emosi)')?.netPnl).toBe(0)

            // 6. Side / Direction
            const sideBreakdown = report.getBreakdown('Side')
            expect(sideBreakdown.find((b) => b.label === 'Long')?.netPnl).toBe(100)
            expect(sideBreakdown.find((b) => b.label === 'Short')?.netPnl).toBe(-50)

            // Pastikan setiap breakdown terurut dari Net PnL terbesar ke terkecil
            for (const b of [exchangeBreakdown, pairBreakdown, setupBreakdown, gradeBreakdown, emotionBreakdown, sideBreakdown]) {
                for (let i = 1; i < b.length; i++) {
                    expect(b[i - 1]!.netPnl).toBeGreaterThanOrEqual(b[i]!.netPnl)
                }
            }
        })
    })

    describe('Perbandingan Benchmark Bitcoin (compareWithBenchmark)', () => {
        it('menghitung perbandingan ROI portofolio terhadap BTC klines', () => {
            const t1 = createTrade({ id: 1, exitTime: 1700000000000, realizedPnl: 100, feeOpen: 0, feeClose: 0, fundingFee: 0 })
            const t2 = createTrade({ id: 2, exitTime: 1700086400000, realizedPnl: 150, feeOpen: 0, feeClose: 0, fundingFee: 0 })

            const report = compilePerformanceReport([t1, t2])

            const btcKlines: PricePoint[] = [
                { time: 1700000000000, close: 30000 },
                { time: 1700086400000, close: 33000 }
            ]

            const initialCapital = 1000
            const comp = report.compareWithBenchmark(btcKlines, initialCapital)

            expect(comp.points.length).toBeGreaterThan(0)
            expect(comp.summary).not.toBeNull()

            // User PnL total = 250 -> ROI = (250 / 1000) * 100 = 25%
            expect(comp.summary?.userFinalRoi).toBeCloseTo(25, 2)
            // BTC naik dari 30000 ke 33000 = +10%
            expect(comp.summary?.btcFinalRoi).toBeCloseTo(10, 2)
            // Alpha = 25 - 10 = +15%
            expect(comp.summary?.alpha).toBeCloseTo(15, 2)
            expect(comp.summary?.isOutperforming).toBe(true)
        })

        it('mengembalikan array kosong dan summary null jika klines kosong atau modal tidak valid', () => {
            const t1 = createTrade({ id: 1, exitTime: 1000, realizedPnl: 50, feeOpen: 0, feeClose: 0, fundingFee: 0 })
            const report = compilePerformanceReport([t1])

            const comp1 = report.compareWithBenchmark([], 1000)
            expect(comp1.points).toHaveLength(0)
            expect(comp1.summary).toBeNull()

            const comp2 = report.compareWithBenchmark([{ time: 1000, close: 50000 }], 0)
            expect(comp2.points).toHaveLength(0)
            expect(comp2.summary).toBeNull()
        })
    })

    describe('Penyaringan Data (TradeFilterOptions)', () => {
        it('menyaring trade berdasarkan simbol, exchange, setup, dan rentang tanggal', () => {
            const t1 = createTrade({
                id: 1,
                symbol: 'BTCUSDT',
                exchange: 'binance',
                exitTime: new Date('2026-03-01T12:00:00Z').getTime(),
                realizedPnl: 100, feeOpen: 0, feeClose: 0, fundingFee: 0
            }, { setupTag: 'trend' })

            const t2 = createTrade({
                id: 2,
                symbol: 'ETHUSDT',
                exchange: 'binance',
                exitTime: new Date('2026-03-05T12:00:00Z').getTime(),
                realizedPnl: 50, feeOpen: 0, feeClose: 0, fundingFee: 0
            }, { setupTag: 'trend' })

            const t3 = createTrade({
                id: 3,
                symbol: 'BTCUSDT',
                exchange: 'mexc',
                exitTime: new Date('2026-03-15T12:00:00Z').getTime(),
                realizedPnl: -20, feeOpen: 0, feeClose: 0, fundingFee: 0
            }, { setupTag: 'reversal' })

            const allTrades = [t1, t2, t3]

            // Filter per symbol
            const btcReport = compilePerformanceReport(allTrades, { symbol: 'BTCUSDT' })
            expect(btcReport.summary.totalTrades).toBe(2)
            expect(btcReport.trades.map((t) => t.trade.id)).toEqual([1, 3])

            // Filter per date range
            const dateReport = compilePerformanceReport(allTrades, {
                from: '2026-03-01',
                to: '2026-03-10'
            })
            expect(dateReport.summary.totalTrades).toBe(2)
            expect(dateReport.trades.map((t) => t.trade.id)).toEqual([1, 2])

            // Filter per setupTag
            const setupReport = compilePerformanceReport(allTrades, { setupTag: 'reversal' })
            expect(setupReport.summary.totalTrades).toBe(1)
            expect(setupReport.trades[0]?.trade.id).toBe(3)
        })
    })
})
