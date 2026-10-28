import type { TradeDetail } from '../../../shared/domain'
import { calculateRoiComparison } from '../btc-api'
import { sessionLabelOf, weekdayLabelOf, groupKeyOf } from './dimensions'
import { computeRecoveryFactor, R_BUCKETS, type PerformanceSummary, type RBucket } from './metrics'
import type {
    AnalyticsDimension,
    BenchmarkComparison,
    DimensionBucket,
    DrawdownResult,
    PerformanceReport,
    PricePoint,
    RDistributionStats,
    SanitizedPoint,
    TradeFilterOptions
} from './types'

/**
 * Parsing nilai timestamp dari filter (bisa string YYYY-MM-DD atau epoch ms).
 */
function parseFilterTimestamp(val: string | number | null | undefined, isEnd: boolean): number | null {
    if (val === null || val === undefined || val === '') return null
    if (typeof val === 'number') return Number.isFinite(val) ? val : null
    const trimmed = String(val).trim()
    if (!trimmed) return null
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
        return new Date(`${trimmed}T${isEnd ? '23:59:59.999' : '00:00:00.000'}Z`).getTime()
    }
    const parsed = new Date(trimmed).getTime()
    return Number.isFinite(parsed) ? parsed : null
}

/**
 * Mengecek apakah satu TradeDetail memenuhi kriteria filter global.
 */
function matchesFilter(detail: TradeDetail, filter?: TradeFilterOptions): boolean {
    if (!filter) return true
    const { from, to, symbol, exchange, setupTag, grade, emotion, direction, side } = filter
    const fromMs = parseFilterTimestamp(from, false)
    const toMs = parseFilterTimestamp(to, true)

    const exitTime = detail.trade.exitTime
    if (fromMs !== null && exitTime < fromMs) return false
    if (toMs !== null && exitTime > toMs) return false
    if (symbol && detail.trade.symbol !== symbol) return false
    if (exchange && detail.trade.exchange.toLowerCase() !== exchange.toLowerCase()) return false
    if (setupTag && (detail.journal?.setupTag ?? '') !== setupTag) return false
    if (grade && (detail.journal?.executionGrade ?? '') !== grade) return false
    if (emotion && (detail.journal?.emotionTag ?? '') !== emotion) return false

    const expectedDir = side ?? direction
    if (expectedDir && detail.trade.direction.toLowerCase() !== expectedDir.toLowerCase()) return false

    return true
}

/**
 * P&L bersih aman satu trade (menghindari NaN jika ada data corrupt).
 */
export function safeNetPnl(detail: TradeDetail): number {
    const trade = detail.trade
    const realizedPnl = Number.isFinite(trade.realizedPnl) ? trade.realizedPnl : 0
    const feeOpen = Number.isFinite(trade.feeOpen) ? trade.feeOpen : 0
    const feeClose = Number.isFinite(trade.feeClose) ? trade.feeClose : 0
    const fundingFee = Number.isFinite(trade.fundingFee) ? trade.fundingFee : 0
    return realizedPnl - feeOpen - feeClose - fundingFee
}

/**
 * Ekstraksi kunci label grup untuk satu dimensi analitik.
 */
function getDimensionKey(detail: TradeDetail, dimension: AnalyticsDimension): string {
    const lower = String(dimension).toLowerCase()
    switch (lower) {
        case 'exchange':
            return detail.trade.exchange.toUpperCase()
        case 'pair':
        case 'symbol':
            return detail.trade.symbol
        case 'setup':
        case 'setuptag':
            return detail.journal?.setupTag ?? '(tanpa setup)'
        case 'grade':
            return detail.journal?.executionGrade
                ? `Grade ${detail.journal.executionGrade}`
                : '(belum digrade)'
        case 'emotion':
        case 'emotiontag':
            return detail.journal?.emotionTag ?? '(tanpa emosi)'
        case 'side':
        case 'direction':
            return detail.trade.direction === 'long' ? 'Long' : 'Short'
        case 'session':
            return sessionLabelOf(detail.trade.entryTime)
        case 'weekday':
            return weekdayLabelOf(detail.trade.entryTime)
        default:
            return groupKeyOf(detail, dimension as any)
    }
}

/**
 * Hitung rincian statistik performa per dimensi.
 */
function computeBreakdown(trades: ReadonlyArray<TradeDetail>, dimension: AnalyticsDimension): DimensionBucket[] {
    const groups = new Map<string, TradeDetail[]>()
    for (const detail of trades) {
        const key = getDimensionKey(detail, dimension)
        const list = groups.get(key)
        if (list) list.push(detail)
        else groups.set(key, [detail])
    }

    const buckets: DimensionBucket[] = []
    for (const [label, group] of groups) {
        let wins = 0
        let losses = 0
        let breakEven = 0
        let netPnlValue = 0
        let grossProfit = 0
        let grossLoss = 0
        let rSum = 0
        let rCount = 0

        for (const detail of group) {
            const pnl = safeNetPnl(detail)
            netPnlValue += pnl
            if (pnl > 0) {
                wins += 1
                grossProfit += pnl
            } else if (pnl < 0) {
                losses += 1
                grossLoss += Math.abs(pnl)
            } else {
                breakEven += 1
            }

            if (detail.rMultiple !== null && Number.isFinite(detail.rMultiple)) {
                rSum += detail.rMultiple
                rCount += 1
            }
        }

        const directional = wins + losses
        const winRate = directional > 0 ? wins / directional : null
        const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : Number.POSITIVE_INFINITY
        const avgR = rCount > 0 ? rSum / rCount : null

        buckets.push({
            label,
            trades: group,
            netPnl: netPnlValue,
            wins,
            losses,
            breakEven,
            winRate,
            avgR,
            profitFactor,
            totalTrades: group.length
        })
    }

    return buckets.sort((a, b) => b.netPnl - a.netPnl)
}

/**
 * Mesin Analitik Terpadu (Trading Analytics Engine).
 *
 * Mengompilasi laporan performa menyeluruh dalam satu lintasan komputasi efisien (single-pass):
 * - Menyaring dan mengurutkan transaksi secara deterministik.
 * - Membangun kurva ekuitas tersanitasi (tanpa NaN, bebas duplikasi detik).
 * - Menghitung metrik ringkasan, drawdown, dan distribusi R-multiple sekaligus.
 * - Menyediakan accessor rincian per dimensi dan komparasi benchmark secara terisolasi.
 */
export function compilePerformanceReport(
    trades: TradeDetail[],
    filterCriteria?: TradeFilterOptions
): PerformanceReport {
    // 1. Sanitasi awal dan penyaringan
    const filteredTrades = trades.filter((detail) => {
        if (!Number.isFinite(detail.trade.exitTime) || detail.trade.exitTime <= 0) {
            return false
        }
        return matchesFilter(detail, filterCriteria)
    })

    // 2. Pengurutan kronologis deterministik berdasarkan exitTime, tie-breaker id
    const sortedTrades = [...filteredTrades].sort((a, b) => {
        if (a.trade.exitTime !== b.trade.exitTime) return a.trade.exitTime - b.trade.exitTime
        return a.trade.id - b.trade.id
    })

    // 3. Akumulator lintasan tunggal (Single-Pass Accumulators)
    let wins = 0
    let losses = 0
    let breakEven = 0
    let grossProfit = 0
    let grossLoss = 0
    let grossPnlTotal = 0
    let feeTotal = 0
    let fundingFeeTotal = 0

    let tradesWithR = 0
    let sumR = 0
    let winsWithR = 0
    let lossesWithR = 0
    let winRTotal = 0
    let lossRTotal = 0

    let maxConsecutiveWins = 0
    let maxConsecutiveLosses = 0
    let curWins = 0
    let curLosses = 0

    const rBuckets: RBucket[] = R_BUCKETS.map((b) => ({ ...b, count: 0 }))
    const sanitizedCurve: SanitizedPoint[] = []

    let cumulativeEquity = 0
    let peakEquity = 0

    let maxDrawdown = 0
    let maxDrawdownTime: number | null = null
    let maxDrawdownIndex = -1

    for (const detail of sortedTrades) {
        const trade = detail.trade
        const pnl = safeNetPnl(detail)

        grossPnlTotal += Number.isFinite(trade.realizedPnl) ? trade.realizedPnl : 0
        feeTotal +=
            (Number.isFinite(trade.feeOpen) ? trade.feeOpen : 0) +
            (Number.isFinite(trade.feeClose) ? trade.feeClose : 0)
        fundingFeeTotal += Number.isFinite(trade.fundingFee) ? trade.fundingFee : 0

        // Agregasi R-Multiple
        if (detail.rMultiple !== null && Number.isFinite(detail.rMultiple)) {
            const r = detail.rMultiple
            tradesWithR += 1
            sumR += r
            if (r > 0) {
                winsWithR += 1
                winRTotal += r
            } else if (r < 0) {
                lossesWithR += 1
                lossRTotal += Math.abs(r)
            }
            const bucket = rBuckets.find((b) => r >= b.min && r < b.max)
            if (bucket) bucket.count += 1
        }

        // Klasifikasi hasil trade
        if (pnl > 0) {
            wins += 1
            grossProfit += pnl
            curWins += 1
            curLosses = 0
            if (curWins > maxConsecutiveWins) maxConsecutiveWins = curWins
        } else if (pnl < 0) {
            losses += 1
            grossLoss += Math.abs(pnl)
            curLosses += 1
            curWins = 0
            if (curLosses > maxConsecutiveLosses) maxConsecutiveLosses = curLosses
        } else {
            breakEven += 1
            curWins = 0
            curLosses = 0
        }

        // Update kurva ekuitas dan drawdown
        cumulativeEquity += pnl
        if (cumulativeEquity > peakEquity) {
            peakEquity = cumulativeEquity
        }
        const currentDrawdown = cumulativeEquity - peakEquity // Selalu <= 0

        // Invariance Hardening: Sanitasi titik koordinat kurva ekuitas
        // Deduplikasi timestamp pada detik yang sama untuk kepatuhan rendering grafik
        const currentSecond = Math.floor(trade.exitTime / 1000)
        const lastPoint = sanitizedCurve[sanitizedCurve.length - 1]
        const lastSecond = lastPoint ? Math.floor(lastPoint.time / 1000) : null

        if (lastPoint && lastSecond === currentSecond) {
            lastPoint.time = trade.exitTime
            lastPoint.equity = cumulativeEquity
            lastPoint.peak = peakEquity
            lastPoint.drawdown = currentDrawdown
            lastPoint.tradeId = trade.id

            if (currentDrawdown < maxDrawdown) {
                maxDrawdown = currentDrawdown
                maxDrawdownTime = trade.exitTime
                maxDrawdownIndex = sanitizedCurve.length - 1
            }
        } else {
            sanitizedCurve.push({
                time: trade.exitTime,
                equity: cumulativeEquity,
                peak: peakEquity,
                drawdown: currentDrawdown,
                tradeId: trade.id
            })
            const newIndex = sanitizedCurve.length - 1
            if (currentDrawdown < maxDrawdown) {
                maxDrawdown = currentDrawdown
                maxDrawdownTime = trade.exitTime
                maxDrawdownIndex = newIndex
            }
        }
    }

    // 4. Kalkulasi durasi pemulihan max drawdown
    let maxDrawdownDurationMs: number | null = null
    if (maxDrawdownIndex !== -1 && maxDrawdown < 0) {
        const peakLevel = sanitizedCurve[maxDrawdownIndex]?.peak ?? 0
        let peakIndex = maxDrawdownIndex
        while (peakIndex > 0 && (sanitizedCurve[peakIndex]?.equity ?? 0) < peakLevel) {
            peakIndex -= 1
        }

        const startTime = sanitizedCurve[peakIndex]?.time ?? 0
        for (let i = maxDrawdownIndex; i < sanitizedCurve.length; i += 1) {
            const point = sanitizedCurve[i]
            if (point && point.equity >= peakLevel) {
                maxDrawdownDurationMs = point.time - startTime
                break
            }
        }
    }

    // 5. Kalkulasi metrik ringkasan performa
    const directional = wins + losses
    const winRate = directional > 0 ? wins / directional : null
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : Number.POSITIVE_INFINITY
    const avgWin = wins > 0 ? grossProfit / wins : null
    const avgLoss = losses > 0 ? grossLoss / losses : null

    let expectancy: number | null = null
    if (winRate !== null && avgWin !== null && avgLoss !== null) {
        const lossRate = 1 - winRate
        expectancy = winRate * avgWin - lossRate * avgLoss
    }

    const totalR = tradesWithR > 0 ? sumR : null
    const avgR = tradesWithR > 0 ? sumR / tradesWithR : null

    let expectancyR: number | null = null
    const directionalR = winsWithR + lossesWithR
    const winRateR = directionalR > 0 ? winsWithR / directionalR : null
    const avgWinR = winsWithR > 0 ? winRTotal / winsWithR : null
    const avgLossR = lossesWithR > 0 ? lossRTotal / lossesWithR : null

    if (winRateR !== null && avgWinR !== null && avgLossR !== null) {
        const lossRateR = 1 - winRateR
        expectancyR = winRateR * avgWinR - lossRateR * avgLossR
    }

    const netPnlTotal = grossProfit - grossLoss
    const recoveryFactor = computeRecoveryFactor(netPnlTotal, maxDrawdown)

    const summary: PerformanceSummary = {
        totalTrades: sortedTrades.length,
        wins,
        losses,
        breakEven,
        winRate,
        profitFactor,
        expectancy,
        avgWin,
        avgLoss,
        netPnlTotal,
        grossPnlTotal,
        feeTotal,
        fundingFeeTotal,
        tradesWithR,
        totalR,
        avgR,
        expectancyR,
        maxConsecutiveWins,
        maxConsecutiveLosses,
        recoveryFactor
    }

    const drawdownStats: DrawdownResult = {
        maxDrawdown,
        maxDrawdownTime,
        maxDrawdownDurationMs
    }

    const rDistribution: RDistributionStats = {
        buckets: rBuckets,
        withR: tradesWithR,
        total: sortedTrades.length
    }

    // Cache untuk breakdown per dimensi agar tidak dihitung ulang saat berganti tab dimensi
    const breakdownCache = new Map<string, DimensionBucket[]>()

    return {
        summary,
        equityCurve: Object.freeze(sanitizedCurve),
        drawdownStats,
        rDistribution,
        trades: Object.freeze(sortedTrades),

        getBreakdown(dimension: AnalyticsDimension): DimensionBucket[] {
            const key = String(dimension).toLowerCase()
            const cached = breakdownCache.get(key)
            if (cached) return cached
            const result = computeBreakdown(sortedTrades, dimension)
            breakdownCache.set(key, result)
            return result
        },

        compareWithBenchmark(
            benchmarkKlines: PricePoint[],
            startingCapital: number
        ): BenchmarkComparison {
            if (
                !benchmarkKlines ||
                benchmarkKlines.length === 0 ||
                startingCapital <= 0 ||
                sanitizedCurve.length === 0
            ) {
                return { points: [], summary: null }
            }
            return calculateRoiComparison(benchmarkKlines, sanitizedCurve, startingCapital)
        }
    }
}
