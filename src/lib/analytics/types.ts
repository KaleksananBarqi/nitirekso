import type { TradeDetail } from '../../../shared/domain'
import type { BtcComparisonSummary, RoiComparisonPoint } from '../btc-api'
import type { PerformanceSummary, RBucket } from './metrics'

/**
 * Titik ekuitas yang telah disanitasi dan terjamin validitas invariannya:
 * - Bebas dari nilai NaN, null, atau undefined.
 * - Terurut secara kronologis deterministik berdasarkan waktu exit.
 * - Tidak memiliki timestamp duplikat pada detik yang sama (ramah lightweight-charts).
 */
export interface SanitizedPoint {
    /** Epoch ms UTC — waktu exit trade (atau titik konsolidasi detik). */
    time: number
    /** Ekuitas kumulatif setelah trade ini. */
    equity: number
    /** Puncak ekuitas tertinggi hingga titik ini. */
    peak: number
    /** Penurunan modal dari puncak (nilai <= 0). */
    drawdown: number
    /** ID trade terakhir yang membentuk titik koordinat ini. */
    tradeId: number
}

/**
 * Hasil kalkulasi drawdown terpadu.
 */
export interface DrawdownResult {
    /** Penurunan terbesar dari puncak (nilai negatif atau 0). */
    maxDrawdown: number
    /** Epoch ms saat drawdown terburuk terjadi. */
    maxDrawdownTime: number | null
    /**
     * Lama (ms) dari puncak sebelum drawdown terburuk sampai ekuitas kembali
     * menyentuh level puncak tersebut. Null bila belum pernah pulih.
     */
    maxDrawdownDurationMs: number | null
    /** Persentase drawdown relatif terhadap puncak, jika relevan. */
    maxDrawdownPercent?: number | null
}

/**
 * Statistik distribusi R-multiple untuk visualisasi histogram kuantitatif.
 */
export interface RDistributionStats {
    buckets: RBucket[]
    withR: number
    total: number
}

/**
 * Dimensi analitik yang didukung untuk segmentasi data trade.
 */
export type AnalyticsDimension =
    | 'exchange'
    | 'Exchange'
    | 'pair'
    | 'Pair'
    | 'symbol'
    | 'Symbol'
    | 'setup'
    | 'Setup'
    | 'setupTag'
    | 'grade'
    | 'Grade'
    | 'emotion'
    | 'Emotion'
    | 'emotionTag'
    | 'side'
    | 'Side'
    | 'direction'
    | 'Direction'
    | 'session'
    | 'Session'
    | 'weekday'
    | 'Weekday'

/**
 * Bucket hasil pengelompokan performa per dimensi tertentu.
 */
export interface DimensionBucket {
    label: string
    trades: TradeDetail[]
    /** P&L bersih kumulatif untuk grup ini. */
    netPnl: number
    wins: number
    losses: number
    breakEven: number
    /** wins / (wins + losses). Null bila tidak ada trade berarah. */
    winRate: number | null
    /** Rata-rata R untuk trade yang memiliki planned stop. Null bila tidak ada. */
    avgR: number | null
    /** Rasio profit kumulatif terhadap loss kumulatif. Infinity bila tanpa loss. */
    profitFactor?: number
    /** Jumlah total transaksi dalam bucket ini. */
    totalTrades?: number
}

/**
 * Titik data harga acuan (benchmark) seperti Bitcoin.
 */
export interface PricePoint {
    /** Epoch ms */
    time: number
    /** Harga penutupan */
    close: number
}

/**
 * Hasil komparasi performa portofolio terhadap instrumen benchmark.
 */
export interface BenchmarkComparison {
    points: RoiComparisonPoint[]
    summary: BtcComparisonSummary | null
}

/**
 * Opsi penyaringan trade sebelum dikompilasi ke dalam PerformanceReport.
 */
export interface TradeFilterOptions {
    /** Rentang awal: format 'YYYY-MM-DD' atau epoch ms UTC. */
    from?: string | number | null
    /** Rentang akhir: format 'YYYY-MM-DD' atau epoch ms UTC. */
    to?: string | number | null
    symbol?: string | null
    exchange?: string | null
    setupTag?: string | null
    grade?: string | null
    emotion?: string | null
    direction?: 'long' | 'short' | null
    side?: 'long' | 'short' | null
}

/**
 * Antarmuka laporan analitik performa terpadu (Trading Analytics Engine).
 * Memenuhi kontrak Deep Module: antarmuka bersih menyembunyikan komputasi kompleks.
 */
export interface PerformanceReport {
    /** Ringkasan metrik statistik kuantitatif dan rasio performa. */
    readonly summary: PerformanceSummary
    /** Kurva ekuitas kronologis yang dijamin bersih (sanitized). */
    readonly equityCurve: ReadonlyArray<SanitizedPoint>
    /** Statistik penarikan modal (drawdown). */
    readonly drawdownStats: DrawdownResult
    /** Distribusi frekuensi R-multiple untuk histogram. */
    readonly rDistribution: RDistributionStats
    /** Daftar trade yang sudah lolos filter dan menyusun laporan ini. */
    readonly trades: ReadonlyArray<TradeDetail>

    /**
     * Dapatkan rincian statistik performa berdasarkan dimensi tertentu.
     * Hasil dikelompokkan dan diurutkan berdasarkan Net PnL menurun.
     */
    getBreakdown(dimension: AnalyticsDimension): DimensionBucket[]

    /**
     * Bandingkan pertumbuhan portofolio pengguna dengan kurva benchmark (misal BTC).
     */
    compareWithBenchmark(
        benchmarkKlines: PricePoint[],
        startingCapital: number
    ): BenchmarkComparison
}
