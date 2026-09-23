import { useCallback, useEffect, useState } from 'react'
import type { AccountBalance } from '@shared/domain'
import { Badge, Button, Card, ErrorNote } from './ui'
import { formatDateTime, formatPnl, pnlColorClass } from '../lib/format'
import { PnlValue } from './PnlValue'
import { cn } from '../lib/utils'
import { getExchangeDefaultLogo, getExchangeDisplayName } from '../lib/exchangeAssets'

interface AccountBalanceWidgetProps {
    hidePnl?: boolean
    className?: string
    onBalancesUpdated?: () => void
}

export function AccountBalanceWidget({
    hidePnl = false,
    className,
    onBalancesUpdated
}: AccountBalanceWidgetProps): React.JSX.Element {
    const [balances, setBalances] = useState<AccountBalance[]>([])
    const [loading, setLoading] = useState(false)
    const [syncing, setSyncing] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const loadBalances = useCallback(async () => {
        setLoading(true)
        try {
            const data = await window.api.getBalances()
            setBalances(data)
        } catch (err) {
            console.error('Gagal memuat saldo:', err)
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        void loadBalances()
    }, [loadBalances])

    // Dengarkan progress dan event sinkronisasi global terpadu
    useEffect(() => {
        const unsubscribe = window.api.onSyncProgress(() => {
            setSyncing(true)
        })
        const handleSyncComplete = () => {
            setSyncing(false)
            void loadBalances()
        }
        window.addEventListener('app:sync-complete', handleSyncComplete)

        return () => {
            unsubscribe()
            window.removeEventListener('app:sync-complete', handleSyncComplete)
        }
    }, [loadBalances])

    /**
     * Sinkronisasi terpadu: menarik trade baru DAN saldo exchange secara bersamaan.
     */
    const handleUnifiedSync = async () => {
        setSyncing(true)
        setError(null)
        try {
            const res = await window.api.runSync()
            if (!res.ok) {
                setError(res.error ?? 'Gagal menyinkronkan data exchange.')
                return
            }
            await loadBalances()
            onBalancesUpdated?.()
            window.dispatchEvent(new CustomEvent('app:sync-complete'))
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err))
        } finally {
            setSyncing(false)
        }
    }

    // Hitung total ekuitas & rincian
    const totalEquity = balances.reduce((sum, b) => sum + (b.total || 0), 0)
    const totalAvailable = balances.reduce((sum, b) => sum + (b.available || 0), 0)
    const totalUnrealized = balances.reduce((sum, b) => sum + (b.unrealizedPnl || 0), 0)
    const latestUpdate = balances.length > 0
        ? Math.max(...balances.map((b) => b.updatedAt))
        : null

    return (
        <Card className={cn('overflow-hidden border border-border/80 bg-card/60 backdrop-blur-sm', className)}>
            <div className="flex flex-col gap-3 p-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            Saldo Exchange (Futures)
                        </span>
                        {latestUpdate && (
                            <span className="text-[10px] text-muted-foreground">
                                · Diperbarui {formatDateTime(latestUpdate)}
                            </span>
                        )}
                    </div>
                    <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void handleUnifiedSync()}
                        disabled={syncing || loading}
                        className="h-7 text-xs"
                        title="Sinkronkan seluruh trade dan saldo terkini dari exchange yang aktif"
                    >
                        {syncing ? 'Menyinkronkan…' : '↻ Sinkron Sekarang'}
                    </Button>
                </div>

                {error && <ErrorNote message={error} />}

                {balances.length === 0 && !loading ? (
                    <div className="rounded-md border border-dashed border-border p-3 text-center text-xs text-muted-foreground">
                        Belum ada data saldo. Pastikan API key exchange sudah disimpan di Settings lalu klik &quot;Sinkron Sekarang&quot;.
                    </div>
                ) : (
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                        {/* Total Equity */}
                        <div className="rounded-lg border border-border bg-background/50 p-3">
                            <span className="text-[11px] font-medium text-muted-foreground">Total Ekuitas</span>
                            <div className="mt-1 text-lg font-bold tracking-tight text-foreground">
                                <PnlValue
                                    value={`$${totalEquity.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                                    hide={hidePnl}
                                />
                            </div>
                            <span className="text-[10px] text-muted-foreground">Gabungan seluruh exchange</span>
                        </div>

                        {/* Free / Available */}
                        <div className="rounded-lg border border-border bg-background/50 p-3">
                            <span className="text-[11px] font-medium text-muted-foreground">Saldo Tersedia (Free Margin)</span>
                            <div className="mt-1 text-lg font-semibold tracking-tight text-foreground">
                                <PnlValue
                                    value={`$${totalAvailable.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                                    hide={hidePnl}
                                />
                            </div>
                            <span className="text-[10px] text-muted-foreground">Siap untuk open posisi baru</span>
                        </div>

                        {/* Floating PnL */}
                        <div className="rounded-lg border border-border bg-background/50 p-3">
                            <span className="text-[11px] font-medium text-muted-foreground">Floating PnL (Unrealized)</span>
                            <div className={cn('mt-1 text-lg font-semibold tracking-tight', pnlColorClass(totalUnrealized))}>
                                <PnlValue
                                    value={formatPnl(totalUnrealized)}
                                    hide={hidePnl}
                                    className={pnlColorClass(totalUnrealized)}
                                />
                            </div>
                            <span className="text-[10px] text-muted-foreground">Posisi yang sedang aktif berjalan</span>
                        </div>
                    </div>
                )}

                {/* Per Exchange Breakdown Chips */}
                {balances.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-border/40 text-xs">
                        <span className="text-[11px] text-muted-foreground">Rincian Akun:</span>
                        {balances.map((b) => {
                            const logo = getExchangeDefaultLogo(b.exchange)
                            const name = getExchangeDisplayName(b.exchange)
                            return (
                                <div
                                    key={b.exchange}
                                    className="flex items-center gap-1.5 rounded-full border border-border bg-muted/30 px-2.5 py-0.5 text-[11px]"
                                >
                                    {logo && (
                                        <img
                                            src={logo}
                                            alt={name}
                                            className="h-3.5 w-3.5 rounded-full object-contain"
                                        />
                                    )}
                                    <Badge tone="muted" className="px-1.5 py-0 text-[10px] font-bold">
                                        {b.exchange.toUpperCase()}
                                    </Badge>
                                    <span className="tabular font-medium">
                                        <PnlValue
                                            value={`$${b.total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                                            hide={hidePnl}
                                        />
                                    </span>
                                    {b.total - b.available > 0.01 && (
                                        <span className="inline-flex items-center text-[10px] text-muted-foreground">
                                            (Avail:&nbsp;
                                            <PnlValue
                                                value={`$${b.available.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                                                hide={hidePnl}
                                            />
                                            )
                                        </span>
                                    )}
                                </div>
                            )
                        })}
                    </div>
                )}
            </div>
        </Card>
    )
}
