import { useMemo, useState } from 'react'
import type { TradeDetail } from '@shared/domain'
import { PageHeader } from '../components/AppShell'
import { MetricCard } from '../components/MetricCard'
import { Badge, Button, EmptyState } from '../components/ui'
import { PnlValue } from '../components/PnlValue'
import { AccountBalanceWidget } from '../components/AccountBalanceWidget'
import { ShareAnalyticsModal } from '../components/ShareAnalyticsModal'
import { SharePnlModal } from '../components/SharePnlModal'
import { compilePerformanceReport } from '../lib/analytics'
import { formatDateTime, formatDuration, formatPnl, formatRatio, formatR, pnlColorClass, rColorClass } from '../lib/format'
import { useI18n } from '../lib/i18n'
import { cn } from '../lib/utils'

/**
 * Dashboard — Neo-Quant Bento Overview (ADR-0005).
 *
 * Hierarki Bento:
 * 1. Hero Strip: Saldo Exchange + Kartu Hero P&L Bersih & Win Rate.
 * 2. Analitik & Risiko: Kurva Equity (7 col) + Ringkasan Risiko & Eksekusi (5 col).
 * 3. Metrik Tambahan + Trade Terakhir dengan aksi bagikan cepat.
 */

function EquitySparkline({
    points,
    emptyText,
    ariaLabel
}: {
    points: ReadonlyArray<{ time: number; equity: number }>
    emptyText: string
    ariaLabel: string
}): React.JSX.Element {
    if (points.length < 2) {
        return <p className="px-2 py-8 text-center text-xs text-muted-foreground">{emptyText}</p>
    }

    const width = 800
    const height = 160
    const values = points.map((p) => p.equity)
    const min = Math.min(0, ...values)
    const max = Math.max(0, ...values)
    const range = max - min || 1

    const toX = (index: number): number => (index / (points.length - 1)) * width
    const toY = (value: number): number => height - ((value - min) / range) * height

    const linePath = points
        .map((point, index) => `${index === 0 ? 'M' : 'L'} ${toX(index).toFixed(2)} ${toY(point.equity).toFixed(2)}`)
        .join(' ')

    const zeroY = toY(0)
    const areaPath = `${linePath} L ${width} ${zeroY.toFixed(2)} L 0 ${zeroY.toFixed(2)} Z`

    const last = values[values.length - 1] ?? 0
    const isPositive = last >= 0

    return (
        <svg
            viewBox={`0 0 ${width} ${height}`}
            preserveAspectRatio="none"
            className="h-44 w-full"
            role="img"
            aria-label={ariaLabel}
        >
            <line
                x1="0"
                y1={zeroY}
                x2={width}
                y2={zeroY}
                className="stroke-border"
                strokeWidth="1"
                strokeDasharray="4 4"
                vectorEffect="non-scaling-stroke"
            />
            <path d={areaPath} className={isPositive ? 'fill-profit/15' : 'fill-loss/15'} />
            <path
                d={linePath}
                className={isPositive ? 'stroke-profit' : 'stroke-loss'}
                strokeWidth="2.2"
                fill="none"
                vectorEffect="non-scaling-stroke"
            />
        </svg>
    )
}

interface DashboardProps {
    trades: TradeDetail[]
    hidePnl: boolean
}

export function Dashboard({ trades, hidePnl }: DashboardProps): React.JSX.Element {
    const { t } = useI18n()
    const [shareAnalyticsOpen, setShareAnalyticsOpen] = useState(false)
    const [sharePnlDetail, setSharePnlDetail] = useState<TradeDetail | null>(null)

    const report = useMemo(() => compilePerformanceReport(trades), [trades])

    const recent = useMemo(
        () => [...trades].sort((a, b) => b.trade.exitTime - a.trade.exitTime).slice(0, 5),
        [trades]
    )

    if (trades.length === 0) {
        return (
            <div className="flex h-full flex-col overflow-hidden">
                <PageHeader title={t('dash.title')} description={t('dash.emptySubtitle')} />
                <div className="px-4 pt-4 md:px-6">
                    <AccountBalanceWidget hidePnl={hidePnl} />
                </div>
                <EmptyState title={t('dash.emptyTitle')} description={t('dash.emptyDesc')} />
            </div>
        )
    }

    const lastEquity = report.equityCurve[report.equityCurve.length - 1]?.equity ?? 0

    return (
        <div className="flex h-full flex-col overflow-hidden">
            <PageHeader
                title={t('dash.title')}
                description={t('dash.subtitle', { count: report.summary.totalTrades })}
                actions={
                    <Button
                        size="sm"
                        variant="primary"
                        className="min-h-11 sm:min-h-9"
                        onClick={() => setShareAnalyticsOpen(true)}
                    >
                        {t('dash.shareReport')}
                    </Button>
                }
            />

            <div className="flex-1 overflow-y-auto px-4 py-4 md:px-6 flex flex-col gap-4">
                {/* ── BARIS 1: HERO BENTO STRIP (Saldo Exchange + Net P&L & Win Rate) ── */}
                <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
                    <div className="xl:col-span-7">
                        <AccountBalanceWidget hidePnl={hidePnl} />
                    </div>

                    <div className="xl:col-span-5 rounded-xl bg-card p-4 ring-1 ring-border/45 flex flex-col justify-between gap-3">
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                                    {t('dash.netPnl')}
                                </p>
                                <div className="mt-1.5">
                                    <PnlValue
                                        value={formatPnl(report.summary.netPnlTotal)}
                                        hide={hidePnl}
                                        className={cn(
                                            'tabular text-2xl sm:text-3xl font-bold tracking-tight',
                                            pnlColorClass(report.summary.netPnlTotal)
                                        )}
                                    />
                                </div>
                                <p className="mt-1 text-[11px] text-muted-foreground tabular">
                                    {t('dash.grossAndFee', {
                                        gross: formatPnl(report.summary.grossPnlTotal),
                                        fee: formatPnl(-report.summary.feeTotal)
                                    })}
                                </p>
                            </div>

                            <div className="rounded-lg bg-muted/60 px-3 py-2 text-right shrink-0">
                                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                                    {t('dash.winRate')}
                                </p>
                                <p className="tabular mt-0.5 text-lg font-bold text-foreground">
                                    {report.summary.winRate === null
                                        ? '—'
                                        : `${(report.summary.winRate * 100).toFixed(1)}%`}
                                </p>
                                <p className="tabular text-[10px] text-muted-foreground">
                                    {report.summary.breakEven > 0
                                        ? `${report.summary.wins}W / ${report.summary.losses}L · ${report.summary.breakEven} flat`
                                        : `${report.summary.wins}W / ${report.summary.losses}L`}
                                </p>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border/35">
                            <div className="rounded-lg bg-muted/50 px-3 py-2">
                                <p className="text-[10px] font-semibold uppercase text-muted-foreground">
                                    {t('dash.profitFactor')}
                                </p>
                                <p className="mt-0.5 text-sm font-bold tabular">
                                    <PnlValue
                                        value={formatRatio(report.summary.profitFactor)}
                                        hide={hidePnl}
                                        className={
                                            !Number.isFinite(report.summary.profitFactor) ||
                                            report.summary.profitFactor >= 1
                                                ? 'text-profit'
                                                : 'text-loss'
                                        }
                                    />
                                </p>
                            </div>
                            <div className="rounded-lg bg-muted/50 px-3 py-2">
                                <p className="text-[10px] font-semibold uppercase text-muted-foreground">
                                    {t('dash.expectancy')}
                                </p>
                                <p
                                    className={cn(
                                        'mt-0.5 text-sm font-bold tabular',
                                        report.summary.expectancy !== null &&
                                            pnlColorClass(report.summary.expectancy)
                                    )}
                                >
                                    {report.summary.expectancy === null
                                        ? '—'
                                        : formatPnl(report.summary.expectancy)}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* ── BARIS 2: BENTO EQUITY CURVE + RINGKASAN RISIKO ── */}
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
                    <section className="lg:col-span-7 rounded-xl bg-card ring-1 ring-border/45 flex flex-col justify-between">
                        <div className="flex items-center justify-between border-b border-border/40 px-4 py-3">
                            <div>
                                <h3 className="text-sm font-semibold text-foreground">
                                    {t('dash.equityCurve')}
                                </h3>
                                <p className="text-[11px] text-muted-foreground">
                                    {t('dash.equityCurveDesc')}
                                </p>
                            </div>
                            <PnlValue
                                value={formatPnl(lastEquity)}
                                hide={hidePnl}
                                className={cn('tabular text-sm font-bold', pnlColorClass(lastEquity))}
                            />
                        </div>
                        <div className="px-2 py-3">
                            <EquitySparkline
                                points={report.equityCurve}
                                emptyText={t('dash.equityNeedTwo')}
                                ariaLabel={t('dash.equityCurveAria')}
                            />
                        </div>
                    </section>

                    <section className="lg:col-span-5 rounded-xl bg-card p-4 ring-1 ring-border/45 flex flex-col gap-3">
                        <h3 className="text-sm font-semibold text-foreground">{t('dash.riskSummary')}</h3>
                        <div className="grid grid-cols-2 gap-2.5">
                            <MetricCard
                                variant="tile"
                                label={t('dash.maxDrawdown')}
                                value={
                                    <PnlValue
                                        value={formatPnl(report.drawdownStats.maxDrawdown)}
                                        hide={hidePnl}
                                        className={report.drawdownStats.maxDrawdown < 0 ? 'text-loss' : undefined}
                                    />
                                }
                                hint={
                                    report.drawdownStats.maxDrawdownTime
                                        ? t('dash.worstAt', {
                                              time: formatDateTime(report.drawdownStats.maxDrawdownTime)
                                          })
                                        : t('dash.noDrawdown')
                                }
                            />
                            <MetricCard
                                variant="tile"
                                label={t('dash.totalR')}
                                value={formatR(report.summary.totalR)}
                                hint={
                                    report.summary.avgR !== null
                                        ? t('dash.avgR', { avg: formatR(report.summary.avgR) })
                                        : t('dash.noValidR')
                                }
                                valueClassName={rColorClass(report.summary.totalR)}
                            />
                            <MetricCard
                                variant="tile"
                                label={t('dash.recoveryFactor')}
                                value={
                                    report.summary.recoveryFactor !== null
                                        ? !Number.isFinite(report.summary.recoveryFactor)
                                            ? '∞'
                                            : report.summary.recoveryFactor.toFixed(2)
                                        : '—'
                                }
                                hint={t('dash.recoveryHint')}
                                valueClassName={
                                    report.summary.recoveryFactor !== null &&
                                    report.summary.recoveryFactor >= 1
                                        ? 'text-profit'
                                        : report.summary.recoveryFactor !== null &&
                                            report.summary.recoveryFactor < 0
                                          ? 'text-loss'
                                          : undefined
                                }
                                badge={
                                    report.summary.recoveryFactor !== null &&
                                    report.summary.recoveryFactor >= 1 ? (
                                        <Badge tone="profit">{t('dash.resilient')}</Badge>
                                    ) : undefined
                                }
                            />
                            <MetricCard
                                variant="tile"
                                label={t('dash.maxStreak')}
                                value={`${report.summary.maxConsecutiveWins}W / ${report.summary.maxConsecutiveLosses}L`}
                                hint={t('dash.streakHint')}
                                badge={
                                    report.summary.maxConsecutiveWins >= 3 ? (
                                        <Badge tone="profit">
                                            {t('dash.winStreakBadge', {
                                                n: report.summary.maxConsecutiveWins
                                            })}
                                        </Badge>
                                    ) : undefined
                                }
                            />
                        </div>
                    </section>
                </div>

                {/* ── BARIS 3: METRIK PENDUKUNG RINGKAS ── */}
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                    <MetricCard
                        label={t('dash.drawdownDuration')}
                        value={
                            report.drawdownStats.maxDrawdownDurationMs === null
                                ? t('dash.notRecovered')
                                : formatDuration(0, report.drawdownStats.maxDrawdownDurationMs)
                        }
                        hint={t('dash.drawdownDurationHint')}
                    />
                    <MetricCard
                        label={t('dash.fundingFee')}
                        value={
                            <PnlValue
                                value={formatPnl(-report.summary.fundingFeeTotal)}
                                hide={hidePnl}
                                className={report.summary.fundingFeeTotal > 0 ? 'text-loss' : undefined}
                            />
                        }
                        hint={t('dash.fundingFeeHint')}
                    />
                    <MetricCard
                        label={t('dash.validR')}
                        value={`${report.summary.tradesWithR} / ${report.summary.totalTrades}`}
                        hint={t('dash.validRHint')}
                        badge={
                            report.summary.tradesWithR < report.summary.totalTrades ? (
                                <Badge tone="warning">{t('dash.partial')}</Badge>
                            ) : undefined
                        }
                    />
                    <MetricCard
                        label={t('dash.expectancyR')}
                        value={formatR(report.summary.expectancyR)}
                        hint={t('dash.expectancyRHint')}
                        valueClassName={rColorClass(report.summary.expectancyR)}
                    />
                </div>

                {/* ── BARIS 4: TRADE TERAKHIR ── */}
                <section className="rounded-xl bg-card ring-1 ring-border/45">
                    <div className="border-b border-border/40 px-4 py-3">
                        <h3 className="text-sm font-semibold text-foreground">
                            {t('dash.recentTrades')}
                        </h3>
                    </div>
                    <div className="divide-y divide-border/40">
                        {recent.map((detail) => (
                            <div
                                key={detail.trade.id}
                                className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 text-xs hover:bg-muted/40 transition-colors"
                            >
                                <div className="flex flex-wrap items-center gap-2.5 min-w-0">
                                    <Badge tone={detail.trade.direction === 'long' ? 'profit' : 'loss'}>
                                        {detail.trade.direction === 'long' ? 'Long' : 'Short'}
                                    </Badge>
                                    <span className="font-semibold text-foreground">
                                        {detail.trade.symbol}
                                    </span>
                                    {detail.journal?.setupTag && (
                                        <span className="text-muted-foreground truncate">
                                            {detail.journal.setupTag}
                                        </span>
                                    )}
                                    {detail.journal?.executionGrade && (
                                        <Badge tone={detail.journal.executionGrade === 'A' ? 'profit' : 'muted'}>
                                            Grade {detail.journal.executionGrade}
                                        </Badge>
                                    )}
                                </div>
                                <div className="flex items-center gap-3 ml-auto">
                                    <span className="hidden sm:inline tabular text-muted-foreground">
                                        {formatDateTime(detail.trade.exitTime)}
                                    </span>
                                    <PnlValue
                                        value={formatR(detail.rMultiple)}
                                        hide={hidePnl}
                                        className={cn('w-16 text-right text-xs', rColorClass(detail.rMultiple))}
                                    />
                                    <PnlValue
                                        value={formatPnl(detail.trade.realizedPnl)}
                                        hide={hidePnl}
                                        className={cn('w-24 text-right font-semibold', pnlColorClass(detail.trade.realizedPnl))}
                                    />
                                    <Button
                                        size="sm"
                                        variant="secondary"
                                        className="min-h-11 sm:min-h-8 px-3 text-[11px]"
                                        onClick={() => setSharePnlDetail(detail)}
                                    >
                                        {t('dash.shareTrade')}
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>

                <p className="text-[11px] text-muted-foreground pb-2">{t('dash.footnote')}</p>
            </div>

            <ShareAnalyticsModal
                isOpen={shareAnalyticsOpen}
                onClose={() => setShareAnalyticsOpen(false)}
                trades={trades}
                report={report}
            />

            {sharePnlDetail && (
                <SharePnlModal
                    isOpen={Boolean(sharePnlDetail)}
                    onClose={() => setSharePnlDetail(null)}
                    detail={sharePnlDetail}
                />
            )}
        </div>
    )
}
