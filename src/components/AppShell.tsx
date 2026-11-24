import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useI18n, type TranslationKey } from '../lib/i18n'
import { cn } from '../lib/utils'
import type { UpdatePillContent } from '../lib/update/updateHelpers'

import logoUrl from '../assets/logo.svg'

/**
 * Kerangka aplikasi Neo-Quant Bento Shell (ADR-0005).
 *
 * - Desktop / Tablet (>= 768px): Pemisahan tonal di atas `bg-shell` dengan celah 4px,
 *   sidebar tonal tanpa border keras 1px, indikator aktif bilah aksen kiri 2.5px.
 * - Mobile (< 768px): Top bar tonal ringkas, drawer sekunder, dan bottom navigation
 *   bar ramah sentuh (min-h-14).
 */

export type RouteId = 'dashboard' | 'trades' | 'journal' | 'analytics' | 'settings' | 'logs' | 'about'

interface NavDef {
    id: RouteId
    labelKey: TranslationKey
    shortKey: TranslationKey
    hintKey: TranslationKey
}

const NAV_DEFS: NavDef[] = [
    { id: 'dashboard', labelKey: 'nav.dashboard', shortKey: 'nav.dashboard.short', hintKey: 'nav.dashboard.hint' },
    { id: 'trades', labelKey: 'nav.trades', shortKey: 'nav.trades.short', hintKey: 'nav.trades.hint' },
    { id: 'journal', labelKey: 'nav.journal', shortKey: 'nav.journal.short', hintKey: 'nav.journal.hint' },
    { id: 'analytics', labelKey: 'nav.analytics', shortKey: 'nav.analytics.short', hintKey: 'nav.analytics.hint' },
    { id: 'settings', labelKey: 'nav.settings', shortKey: 'nav.settings.short', hintKey: 'nav.settings.hint' },
    { id: 'logs', labelKey: 'nav.logs', shortKey: 'nav.logs.short', hintKey: 'nav.logs.hint' },
    { id: 'about', labelKey: 'nav.about', shortKey: 'nav.about.short', hintKey: 'nav.about.hint' }
]

const MOBILE_PRIMARY_IDS: RouteId[] = ['dashboard', 'trades', 'journal', 'analytics', 'settings']

function NavIcon({ id, active }: { id: RouteId; active: boolean }): React.JSX.Element {
    const stroke = active ? 2.1 : 1.7
    switch (id) {
        case 'dashboard':
            return (
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth={stroke} aria-hidden="true">
                    <rect x="3" y="3" width="8" height="8" rx="1.5" />
                    <rect x="13" y="3" width="8" height="5" rx="1.5" />
                    <rect x="13" y="10" width="8" height="11" rx="1.5" />
                    <rect x="3" y="13" width="8" height="8" rx="1.5" />
                </svg>
            )
        case 'trades':
            return (
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth={stroke} aria-hidden="true">
                    <path d="M4 6h16M4 12h16M4 18h10" strokeLinecap="round" />
                </svg>
            )
        case 'journal':
            return (
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth={stroke} aria-hidden="true">
                    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
            )
        case 'analytics':
            return (
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth={stroke} aria-hidden="true">
                    <path d="M3 3v18h18" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="m7 14 4-4 4 3 5-6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
            )
        case 'settings':
            return (
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth={stroke} aria-hidden="true">
                    <circle cx="12" cy="12" r="3" />
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c.26.6.77 1 1.51 1H21a2 2 0 0 1 0 4h-.09c-.74 0-1.25.4-1.51 1z" />
                </svg>
            )
        default:
            return (
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth={stroke} aria-hidden="true">
                    <circle cx="12" cy="12" r="9" />
                    <path d="M12 8v4m0 4h.01" strokeLinecap="round" />
                </svg>
            )
    }
}

interface AppShellProps {
    active: RouteId
    onNavigate: (route: RouteId) => void
    /** Info status di bagian bawah sidebar & drawer mobile. */
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
    const { t } = useI18n()
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
    const menuTriggerRef = useRef<HTMLButtonElement | null>(null)

    useEffect(() => {
        if (!mobileMenuOpen) return
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                setMobileMenuOpen(false)
                menuTriggerRef.current?.focus()
            }
        }
        window.addEventListener('keydown', onKeyDown)
        return () => window.removeEventListener('keydown', onKeyDown)
    }, [mobileMenuOpen])

    const handleMobileNavigate = (route: RouteId) => {
        setMobileMenuOpen(false)
        onNavigate(route)
    }

    const openSaweria = () => {
        const url = 'https://saweria.co/arthex1204'
        if (window.api?.openExternalUrl) {
            void window.api.openExternalUrl(url)
        } else {
            window.open(url, '_blank')
        }
    }

    const mobilePrimaryItems = NAV_DEFS.filter((item) => MOBILE_PRIMARY_IDS.includes(item.id))
    const activeDef = NAV_DEFS.find((i) => i.id === active)

    return (
        <div className="flex h-full w-full flex-col md:flex-row md:gap-1 md:p-1 overflow-hidden bg-shell">
            {/* ── DESKTOP / TABLET TONAL SIDEBAR (>= 768px) ── */}
            <aside className="hidden md:flex w-56 lg:w-60 shrink-0 flex-col rounded-xl bg-card overflow-hidden">
                <div className="px-4 py-3.5 border-b border-border/35">
                    <div className="flex items-center gap-2.5">
                        <img
                            src={logoUrl}
                            alt="nitirekso Logo"
                            width={32}
                            height={32}
                            className="h-8 w-8 rounded-lg shrink-0 object-contain"
                        />
                        <div className="min-w-0">
                            <h1 className="text-sm font-bold tracking-tight text-foreground leading-tight truncate">
                                nitirekso
                            </h1>
                            <p className="text-[10px] font-medium text-muted-foreground leading-tight mt-0.5 truncate">
                                {t('brand.tagline')}
                            </p>
                        </div>
                    </div>
                </div>

                <nav className="flex-1 overflow-y-auto p-2 flex flex-col gap-0.5" aria-label={t('nav.mainAria')}>
                    {NAV_DEFS.map((item) => {
                        const isActive = item.id === active
                        return (
                            <button
                                key={item.id}
                                type="button"
                                onClick={() => onNavigate(item.id)}
                                aria-current={isActive ? 'page' : undefined}
                                className={cn(
                                    'group relative flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left transition-colors',
                                    isActive
                                        ? 'bg-accent text-foreground shadow-[inset_2.5px_0_0_var(--primary)]'
                                        : 'text-muted-foreground hover:bg-muted/70 hover:text-foreground'
                                )}
                            >
                                <span className={cn('shrink-0', isActive ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground')}>
                                    <NavIcon id={item.id} active={isActive} />
                                </span>
                                <div className="min-w-0 flex-1">
                                    <div className="flex w-full items-center justify-between gap-2">
                                        <span className="text-[13px] font-semibold truncate">{t(item.labelKey)}</span>
                                        {item.id === 'about' && updatePill?.visible && (
                                            <span
                                                className={cn(
                                                    'rounded px-1.5 py-0.5 text-[10px] font-semibold tabular',
                                                    updatePill.tone === 'profit'
                                                        ? 'bg-profit/15 text-profit'
                                                        : updatePill.tone === 'warning'
                                                          ? 'bg-secondary text-foreground'
                                                          : 'bg-primary/15 text-primary'
                                                )}
                                            >
                                                {updatePill.badgeText}
                                            </span>
                                        )}
                                    </div>
                                    <span className="block text-[10px] text-muted-foreground truncate">
                                        {t(item.hintKey)}
                                    </span>
                                </div>
                            </button>
                        )
                    })}
                </nav>

                {updatePill?.visible && (
                    <div className="px-2.5 pb-2">
                        <button
                            type="button"
                            onClick={() => onNavigate('about')}
                            className={cn(
                                'flex w-full items-center justify-between gap-2 rounded-lg bg-muted/70 px-3 py-2 text-left text-xs font-medium transition-colors hover:bg-muted',
                                updatePill.tone === 'profit'
                                    ? 'text-profit'
                                    : 'text-foreground'
                            )}
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
                            <span className="text-[10px] font-semibold text-primary shrink-0">
                                {t('nav.openUpdate')}
                            </span>
                        </button>
                    </div>
                )}

                {statusSlot && <div className="border-t border-border/35 p-3">{statusSlot}</div>}

                {/* Footer Dukungan */}
                <div className="border-t border-border/35 p-2.5">
                    <button
                        type="button"
                        onClick={openSaweria}
                        className="group flex w-full items-center justify-center gap-2 rounded-lg bg-secondary px-3 py-2 text-xs font-semibold text-secondary-foreground hover:bg-accent transition-colors"
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
                        <span>{t('nav.support')}</span>
                    </button>
                </div>
            </aside>

            {/* ── MOBILE COMPACT TOP BAR (< 768px) ── */}
            <header className="flex md:hidden shrink-0 items-center justify-between gap-2 bg-card px-3.5 pb-2.5 pt-[calc(0.625rem+env(safe-area-inset-top))]">
                <div className="flex items-center gap-2.5 min-w-0">
                    <img
                        src={logoUrl}
                        alt="nitirekso Logo"
                        width={28}
                        height={28}
                        className="h-7 w-7 rounded-lg shrink-0 object-contain"
                    />
                    <div className="min-w-0">
                        <span className="block text-sm font-bold tracking-tight text-foreground leading-tight truncate">
                            nitirekso
                        </span>
                        <span className="block text-[11px] text-muted-foreground leading-tight truncate">
                            {activeDef ? t(activeDef.labelKey) : t('nav.journal')}
                        </span>
                    </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                    {updatePill?.visible && (
                        <button
                            type="button"
                            onClick={() => handleMobileNavigate('about')}
                            className="min-h-11 rounded-lg bg-primary/15 px-3 text-[11px] font-semibold text-primary"
                        >
                            {updatePill.badgeText}
                        </button>
                    )}
                    <button
                        ref={menuTriggerRef}
                        type="button"
                        onClick={() => setMobileMenuOpen((v) => !v)}
                        aria-expanded={mobileMenuOpen}
                        aria-controls="mobile-nav-drawer"
                        className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-secondary px-3 text-xs font-semibold text-secondary-foreground"
                    >
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                            <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
                        </svg>
                        <span>{t('nav.menu')}</span>
                    </button>
                </div>
            </header>

            {/* ── MOBILE DRAWER (Logs, About, Sync & Kontrol Cepat) ── */}
            {mobileMenuOpen && (
                <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label={t('nav.moreMenu')}>
                    <div
                        className="fixed inset-0 bg-black/60 backdrop-blur-xs"
                        onClick={() => setMobileMenuOpen(false)}
                        aria-hidden="true"
                    />
                    <div
                        id="mobile-nav-drawer"
                        className="fixed right-0 top-0 bottom-0 z-50 flex w-[82vw] max-w-xs flex-col bg-card pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] shadow-2xl"
                    >
                        <div className="flex items-center justify-between border-b border-border/45 px-4 py-3">
                            <span className="text-sm font-bold text-foreground">{t('nav.moreMenu')}</span>
                            <button
                                type="button"
                                onClick={() => setMobileMenuOpen(false)}
                                aria-label={t('nav.closeMenu')}
                                className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-lg text-muted-foreground hover:bg-muted hover:text-foreground"
                            >
                                ×
                            </button>
                        </div>

                        <nav className="flex flex-col gap-1 p-3" aria-label={t('nav.secondaryAria')}>
                            {(['logs', 'about'] as RouteId[]).map((id) => {
                                const item = NAV_DEFS.find((i) => i.id === id)!
                                const isActive = active === id
                                return (
                                    <button
                                        key={id}
                                        type="button"
                                        onClick={() => handleMobileNavigate(id)}
                                        aria-current={isActive ? 'page' : undefined}
                                        className={cn(
                                            'flex min-h-11 w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors',
                                            isActive
                                                ? 'bg-accent text-foreground shadow-[inset_2.5px_0_0_var(--primary)]'
                                                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                                        )}
                                    >
                                        <span>{t(item.labelKey)}</span>
                                        {id === 'about' && updatePill?.visible && (
                                            <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                                                {updatePill.badgeText}
                                            </span>
                                        )}
                                    </button>
                                )
                            })}
                        </nav>

                        {statusSlot && (
                            <div className="mt-auto border-t border-border/45 p-4">{statusSlot}</div>
                        )}

                        <div className="border-t border-border/45 p-3">
                            <button
                                type="button"
                                onClick={openSaweria}
                                className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-secondary px-3 text-xs font-semibold text-secondary-foreground"
                            >
                                <span>{t('nav.support')}</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── AREA KONTEN UTAMA (Permukaan Tonal) ── */}
            <main className="flex-1 overflow-hidden bg-background md:rounded-xl pb-[calc(4.5rem+env(safe-area-inset-bottom))] md:pb-0">
                {children}
            </main>

            {/* ── MOBILE BOTTOM NAVIGATION BAR (< 768px) ── */}
            <nav
                aria-label={t('nav.bottomAria')}
                className="fixed bottom-0 left-0 right-0 z-40 flex md:hidden items-stretch border-t border-border/45 bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xs"
            >
                {mobilePrimaryItems.map((item) => {
                    const isActive = active === item.id
                    return (
                        <button
                            key={item.id}
                            type="button"
                            onClick={() => handleMobileNavigate(item.id)}
                            aria-current={isActive ? 'page' : undefined}
                            className={cn(
                                'relative flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 px-1 py-1.5 text-[10px] font-semibold transition-colors',
                                isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
                            )}
                        >
                            {isActive && (
                                <span className="absolute top-0 left-3 right-3 h-0.5 rounded-full bg-primary" />
                            )}
                            <NavIcon id={item.id} active={isActive} />
                            <span className="truncate max-w-full">{t(item.shortKey)}</span>
                        </button>
                    )
                })}
            </nav>
        </div>
    )
}

/** Header halaman konsisten dengan slot aksi yang otomatis wrap di layar sempit. */
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
        <header className="flex flex-col gap-3 border-b border-border/45 bg-card/55 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between md:px-6 md:py-4">
            <div className="min-w-0">
                <h2 className="text-base font-bold tracking-tight text-foreground">{title}</h2>
                {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
            </div>
            {actions && <div className="flex flex-wrap shrink-0 items-center gap-2">{actions}</div>}
        </header>
    )
}
