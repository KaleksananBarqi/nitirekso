import { useState } from 'react'
import { Card, CardHeader, Field, Button, Badge } from './ui'
import {
    loadAllColorSchemes,
    addCustomColorScheme,
    updateCustomColorScheme,
    deleteCustomColorScheme,
    getActiveCustomSchemeId,
    setActiveCustomSchemeId,
    type CustomColorScheme
} from '../lib/customThemes'

export function CustomColorSchemeCard(): React.JSX.Element {
    const [schemes, setSchemes] = useState<CustomColorScheme[]>(loadAllColorSchemes)
    const [activeId, setActiveId] = useState<string | null>(getActiveCustomSchemeId)

    // Form state untuk skema baru atau edit
    const [isCreating, setIsCreating] = useState(false)
    const [editingId, setEditingId] = useState<string | null>(null)
    const [name, setName] = useState('')
    const [primary, setPrimary] = useState('#8b5cf6')
    const [profit, setProfit] = useState('#22c55e')
    const [loss, setLoss] = useState('#ef4444')
    const [background, setBackground] = useState('#0b0f19')
    const [cardBg, setCardBg] = useState('#131b2e')
    const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null)
    const [formError, setFormError] = useState<string | null>(null)
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

    const handleSelectScheme = (id: string | null) => {
        setActiveCustomSchemeId(id)
        setActiveId(id)
        setFeedbackMsg(id ? 'Skema warna berhasil diterapkan!' : 'Kembali ke tema bawaan.')
        setTimeout(() => setFeedbackMsg(null), 3000)
    }

    const handleDelete = (id: string) => {
        deleteCustomColorScheme(id)
        const updated = loadAllColorSchemes()
        setSchemes(updated)
        if (activeId === id) {
            setActiveId(null)
        }
        setConfirmDeleteId(null)
        setFeedbackMsg('Skema warna berhasil dihapus.')
        setTimeout(() => setFeedbackMsg(null), 3000)
    }

    const handleStartEdit = (scheme: CustomColorScheme) => {
        setEditingId(scheme.id)
        setName(scheme.name)
        setPrimary(scheme.primary)
        setProfit(scheme.profit)
        setLoss(scheme.loss)
        setBackground(scheme.background || '#0b0f19')
        setCardBg(scheme.card || '#131b2e')
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
            setFormError('Harap masukkan nama untuk skema warna Anda.')
            return
        }
        setFormError(null)

        if (editingId) {
            updateCustomColorScheme(editingId, {
                name: name.trim(),
                primary,
                profit,
                loss,
                background,
                card: cardBg
            })
            const updated = loadAllColorSchemes()
            setSchemes(updated)
            setFeedbackMsg(`Skema "${name.trim()}" berhasil diperbarui!`)
        } else {
            const created = addCustomColorScheme({
                name: name.trim(),
                primary,
                profit,
                loss,
                background,
                card: cardBg
            })
            const updated = loadAllColorSchemes()
            setSchemes(updated)
            handleSelectScheme(created.id)
            setFeedbackMsg(`Skema baru "${created.name}" berhasil dibuat & diterapkan!`)
        }

        setName('')
        setEditingId(null)
        setIsCreating(false)
        setTimeout(() => setFeedbackMsg(null), 3000)
    }

    const currentScheme = schemes.find((s) => s.id === activeId) || null

    return (
        <Card>
            <CardHeader
                title="Skema Warna Kustom"
                description="Kreasikan skema warna Anda sendiri dengan nama kustom, atur warna aksen, profit, loss, dan latar belakang."
            />

            <div className="flex flex-col gap-5 p-4">
                {/* Status Aktif & Feedback */}
                <div className="flex items-center justify-between flex-wrap gap-2 p-3 rounded-xl bg-muted/30 border border-border/50">
                    <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-foreground">Skema Aktif:</span>
                        {currentScheme ? (
                            <div className="flex items-center gap-1.5">
                                <span className="text-xs font-bold text-primary">{currentScheme.name}</span>
                                <div className="flex items-center gap-1 ml-1">
                                    <span className="w-2.5 h-2.5 rounded-full" style={{ background: currentScheme.primary }} title="Aksen" />
                                    <span className="w-2.5 h-2.5 rounded-full" style={{ background: currentScheme.profit }} title="Profit" />
                                    <span className="w-2.5 h-2.5 rounded-full" style={{ background: currentScheme.loss }} title="Loss" />
                                </div>
                            </div>
                        ) : (
                            <span className="text-xs text-muted-foreground italic">Tema Standar Aplikasi (Bawaan)</span>
                        )}
                    </div>

                    <div className="flex items-center gap-2">
                        {currentScheme && (
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleSelectScheme(null)}
                                className="text-xs text-muted-foreground hover:text-foreground"
                            >
                                Reset ke Standar
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
                            className="text-xs font-semibold"
                        >
                            {isCreating ? 'Tutup Form' : '+ Buat Skema Baru'}
                        </Button>
                    </div>
                </div>

                {feedbackMsg && (
                    <div className="px-3 py-1.5 rounded-lg bg-profit/15 text-profit border border-profit/30 text-xs font-medium animate-fadeIn">
                        ✓ {feedbackMsg}
                    </div>
                )}

                {/* Form Buat / Edit Skema */}
                {isCreating && (
                    <form onSubmit={handleSaveScheme} className="p-4 rounded-xl bg-card border border-primary/40 shadow-sm flex flex-col gap-4">
                        <div className="flex items-center justify-between">
                            <p className="text-xs font-bold uppercase tracking-wider text-primary">
                                {editingId ? '✏️ Edit Skema Warna Kustom' : '🎨 Konfigurasi Skema Warna Baru'}
                            </p>
                            {editingId && (
                                <span className="text-[10px] text-muted-foreground">Mode Edit Aktif</span>
                            )}
                        </div>

                        {formError && (
                            <div className="px-3 py-1.5 rounded-lg bg-destructive/15 text-destructive border border-destructive/30 text-xs font-medium">
                                ⚠ {formError}
                            </div>
                        )}

                        <Field label="Nama Skema Warna" hint="Contoh: Tokyo Night, Binance Gold, Cyber Scalp">
                            <input
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="Nama skema warna Anda..."
                                className="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs focus:border-primary focus:outline-none"
                                autoFocus
                            />
                        </Field>

                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                            {/* Primary */}
                            <div className="flex flex-col gap-1 p-2.5 rounded-lg border border-border/60 bg-muted/20">
                                <label className="text-[11px] font-semibold text-foreground">Warna Utama (Primary / Aksen)</label>
                                <div className="flex items-center gap-2 mt-1">
                                    <input
                                        type="color"
                                        value={primary}
                                        onChange={(e) => setPrimary(e.target.value)}
                                        className="w-8 h-8 rounded border border-border cursor-pointer bg-transparent"
                                    />
                                    <input
                                        type="text"
                                        value={primary}
                                        onChange={(e) => setPrimary(e.target.value)}
                                        className="h-7 w-24 text-xs font-mono px-2 rounded bg-background border border-border focus:border-primary focus:outline-none"
                                    />
                                </div>
                            </div>

                            {/* Profit */}
                            <div className="flex flex-col gap-1 p-2.5 rounded-lg border border-border/60 bg-muted/20">
                                <label className="text-[11px] font-semibold text-profit">Warna Indikator Profit</label>
                                <div className="flex items-center gap-2 mt-1">
                                    <input
                                        type="color"
                                        value={profit}
                                        onChange={(e) => setProfit(e.target.value)}
                                        className="w-8 h-8 rounded border border-border cursor-pointer bg-transparent"
                                    />
                                    <input
                                        type="text"
                                        value={profit}
                                        onChange={(e) => setProfit(e.target.value)}
                                        className="h-7 w-24 text-xs font-mono px-2 rounded bg-background border border-border focus:border-primary focus:outline-none"
                                    />
                                </div>
                            </div>

                            {/* Loss */}
                            <div className="flex flex-col gap-1 p-2.5 rounded-lg border border-border/60 bg-muted/20">
                                <label className="text-[11px] font-semibold text-loss">Warna Indikator Loss</label>
                                <div className="flex items-center gap-2 mt-1">
                                    <input
                                        type="color"
                                        value={loss}
                                        onChange={(e) => setLoss(e.target.value)}
                                        className="w-8 h-8 rounded border border-border cursor-pointer bg-transparent"
                                    />
                                    <input
                                        type="text"
                                        value={loss}
                                        onChange={(e) => setLoss(e.target.value)}
                                        className="h-7 w-24 text-xs font-mono px-2 rounded bg-background border border-border focus:border-primary focus:outline-none"
                                    />
                                </div>
                            </div>

                            {/* Background */}
                            <div className="flex flex-col gap-1 p-2.5 rounded-lg border border-border/60 bg-muted/20">
                                <label className="text-[11px] font-semibold text-foreground">Warna Latar (Background)</label>
                                <div className="flex items-center gap-2 mt-1">
                                    <input
                                        type="color"
                                        value={background}
                                        onChange={(e) => setBackground(e.target.value)}
                                        className="w-8 h-8 rounded border border-border cursor-pointer bg-transparent"
                                    />
                                    <input
                                        type="text"
                                        value={background}
                                        onChange={(e) => setBackground(e.target.value)}
                                        className="h-7 w-24 text-xs font-mono px-2 rounded bg-background border border-border focus:border-primary focus:outline-none"
                                    />
                                </div>
                            </div>

                            {/* Card Background */}
                            <div className="flex flex-col gap-1 p-2.5 rounded-lg border border-border/60 bg-muted/20">
                                <label className="text-[11px] font-semibold text-foreground">Warna Kartu / Panel (Card)</label>
                                <div className="flex items-center gap-2 mt-1">
                                    <input
                                        type="color"
                                        value={cardBg}
                                        onChange={(e) => setCardBg(e.target.value)}
                                        className="w-8 h-8 rounded border border-border cursor-pointer bg-transparent"
                                    />
                                    <input
                                        type="text"
                                        value={cardBg}
                                        onChange={(e) => setCardBg(e.target.value)}
                                        className="h-7 w-24 text-xs font-mono px-2 rounded bg-background border border-border focus:border-primary focus:outline-none"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Live mini preview */}
                        <div
                            className="p-3 rounded-lg flex items-center justify-between border transition-all"
                            style={{ background: cardBg, borderColor: primary }}
                        >
                            <span className="text-xs font-bold" style={{ color: primary }}>
                                Preview Kartu: {name || 'Nama Skema'}
                            </span>
                            <div className="flex items-center gap-4 text-xs font-semibold">
                                <span style={{ color: profit }}>+14.50% (Win)</span>
                                <span style={{ color: loss }}>-4.20% (Loss)</span>
                            </div>
                        </div>

                        <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/40">
                            <Button variant="ghost" size="sm" type="button" onClick={handleCancelForm}>
                                Batal
                            </Button>
                            <Button variant="primary" size="sm" type="submit">
                                {editingId ? 'Simpan Perubahan' : 'Simpan & Terapkan Skema'}
                            </Button>
                        </div>
                    </form>
                )}

                {/* Galeri Skema Warna */}
                <div>
                    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2.5">
                        Koleksi Skema Warna ({schemes.length}):
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                        {schemes.map((s) => {
                            const isSelected = activeId === s.id
                            const isConfirmingDelete = confirmDeleteId === s.id

                            return (
                                <div
                                    key={s.id}
                                    onClick={() => handleSelectScheme(s.id)}
                                    className={`relative p-3 rounded-xl border flex flex-col justify-between gap-3 cursor-pointer transition-all ${
                                        isSelected
                                            ? 'border-primary ring-2 ring-primary/40 bg-card shadow-sm'
                                            : 'border-border/70 bg-card/40 hover:border-border hover:bg-card/70'
                                    }`}
                                >
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="flex flex-col min-w-0">
                                            <span className="text-xs font-bold text-foreground truncate">{s.name}</span>
                                            <span className="text-[10px] text-muted-foreground">
                                                {s.isBuiltin ? 'Preset Bawaan' : 'Kustom Anda'}
                                            </span>
                                        </div>
                                        {isSelected ? (
                                            <Badge tone="profit">Aktif</Badge>
                                        ) : (
                                            <span className="text-[10px] font-medium text-muted-foreground hover:text-foreground">
                                                Pilih
                                            </span>
                                        )}
                                    </div>

                                    {/* Palette Swatches */}
                                    <div className="flex items-center gap-1.5 p-1.5 rounded-lg bg-black/20 border border-white/5">
                                        <div
                                            className="w-5 h-5 rounded-md shadow-xs"
                                            style={{ background: s.primary }}
                                            title={`Primary: ${s.primary}`}
                                        />
                                        <div
                                            className="w-5 h-5 rounded-md shadow-xs"
                                            style={{ background: s.profit }}
                                            title={`Profit: ${s.profit}`}
                                        />
                                        <div
                                            className="w-5 h-5 rounded-md shadow-xs"
                                            style={{ background: s.loss }}
                                            title={`Loss: ${s.loss}`}
                                        />
                                        {s.background && (
                                            <div
                                                className="w-5 h-5 rounded-md shadow-xs border border-white/10"
                                                style={{ background: s.background }}
                                                title={`Background: ${s.background}`}
                                            />
                                        )}
                                        {s.card && (
                                            <div
                                                className="w-5 h-5 rounded-md shadow-xs border border-white/10"
                                                style={{ background: s.card }}
                                                title={`Card: ${s.card}`}
                                            />
                                        )}
                                    </div>

                                    {/* Aksi Edit & Hapus jika kustom */}
                                    {!s.isBuiltin && (
                                        <div className="flex items-center justify-between pt-1 border-t border-border/40 mt-1">
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    handleStartEdit(s)
                                                }}
                                                className="text-[11px] font-medium text-primary hover:underline flex items-center gap-1"
                                                title="Edit skema warna ini"
                                            >
                                                <span>✏️</span>
                                                <span>Edit</span>
                                            </button>

                                            {isConfirmingDelete ? (
                                                <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleDelete(s.id)}
                                                        className="px-2 py-0.5 rounded bg-destructive text-destructive-foreground text-[10px] font-bold shadow-xs hover:bg-destructive/90"
                                                    >
                                                        Yakin Hapus?
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => setConfirmDeleteId(null)}
                                                        className="text-[10px] text-muted-foreground hover:text-foreground"
                                                    >
                                                        Batal
                                                    </button>
                                                </div>
                                            ) : (
                                                <button
                                                    type="button"
                                                    onClick={(e) => {
                                                        e.stopPropagation()
                                                        setConfirmDeleteId(s.id)
                                                    }}
                                                    className="text-[10px] text-muted-foreground hover:text-destructive transition-colors"
                                                >
                                                    Hapus
                                                </button>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )
                        })}
                    </div>
                </div>
            </div>
        </Card>
    )
}
