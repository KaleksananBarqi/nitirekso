import { useEffect, useRef } from 'react'
import {
    AreaSeries,
    LineSeries,
    LineStyle,
    ColorType,
    createChart,
    type IChartApi,
    type ISeriesApi,
    type UTCTimestamp
} from 'lightweight-charts'
import type { SanitizedPoint } from '../../lib/analytics'
import type { RoiComparisonPoint } from '../../lib/btc-api'
import { cn } from '../../lib/utils'

/**
 * Kurva equity, drawdown (underwater), dan perbandingan VS ROI BTC memakai `lightweight-charts`.
 */

export interface EquityChartProps {
    /** Kurva equity kumulatif yang telah disanitasi. */
    points: ReadonlyArray<SanitizedPoint>
    /** Titik data perbandingan ROI (khusus mode 'roi') */
    roiPoints?: RoiComparisonPoint[]
    /** Mode tampilan chart: equity ($), drawdown, atau VS ROI BTC (%). */
    variant?: 'equity' | 'drawdown' | 'roi'
    /** Tinggi chart dalam px. */
    height?: number
    className?: string
}

/** Baca nilai warna dari CSS variable tema aktif. */
function readThemeColor(variable: string, fallback: string): string {
    const value = typeof document !== 'undefined'
        ? getComputedStyle(document.documentElement).getPropertyValue(variable).trim()
        : ''
    return value === '' ? fallback : value
}

export function EquityChart({
    points,
    roiPoints = [],
    variant = 'equity',
    height = 260,
    className
}: EquityChartProps): React.JSX.Element {
    const containerRef = useRef<HTMLDivElement | null>(null)
    const chartRef = useRef<IChartApi | null>(null)
    const seriesRef = useRef<ISeriesApi<'Area'> | null>(null)
    const btcSeriesRef = useRef<ISeriesApi<'Line'> | null>(null)

    // Buat chart sekali. Pembuatan ulang hanya bila variant atau height berubah
    useEffect(() => {
        const container = containerRef.current
        if (!container) return

        const textColor = readThemeColor('--muted-foreground', '#8b949e')
        const borderColor = readThemeColor('--border', '#2a313c')

        const isRoiMode = variant === 'roi'

        const chart = createChart(container, {
            height,
            layout: {
                background: { type: ColorType.Solid, color: 'transparent' },
                textColor,
                fontFamily: readThemeColor('--font-mono', 'monospace'),
                fontSize: 11,
                attributionLogo: false
            },
            grid: {
                vertLines: { color: borderColor, style: 3 },
                horzLines: { color: borderColor, style: 3 }
            },
            rightPriceScale: {
                borderColor,
                scaleMargins: { top: 0.1, bottom: 0.1 },
                // Format persentase untuk mode ROI
                ...(isRoiMode
                    ? {
                          format: {
                              type: 'percent'
                          }
                      }
                    : {})
            },
            localization: isRoiMode
                ? {
                      priceFormatter: (val: number) => `${val >= 0 ? '+' : ''}${val.toFixed(2)}%`
                  }
                : undefined,
            timeScale: {
                borderColor,
                timeVisible: true,
                secondsVisible: false
            },
            handleScale: { axisPressedMouseMove: false },
            crosshair: {
                vertLine: { color: textColor, width: 1, style: 3, labelBackgroundColor: textColor },
                horzLine: { color: textColor, width: 1, style: 3, labelBackgroundColor: textColor }
            }
        })

        const isDrawdown = variant === 'drawdown'
        const lineColor = isDrawdown
            ? readThemeColor('--loss', '#f85149')
            : readThemeColor('--primary', '#58a6ff')

        const series = chart.addSeries(AreaSeries, {
            lineColor,
            topColor: `${lineColor}40`,
            bottomColor: `${lineColor}05`,
            lineWidth: 2,
            priceLineVisible: false,
            lastValueVisible: true,
            title: isRoiMode ? 'Portofolio' : undefined
        })

        chartRef.current = chart
        seriesRef.current = series

        // Jika mode ROI, tambahkan garis pembanding BTC
        if (isRoiMode) {
            const btcSeries = chart.addSeries(LineSeries, {
                color: '#F7931A', // Bitcoin iconic orange
                lineWidth: 2,
                lineStyle: LineStyle.Dashed,
                priceLineVisible: false,
                lastValueVisible: true,
                title: 'BTC Hold'
            })
            btcSeriesRef.current = btcSeries
        } else {
            btcSeriesRef.current = null
        }

        const observer = typeof ResizeObserver !== 'undefined'
            ? new ResizeObserver(() => {
                  chart.applyOptions({ width: container.clientWidth })
              })
            : null
        observer?.observe(container)
        chart.applyOptions({ width: container.clientWidth })

        return () => {
            observer?.disconnect()
            chart.remove()
            chartRef.current = null
            seriesRef.current = null
            btcSeriesRef.current = null
        }
    }, [height, variant])

    // Perbarui data tanpa membuat ulang chart.
    // Redundan `sanitizeData` dihapus karena `report.equityCurve` sudah tersanitasi di domain engine (#29).
    useEffect(() => {
        const series = seriesRef.current
        if (!series) return

        if (variant === 'roi') {
            if (roiPoints.length > 0) {
                let prevRoiTime = -Infinity
                const userData = roiPoints.map((p) => {
                    let chartTime = p.time / 1000
                    if (chartTime <= prevRoiTime) {
                        chartTime = prevRoiTime + 0.001
                    }
                    prevRoiTime = chartTime
                    return {
                        time: chartTime as UTCTimestamp,
                        value: p.userRoi
                    }
                })
                series.setData(userData)

                if (btcSeriesRef.current) {
                    let prevBtcTime = -Infinity
                    const btcData = roiPoints.map((p) => {
                        let chartTime = p.time / 1000
                        if (chartTime <= prevBtcTime) {
                            chartTime = prevBtcTime + 0.001
                        }
                        prevBtcTime = chartTime
                        return {
                            time: chartTime as UTCTimestamp,
                            value: p.btcRoi
                        }
                    })
                    btcSeriesRef.current.setData(btcData)
                }
                chartRef.current?.timeScale().fitContent()
            }
        } else {
            let prevPointTime = -Infinity
            const data = points.map((point) => {
                let chartTime = point.time / 1000
                if (chartTime <= prevPointTime) {
                    chartTime = prevPointTime + 0.001
                }
                prevPointTime = chartTime
                return {
                    time: chartTime as UTCTimestamp,
                    value: variant === 'drawdown' ? point.drawdown : point.equity
                }
            })

            series.setData(data)
            chartRef.current?.timeScale().fitContent()
        }
    }, [points, roiPoints, variant])

    if (variant === 'roi' && roiPoints.length === 0) {
        return (
            <div
                className={cn('flex items-center justify-center text-xs text-muted-foreground', className)}
                style={{ height }}
            >
                Memuat atau data perbandingan BTC belum tersedia...
            </div>
        )
    }

    if (variant !== 'roi' && points.length === 0) {
        return (
            <div
                className={cn('flex items-center justify-center text-xs text-muted-foreground', className)}
                style={{ height }}
            >
                Belum ada data untuk digambar.
            </div>
        )
    }

    return (
        <div className="relative">
            {variant === 'roi' && (
                <div className="absolute top-2 left-3 z-10 flex items-center gap-4 text-[11px] font-mono bg-background/80 px-2.5 py-1 rounded-md border border-border backdrop-blur-xs">
                    <span className="flex items-center gap-1.5 text-primary">
                        <span className="inline-block h-2 w-2 rounded-full bg-primary" />
                        Portofolio ROI (%)
                    </span>
                    <span className="flex items-center gap-1.5 text-[#F7931A]">
                        <span className="inline-block h-0.5 w-3 bg-[#F7931A]" />
                        BTC Buy & Hold (%)
                    </span>
                </div>
            )}
            <div ref={containerRef} className={cn('w-full', className)} style={{ height }} />
        </div>
    )
}

