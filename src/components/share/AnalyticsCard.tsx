import { useMemo } from 'react'
import type { summarize, buildEquityCurve, computeDrawdown } from '../../lib/analytics/metrics'
import { formatDate, formatPnl, formatRatio } from '../../lib/format'
import { cn } from '../../lib/utils'
import { useHidePnl } from '../../hooks/useHidePnl'
import type { BgTemplate } from '../../lib/shareSettings'
import type { CardAspectRatio } from '../ShareAnalyticsModal'

export interface AnalyticsCardProps {
    summary: ReturnType<typeof summarize>
    curve: ReturnType<typeof buildEquityCurve>
    drawdown: ReturnType<typeof computeDrawdown>
    bg: BgTemplate
    accent: string
    isProfit: boolean
    traderHandle: string
    brandTitle: string
    brandSubtitle: string
    activeReferral: string
    avatarUrl: string | null
    isCustomBgActive: boolean
    customBgUrl: string | null
    bgDimming: number
    bgPosX?: number
    bgPosY?: number
    showProfile: boolean
    showWatermark: boolean
    showChart: boolean
    hideNominal: boolean
    showReferral: boolean
    periodLabel: string
    customTraderNote?: string
    aspectRatio: CardAspectRatio
}

/**
 * Komponen pratinjau DOM interaktif kartu analitik portofolio kumulatif.
 */
export function AnalyticsCard({
    summary,
    curve,
    drawdown,
    bg,
    accent,
    isProfit,
    traderHandle,
    brandTitle,
    brandSubtitle,
    activeReferral,
    avatarUrl,
    isCustomBgActive,
    customBgUrl,
    bgDimming,
    bgPosX = 50,
    bgPosY = 50,
    showProfile,
    showWatermark,
    showChart,
    hideNominal,
    showReferral,
    periodLabel,
    customTraderNote,
    aspectRatio
}: AnalyticsCardProps): React.JSX.Element {
    const { hidePnl } = useHidePnl()
    const isTransparentMode = !isCustomBgActive && bg.isTransparent

    // Render SVG Kurva Sederhana untuk Live Preview
    const svgCurvePath = useMemo(() => {
        if (curve.length < 2) return ''
        const minPnl = Math.min(...curve.map((p) => p.equity))
        const maxPnl = Math.max(...curve.map((p) => p.equity))
        const range = maxPnl - minPnl || 1
        const w = 440
        const h = 75

        return curve
            .map((p, i) => {
                const px = (i / (curve.length - 1)) * w
                const py = h - ((p.equity - minPnl) / range) * (h - 16) - 8
                return `${i === 0 ? 'M' : 'L'} ${px.toFixed(1)} ${py.toFixed(1)}`
            })
            .join(' ')
    }, [curve])

    return (
        <div
            className={cn(
                "relative overflow-hidden transition-all duration-200 select-none text-white font-sans",
                aspectRatio === '16:9' ? 'aspect-[16/9]' : aspectRatio === '1:1' ? 'aspect-square' : 'aspect-[4/5]'
            )}
            style={{
                borderRadius: 22,
                padding: aspectRatio === '16:9' ? '20px 24px 16px' : '22px 24px 18px',
                background: isCustomBgActive
                    ? 'transparent'
                    : isTransparentMode
                        ? 'linear-gradient(135deg, rgba(15, 23, 42, 0.88) 0%, rgba(10, 15, 30, 0.92) 100%)'
                        : bg.bg,
                border: isTransparentMode ? `1.5px solid ${accent}66` : `1px solid ${bg.border}`,
                boxShadow: isTransparentMode ? `0 8px 32px rgba(0, 0, 0, 0.5), 0 0 24px ${accent}22` : '0 12px 36px rgba(0, 0, 0, 0.35)'
            }}
        >
            {/* Custom Image Wallpaper */}
            {isCustomBgActive && customBgUrl && (
                <>
                    <img
                        src={customBgUrl}
                        alt="Background"
                        className="absolute inset-0 h-full w-full object-cover pointer-events-none"
                        style={{
                            objectPosition: `${bgPosX}% ${bgPosY}%`
                        }}
                    />
                    <div
                        className="absolute inset-0 pointer-events-none"
                        style={{ backgroundColor: `rgba(0, 0, 0, ${bgDimming / 100})` }}
                    />
                </>
            )}

            <div className="relative z-10 flex flex-col justify-between h-full gap-2">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div>
                        <div className="flex items-baseline gap-1.5">
                            <span className="text-lg font-black tracking-wider" style={{ color: accent }}>
                                {brandTitle}
                            </span>
                            <span className="text-xs font-light text-white/60 tracking-wider">
                                {brandSubtitle}
                            </span>
                        </div>
                        <p className="text-[10px] text-white/50">{periodLabel}</p>
                    </div>

                    <div className="flex items-center gap-1.5">
                        {showReferral && activeReferral && (
                            <span className="text-[9px] font-bold text-sky-400 bg-sky-500/15 px-2 py-0.5 rounded border border-sky-400/30">
                                REF: {activeReferral}
                            </span>
                        )}
                    </div>
                </div>

                {/* Hero Stat Box */}
                <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3 flex items-center justify-between">
                    <div>
                        <span className="text-[9px] uppercase font-semibold text-white/50 tracking-wider">Total Net Profit</span>
                        <div className="text-xl font-black tabular-nums mt-0.5" style={{ color: isProfit ? '#4ade80' : '#f87171' }}>
                            {hideNominal || hidePnl
                                ? (isProfit ? '+••••' : '-••••')
                                : `${isProfit ? '+' : ''}${formatPnl(summary.netPnlTotal)} USDT`}
                        </div>
                    </div>
                    <div
                        className="rounded-lg p-2 text-center border"
                        style={{ background: `${accent}18`, borderColor: `${accent}44` }}
                    >
                        <span className="text-[9px] uppercase font-bold text-white/60 block">Win Rate</span>
                        <span className="text-base font-black" style={{ color: accent }}>
                            {summary.winRate !== null ? (summary.winRate * 100).toFixed(1) : '0.0'}%
                        </span>
                    </div>
                </div>

                {/* Kurva Ekuitas Mini */}
                {showChart && curve.length >= 2 && (
                    <div className="rounded-xl border border-white/10 bg-black/20 p-2">
                        <div className="flex items-center justify-between mb-0.5 text-[9px] text-white/50 font-semibold">
                            <span>EQUITY GROWTH</span>
                            <span>{curve.length} points</span>
                        </div>
                        <svg
                            viewBox="0 0 440 75"
                            className={cn(
                                "w-full overflow-visible",
                                aspectRatio === '4:5' ? "h-20" : aspectRatio === '1:1' ? "h-16" : "h-12"
                            )}
                        >
                            <path
                                d={svgCurvePath}
                                fill="none"
                                stroke={accent}
                                strokeWidth="2.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            />
                        </svg>
                    </div>
                )}

                {/* Bento Grid Stats (8 Metrik Kuantitatif & Risiko Nitirekso) */}
                <div className={cn(
                    "grid gap-1.5 text-left",
                    aspectRatio === '4:5' ? "grid-cols-2" : "grid-cols-4"
                )}>
                    <div className="rounded-lg border border-white/5 bg-white/[0.03] p-1.5">
                        <span className="text-[8px] text-white/50 uppercase block">Total Trades</span>
                        <span className="text-[11px] font-bold text-white">{summary.totalTrades} ({summary.wins}W/{summary.losses}L)</span>
                    </div>
                    <div className="rounded-lg border border-white/5 bg-white/[0.03] p-1.5">
                        <span className="text-[8px] text-white/50 uppercase block">Profit Factor</span>
                        <span className="text-[11px] font-bold text-white">{summary.profitFactor !== Number.POSITIVE_INFINITY ? formatRatio(summary.profitFactor) : '∞'}</span>
                    </div>
                    <div className="rounded-lg border border-white/5 bg-white/[0.03] p-1.5">
                        <span className="text-[8px] text-white/50 uppercase block">Total R</span>
                        <span className="text-[11px] font-bold text-white">
                            {summary.totalR !== null ? `${summary.totalR >= 0 ? '+' : ''}${summary.totalR.toFixed(2)} R` : '—'}
                        </span>
                    </div>
                    <div className="rounded-lg border border-white/5 bg-white/[0.03] p-1.5">
                        <span className="text-[8px] text-white/50 uppercase block">Expectancy (R)</span>
                        <span className="text-[11px] font-bold text-white">
                            {summary.expectancyR !== null
                                ? `${summary.expectancyR >= 0 ? '+' : ''}${summary.expectancyR.toFixed(2)} R`
                                : (hideNominal || hidePnl ? '••••' : (summary.expectancy !== null ? `${formatPnl(summary.expectancy)} USDT` : '—'))}
                        </span>
                    </div>
                    <div className="rounded-lg border border-white/5 bg-white/[0.03] p-1.5">
                        <span className="text-[8px] text-white/50 uppercase block">Recovery Factor</span>
                        <span className="text-[11px] font-bold text-white">
                            {summary.recoveryFactor !== null ? (!Number.isFinite(summary.recoveryFactor) ? '∞' : summary.recoveryFactor.toFixed(2)) : '—'}
                        </span>
                    </div>
                    <div className="rounded-lg border border-white/5 bg-white/[0.03] p-1.5">
                        <span className="text-[8px] text-white/50 uppercase block">Max Streak</span>
                        <span className="text-[11px] font-bold text-white">{summary.maxConsecutiveWins}W / {summary.maxConsecutiveLosses}L</span>
                    </div>
                    <div className="rounded-lg border border-white/5 bg-white/[0.03] p-1.5">
                        <span className="text-[8px] text-white/50 uppercase block">Max Drawdown</span>
                        <span className="text-[11px] font-bold text-white">
                            {hideNominal || hidePnl ? '••••' : `${formatPnl(drawdown.maxDrawdown)} USDT`}
                        </span>
                    </div>
                    <div className="rounded-lg border border-white/5 bg-white/[0.03] p-1.5">
                        <span className="text-[8px] text-white/50 uppercase block">Avg Win / Loss</span>
                        <span className="text-[11px] font-bold text-white">{hideNominal || hidePnl ? '•••• / ••••' : `${formatPnl(summary.avgWin || 0)} / ${formatPnl(summary.avgLoss || 0)}`}</span>
                    </div>
                </div>

                {/* Catatan Trader Kustom (jika ada) */}
                {customTraderNote && (
                    <div className="rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[10px] text-white/80 italic">
                        "{customTraderNote}"
                    </div>
                )}

                {/* Footer Profile & Watermark */}
                {(showProfile || showWatermark) && (
                    <div className="flex items-center justify-between border-t border-white/10 pt-2">
                        {showProfile ? (
                            <div className="flex items-center gap-1.5">
                                {avatarUrl ? (
                                    <img
                                        src={avatarUrl}
                                        alt="Avatar"
                                        className="h-6 w-6 rounded-full object-cover"
                                        style={{ border: `1.5px solid ${accent}` }}
                                    />
                                ) : (
                                    <div
                                        className="flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold text-white"
                                        style={{ background: `${accent}33`, border: `1.5px solid ${accent}` }}
                                    >
                                        {traderHandle.replace('@', '').slice(0, 2).toUpperCase() || 'TR'}
                                    </div>
                                )}
                                <div>
                                    <div className="text-[11px] font-bold text-white leading-tight">{traderHandle}</div>
                                    <div className="text-[8px] text-white/50 leading-tight">Verified Trader</div>
                                </div>
                            </div>
                        ) : <div />}

                        {showWatermark && (
                            <span className="text-[9px] text-white/40 font-medium">
                                {brandTitle} • {formatDate(Date.now())}
                            </span>
                        )}
                    </div>
                )}
            </div>
        </div>
    )
}
