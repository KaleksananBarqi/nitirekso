import { useEffect, useMemo, useState } from 'react'
import { Card, CardHeader, Field, Button, Badge } from './ui'
import {
    DEFAULT_DARK_PRESET_ID,
    addCustomThemePreset,
    deleteCustomThemePreset,
    getAllThemePresets,
    getEffectiveThemePreset,
    selectThemePreset,
    updateCustomThemePreset,
    type ThemePreset
} from '../lib/themeEngine'
import { useI18n } from '../lib/i18n'
import { cn } from '../lib/utils'

type ThemeFilter = 'all' | 'dark' | 'light' | 'custom'

export function CustomColorSchemeCard(): React.JSX.Element {
    const { t } = useI18n()
    const [presets, setPresets] = useState<ThemePreset[]>(getAllThemePresets)
    const [activePreset, setActivePreset] = useState<ThemePreset>(getEffectiveThemePreset)
    const [searchQuery, setSearchQuery] = useState('')
    const [filter, setFilter] = useState<ThemeFilter>('all')

    useEffect(() => {
        const refresh = () => {
            setPresets(getAllThemePresets())
            setActivePreset(getEffectiveThemePreset())
        }
        window.addEventListener('nitirekso:theme-updated', refresh)
        window.addEventListener('custom-themes:updated', refresh)
        return () => {
            window.removeEventListener('nitirekso:theme-updated', refresh)
            window.removeEventListener('custom-themes:updated', refresh)
        }
    }, [])

    // Form state untuk tema kustom
    const [isCreating, setIsCreating] = useState(false)
    const [editingId, setEditingId] = useState<string | null>(null)
    const [name, setName] = useState('')
    const [primary, setPrimary] = useState('#9333EA')
    const [profit, setProfit] = useState('#10B981')
    const [loss, setLoss] = useState('#F43F5E')
    const [background, setBackground] = useState('#0C0B14')
    const [cardBg, setCardBg] = useState('#151322')
    const [formError, setFormError] = useState<string | null>(null)
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

    const counts = useMemo(() => {
        let dark = 0
        let light = 0
        let custom = 0
        for (const p of presets) {
            if (p.polarity === 'dark') dark++
            else light++
            if (!p.isBuiltin) custom++
        }
        return { all: presets.length, dark, light, custom }
    }, [presets])

    const filteredPresets = useMemo(() => {
        const q = searchQuery.trim().toLowerCase()
        return presets.filter((p) => {
            if (filter === 'dark' && p.polarity !== 'dark') return false
            if (filter === 'light' && p.polarity !== 'light') return false
            if (filter === 'custom' && p.isBuiltin) return false
            if (!q) return true
            return (
                p.name.toLowerCase().includes(q) ||
                p.description.toLowerCase().includes(q) ||
                p.id.toLowerCase().includes(q)
            )
        })
    }, [presets, filter, searchQuery])

    const handleSelectPreset = (id: string) => {
        selectThemePreset(id)
    }

    const handleDelete = (id: string) => {
        deleteCustomThemePreset(id)
        setConfirmDeleteId(null)
    }

    const handleStartEdit = (preset: ThemePreset) => {
        setEditingId(preset.id)
        setName(preset.name)
        setPrimary(preset.primary)
        setProfit(preset.profit)
        setLoss(preset.loss)
        setBackground(preset.background)
        setCardBg(preset.card)
        setIsCreating(true)
        setFormError(null)
    }

    const handleCancelForm = () => {
        setIsCreating(false)
        setEditingId(null)
        setName('')
        setFormError(null)
    }

    const handleSaveScheme = (e: React.FormEvent) => {
        e.preventDefault()
        if (!name.trim()) {
            setFormError(t('themes.formNameError'))
            return
        }
        setFormError(null)

        if (editingId) {
            updateCustomThemePreset(editingId, {
                name: name.trim(),
                primary,
                profit,
                loss,
                background,
                card: cardBg
            })
        } else {
            const created = addCustomThemePreset({
                name: name.trim(),
                primary,
                profit,
                loss,
                background,
                card: cardBg
            })
            selectThemePreset(created.id)
        }

        setName('')
        setEditingId(null)
        setIsCreating(false)
    }

    return (
        <Card>
            <CardHeader title={t('themes.title')} description={t('themes.desc')} />

            <div className="flex flex-col gap-4 p-4">
                {/* Bar Status Tema Aktif */}
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-muted/55 p-3.5">
                    <div className="flex items-center gap-2.5 min-w-0">
                        <span className="text-xs font-semibold text-muted-foreground">
                            {t('themes.activeLabel')}:
                        </span>
                        <span className="text-xs font-bold text-foreground truncate">
                            {activePreset.name}
                        </span>
                        <div className="flex items-center gap-1">
                            <span
                                className="h-3 w-3 rounded-full ring-1 ring-border"
                                style={{ background: activePreset.background }}
                            />
                            <span
                                className="h-3 w-3 rounded-full ring-1 ring-border"
                                style={{ background: activePreset.primary }}
                            />
                            <span
                                className="h-3 w-3 rounded-full ring-1 ring-border"
                                style={{ background: activePreset.profit }}
                            />
                            <span
                                className="h-3 w-3 rounded-full ring-1 ring-border"
                                style={{ background: activePreset.loss }}
                            />
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        {activePreset.id !== DEFAULT_DARK_PRESET_ID && (
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleSelectPreset(DEFAULT_DARK_PRESET_ID)}
                            >
                                {t('themes.resetDefault')}
                            </Button>
                        )}
                        <Button
                            variant="primary"
                            size="sm"
                            onClick={() => {
                                if (isCreating) {
                                    handleCancelForm()
                                } else {
                                    setEditingId(null)
                                    setName('')
                                    setIsCreating(true)
                                }
                            }}
                        >
                            {isCreating ? t('themes.closeForm') : t('themes.createNew')}
                        </Button>
                    </div>
                </div>

                {/* Form Buat / Edit Tema Kustom */}
                {isCreating && (
                    <form
                        onSubmit={handleSaveScheme}
                        className="rounded-xl bg-muted/45 p-4 ring-1 ring-primary/40 flex flex-col gap-4"
                    >
                        <div className="flex items-center justify-between">
                            <p className="text-xs font-bold uppercase tracking-wide text-primary">
                                {editingId ? t('themes.edit') : t('themes.createNew')}
                            </p>
                        </div>

                        {formError && (
                            <div className="rounded-lg bg-destructive/15 px-3 py-2 text-xs font-medium text-destructive">
                                {formError}
                            </div>
                        )}

                        <Field label={t('themes.formNameLabel')}>
                            <input
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder={t('themes.formNamePlaceholder')}
                                className="mt-1 h-10 sm:h-9 w-full rounded-lg border border-input bg-background px-3 py-1 text-sm focus:border-primary focus:outline-none"
                                autoFocus
                            />
                        </Field>

                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                            {[
                                { label: t('themes.colorPrimary'), val: primary, set: setPrimary },
                                { label: t('themes.colorProfit'), val: profit, set: setProfit },
                                { label: t('themes.colorLoss'), val: loss, set: setLoss },
                                { label: t('themes.colorBg'), val: background, set: setBackground },
                                { label: t('themes.colorCard'), val: cardBg, set: setCardBg }
                            ].map((item) => (
                                <div
                                    key={item.label}
                                    className="flex flex-col gap-1.5 rounded-lg bg-card p-2.5"
                                >
                                    <label className="text-[11px] font-semibold text-foreground">
                                        {item.label}
                                    </label>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="color"
                                            value={item.val}
                                            onChange={(e) => item.set(e.target.value)}
                                            className="h-8 w-8 rounded border border-border cursor-pointer bg-transparent"
                                        />
                                        <input
                                            type="text"
                                            value={item.val}
                                            onChange={(e) => item.set(e.target.value)}
                                            className="h-8 w-24 rounded-md border border-input bg-background px-2 font-mono text-xs focus:border-primary focus:outline-none"
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div
                            className="rounded-lg p-3 flex items-center justify-between ring-1"
                            style={{ background: cardBg, borderColor: primary }}
                        >
                            <span className="text-xs font-bold" style={{ color: primary }}>
                                {name || t('themes.formPreview')}
                            </span>
                            <div className="flex items-center gap-4 text-xs font-semibold tabular">
                                <span style={{ color: profit }}>+14.50%</span>
                                <span style={{ color: loss }}>-4.20%</span>
                            </div>
                        </div>

                        <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/40">
                            <Button variant="ghost" size="sm" type="button" onClick={handleCancelForm}>
                                {t('themes.cancel')}
                            </Button>
                            <Button variant="primary" size="sm" type="submit">
                                {editingId ? t('themes.saveEdit') : t('themes.saveNew')}
                            </Button>
                        </div>
                    </form>
                )}

                {/* Bilah Pencarian & Filter Polaritas */}
                <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
                    <input
                        type="search"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder={t('themes.searchPlaceholder')}
                        className="h-10 sm:h-9 w-full sm:max-w-xs rounded-lg border border-input bg-background px-3 text-xs focus:border-primary focus:outline-none"
                    />

                    <div className="flex flex-wrap items-center gap-1.5">
                        {(
                            [
                                { id: 'all', label: `${t('themes.filterAll')} (${counts.all})` },
                                { id: 'dark', label: `${t('themes.filterDark')} (${counts.dark})` },
                                { id: 'light', label: `${t('themes.filterLight')} (${counts.light})` },
                                ...(counts.custom > 0
                                    ? [{ id: 'custom' as const, label: `${t('themes.filterCustom')} (${counts.custom})` }]
                                    : [])
                            ] as const
                        ).map((chip) => {
                            const active = filter === chip.id
                            return (
                                <button
                                    key={chip.id}
                                    type="button"
                                    onClick={() => setFilter(chip.id)}
                                    className={cn(
                                        'min-h-11 sm:min-h-9 rounded-lg px-3 text-xs font-semibold transition-colors',
                                        active
                                            ? 'bg-primary text-primary-foreground'
                                            : 'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground'
                                    )}
                                >
                                    {chip.label}
                                </button>
                            )
                        })}
                    </div>
                </div>

                {/* Grid Galeri Preset Tema */}
                {filteredPresets.length === 0 ? (
                    <p className="py-6 text-center text-xs text-muted-foreground">
                        {t('themes.noMatch')}
                    </p>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                        {filteredPresets.map((preset) => {
                            const isSelected = activePreset.id === preset.id
                            const isConfirmingDelete = confirmDeleteId === preset.id

                            return (
                                <div
                                    key={preset.id}
                                    role="button"
                                    tabIndex={0}
                                    onClick={() => handleSelectPreset(preset.id)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' || e.key === ' ') {
                                            e.preventDefault()
                                            handleSelectPreset(preset.id)
                                        }
                                    }}
                                    className={cn(
                                        'relative flex flex-col justify-between gap-2.5 rounded-xl p-3 cursor-pointer transition-all',
                                        isSelected
                                            ? 'bg-accent ring-2 ring-primary'
                                            : 'bg-muted/45 hover:bg-muted/80'
                                    )}
                                >
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="min-w-0">
                                            <span className="block text-xs font-bold text-foreground truncate">
                                                {preset.name}
                                            </span>
                                            <span className="block text-[10px] text-muted-foreground truncate">
                                                {preset.polarity === 'dark'
                                                    ? t('appearance.modeDark')
                                                    : t('appearance.modeLight')}
                                                {' · '}
                                                {preset.isBuiltin
                                                    ? t('themes.builtinTag')
                                                    : t('themes.customTag')}
                                            </span>
                                        </div>
                                        {isSelected ? (
                                            <Badge tone="profit">{t('themes.activeBadge')}</Badge>
                                        ) : (
                                            <span className="text-[10px] font-semibold text-muted-foreground">
                                                {t('themes.select')}
                                            </span>
                                        )}
                                    </div>

                                    {/* Mini Swatch Bar */}
                                    <div
                                        className="flex items-center gap-1.5 rounded-lg p-1.5 ring-1 ring-border/50"
                                        style={{ background: preset.background }}
                                    >
                                        <span
                                            className="h-5 w-5 rounded-md ring-1 ring-black/15"
                                            style={{ background: preset.card }}
                                            title={`Card: ${preset.card}`}
                                        />
                                        <span
                                            className="h-5 w-5 rounded-md ring-1 ring-black/15"
                                            style={{ background: preset.primary }}
                                            title={`Primary: ${preset.primary}`}
                                        />
                                        <span
                                            className="h-5 w-5 rounded-md ring-1 ring-black/15"
                                            style={{ background: preset.profit }}
                                            title={`Profit: ${preset.profit}`}
                                        />
                                        <span
                                            className="h-5 w-5 rounded-md ring-1 ring-black/15"
                                            style={{ background: preset.loss }}
                                            title={`Loss: ${preset.loss}`}
                                        />
                                        <span
                                            className="ml-auto text-[10px] font-mono font-semibold pr-1"
                                            style={{ color: preset.foreground }}
                                        >
                                            Aa
                                        </span>
                                    </div>

                                    {!preset.isBuiltin && (
                                        <div className="flex items-center justify-between pt-1.5 border-t border-border/35">
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    handleStartEdit(preset)
                                                }}
                                                className="text-[11px] font-semibold text-primary hover:underline"
                                            >
                                                {t('themes.edit')}
                                            </button>

                                            {isConfirmingDelete ? (
                                                <div
                                                    className="flex items-center gap-2"
                                                    onClick={(e) => e.stopPropagation()}
                                                >
                                                    <button
                                                        type="button"
                                                        onClick={() => handleDelete(preset.id)}
                                                        className="rounded bg-destructive px-2 py-0.5 text-[10px] font-bold text-destructive-foreground"
                                                    >
                                                        {t('themes.confirmDelete')}
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => setConfirmDeleteId(null)}
                                                        className="text-[10px] text-muted-foreground"
                                                    >
                                                        {t('themes.cancel')}
                                                    </button>
                                                </div>
                                            ) : (
                                                <button
                                                    type="button"
                                                    onClick={(e) => {
                                                        e.stopPropagation()
                                                        setConfirmDeleteId(preset.id)
                                                    }}
                                                    className="text-[11px] text-muted-foreground hover:text-destructive"
                                                >
                                                    {t('themes.delete')}
                                                </button>
                                            )}
                                        </div>
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
