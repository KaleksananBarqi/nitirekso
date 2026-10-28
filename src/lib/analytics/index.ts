/**
 * Modul Analitik Nitirekso (Trading Analytics Engine).
 *
 * Titik masuk publik terpadu untuk kalkulasi analitik, pelaporan performa,
 * metrik finansial, kurva ekuitas tersanitasi, dan segmentasi dimensi.
 */

// Mesin Laporan Performa Terpadu
export { compilePerformanceReport, safeNetPnl } from './performance-report'

// Kontrak Tipe Publik Analitik
export type {
    PerformanceReport,
    SanitizedPoint,
    DrawdownResult,
    RDistributionStats,
    DimensionBucket,
    AnalyticsDimension,
    PricePoint,
    BenchmarkComparison,
    TradeFilterOptions
} from './types'

// Kompatibilitas Backwards: Modul Analitik, Metrik & Dimensi Legacy
export * from './types'
export * from './metrics'
export * from './dimensions'
export * from './performance-report'
