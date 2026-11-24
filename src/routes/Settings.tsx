import { useEffect, useState } from 'react'
import { PageHeader } from '../components/AppShell'
import { AiConfigPanel } from '../components/AiConfigPanel'
import { BackupPanel } from '../components/BackupPanel'
import { DeviceSyncPanel } from '../components/DeviceSyncPanel'
import { ExchangeCredentials } from '../components/ExchangeCredentials'
import { SyncPanel } from '../components/SyncPanel'
import { ShareBrandingSettings } from '../components/ShareBrandingSettings'
import { CustomColorSchemeCard } from '../components/CustomColorSchemeCard'
import { Badge, Button, Card, CardHeader, ErrorNote, TextArea, ToggleSwitch } from '../components/ui'
import type { Theme } from '../hooks/useTheme'
import { LOCALE_OPTIONS, useI18n, type TranslationKey } from '../lib/i18n'
import { cn } from '../lib/utils'

/**
 * Settings — 5 Tab Tonal Neo-Quant Bento Shell (ADR-0005).
 *
 * 1. Tampilan & Bahasa (Unified Theme Engine + 34 Preset Jawa + Arekan i18n)
 * 2. Koneksi & Sinkron (Exchange API + Exchange Sync + Sync Vault)
 * 3. Kartu Share (Branding, Profil, Wallpaper, Template)
 * 4. Jurnal & AI (Template Checklist + AI Config)
 * 5. Cadangan & Sistem (Local Snapshot + Status Sistem)
 */

type SettingsTabId = 'appearance' | 'connections' | 'share' | 'journal' | 'system'

const SETTINGS_TABS: ReadonlyArray<{ id: SettingsTabId; labelKey: TranslationKey }> = [
    { id: 'appearance', labelKey: 'settings.tab.appearance' },
    { id: 'connections', labelKey: 'settings.tab.connections' },
    { id: 'share', labelKey: 'settings.tab.share' },
    { id: 'journal', labelKey: 'settings.tab.journal' },
    { id: 'system', labelKey: 'settings.tab.system' }
]

interface SettingsProps {
    theme: Theme
    colorblindSafe: boolean
    isDark: boolean
    onThemeChange: (theme: Theme) => void
    onColorblindChange: (value: boolean) => void
    dbPath: string
    onChecklistTemplateSaved: () => Promise<void> | void
    onDataChanged: () => Promise<void> | void
}

export function Settings({
    theme,
    colorblindSafe,
    isDark,
    onThemeChange,
    onColorblindChange,
    dbPath,
    onChecklistTemplateSaved,
    onDataChanged
}: SettingsProps): React.JSX.Element {
    const { locale, setLocale, t } = useI18n()
    const [activeTab, setActiveTab] = useState<SettingsTabId>('appearance')
    const [template, setTemplate] = useState('')
    const [savingTemplate, setSavingTemplate] = useState(false)
    const [templateSaved, setTemplateSaved] = useState(false)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        window.api
            .getSettings()
            .then((settings) => {
                const stored = settings.checklistTemplate
                if (Array.isArray(stored)) {
                    setTemplate(stored.join('\n'))
                }
            })
            .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
    }, [])

    async function saveTemplate(): Promise<void> {
        setSavingTemplate(true)
        setError(null)
        try {
            const lines = template
                .split('\n')
                .map((line) => line.trim())
                .filter((line) => line !== '')

            const result = await window.api.setSettings({ checklistTemplate: lines })
            if (!result.ok) {
                setError(result.error ?? 'Gagal menyimpan template.')
                return
            }
            setTemplateSaved(true)
            setTimeout(() => setTemplateSaved(false), 2500)
            await onChecklistTemplateSaved()
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err))
        } finally {
            setSavingTemplate(false)
        }
    }

    return (
        <div className="flex h-full flex-col overflow-hidden">
            <PageHeader title={t('settings.title')} description={t('settings.subtitle')} />

            {/* ── TAB BAR TONAL (Keyboard-accessible + Target Sentuh 44px di Mobile) ── */}
            <div className="shrink-0 border-b border-border/40 bg-card/45 px-4 py-2 md:px-6">
                <div
                    role="tablist"
                    aria-label={t('settings.title')}
                    className="flex items-center gap-2 overflow-x-auto pb-0.5"
                >
                    {SETTINGS_TABS.map((tab, idx) => {
                        const isActive = activeTab === tab.id
                        return (
                            <button
                                key={tab.id}
                                id={`settings-tab-${tab.id}`}
                                type="button"
                                role="tab"
                                aria-selected={isActive}
                                aria-controls={`settings-panel-${tab.id}`}
                                tabIndex={isActive ? 0 : -1}
                                onClick={() => setActiveTab(tab.id)}
                                onKeyDown={(e) => {
                                    let nextIdx: number | null = null
                                    if (e.key === 'ArrowRight') nextIdx = (idx + 1) % SETTINGS_TABS.length
                                    else if (e.key === 'ArrowLeft')
                                        nextIdx = (idx - 1 + SETTINGS_TABS.length) % SETTINGS_TABS.length
                                    else if (e.key === 'Home') nextIdx = 0
                                    else if (e.key === 'End') nextIdx = SETTINGS_TABS.length - 1
                                    if (nextIdx !== null) {
                                        e.preventDefault()
                                        const nextTab = SETTINGS_TABS[nextIdx]!
                                        setActiveTab(nextTab.id)
                                        document.getElementById(`settings-tab-${nextTab.id}`)?.focus()
                                    }
                                }}
                                className={cn(
                                    'min-h-11 sm:min-h-9 shrink-0 rounded-lg px-3.5 text-xs font-semibold transition-colors',
                                    isActive
                                        ? 'bg-primary text-primary-foreground'
                                        : 'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground'
                                )}
                            >
                                {t(tab.labelKey)}
                            </button>
                        )
                    })}
                </div>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-4 md:px-6">
                {error && (
                    <div className="mb-4 max-w-4xl">
                        <ErrorNote message={error} />
                    </div>
                )}

                <div
                    id={`settings-panel-${activeTab}`}
                    role="tabpanel"
                    aria-labelledby={`settings-tab-${activeTab}`}
                    className="flex max-w-4xl flex-col gap-4 pb-6"
                >
                    {/* ── TAB 1: TAMPILAN & BAHASA ── */}
                    {activeTab === 'appearance' && (
                        <>
                            <Card>
                                <CardHeader title={t('appearance.title')} description={t('appearance.desc')} />
                                <div className="flex flex-col gap-4 p-4">
                                    {/* Pemilih Bahasa (Arekan / Indonesia / English) */}
                                    <div className="flex flex-col gap-2">
                                        <div>
                                            <p className="text-xs font-semibold text-foreground">
                                                {t('appearance.language')}
                                            </p>
                                            <p className="text-[11px] text-muted-foreground">
                                                {t('appearance.languageHint')}
                                            </p>
                                        </div>
                                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                                            {LOCALE_OPTIONS.map((opt) => {
                                                const active = locale === opt.code
                                                return (
                                                    <button
                                                        key={opt.code}
                                                        type="button"
                                                        onClick={() => setLocale(opt.code)}
                                                        aria-pressed={active}
                                                        className={cn(
                                                            'flex min-h-11 flex-col items-start rounded-lg px-3.5 py-2.5 text-left transition-colors',
                                                            active
                                                                ? 'bg-accent text-foreground shadow-[inset_2.5px_0_0_var(--primary)]'
                                                                : 'bg-muted/55 text-muted-foreground hover:bg-muted hover:text-foreground'
                                                        )}
                                                    >
                                                        <span className="text-xs font-bold text-foreground">
                                                            {opt.label}
                                                        </span>
                                                        <span className="mt-0.5 text-[10px] text-muted-foreground leading-snug">
                                                            {opt.hint}
                                                        </span>
                                                    </button>
                                                )
                                            })}
                                        </div>
                                    </div>

                                    {/* Mode Polaritas (Peteng / Padhang / Melu Sistem) */}
                                    <div className="flex flex-col gap-2 pt-3 border-t border-border/40">
                                        <div>
                                            <p className="text-xs font-semibold text-foreground">
                                                {t('appearance.mode')}
                                            </p>
                                            <p className="text-[11px] text-muted-foreground">
                                                {t('appearance.modeHint')}
                                            </p>
                                        </div>
                                        <div className="grid grid-cols-3 gap-2">
                                            {(
                                                [
                                                    { id: 'dark', label: t('appearance.modeDark') },
                                                    { id: 'light', label: t('appearance.modeLight') },
                                                    { id: 'system', label: t('appearance.modeSystem') }
                                                ] as const
                                            ).map((opt) => {
                                                const active = theme === opt.id
                                                return (
                                                    <button
                                                        key={opt.id}
                                                        type="button"
                                                        onClick={() => onThemeChange(opt.id)}
                                                        aria-pressed={active}
                                                        className={cn(
                                                            'min-h-11 rounded-lg px-3 text-xs font-semibold transition-colors',
                                                            active
                                                                ? 'bg-primary text-primary-foreground'
                                                                : 'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground'
                                                        )}
                                                    >
                                                        {opt.label}
                                                    </button>
                                                )
                                            })}
                                        </div>
                                    </div>

                                    {/* Sakelar Modern Colorblind-Safe */}
                                    <div className="pt-2">
                                        <ToggleSwitch
                                            checked={colorblindSafe}
                                            onChange={onColorblindChange}
                                            label={t('appearance.colorblind')}
                                            description={t('appearance.colorblindHint')}
                                        />
                                    </div>

                                    {/* Pratinjau Warna Semantik */}
                                    <div className="rounded-lg bg-background p-3.5 ring-1 ring-border/40">
                                        <p className="mb-2 text-[11px] font-medium text-muted-foreground">
                                            {t('appearance.previewTitle')}
                                            {colorblindSafe && ' (Colorblind-Safe)'}
                                            {isDark ? ` · ${t('appearance.modeDark')}` : ` · ${t('appearance.modeLight')}`}
                                        </p>
                                        <div className="flex flex-wrap items-center gap-6">
                                            <div>
                                                <p className="text-[10px] uppercase text-muted-foreground">
                                                    {t('appearance.profit')}
                                                </p>
                                                <p className="tabular text-lg font-bold text-profit">+1,240.50</p>
                                            </div>
                                            <div>
                                                <p className="text-[10px] uppercase text-muted-foreground">
                                                    {t('appearance.loss')}
                                                </p>
                                                <p className="tabular text-lg font-bold text-loss">-842.00</p>
                                            </div>
                                            <div>
                                                <p className="text-[10px] uppercase text-muted-foreground">
                                                    {t('appearance.neutral')}
                                                </p>
                                                <p className="tabular text-lg font-bold text-flat">0.00</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </Card>

                            <CustomColorSchemeCard />
                        </>
                    )}

                    {/* ── TAB 2: KONEKSI & SINKRON ── */}
                    {activeTab === 'connections' && (
                        <>
                            <Card>
                                <CardHeader title={t('exchange.title')} description={t('exchange.desc')} />
                                <div className="p-4">
                                    <div className="mb-3 rounded-lg bg-muted/65 px-3.5 py-2.5 text-[11px]">
                                        <p className="font-semibold text-foreground">{t('exchange.readOnlyTitle')}</p>
                                        <p className="mt-0.5 text-muted-foreground">{t('exchange.readOnlyDesc')}</p>
                                    </div>
                                    <ExchangeCredentials onChanged={onDataChanged} />
                                </div>
                            </Card>

                            <Card>
                                <CardHeader title={t('exchangeSync.title')} description={t('exchangeSync.desc')} />
                                <div className="p-4">
                                    <SyncPanel onSyncComplete={onDataChanged} variant="full" />
                                </div>
                            </Card>

                            <DeviceSyncPanel onSynced={onDataChanged} />
                        </>
                    )}

                    {/* ── TAB 3: KARTU SHARE ── */}
                    {activeTab === 'share' && <ShareBrandingSettings />}

                    {/* ── TAB 4: JURNAL & AI ── */}
                    {activeTab === 'journal' && (
                        <>
                            <Card>
                                <CardHeader title={t('checklist.title')} description={t('checklist.desc')} />
                                <div className="flex flex-col gap-3 p-4">
                                    <TextArea
                                        value={template}
                                        onChange={(e) => setTemplate(e.target.value)}
                                        placeholder={'Sesuai rencana risk %\nTidak entry saat news besar'}
                                        className="min-h-[120px] font-mono text-xs"
                                    />
                                    <div className="flex items-center gap-3">
                                        <Button
                                            variant="primary"
                                            onClick={() => void saveTemplate()}
                                            disabled={savingTemplate}
                                        >
                                            {savingTemplate ? t('checklist.saving') : t('checklist.save')}
                                        </Button>
                                        {templateSaved && <Badge tone="profit">{t('checklist.saved')}</Badge>}
                                    </div>
                                </div>
                            </Card>

                            <AiConfigPanel onSaved={() => onDataChanged} />
                        </>
                    )}

                    {/* ── TAB 5: CADANGAN & SISTEM ── */}
                    {activeTab === 'system' && (
                        <>
                            <BackupPanel onSyncComplete={onDataChanged} />

                            <Card>
                                <CardHeader title={t('system.title')} description={t('system.desc')} />
                                <div className="flex flex-col gap-2 p-4 text-xs">
                                    <div className="flex justify-between gap-4 rounded-lg bg-muted/50 px-3 py-2">
                                        <span className="text-muted-foreground">{t('system.dbLocation')}</span>
                                        <span className="tabular truncate font-mono text-[11px]" title={dbPath}>
                                            {dbPath}
                                        </span>
                                    </div>
                                    <div className="flex justify-between gap-4 rounded-lg bg-muted/50 px-3 py-2">
                                        <span className="text-muted-foreground">{t('system.colorblind')}</span>
                                        <span className={cn(colorblindSafe ? 'text-profit font-semibold' : 'text-muted-foreground')}>
                                            {colorblindSafe ? t('system.active') : t('system.inactive')}
                                        </span>
                                    </div>
                                    <div className="flex justify-between gap-4 rounded-lg bg-muted/50 px-3 py-2">
                                        <span className="text-muted-foreground">{t('system.autoSync')}</span>
                                        <span className="text-muted-foreground">{t('system.inactiveDefault')}</span>
                                    </div>
                                </div>
                            </Card>
                        </>
                    )}
                </div>
            </div>
        </div>
    )
}
