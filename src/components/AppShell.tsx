import type { ReactNode } from 'react'
import { cn } from '../lib/utils'
import type { UpdatePillContent } from '../lib/update/updateHelpers'

import logoUrl from '../assets/logo.svg'

/**
 * Kerangka aplikasi: sidebar navigasi + area konten.
 *
 * Struktur navigasi mengikuti brief §7:
 * Dashboard / Trade Log / Journal Entry / Analytics / Settings
 *
 * Gaya sengaja ditulis sendiri (bukan komponen library default) supaya tidak
 * terlihat seperti template admin-dashboard generik (brief §7).
 */

export type RouteId = 'dashboard' | 'trades' | 'journal' | 'analytics' | 'settings' | 'logs' | 'about'

export interface NavItem {
    id: RouteId
    label: string
    hint: string
}

const NAV_ITEMS: NavItem[] = [
    { id: 'dashboard', label: 'Dashboard', hint: 'Ringkasan performa' },
    { id: 'trades', label: 'Trade Log', hint: 'Daftar transaksi' },
    { id: 'journal', label: 'Journal Entry', hint: 'Catatan & grading' },
    { id: 'analytics', label: 'Analytics', hint: 'Breakdown mendalam' },
    { id: 'settings', label: 'Settings', hint: 'Preferensi & koneksi' },
    { id: 'logs', label: 'Error Logs', hint: 'Log sistem & debugging' },
    { id: 'about', label: 'About', hint: 'Tentang & update' }
]

interface AppShellProps {
    active: RouteId
    onNavigate: (route: RouteId) => void
    /** Info status di bagian bawah sidebar. */
    statusSlot?: ReactNode
    /** Indikator pembaruan aplikasi non-blocking. */
    updatePill?: UpdatePillContent
    children: ReactNode
}

export function AppShell({
    active,
    onNavigate,
    statusSlot,
    updatePill,
    children
}: AppShellProps): React.JSX.Element {
    return (
        <div className="flex h-full w-full overflow-hidden bg-background">
            <aside className="flex w-56 shrink-0 flex-col border-r border-border bg-card">
                <div className="border-b border-border px-3.5 py-3">
                    <div className="flex items-center gap-2.5">
                        <img
                            src={logoUrl}
                            alt="nitirekso Logo"
                            className="h-8 w-8 rounded-lg shrink-0 object-contain shadow-sm"
                        />
                        <div className="min-w-0">
                            <h1 className="text-sm font-bold tracking-tight text-foreground leading-tight truncate">
                                nitirekso
                            </h1>
                            <p className="text-[10px] font-medium text-primary leading-tight mt-0.5 truncate">
                                Niti Transaksi, Rekso Evaluasi
                            </p>
                        </div>
                    </div>
                </div>

                <nav className="flex-1 overflow-y-auto p-2">
                    {NAV_ITEMS.map((item) => {
                        const isActive = item.id === active
                        return (
                            <button
                                key={item.id}
                                type="button"
                                onClick={() => onNavigate(item.id)}
                                aria-current={isActive ? 'page' : undefined}
                                className={cn(
                                    'group relative mb-0.5 flex w-full flex-col items-start rounded-md px-3 py-2 text-left transition-colors',
                                    isActive
                                        ? 'bg-primary/15 text-foreground'
                                        : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                                )}
                            >
                                {/* Penanda aktif: garis vertikal, bukan sekadar warna latar —
                    supaya tetap terlihat jelas di mode colorblind-safe. */}
                                {isActive && (
                                    <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full bg-primary" />
                                )}
                                <div className="flex w-full items-center justify-between gap-2">
                                    <span className="text-[13px] font-medium">{item.label}</span>
                                    {item.id === 'about' && updatePill?.visible && (
                                        <span
                                            className={cn(
                                                'rounded border px-1.5 py-0.5 text-[10px] font-semibold tabular',
                                                updatePill.tone === 'profit'
                                                    ? 'border-profit/50 bg-card text-profit'
                                                    : updatePill.tone === 'warning'
                                                        ? 'border-border bg-secondary text-foreground'
                                                        : 'border-primary/40 bg-primary/15 text-foreground'
                                            )}
                                        >
                                            {updatePill.badgeText}
                                        </span>
                                    )}
                                </div>
                                <span className="text-[10px] text-muted-foreground">{item.hint}</span>
                            </button>
                        )
                    })}
                </nav>

                {updatePill?.visible && (
                    <div className="border-t border-border px-2.5 py-2">
                        <button
                            type="button"
                            onClick={() => onNavigate('about')}
                            className={cn(
                                'flex w-full items-center justify-between gap-2 rounded-md border bg-card px-2.5 py-2 text-left text-xs font-medium transition-colors hover:bg-accent',
                                updatePill.tone === 'profit'
                                    ? 'border-profit/50 text-profit'
                                    : updatePill.tone === 'warning'
                                        ? 'border-border text-foreground'
                                        : 'border-primary/40 text-foreground'
                            )}
                            title="Buka halaman About untuk melihat detail pembaruan"
                        >
                            <span className="flex items-center gap-2 min-w-0">
                                <svg
                                    viewBox="0 0 20 20"
                                    width="14"
                                    height="14"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="1.8"
                                    className="shrink-0"
                                    aria-hidden="true"
                                >
                                    <path d="M10 3v9m0 0-3.5-3.5M10 12l3.5-3.5M4 15.5h12" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                                <span className="truncate tabular">{updatePill.label}</span>
                            </span>
                            <span className="text-[10px] font-semibold text-foreground shrink-0">
                                Buka
                            </span>
                        </button>
                    </div>
                )}

                {statusSlot && <div className="border-t border-border p-3">{statusSlot}</div>}

                {/* Footer Dukungan Saweria */}
                <div className="border-t border-border/60 p-2.5 bg-card/40">
                    <button
                        type="button"
                        onClick={() => {
                            const url = 'https://saweria.co/arthex1204'
                            if (window.api?.openExternalUrl) {
                                void window.api.openExternalUrl(url)
                            } else {
                                window.open(url, '_blank')
                            }
                        }}
                        className="group flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-secondary/70 px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-accent hover:border-primary/40 transition-colors"
                        title="Dukung pengembang nitirekso lewat Saweria"
                    >
                        <svg
                            viewBox="0 0 24 24"
                            width="14"
                            height="14"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            className="shrink-0 text-primary"
                            aria-hidden="true"
                        >
                            <path d="M18 8h1a4 4 0 0 1 0 8h-1M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8Z" strokeLinecap="round" strokeLinejoin="round" />
                            <path d="M6 2v2M10 2v2M14 2v2" strokeLinecap="round" />
                        </svg>
                        <span>Beliin Aku Kopi</span>
                    </button>
                </div>
            </aside>

            <main className="flex-1 overflow-hidden">{children}</main>
        </div>
    )
}

/** Header halaman konsisten dengan slot aksi di kanan. */
export function PageHeader({
    title,
    description,
    actions
}: {
    title: string
    description?: string
    actions?: ReactNode
}): React.JSX.Element {
    return (
        <header className="flex items-start justify-between gap-4 border-b border-border px-6 py-4">
            <div>
                <h2 className="text-base font-semibold">{title}</h2>
                {description && <p className="text-xs text-muted-foreground">{description}</p>}
            </div>
            {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </header>
    )
}
