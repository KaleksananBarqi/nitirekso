import { useRef, useState } from 'react'
import { Card, CardHeader, Field } from './ui'
import {
    BG_TEMPLATES,
    loadShareSettings,
    saveShareSettings,
    loadCustomBgList,
    addCustomBgItem,
    updateCustomBgItemName,
    deleteCustomBgItem,
    getAllShareTemplates,
    deleteCustomShareTemplate,
    getActiveTemplateId,
    setActiveTemplateId,
    type ShareSettings,
    type ExchangeName,
    type ShareCardTemplate,
    type CustomBgItem
} from '../lib/shareSettings'

export function ShareBrandingSettings(): React.JSX.Element {
    const [settings, setSettings] = useState<ShareSettings>(loadShareSettings)
    const [customBgList, setCustomBgList] = useState<CustomBgItem[]>(loadCustomBgList)
    const [editingBgId, setEditingBgId] = useState<string | null>(null)
    const [editingBgName, setEditingBgName] = useState<string>('')
    const [templates, setTemplates] = useState<ShareCardTemplate[]>(getAllShareTemplates)
    const [activeTemplateId, setActiveTemplateIdState] = useState<string>(getActiveTemplateId)
    const [activeExchangeTab, setActiveExchangeTab] = useState<ExchangeName>('mexc')
    const [avatarFileError, setAvatarFileError] = useState<string | null>(null)
    const [bgFileError, setBgFileError] = useState<string | null>(null)
    const [mexcLogoError, setMexcLogoError] = useState<string | null>(null)
    const [bitunixLogoError, setBitunixLogoError] = useState<string | null>(null)

    const avatarInputRef = useRef<HTMLInputElement>(null)
    const bgInputRef = useRef<HTMLInputElement>(null)
    const mexcLogoInputRef = useRef<HTMLInputElement>(null)
    const bitunixLogoInputRef = useRef<HTMLInputElement>(null)

    const currentTemplate = BG_TEMPLATES.find((t) => t.id === settings.bgPresetId) || BG_TEMPLATES[0]!

    // Sinkronkan ke localStorage setiap ada perubahan state
    const updateSettings = (partial: Partial<ShareSettings>) => {
        setSettings((prev) => {
            const next = { ...prev, ...partial }
            saveShareSettings(partial)
            return next
        })
    }

    const handleSetDefaultTemplate = (templateId: string) => {
        setActiveTemplateId(templateId)
        setActiveTemplateIdState(templateId)
    }

    const handleDeleteTemplate = (templateId: string, name: string) => {
        if (window.confirm(`Hapus template "${name}"?`)) {
            deleteCustomShareTemplate(templateId)
            setTemplates(getAllShareTemplates())
            setActiveTemplateIdState(getActiveTemplateId())
        }
    }

    const handleAddCustomBg = (dataUrl: string, fileName?: string) => {
        const cleanName = fileName ? fileName.replace(/\.[^/.]+$/, '').slice(0, 18) : `Wallpaper ${customBgList.length + 1}`
        const created = addCustomBgItem({ name: cleanName, dataUrl })
        const updated = loadCustomBgList()
        setCustomBgList(updated)
        updateSettings({ isCustomBg: true, customBgId: created.id, customBgUrl: created.dataUrl })
    }

    const handleDeleteCustomBg = (id: string, name: string) => {
        if (window.confirm(`Hapus gambar background "${name}" dari galeri?`)) {
            deleteCustomBgItem(id)
            const updated = loadCustomBgList()
            setCustomBgList(updated)
            if (settings.customBgId === id) {
                if (updated.length > 0) {
                    updateSettings({ customBgId: updated[0]!.id, customBgUrl: updated[0]!.dataUrl })
                } else {
                    updateSettings({ isCustomBg: false, customBgId: null, customBgUrl: null })
                }
            }
        }
    }

    const handleSaveBgName = (id: string) => {
        if (!editingBgName.trim()) return
        updateCustomBgItemName(id, editingBgName.trim())
        setCustomBgList(loadCustomBgList())
        setEditingBgId(null)
        setEditingBgName('')
    }

    // Helper upload gambar
    const handleImageUpload = (
        file: File | undefined,
        maxMb: number,
        onError: (err: string | null) => void,
        onSuccess: (dataUrl: string) => void
    ) => {
        onError(null)
        if (!file) return

        if (!file.type.startsWith('image/')) {
            onError('Harap pilih berkas gambar (PNG, JPG, SVG, WebP).')
            return
        }

        if (file.size > maxMb * 1024 * 1024) {
            onError(`Ukuran berkas maksimal ${maxMb}MB.`)
            return
        }

        const reader = new FileReader()
        reader.onload = (event) => {
            const dataUrl = event.target?.result as string
            if (dataUrl) onSuccess(dataUrl)
        }
        reader.readAsDataURL(file)
    }

    return (
        <Card>
            <CardHeader
                title="Branding Kartu Share PnL"
                description="Kustomisasi nama brand, logo exchange, kode referral (MEXC & Bitunix), avatar, dan wallpaper kartu share."
            />

            <div className="flex flex-col gap-6 p-4">
                {/* ── BAGIAN 1: BRAND TITLE & SUBTITLE ── */}
                <div>
                    <p className="text-xs font-semibold text-foreground uppercase tracking-wider mb-2">
                        1. Kustomisasi Judul Brand
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Field label="Nama Brand Utama" hint="Contoh: NITIREKSO, CRYPTO JOURNAL, VIP TRADER">
                            <input
                                type="text"
                                value={settings.brandTitle}
                                onChange={(e) => updateSettings({ brandTitle: e.target.value.toUpperCase() })}
                                placeholder="NITIREKSO"
                                className="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm font-bold tracking-wider shadow-xs focus:border-primary focus:outline-none"
                            />
                        </Field>

                        <Field label="Sub-label Badge Brand" hint="Contoh: JOURNAL, PRO, FUTURES, ALPHA">
                            <input
                                type="text"
                                value={settings.brandSubtitle}
                                onChange={(e) => updateSettings({ brandSubtitle: e.target.value.toUpperCase() })}
                                placeholder="JOURNAL"
                                className="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm font-semibold tracking-wide shadow-xs focus:border-primary focus:outline-none"
                            />
                        </Field>
                    </div>
                </div>

                {/* ── BAGIAN 2: LOGO EXCHANGE & KODE REFERRAL (MEXC & BITUNIX) ── */}
                <div className="pt-2 border-t border-border/50">
                    <div className="flex items-center justify-between mb-2">
                        <div>
                            <p className="text-xs font-semibold text-foreground uppercase tracking-wider">
                                2. Exchange & Kode Referral
                            </p>
                            <p className="text-[11px] text-muted-foreground">
                                Upload logo khusus dan masukkan kode referral untuk masing-masing exchange.
                            </p>
                        </div>

                        {/* Toggle Global Referral */}
                        <label className="flex items-center gap-1.5 cursor-pointer text-xs select-none">
                            <input
                                type="checkbox"
                                checked={settings.showReferral}
                                onChange={(e) => updateSettings({ showReferral: e.target.checked })}
                                className="h-3.5 w-3.5 rounded border-border text-primary accent-primary"
                            />
                            <span className="font-medium text-foreground">Tampilkan Kode Reff di Kartu</span>
                        </label>
                    </div>

                    {/* Tabs Exchange: MEXC & Bitunix */}
                    <div className="flex gap-2 mb-3">
                        {(['mexc', 'bitunix'] as const).map((ex) => (
                            <button
                                key={ex}
                                type="button"
                                onClick={() => setActiveExchangeTab(ex)}
                                className={`px-4 py-1.5 rounded-lg text-xs font-bold uppercase transition-all ${activeExchangeTab === ex
                                    ? 'bg-primary text-primary-foreground shadow-xs'
                                    : 'bg-muted/40 text-muted-foreground hover:text-foreground'
                                    }`}
                            >
                                {ex}
                            </button>
                        ))}
                    </div>

                    {/* Form Konfigurasi Exchange Aktif */}
                    <div className="rounded-xl border border-border/70 bg-card/40 p-4">
                        {activeExchangeTab === 'mexc' ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <Field label="Logo MEXC" hint="PNG transparan disarankan (opsional)">
                                    <div className="flex items-center gap-3 mt-1">
                                        <input
                                            ref={mexcLogoInputRef}
                                            type="file"
                                            accept="image/*"
                                            onChange={(e) =>
                                                handleImageUpload(
                                                    e.target.files?.[0],
                                                    4,
                                                    setMexcLogoError,
                                                    (dataUrl) => updateSettings({ mexcLogoUrl: dataUrl })
                                                )
                                            }
                                            className="hidden"
                                        />

                                        {/* Preview Logo MEXC */}
                                        <div
                                            onClick={() => mexcLogoInputRef.current?.click()}
                                            title="Klik untuk upload logo MEXC"
                                            className="h-10 px-3 rounded-lg border border-border/80 flex items-center justify-center cursor-pointer bg-background/80 hover:opacity-85 transition-opacity"
                                        >
                                            {settings.mexcLogoUrl ? (
                                                <img src={settings.mexcLogoUrl} alt="MEXC Logo" className="h-6 max-w-[100px] object-contain" />
                                            ) : (
                                                <span className="text-xs font-bold text-foreground/80 tracking-wider">MEXC</span>
                                            )}
                                        </div>

                                        <div className="flex items-center gap-2">
                                            <button
                                                type="button"
                                                onClick={() => mexcLogoInputRef.current?.click()}
                                                className="rounded-md bg-primary/10 border border-primary/30 px-2.5 py-1 text-xs font-semibold text-primary hover:bg-primary/20 transition-colors"
                                            >
                                                {settings.mexcLogoUrl ? 'Ganti Logo' : 'Upload Logo MEXC'}
                                            </button>
                                            {settings.mexcLogoUrl && (
                                                <button
                                                    type="button"
                                                    onClick={() => updateSettings({ mexcLogoUrl: null })}
                                                    className="text-xs text-muted-foreground hover:text-destructive transition-colors"
                                                >
                                                    Reset ke Teks
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                    {mexcLogoError && <p className="text-[11px] text-destructive mt-1">{mexcLogoError}</p>}
                                </Field>

                                <Field label="Kode Referral MEXC" hint="Akan tampil di bawah logo exchange pada kartu">
                                    <input
                                        type="text"
                                        value={settings.mexcReferralCode}
                                        onChange={(e) => updateSettings({ mexcReferralCode: e.target.value.trim() })}
                                        placeholder="Contoh: MEXC888"
                                        className="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs focus:border-primary focus:outline-none"
                                    />
                                </Field>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <Field label="Logo Bitunix" hint="PNG transparan disarankan (opsional)">
                                    <div className="flex items-center gap-3 mt-1">
                                        <input
                                            ref={bitunixLogoInputRef}
                                            type="file"
                                            accept="image/*"
                                            onChange={(e) =>
                                                handleImageUpload(
                                                    e.target.files?.[0],
                                                    4,
                                                    setBitunixLogoError,
                                                    (dataUrl) => updateSettings({ bitunixLogoUrl: dataUrl })
                                                )
                                            }
                                            className="hidden"
                                        />

                                        {/* Preview Logo Bitunix */}
                                        <div
                                            onClick={() => bitunixLogoInputRef.current?.click()}
                                            title="Klik untuk upload logo Bitunix"
                                            className="h-10 px-3 rounded-lg border border-border/80 flex items-center justify-center cursor-pointer bg-background/80 hover:opacity-85 transition-opacity"
                                        >
                                            {settings.bitunixLogoUrl ? (
                                                <img src={settings.bitunixLogoUrl} alt="Bitunix Logo" className="h-6 max-w-[100px] object-contain" />
                                            ) : (
                                                <span className="text-xs font-bold text-foreground/80 tracking-wider">BITUNIX</span>
                                            )}
                                        </div>

                                        <div className="flex items-center gap-2">
                                            <button
                                                type="button"
                                                onClick={() => bitunixLogoInputRef.current?.click()}
                                                className="rounded-md bg-primary/10 border border-primary/30 px-2.5 py-1 text-xs font-semibold text-primary hover:bg-primary/20 transition-colors"
                                            >
                                                {settings.bitunixLogoUrl ? 'Ganti Logo' : 'Upload Logo Bitunix'}
                                            </button>
                                            {settings.bitunixLogoUrl && (
                                                <button
                                                    type="button"
                                                    onClick={() => updateSettings({ bitunixLogoUrl: null })}
                                                    className="text-xs text-muted-foreground hover:text-destructive transition-colors"
                                                >
                                                    Reset ke Teks
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                    {bitunixLogoError && <p className="text-[11px] text-destructive mt-1">{bitunixLogoError}</p>}
                                </Field>

                                <Field label="Kode Referral Bitunix" hint="Akan tampil di bawah logo exchange pada kartu">
                                    <input
                                        type="text"
                                        value={settings.bitunixReferralCode}
                                        onChange={(e) => updateSettings({ bitunixReferralCode: e.target.value.trim() })}
                                        placeholder="Contoh: BITUNIX100"
                                        className="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs focus:border-primary focus:outline-none"
                                    />
                                </Field>
                            </div>
                        )}
                    </div>
                </div>

                {/* ── BAGIAN 3: IDENTITAS TRADER ── */}
                <div className="pt-2 border-t border-border/50">
                    <p className="text-xs font-semibold text-foreground uppercase tracking-wider mb-2">
                        3. Profil & Identitas Trader
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Field label="Foto Avatar Trader" hint="PNG/JPG/WebP, tampil di footer kartu">
                            <div className="flex items-center gap-3 mt-1">
                                <input
                                    ref={avatarInputRef}
                                    type="file"
                                    accept="image/*"
                                    onChange={(e) =>
                                        handleImageUpload(
                                            e.target.files?.[0],
                                            5,
                                            setAvatarFileError,
                                            (dataUrl) => updateSettings({ avatarUrl: dataUrl })
                                        )
                                    }
                                    className="hidden"
                                />

                                <div
                                    onClick={() => avatarInputRef.current?.click()}
                                    title="Klik untuk upload foto avatar"
                                    className="w-13 h-13 rounded-full border-2 flex items-center justify-center cursor-pointer overflow-hidden bg-muted/40 hover:opacity-85 transition-all shadow-md flex-shrink-0"
                                    style={{ borderColor: currentTemplate.accentProfit }}
                                >
                                    {settings.avatarUrl ? (
                                        <img src={settings.avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                                    ) : (
                                        <span className="text-sm font-bold text-foreground/70">
                                            {(settings.traderHandle || '@trader').replace('@', '').slice(0, 2).toUpperCase() || 'TR'}
                                        </span>
                                    )}
                                </div>

                                <div className="flex flex-col gap-1">
                                    <div className="flex items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={() => avatarInputRef.current?.click()}
                                            className="rounded-md bg-primary/10 border border-primary/30 px-2.5 py-1 text-xs font-semibold text-primary hover:bg-primary/20 transition-colors"
                                        >
                                            {settings.avatarUrl ? 'Ganti Foto' : 'Upload Foto'}
                                        </button>
                                        {settings.avatarUrl && (
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    updateSettings({ avatarUrl: null })
                                                    if (avatarInputRef.current) avatarInputRef.current.value = ''
                                                }}
                                                className="text-xs text-muted-foreground hover:text-destructive transition-colors px-1 py-1"
                                            >
                                                Hapus
                                            </button>
                                        )}
                                    </div>
                                    {avatarFileError && <p className="text-[11px] text-destructive">{avatarFileError}</p>}
                                </div>
                            </div>
                        </Field>

                        <Field label="Handle / Nama Trader" hint="Ditampilkan di footer kartu share">
                            <input
                                type="text"
                                value={settings.traderHandle || ''}
                                onChange={(e) => updateSettings({ traderHandle: e.target.value })}
                                placeholder="@username"
                                className="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs focus:border-primary focus:outline-none"
                            />
                        </Field>
                    </div>
                </div>

                {/* ── BAGIAN 4: LATAR BELAKANG KARTU & GALERI WALLPAPER ── */}
                <div className="flex flex-col gap-4 pt-2 border-t border-border/50">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                        <div>
                            <p className="text-xs font-semibold text-foreground uppercase tracking-wider">
                                4. Tema Preset & Galeri Wallpaper Kustom
                            </p>
                            <p className="text-[11px] text-muted-foreground">
                                Pilih preset warna atau unggah wallpaper Anda sendiri. Setiap gambar dapat ditautkan ke template desain.
                            </p>
                        </div>

                        {settings.isCustomBg && settings.customBgUrl && (
                            <div className="flex items-center gap-2 bg-muted/40 px-2.5 py-1 rounded-md">
                                <span className="text-[11px] font-medium text-foreground">
                                    Dimming Overlay: {settings.bgDimming}%
                                </span>
                                <input
                                    type="range"
                                    min="30"
                                    max="95"
                                    value={settings.bgDimming}
                                    onChange={(e) => updateSettings({ bgDimming: Number(e.target.value) })}
                                    className="w-20 h-1.5 accent-primary cursor-pointer"
                                />
                            </div>
                        )}
                    </div>

                    {/* Sub-bagian 4.1: Preset Bawaan */}
                    <div>
                        <p className="text-[11px] font-semibold text-muted-foreground mb-2">Preset Warna Bawaan:</p>
                        <div className="flex flex-wrap items-center gap-2">
                            {BG_TEMPLATES.map((t) => (
                                <button
                                    key={t.id}
                                    type="button"
                                    onClick={() => updateSettings({ bgPresetId: t.id, isCustomBg: false })}
                                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${!settings.isCustomBg && settings.bgPresetId === t.id
                                        ? 'border-primary bg-primary/15 text-foreground font-semibold shadow-xs ring-1 ring-primary/40'
                                        : 'border-border/70 bg-card text-muted-foreground hover:text-foreground'
                                        }`}
                                >
                                    <span
                                        className="w-3.5 h-3.5 rounded-full flex-shrink-0"
                                        style={{
                                            background: t.isTransparent
                                                ? 'linear-gradient(45deg, #38bdf8 0%, #a855f7 100%)'
                                                : t.accentProfit,
                                            boxShadow: (!settings.isCustomBg && settings.bgPresetId === t.id)
                                                ? `0 0 8px ${t.accentProfit}`
                                                : 'none'
                                        }}
                                    />
                                    <span>{t.label}</span>
                                    {t.isTransparent && (
                                        <span className="text-[9px] px-1 py-0.2 rounded bg-sky-500/20 text-sky-400 font-bold ml-0.5">
                                            PNG Transparan
                                        </span>
                                    )}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Sub-bagian 4.2: Galeri Wallpaper Kustom */}
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <p className="text-[11px] font-semibold text-muted-foreground">
                                Galeri Wallpaper Kustom Anda ({customBgList.length}):
                            </p>

                            {/* Tombol Upload BG Baru */}
                            <input
                                ref={bgInputRef}
                                type="file"
                                accept="image/*"
                                onChange={(e) => {
                                    const file = e.target.files?.[0]
                                    handleImageUpload(
                                        file,
                                        8,
                                        setBgFileError,
                                        (dataUrl) => handleAddCustomBg(dataUrl, file?.name)
                                    )
                                    if (bgInputRef.current) bgInputRef.current.value = ''
                                }}
                                className="hidden"
                            />
                            <button
                                type="button"
                                onClick={() => bgInputRef.current?.click()}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-dashed border-primary/50 bg-primary/10 text-primary hover:bg-primary/20 transition-all shadow-xs"
                            >
                                <svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
                                    <rect x="3" y="3" width="14" height="14" rx="2" />
                                    <circle cx="7.5" cy="7.5" r="1.5" />
                                    <path d="M3 14l4-4 3 3 4-4 3 3" />
                                </svg>
                                <span>+ Upload Wallpaper Baru</span>
                            </button>
                        </div>

                        {customBgList.length === 0 ? (
                            <div className="p-4 rounded-xl border border-dashed border-border text-center bg-card/20">
                                <p className="text-xs text-muted-foreground">Belum ada wallpaper kustom yang diunggah.</p>
                                <p className="text-[11px] text-muted-foreground mt-1">Unggah gambar wallpaper favorit Anda untuk ditautkan ke kartu share.</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                                {customBgList.map((bgItem) => {
                                    const isSelected = settings.isCustomBg && settings.customBgId === bgItem.id
                                    const isEditing = editingBgId === bgItem.id

                                    return (
                                        <div
                                            key={bgItem.id}
                                            className={`relative flex flex-col rounded-xl border overflow-hidden transition-all ${
                                                isSelected
                                                    ? 'border-primary ring-2 ring-primary/40 bg-card shadow-sm'
                                                    : 'border-border/70 bg-card/50 hover:border-border'
                                            }`}
                                        >
                                            {/* Thumbnail Image */}
                                            <div
                                                onClick={() => updateSettings({
                                                    isCustomBg: true,
                                                    customBgId: bgItem.id,
                                                    customBgUrl: bgItem.dataUrl
                                                })}
                                                className="h-24 w-full bg-cover bg-center cursor-pointer relative group"
                                                style={{ backgroundImage: `url(${bgItem.dataUrl})` }}
                                            >
                                                <div className="absolute inset-0 bg-black/20 group-hover:bg-black/10 transition-colors" />
                                                {isSelected && (
                                                    <span className="absolute top-2 right-2 px-2 py-0.5 rounded-md bg-primary text-primary-foreground text-[10px] font-bold shadow-xs">
                                                        Aktif
                                                    </span>
                                                )}
                                            </div>

                                            {/* Info & Aksi */}
                                            <div className="p-2.5 flex items-center justify-between gap-2">
                                                {isEditing ? (
                                                    <div className="flex items-center gap-1 flex-1">
                                                        <input
                                                            type="text"
                                                            value={editingBgName}
                                                            onChange={(e) => setEditingBgName(e.target.value)}
                                                            className="h-6 px-1.5 text-xs w-full rounded bg-background border border-border focus:border-primary focus:outline-none"
                                                            autoFocus
                                                            onKeyDown={(e) => {
                                                                if (e.key === 'Enter') handleSaveBgName(bgItem.id)
                                                                if (e.key === 'Escape') setEditingBgId(null)
                                                            }}
                                                        />
                                                        <button
                                                            type="button"
                                                            onClick={() => handleSaveBgName(bgItem.id)}
                                                            className="text-[10px] px-1.5 py-1 bg-primary text-primary-foreground rounded font-bold"
                                                        >
                                                            OK
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <div className="flex flex-col min-w-0 flex-1">
                                                        <span
                                                            onClick={() => {
                                                                setEditingBgId(bgItem.id)
                                                                setEditingBgName(bgItem.name)
                                                            }}
                                                            title="Klik untuk ganti nama"
                                                            className="text-xs font-semibold text-foreground truncate cursor-pointer hover:underline"
                                                        >
                                                            {bgItem.name} ✎
                                                        </span>
                                                    </div>
                                                )}

                                                <div className="flex items-center gap-1">
                                                    {!isSelected && (
                                                        <button
                                                            type="button"
                                                            onClick={() => updateSettings({
                                                                isCustomBg: true,
                                                                customBgId: bgItem.id,
                                                                customBgUrl: bgItem.dataUrl
                                                            })}
                                                            className="px-2 py-1 text-[10px] font-semibold rounded bg-muted hover:bg-muted/80 text-foreground transition-colors"
                                                        >
                                                            Pilih
                                                        </button>
                                                    )}
                                                    <button
                                                        type="button"
                                                        onClick={() => handleDeleteCustomBg(bgItem.id, bgItem.name)}
                                                        className="p-1 text-muted-foreground hover:text-destructive transition-colors rounded hover:bg-destructive/10"
                                                        title="Hapus background ini"
                                                    >
                                                        <svg viewBox="0 0 20 20" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2">
                                                            <path d="M4 6h12M8 6V4h4v2m-6 4v6m4-6v6m3-10v11a1 1 0 01-1 1H6a1 1 0 01-1-1V6" />
                                                        </svg>
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                    </div>
                    {bgFileError && <p className="text-[11px] text-destructive">{bgFileError}</p>}
                </div>

                {/* ── BAGIAN 5: PREFERENSI KONTEN KARTU SHARE ── */}
                <div className="flex flex-col gap-3 pt-2 border-t border-border/50">
                    <p className="text-xs font-semibold text-foreground uppercase tracking-wider">
                        5. Preferensi Konten Kartu Share
                    </p>

                    <label className="flex items-start gap-2.5 cursor-pointer select-none">
                        <input
                            type="checkbox"
                            checked={settings.showTradeTimes}
                            onChange={(e) => updateSettings({ showTradeTimes: e.target.checked })}
                            className="mt-0.5 h-4 w-4 rounded border-border text-primary accent-primary"
                        />
                        <div>
                            <span className="text-xs font-semibold text-foreground">
                                Catat Waktu Entry & Exit
                            </span>
                            <p className="text-[11px] text-muted-foreground mt-0.5">
                                Menampilkan tanggal dan jam eksekusi posisi masuk dan posisi keluar tepat di bawah angka harga.
                            </p>
                        </div>
                    </label>

                    <label className="flex items-start gap-2.5 cursor-pointer select-none">
                        <input
                            type="checkbox"
                            checked={settings.showFullText}
                            onChange={(e) => updateSettings({ showFullText: e.target.checked })}
                            className="mt-0.5 h-4 w-4 rounded border-border text-primary accent-primary"
                        />
                        <div>
                            <span className="text-xs font-semibold text-foreground">
                                Tampilkan Semua Thesis & Review (Tanpa Terpotong)
                            </span>
                            <p className="text-[11px] text-muted-foreground mt-0.5">
                                Seluruh kalimat jurnal ditampilkan utuh tanpa terpotong elipsis. Ukuran kartu otomatis memanjang menyesuaikan teks Anda.
                            </p>
                        </div>
                    </label>
                </div>

                {/* ── BAGIAN 6: KELOLA TEMPLATE KARTU SHARE ── */}
                <div className="flex flex-col gap-3 pt-2 border-t border-border/50">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-xs font-semibold text-foreground uppercase tracking-wider">
                                6. Template Desain Tersimpan ({templates.length})
                            </p>
                            <p className="text-[11px] text-muted-foreground">
                                Anda dapat menyimpan template desain tak terbatas langsung dari jendela modal Share PnL atau mengelolanya di sini.
                            </p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mt-1">
                        {templates.map((tpl) => {
                            const isDefault = activeTemplateId === tpl.id
                            return (
                                <div
                                    key={tpl.id}
                                    className={`flex items-center justify-between p-3 rounded-xl border transition-all ${
                                        isDefault
                                            ? 'border-primary bg-primary/10 shadow-xs'
                                            : 'border-border/70 bg-card/60 hover:border-border'
                                    }`}
                                >
                                    <div className="flex flex-col min-w-0 pr-2">
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                            <span className="text-xs font-bold text-foreground truncate">
                                                {tpl.name}
                                            </span>
                                            {tpl.isBuiltin && (
                                                <span className="text-[9px] px-1.5 py-0.2 rounded bg-muted text-muted-foreground font-semibold">
                                                    Preset
                                                </span>
                                            )}
                                            {isDefault && (
                                                <span className="text-[9px] px-1.5 py-0.2 rounded bg-primary/20 text-primary font-bold">
                                                    Default Aktif
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-2 mt-1 text-[10px] text-muted-foreground">
                                            <span>{tpl.showPnl ? 'USD Ditampilkan' : 'USD Tersembunyi'}</span>
                                            <span>•</span>
                                            <span>{tpl.showTradeTimes ? 'Ada Waktu' : 'Tanpa Waktu'}</span>
                                            <span>•</span>
                                            <span>{tpl.bgPresetId}</span>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-1 flex-shrink-0">
                                        {!isDefault && (
                                            <button
                                                type="button"
                                                onClick={() => handleSetDefaultTemplate(tpl.id)}
                                                className="px-2 py-1 text-[11px] font-semibold rounded bg-muted/60 hover:bg-muted text-foreground transition-colors"
                                                title="Gunakan sebagai default saat membuka modal Share PnL"
                                            >
                                                Pilih
                                            </button>
                                        )}
                                        {!tpl.isBuiltin && (
                                            <button
                                                type="button"
                                                onClick={() => handleDeleteTemplate(tpl.id, tpl.name)}
                                                className="p-1 text-muted-foreground hover:text-destructive transition-colors rounded hover:bg-destructive/10"
                                                title="Hapus template kustom ini"
                                            >
                                                <svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
                                                    <path d="M4 6h12M8 6V4h4v2m-6 4v6m4-6v6m3-10v11a1 1 0 01-1 1H6a1 1 0 01-1-1V6" />
                                                </svg>
                                            </button>
                                        )}
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </div>

                {/* ── PRATINJAU MINI LIVE PREVIEW ── */}
                <div className="pt-2 border-t border-border/50">
                    <p className="text-[11px] font-semibold text-muted-foreground mb-2">
                        Pratinjau Hasil Desain ({activeExchangeTab.toUpperCase()}):
                    </p>
                    <div
                        className="relative overflow-hidden rounded-xl p-4 border transition-all"
                        style={{
                            background: settings.isCustomBg && settings.customBgUrl
                                ? `linear-gradient(rgba(0,0,0,${settings.bgDimming / 100}), rgba(0,0,0,${settings.bgDimming / 100})), url(${settings.customBgUrl}) center / cover`
                                : currentTemplate.bg,
                            borderColor: currentTemplate.border,
                        }}
                    >
                        <div className="flex items-start justify-between mb-3">
                            <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-white tracking-wider">
                                    {settings.brandTitle || 'NITIREKSO'}
                                </span>
                                <span
                                    className="text-[9px] font-bold px-1.5 py-0.5 rounded text-white"
                                    style={{ background: currentTemplate.accentProfit }}
                                >
                                    {settings.brandSubtitle || 'JOURNAL'}
                                </span>
                            </div>

                            {/* Exchange Logo & Referral Badge Preview */}
                            <div className="flex flex-col items-end gap-1">
                                {activeExchangeTab === 'mexc' ? (
                                    settings.mexcLogoUrl ? (
                                        <img src={settings.mexcLogoUrl} alt="MEXC" className="h-5 max-w-[80px] object-contain" />
                                    ) : (
                                        <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-white/10 text-white border border-white/20">
                                            MEXC
                                        </span>
                                    )
                                ) : (
                                    settings.bitunixLogoUrl ? (
                                        <img src={settings.bitunixLogoUrl} alt="Bitunix" className="h-5 max-w-[80px] object-contain" />
                                    ) : (
                                        <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-white/10 text-white border border-white/20">
                                            BITUNIX
                                        </span>
                                    )
                                )}

                                {settings.showReferral && (
                                    <span className="text-[9px] font-semibold text-sky-400 bg-sky-500/15 border border-sky-500/30 px-1.5 py-0.2 rounded">
                                        Ref: {activeExchangeTab === 'mexc' ? (settings.mexcReferralCode || '—') : (settings.bitunixReferralCode || '—')}
                                    </span>
                                )}
                            </div>
                        </div>

                        <div className="text-2xl font-extrabold tracking-tight" style={{ color: currentTemplate.accentProfit }}>
                            +124.50%
                        </div>

                        <div className="flex items-center justify-between mt-3 pt-2 border-t border-white/10">
                            <div className="flex items-center gap-2">
                                {settings.avatarUrl ? (
                                    <img
                                        src={settings.avatarUrl}
                                        alt="Avatar"
                                        className="w-6 h-6 rounded-full object-cover"
                                        style={{ border: `1.5px solid ${currentTemplate.accentProfit}` }}
                                    />
                                ) : (
                                    <div
                                        className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold text-white"
                                        style={{ background: `${currentTemplate.accentProfit}44` }}
                                    >
                                        {(settings.traderHandle || '@trader').replace('@', '').slice(0, 2).toUpperCase() || 'TR'}
                                    </div>
                                )}
                                <span className="text-xs font-semibold text-white">{settings.traderHandle || '@trader'}</span>
                            </div>
                            <span className="text-[10px] text-white/50">nitirekso</span>
                        </div>
                    </div>
                </div>
            </div>
        </Card>
    )
}
