import { useRef, useState } from 'react'
import { Card, CardHeader, Field, Button } from './ui'
import {
    BG_TEMPLATES,
    EXCHANGES,
    loadShareSettings,
    saveShareSettings,
    loadCustomBgList,
    addCustomBgItem,
    updateCustomBgItem,
    deleteCustomBgItem,
    getAllShareTemplates,
    updateCustomShareTemplate,
    deleteCustomShareTemplate,
    getActiveTemplateId,
    setActiveTemplateId,
    getAllBgTemplates,
    saveCustomShareColorScheme,
    updateCustomShareColorScheme,
    deleteCustomShareColorScheme,
    resolveMediaType,
    type ShareSettings,
    type ExchangeName,
    type ShareCardTemplate,
    type CustomBgItem,
    type BgDimmingDirection,
    type BgTemplate
} from '../lib/shareSettings'
import { getExchangeDefaultLogo, getExchangeDisplayName } from '../lib/exchangeAssets'
import { getGradientDimmingStyle } from './SharePnlModal'

export function ShareBrandingSettings(): React.JSX.Element {
    const [settings, setSettings] = useState<ShareSettings>(loadShareSettings)
    const [customBgList, setCustomBgList] = useState<CustomBgItem[]>(loadCustomBgList)
    const [colorSchemes, setColorSchemes] = useState<BgTemplate[]>(getAllBgTemplates)
    const [isCreatingScheme, setIsCreatingScheme] = useState(false)
    const [editingSchemeId, setEditingSchemeId] = useState<string | null>(null)
    const [newSchemeName, setNewSchemeName] = useState('')
    const [newBgStart, setNewBgStart] = useState('#0f172a')
    const [newBgEnd, setNewBgEnd] = useState('#020617')
    const [newAccentProfit, setNewAccentProfit] = useState('#10b981')
    const [newAccentLoss, setNewAccentLoss] = useState('#f43f5e')
    const [newBorder, setNewBorder] = useState('rgba(16, 185, 129, 0.3)')
    const [schemeFeedback, setSchemeFeedback] = useState<string | null>(null)
    const [schemeFormError, setSchemeFormError] = useState<string | null>(null)

    // Inline Confirmation States (Mencegah Window Freeze di Electron)
    const [confirmDeleteSchemeId, setConfirmDeleteSchemeId] = useState<string | null>(null)
    const [confirmDeleteBgId, setConfirmDeleteBgId] = useState<string | null>(null)
    const [confirmDeleteTplId, setConfirmDeleteTplId] = useState<string | null>(null)

    // Modal/Panel Edit Wallpaper Kustom Detail
    const [editingBgItem, setEditingBgItem] = useState<CustomBgItem | null>(null)
    const [editingBgName, setEditingBgName] = useState<string>('')
    const [editingBgPosX, setEditingBgPosX] = useState<number>(50)
    const [editingBgPosY, setEditingBgPosY] = useState<number>(50)

    // Edit Template Kustom Name
    const [editingTplId, setEditingTplId] = useState<string | null>(null)
    const [editingTplName, setEditingTplName] = useState<string>('')

    const [templates, setTemplates] = useState<ShareCardTemplate[]>(getAllShareTemplates)
    const [activeTemplateId, setActiveTemplateIdState] = useState<string>(getActiveTemplateId)
    const [activeExchangeTab, setActiveExchangeTab] = useState<ExchangeName>('mexc')
    const [avatarFileError, setAvatarFileError] = useState<string | null>(null)
    const [bgFileError, setBgFileError] = useState<string | null>(null)
    const [exchangeLogoError, setExchangeLogoError] = useState<string | null>(null)

    const avatarInputRef = useRef<HTMLInputElement>(null)
    const bgInputRef = useRef<HTMLInputElement>(null)
    const exchangeLogoInputRef = useRef<HTMLInputElement>(null)

    const currentTemplate = colorSchemes.find((t) => t.id === settings.bgPresetId) || colorSchemes[0]!

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

    const handleDeleteTemplate = (templateId: string) => {
        deleteCustomShareTemplate(templateId)
        setTemplates(getAllShareTemplates())
        setActiveTemplateIdState(getActiveTemplateId())
        setConfirmDeleteTplId(null)
    }

    const handleSaveTplName = (templateId: string) => {
        if (!editingTplName.trim()) return
        updateCustomShareTemplate(templateId, { name: editingTplName.trim() })
        setTemplates(getAllShareTemplates())
        setEditingTplId(null)
        setEditingTplName('')
    }

    const handleStartEditColorScheme = (t: BgTemplate) => {
        setEditingSchemeId(t.id)
        setNewSchemeName(t.label)
        setNewBgStart(t.bgStart || '#0f172a')
        setNewBgEnd(t.bgEnd || '#020617')
        setNewAccentProfit(t.accentProfit)
        setNewAccentLoss(t.accentLoss)
        setNewBorder(t.border || `${t.accentProfit}44`)
        setSchemeFormError(null)
        setIsCreatingScheme(true)
    }

    const handleCancelSchemeForm = () => {
        setIsCreatingScheme(false)
        setEditingSchemeId(null)
        setNewSchemeName('')
        setSchemeFormError(null)
    }

    const handleSaveColorScheme = (e: React.FormEvent) => {
        e.preventDefault()
        if (!newSchemeName.trim()) {
            setSchemeFormError('Harap masukkan nama skema warna kartu.')
            return
        }
        setSchemeFormError(null)

        if (editingSchemeId) {
            updateCustomShareColorScheme(editingSchemeId, {
                label: newSchemeName.trim(),
                bgStart: newBgStart,
                bgEnd: newBgEnd,
                accentProfit: newAccentProfit,
                accentLoss: newAccentLoss,
                border: newBorder
            })
            const updated = getAllBgTemplates()
            setColorSchemes(updated)
            setSchemeFeedback(`Skema "${newSchemeName.trim()}" berhasil diperbarui!`)
        } else {
            const created = saveCustomShareColorScheme({
                label: newSchemeName.trim(),
                bgStart: newBgStart,
                bgEnd: newBgEnd,
                accentProfit: newAccentProfit,
                accentLoss: newAccentLoss,
                border: newBorder
            })

            const updated = getAllBgTemplates()
            setColorSchemes(updated)
            updateSettings({ bgPresetId: created.id, isCustomBg: false })
            setSchemeFeedback(`Skema "${created.label}" berhasil disimpan dan diterapkan!`)
        }

        setNewSchemeName('')
        setEditingSchemeId(null)
        setIsCreatingScheme(false)
        setTimeout(() => setSchemeFeedback(null), 3000)
    }

    const handleDeleteColorScheme = (id: string) => {
        deleteCustomShareColorScheme(id)
        const updated = getAllBgTemplates()
        setColorSchemes(updated)
        if (settings.bgPresetId === id) {
            updateSettings({ bgPresetId: BG_TEMPLATES[0]!.id })
        }
        setConfirmDeleteSchemeId(null)
        setSchemeFeedback('Skema warna berhasil dihapus.')
        setTimeout(() => setSchemeFeedback(null), 3000)
    }

    const handleAddCustomBg = (dataUrl: string, fileName?: string, mediaType: 'image' | 'video' = 'image') => {
        const cleanName = fileName ? fileName.replace(/\.[^/.]+$/, '').slice(0, 18) : `${mediaType === 'video' ? 'Video' : 'Wallpaper'} ${customBgList.length + 1}`
        const created = addCustomBgItem({ name: cleanName, dataUrl, mediaType })
        const updated = loadCustomBgList()
        setCustomBgList(updated)
        updateSettings({
            isCustomBg: true,
            customBgId: created.id,
            customBgUrl: created.dataUrl,
            customBgMediaType: mediaType
        })
    }

    const handleDeleteCustomBg = (id: string) => {
        deleteCustomBgItem(id)
        const updated = loadCustomBgList()
        setCustomBgList(updated)
        if (settings.customBgId === id) {
            if (updated.length > 0) {
                updateSettings({
                    customBgId: updated[0]!.id,
                    customBgUrl: updated[0]!.dataUrl,
                    customBgMediaType: resolveMediaType(updated[0]!.mediaType, updated[0]!.dataUrl, 'image')
                })
            } else {
                updateSettings({ isCustomBg: false, customBgId: null, customBgUrl: null })
            }
        }
        setConfirmDeleteBgId(null)
    }

    const handleOpenEditBg = (bgItem: CustomBgItem) => {
        setEditingBgItem(bgItem)
        setEditingBgName(bgItem.name)
        setEditingBgPosX(bgItem.posX ?? 50)
        setEditingBgPosY(bgItem.posY ?? 50)
    }

    const handleSaveEditedBg = () => {
        if (!editingBgItem) return
        updateCustomBgItem(editingBgItem.id, {
            name: editingBgName.trim() || editingBgItem.name,
            posX: editingBgPosX,
            posY: editingBgPosY
        })
        const updated = loadCustomBgList()
        setCustomBgList(updated)
        if (settings.customBgId === editingBgItem.id) {
            updateSettings({ bgPosX: editingBgPosX, bgPosY: editingBgPosY })
        }
        setEditingBgItem(null)
    }

    // Helper upload gambar atau video
    const handleMediaUpload = (
        file: File | undefined,
        maxMb: number,
        onError: (err: string | null) => void,
        onSuccess: (dataUrl: string, isVideo: boolean) => void
    ) => {
        onError(null)
        if (!file) return

        const isImage = file.type.startsWith('image/')
        const isVideo = file.type.startsWith('video/')

        if (!isImage && !isVideo) {
            onError('Harap pilih berkas gambar (PNG, JPG, SVG, WebP) atau video (MP4, WebM).')
            return
        }

        if (file.size > maxMb * 1024 * 1024) {
            onError(`Ukuran berkas maksimal ${maxMb}MB.`)
            return
        }

        const reader = new FileReader()
        reader.onload = (event) => {
            const dataUrl = event.target?.result as string
            if (dataUrl) onSuccess(dataUrl, isVideo)
        }
        reader.readAsDataURL(file)
    }

    // Khusus logo & avatar hanya gambar
    const handleImageUpload = (
        file: File | undefined,
        maxMb: number,
        onError: (err: string | null) => void,
        onSuccess: (dataUrl: string) => void
    ) => {
        handleMediaUpload(file, maxMb, onError, (dataUrl, isVideo) => {
            if (isVideo) {
                onError('Avatar dan logo harus berupa file gambar.')
                return
            }
            onSuccess(dataUrl)
        })
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

                    {/* Tabs Exchange (5 Exchange Didukung) */}
                    <div className="flex gap-2 mb-3 flex-wrap">
                        {EXCHANGES.map((ex) => (
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
                        {(() => {
                            const ex = activeExchangeTab
                            const customLogoKey = `${ex}LogoUrl` as keyof ShareSettings
                            const refCodeKey = `${ex}ReferralCode` as keyof ShareSettings
                            const customLogo = settings[customLogoKey] as string | null
                            const defaultLogo = getExchangeDefaultLogo(ex)
                            const displayLogo = customLogo || defaultLogo
                            const refValue = (settings[refCodeKey] as string) || ''

                            return (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <Field
                                        label={`Logo ${getExchangeDisplayName(ex)}`}
                                        hint={customLogo ? 'Menggunakan logo kustom' : 'Menggunakan logo resmi bawaan aplikasi (otomatis)'}
                                    >
                                        <div className="flex items-center gap-3 mt-1">
                                            <input
                                                ref={exchangeLogoInputRef}
                                                type="file"
                                                accept="image/*"
                                                onChange={(e) =>
                                                    handleImageUpload(
                                                        e.target.files?.[0],
                                                        4,
                                                        setExchangeLogoError,
                                                        (dataUrl) => updateSettings({ [customLogoKey]: dataUrl })
                                                    )
                                                }
                                                className="hidden"
                                            />

                                            {/* Preview Logo Exchange */}
                                            <div
                                                onClick={() => exchangeLogoInputRef.current?.click()}
                                                title="Klik untuk upload logo kustom pengganti"
                                                className="h-10 px-3 rounded-lg border border-border/80 flex items-center justify-center cursor-pointer bg-background/80 hover:opacity-85 transition-opacity"
                                            >
                                                {displayLogo ? (
                                                    <img src={displayLogo} alt={`${ex} Logo`} className="h-6 max-w-[110px] object-contain" />
                                                ) : (
                                                    <span className="text-xs font-bold text-foreground/80 tracking-wider uppercase">{ex}</span>
                                                )}
                                            </div>

                                            <div className="flex items-center gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => exchangeLogoInputRef.current?.click()}
                                                    className="rounded-md bg-primary/10 border border-primary/30 px-2.5 py-1 text-xs font-semibold text-primary hover:bg-primary/20 transition-colors"
                                                >
                                                    {customLogo ? 'Ganti Logo Kustom' : 'Upload Kustom (Opsional)'}
                                                </button>
                                                {customLogo && (
                                                    <button
                                                        type="button"
                                                        onClick={() => updateSettings({ [customLogoKey]: null })}
                                                        className="text-xs text-muted-foreground hover:text-destructive transition-colors"
                                                    >
                                                        Kembalikan ke Logo Bawaan
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                        {exchangeLogoError && <p className="text-[11px] text-destructive mt-1">{exchangeLogoError}</p>}
                                    </Field>

                                    <Field
                                        label={`Kode Referral ${getExchangeDisplayName(ex)}`}
                                        hint="Cukup isi kode referral Anda di sini, logo exchange sudah otomatis disiapkan"
                                    >
                                        <input
                                            type="text"
                                            value={refValue}
                                            onChange={(e) => updateSettings({ [refCodeKey]: e.target.value.trim() })}
                                            placeholder={`Contoh: ${ex.toUpperCase()}VIP88`}
                                            className="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm font-medium shadow-xs focus:border-primary focus:outline-none"
                                        />
                                    </Field>
                                </div>
                            )
                        })()}
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
                            <div className="flex flex-wrap items-center gap-3 bg-muted/40 p-2.5 rounded-lg border border-border/50">
                                <div className="flex items-center gap-2">
                                    <span className="text-[11px] font-medium text-foreground whitespace-nowrap">
                                        Dimming: {settings.bgDimming}%
                                    </span>
                                    <input
                                        type="range"
                                        min="20"
                                        max="95"
                                        value={settings.bgDimming}
                                        onChange={(e) => updateSettings({ bgDimming: Number(e.target.value) })}
                                        className="w-20 h-1.5 accent-primary cursor-pointer"
                                    />
                                </div>
                                <div className="flex items-center gap-1.5">
                                    <span className="text-[11px] font-medium text-muted-foreground whitespace-nowrap">
                                        Arah Gradien:
                                    </span>
                                    <select
                                        value={settings.bgDimmingDirection || 'uniform'}
                                        onChange={(e) => updateSettings({ bgDimmingDirection: e.target.value as BgDimmingDirection })}
                                        className="h-7 text-xs rounded bg-background border border-border px-2 text-foreground focus:border-primary focus:outline-none"
                                    >
                                        <option value="uniform">Merata (Uniform)</option>
                                        <option value="top-right">Terang Kanan Atas (Gaya Exchange ⚡)</option>
                                        <option value="top-left">Terang Kiri Atas</option>
                                        <option value="bottom-right">Terang Kanan Bawah</option>
                                        <option value="bottom-left">Terang Kiri Bawah</option>
                                        <option value="left">Terang Sisi Kiri</option>
                                        <option value="right">Terang Sisi Kanan</option>
                                    </select>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Sub-bagian 4.1: Skema Warna Kartu Share (Bawaan + Kustom) */}
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <div>
                                <p className="text-[11px] font-semibold text-muted-foreground">
                                    Skema Warna Kartu Share ({colorSchemes.length}):
                                </p>
                                <p className="text-[10px] text-muted-foreground">
                                    Pilih kombinasi warna background dan aksen profit/loss, atau buat skema warna unik Anda sendiri.
                                </p>
                            </div>
                            <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                    if (isCreatingScheme) {
                                        handleCancelSchemeForm()
                                    } else {
                                        setEditingSchemeId(null)
                                        setNewSchemeName('')
                                        setIsCreatingScheme(true)
                                    }
                                }}
                                className="text-xs font-semibold text-primary hover:bg-primary/10"
                            >
                                {isCreatingScheme ? 'Tutup Form' : '+ Buat Skema Baru'}
                            </Button>
                        </div>

                        {schemeFeedback && (
                            <div className="mb-2.5 px-3 py-1.5 rounded-lg bg-profit/15 text-profit border border-profit/30 text-xs font-medium">
                                ✓ {schemeFeedback}
                            </div>
                        )}

                        {/* Form Buat / Edit Skema Warna Kartu */}
                        {isCreatingScheme && (
                            <form
                                onSubmit={handleSaveColorScheme}
                                className="mb-3 p-3.5 rounded-xl bg-card border border-primary/40 shadow-sm flex flex-col gap-3"
                            >
                                <div className="flex items-center justify-between">
                                    <p className="text-xs font-bold text-primary uppercase tracking-wider">
                                        {editingSchemeId ? '✏️ Edit Skema Warna Kartu Kustom' : '🎨 Buat Skema Warna Kartu Share Baru'}
                                    </p>
                                    {editingSchemeId && (
                                        <span className="text-[10px] text-muted-foreground">Mode Edit Aktif</span>
                                    )}
                                </div>

                                {schemeFormError && (
                                    <div className="px-3 py-1.5 rounded-lg bg-destructive/15 text-destructive border border-destructive/30 text-xs font-medium">
                                        ⚠ {schemeFormError}
                                    </div>
                                )}

                                <Field label="Nama Skema Warna" hint="Contoh: Gold Binance, Tokyo Vaporwave, Pure Midnight">
                                    <input
                                        type="text"
                                        value={newSchemeName}
                                        onChange={(e) => setNewSchemeName(e.target.value)}
                                        placeholder="Nama skema warna kartu..."
                                        className="h-8 w-full rounded-md border border-input bg-background px-3 text-xs focus:border-primary focus:outline-none"
                                        autoFocus
                                    />
                                </Field>

                                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
                                    {/* Background Gradient Start */}
                                    <div className="flex flex-col gap-1 p-2 rounded-lg border border-border/60 bg-muted/20">
                                        <label className="text-[10px] font-semibold text-foreground">BG Awal (Gradient 1)</label>
                                        <div className="flex items-center gap-1.5 mt-0.5">
                                            <input
                                                type="color"
                                                value={newBgStart}
                                                onChange={(e) => setNewBgStart(e.target.value)}
                                                className="w-6 h-6 rounded border border-border cursor-pointer bg-transparent"
                                            />
                                            <input
                                                type="text"
                                                value={newBgStart}
                                                onChange={(e) => setNewBgStart(e.target.value)}
                                                className="h-6 w-full text-[11px] font-mono px-1 rounded bg-background border border-border focus:outline-none"
                                            />
                                        </div>
                                    </div>

                                    {/* Background Gradient End */}
                                    <div className="flex flex-col gap-1 p-2 rounded-lg border border-border/60 bg-muted/20">
                                        <label className="text-[10px] font-semibold text-foreground">BG Akhir (Gradient 2)</label>
                                        <div className="flex items-center gap-1.5 mt-0.5">
                                            <input
                                                type="color"
                                                value={newBgEnd}
                                                onChange={(e) => setNewBgEnd(e.target.value)}
                                                className="w-6 h-6 rounded border border-border cursor-pointer bg-transparent"
                                            />
                                            <input
                                                type="text"
                                                value={newBgEnd}
                                                onChange={(e) => setNewBgEnd(e.target.value)}
                                                className="h-6 w-full text-[11px] font-mono px-1 rounded bg-background border border-border focus:outline-none"
                                            />
                                        </div>
                                    </div>

                                    {/* Accent Profit */}
                                    <div className="flex flex-col gap-1 p-2 rounded-lg border border-border/60 bg-muted/20">
                                        <label className="text-[10px] font-semibold text-profit">Aksen Profit</label>
                                        <div className="flex items-center gap-1.5 mt-0.5">
                                            <input
                                                type="color"
                                                value={newAccentProfit}
                                                onChange={(e) => setNewAccentProfit(e.target.value)}
                                                className="w-6 h-6 rounded border border-border cursor-pointer bg-transparent"
                                            />
                                            <input
                                                type="text"
                                                value={newAccentProfit}
                                                onChange={(e) => setNewAccentProfit(e.target.value)}
                                                className="h-6 w-full text-[11px] font-mono px-1 rounded bg-background border border-border focus:outline-none"
                                            />
                                        </div>
                                    </div>

                                    {/* Accent Loss */}
                                    <div className="flex flex-col gap-1 p-2 rounded-lg border border-border/60 bg-muted/20">
                                        <label className="text-[10px] font-semibold text-loss">Aksen Loss</label>
                                        <div className="flex items-center gap-1.5 mt-0.5">
                                            <input
                                                type="color"
                                                value={newAccentLoss}
                                                onChange={(e) => setNewAccentLoss(e.target.value)}
                                                className="w-6 h-6 rounded border border-border cursor-pointer bg-transparent"
                                            />
                                            <input
                                                type="text"
                                                value={newAccentLoss}
                                                onChange={(e) => setNewAccentLoss(e.target.value)}
                                                className="h-6 w-full text-[11px] font-mono px-1 rounded bg-background border border-border focus:outline-none"
                                            />
                                        </div>
                                    </div>

                                    {/* Border Kartu */}
                                    <div className="flex flex-col gap-1 p-2 rounded-lg border border-border/60 bg-muted/20 col-span-2 sm:col-span-1">
                                        <label className="text-[10px] font-semibold text-muted-foreground">Border Kartu</label>
                                        <div className="flex items-center gap-1.5 mt-0.5">
                                            <input
                                                type="color"
                                                value={newBorder.startsWith('#') ? newBorder : '#10b981'}
                                                onChange={(e) => setNewBorder(e.target.value)}
                                                className="w-6 h-6 rounded border border-border cursor-pointer bg-transparent"
                                            />
                                            <input
                                                type="text"
                                                value={newBorder}
                                                onChange={(e) => setNewBorder(e.target.value)}
                                                className="h-6 w-full text-[11px] font-mono px-1 rounded bg-background border border-border focus:outline-none"
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Mini Live Preview Form */}
                                <div
                                    className="p-2.5 rounded-lg flex items-center justify-between border"
                                    style={{
                                        background: `linear-gradient(145deg, ${newBgStart} 0%, ${newBgEnd} 100%)`,
                                        borderColor: newBorder || `${newAccentProfit}44`
                                    }}
                                >
                                    <span className="text-xs font-bold text-white">
                                        {newSchemeName || 'Pratinjau Skema'}
                                    </span>
                                    <div className="flex items-center gap-3 text-xs font-bold">
                                        <span style={{ color: newAccentProfit }}>+124.50%</span>
                                        <span style={{ color: newAccentLoss }}>-12.00%</span>
                                    </div>
                                </div>

                                <div className="flex items-center justify-end gap-2 mt-1">
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant="ghost"
                                        onClick={handleCancelSchemeForm}
                                    >
                                        Batal
                                    </Button>
                                    <Button type="submit" size="sm" variant="primary">
                                        {editingSchemeId ? 'Simpan Perubahan' : 'Simpan Skema Warna'}
                                    </Button>
                                </div>
                            </form>
                        )}

                        <div className="flex flex-wrap items-center gap-2">
                            {colorSchemes.map((t) => (
                                <div
                                    key={t.id}
                                    className={`group relative flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                                        !settings.isCustomBg && settings.bgPresetId === t.id
                                            ? 'border-primary bg-primary/15 text-foreground font-semibold shadow-xs ring-1 ring-primary/40'
                                            : 'border-border/70 bg-card text-muted-foreground hover:text-foreground'
                                    }`}
                                >
                                    <button
                                        type="button"
                                        onClick={() => updateSettings({ bgPresetId: t.id, isCustomBg: false })}
                                        className="flex items-center gap-2 flex-1"
                                    >
                                        <span
                                            className="w-3.5 h-3.5 rounded-full flex-shrink-0"
                                            style={{
                                                background: t.isTransparent
                                                    ? 'linear-gradient(45deg, #38bdf8 0%, #a855f7 100%)'
                                                    : t.accentProfit,
                                                boxShadow:
                                                    !settings.isCustomBg && settings.bgPresetId === t.id
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
                                        {t.isCustom && (
                                            <span className="text-[9px] px-1.5 py-0.2 rounded bg-primary/20 text-primary font-bold">
                                                Kustom
                                            </span>
                                        )}
                                    </button>

                                    {t.isCustom && (
                                        <div className="flex items-center gap-1 ml-1" onClick={(e) => e.stopPropagation()}>
                                            <button
                                                type="button"
                                                onClick={() => handleStartEditColorScheme(t)}
                                                className="opacity-70 hover:opacity-100 text-primary text-[11px] p-0.5 transition-opacity"
                                                title="Edit skema warna ini"
                                            >
                                                ✏️
                                            </button>

                                            {confirmDeleteSchemeId === t.id ? (
                                                <div className="flex items-center gap-1">
                                                    <button
                                                        type="button"
                                                        onClick={() => handleDeleteColorScheme(t.id)}
                                                        className="px-1.5 py-0.5 rounded bg-destructive text-destructive-foreground text-[10px] font-bold shadow-xs hover:bg-destructive/90"
                                                    >
                                                        Yakin?
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => setConfirmDeleteSchemeId(null)}
                                                        className="text-[10px] text-muted-foreground hover:text-foreground"
                                                    >
                                                        ✕
                                                    </button>
                                                </div>
                                            ) : (
                                                <button
                                                    type="button"
                                                    onClick={() => setConfirmDeleteSchemeId(t.id)}
                                                    className="opacity-60 hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity"
                                                    title="Hapus skema warna kartu ini"
                                                >
                                                    ✕
                                                </button>
                                            )}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Sub-bagian 4.2: Galeri Wallpaper Kustom */}
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <div>
                                <p className="text-[11px] font-semibold text-muted-foreground">
                                    Galeri Wallpaper & Video Kustom ({customBgList.length}):
                                </p>
                                <p className="text-[10px] text-muted-foreground">
                                    Mendukung gambar (PNG/JPG/WebP) dan video (MP4/WebM). Video bisa diekspor jadi GIF animasi!
                                </p>
                            </div>

                            {/* Tombol Upload BG Baru */}
                            <input
                                ref={bgInputRef}
                                type="file"
                                accept="image/*,video/mp4,video/webm"
                                onChange={(e) => {
                                    const file = e.target.files?.[0]
                                    handleMediaUpload(
                                        file,
                                        25,
                                        setBgFileError,
                                        (dataUrl, isVideo) => handleAddCustomBg(dataUrl, file?.name, isVideo ? 'video' : 'image')
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
                                <span>+ Upload Gambar / Video</span>
                            </button>
                        </div>
                        {bgFileError && <p className="text-xs text-destructive mb-2">{bgFileError}</p>}

                        {customBgList.length === 0 ? (
                            <div className="p-4 rounded-xl border border-dashed border-border text-center bg-card/20">
                                <p className="text-xs text-muted-foreground">Belum ada wallpaper atau video kustom yang diunggah.</p>
                                <p className="text-[11px] text-muted-foreground mt-1">Unggah gambar atau klip video MP4/WebM favorit Anda untuk dijadikan latar kartu share.</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                                {customBgList.map((bgItem) => {
                                    const isSelected = settings.isCustomBg && settings.customBgId === bgItem.id
                                    const isEditingThis = editingBgItem?.id === bgItem.id
                                    const isVideo = bgItem.mediaType === 'video'
                                    const isConfirmingDelete = confirmDeleteBgId === bgItem.id

                                    return (
                                        <div
                                            key={bgItem.id}
                                            className={`relative flex flex-col rounded-xl border overflow-hidden transition-all ${
                                                isSelected
                                                    ? 'border-primary ring-2 ring-primary/40 bg-card shadow-sm'
                                                    : 'border-border/70 bg-card/50 hover:border-border'
                                            }`}
                                        >
                                            {/* Thumbnail Image atau Video */}
                                            <div
                                                onClick={() => updateSettings({
                                                    isCustomBg: true,
                                                    customBgId: bgItem.id,
                                                    customBgUrl: bgItem.dataUrl,
                                                    customBgMediaType: resolveMediaType(bgItem.mediaType, bgItem.dataUrl, 'image'),
                                                    bgPosX: bgItem.posX ?? 50,
                                                    bgPosY: bgItem.posY ?? 50
                                                })}
                                                className="h-24 w-full bg-cover cursor-pointer relative group overflow-hidden bg-black/40"
                                                style={!isVideo ? {
                                                    backgroundImage: `url(${bgItem.dataUrl})`,
                                                    backgroundPosition: `${bgItem.posX ?? 50}% ${bgItem.posY ?? 50}%`
                                                } : undefined}
                                            >
                                                {isVideo && (
                                                    <video
                                                        src={bgItem.dataUrl}
                                                        className="w-full h-full object-cover"
                                                        style={{ objectPosition: `${bgItem.posX ?? 50}% ${bgItem.posY ?? 50}%` }}
                                                        muted
                                                        loop
                                                        autoPlay
                                                        playsInline
                                                    />
                                                )}
                                                <div className="absolute inset-0 bg-black/20 group-hover:bg-black/10 transition-colors" />
                                                
                                                {/* Badge Tipe Video / Gambar */}
                                                {isVideo && (
                                                    <span className="absolute top-2 left-2 px-1.5 py-0.5 rounded bg-amber-500/80 text-black text-[9px] font-black uppercase tracking-wider backdrop-blur-xs">
                                                        ▶ Video
                                                    </span>
                                                )}

                                                {isSelected && (
                                                    <span className="absolute top-2 right-2 px-2 py-0.5 rounded-md bg-primary text-primary-foreground text-[10px] font-bold shadow-xs">
                                                        Aktif
                                                    </span>
                                                )}

                                                {(bgItem.posX !== undefined || bgItem.posY !== undefined) && (
                                                    <span className="absolute bottom-1.5 left-2 px-1.5 py-0.5 rounded bg-black/60 text-white/80 text-[8px] font-mono">
                                                        Pan: {bgItem.posX ?? 50}%, {bgItem.posY ?? 50}%
                                                    </span>
                                                )}
                                            </div>

                                            {/* Panel Edit Pop-down jika wallpaper sedang diedit */}
                                            {isEditingThis ? (
                                                <div className="p-3 bg-muted/40 border-t border-border flex flex-col gap-2.5">
                                                    <div className="flex items-center justify-between">
                                                        <span className="text-[10px] font-bold text-primary uppercase">Edit Wallpaper</span>
                                                        <button
                                                            type="button"
                                                            onClick={() => setEditingBgItem(null)}
                                                            className="text-xs text-muted-foreground hover:text-foreground"
                                                        >
                                                            ✕
                                                        </button>
                                                    </div>

                                                    <Field label="Nama Wallpaper" hint="">
                                                        <input
                                                            type="text"
                                                            value={editingBgName}
                                                            onChange={(e) => setEditingBgName(e.target.value)}
                                                            className="h-7 px-2 text-xs w-full rounded bg-background border border-border focus:border-primary focus:outline-none"
                                                        />
                                                    </Field>

                                                    <div className="grid grid-cols-2 gap-2">
                                                        <div>
                                                            <div className="flex justify-between text-[10px] font-medium text-foreground mb-0.5">
                                                                <span>Posisi X</span>
                                                                <span className="font-mono text-primary">{editingBgPosX}%</span>
                                                            </div>
                                                            <input
                                                                type="range"
                                                                min="0"
                                                                max="100"
                                                                value={editingBgPosX}
                                                                onChange={(e) => setEditingBgPosX(Number(e.target.value))}
                                                                className="w-full h-1.5 accent-primary cursor-pointer"
                                                            />
                                                        </div>

                                                        <div>
                                                            <div className="flex justify-between text-[10px] font-medium text-foreground mb-0.5">
                                                                <span>Posisi Y</span>
                                                                <span className="font-mono text-primary">{editingBgPosY}%</span>
                                                            </div>
                                                            <input
                                                                type="range"
                                                                min="0"
                                                                max="100"
                                                                value={editingBgPosY}
                                                                onChange={(e) => setEditingBgPosY(Number(e.target.value))}
                                                                className="w-full h-1.5 accent-primary cursor-pointer"
                                                            />
                                                        </div>
                                                    </div>

                                                    <div className="flex items-center justify-between pt-1">
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                setEditingBgPosX(50)
                                                                setEditingBgPosY(50)
                                                            }}
                                                            className="text-[10px] text-muted-foreground hover:text-foreground underline"
                                                        >
                                                            Reset ke Tengah
                                                        </button>
                                                        <div className="flex items-center gap-1.5">
                                                            <Button
                                                                size="sm"
                                                                variant="ghost"
                                                                onClick={() => setEditingBgItem(null)}
                                                                className="h-6 px-2 text-[10px]"
                                                            >
                                                                Batal
                                                            </Button>
                                                            <Button
                                                                size="sm"
                                                                variant="primary"
                                                                onClick={handleSaveEditedBg}
                                                                className="h-6 px-2.5 text-[10px] font-bold"
                                                            >
                                                                Simpan
                                                            </Button>
                                                        </div>
                                                    </div>
                                                </div>
                                            ) : (
                                                /* Baris Nama & Aksi Standar */
                                                <div className="p-2.5 flex items-center justify-between gap-2">
                                                    <span
                                                        onClick={() => handleOpenEditBg(bgItem)}
                                                        title="Klik untuk ubah nama dan posisi pan"
                                                        className="text-xs font-semibold text-foreground truncate cursor-pointer hover:underline flex-1"
                                                    >
                                                        {bgItem.name}
                                                    </span>

                                                    <div className="flex items-center gap-1">
                                                        <button
                                                            type="button"
                                                            onClick={() => handleOpenEditBg(bgItem)}
                                                            className="p-1 text-muted-foreground hover:text-primary transition-colors rounded hover:bg-primary/10 text-xs"
                                                            title="Edit nama dan posisi crop/pan"
                                                        >
                                                            ✏️
                                                        </button>

                                                        {!isSelected && (
                                                            <button
                                                                type="button"
                                                                onClick={() => updateSettings({
                                                                    isCustomBg: true,
                                                                    customBgId: bgItem.id,
                                                                    customBgUrl: bgItem.dataUrl,
                                                                    customBgMediaType: resolveMediaType(bgItem.mediaType, bgItem.dataUrl, 'image'),
                                                                    bgPosX: bgItem.posX ?? 50,
                                                                    bgPosY: bgItem.posY ?? 50
                                                                })}
                                                                className="px-2 py-1 text-[10px] font-semibold rounded bg-muted hover:bg-muted/80 text-foreground transition-colors"
                                                            >
                                                                Pilih
                                                            </button>
                                                        )}

                                                        {isConfirmingDelete ? (
                                                            <div className="flex items-center gap-1">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleDeleteCustomBg(bgItem.id)}
                                                                    className="px-1.5 py-0.5 rounded bg-destructive text-destructive-foreground text-[10px] font-bold shadow-xs hover:bg-destructive/90"
                                                                >
                                                                    Yakin?
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setConfirmDeleteBgId(null)}
                                                                    className="text-[10px] text-muted-foreground hover:text-foreground"
                                                                >
                                                                    ✕
                                                                </button>
                                                            </div>
                                                        ) : (
                                                            <button
                                                                type="button"
                                                                onClick={() => setConfirmDeleteBgId(bgItem.id)}
                                                                className="p-1 text-muted-foreground hover:text-destructive transition-colors rounded hover:bg-destructive/10"
                                                                title="Hapus background ini"
                                                            >
                                                                <svg viewBox="0 0 20 20" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2">
                                                                    <path d="M4 6h12M8 6V4h4v2m-6 4v6m4-6v6m3-10v11a1 1 0 01-1 1H6a1 1 0 01-1-1V6" />
                                                                </svg>
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            )}
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
                            const isEditingThisTpl = editingTplId === tpl.id
                            const isConfirmingDeleteTpl = confirmDeleteTplId === tpl.id

                            return (
                                <div
                                    key={tpl.id}
                                    className={`flex items-center justify-between p-3 rounded-xl border transition-all ${
                                        isDefault
                                            ? 'border-primary bg-primary/10 shadow-xs'
                                            : 'border-border/70 bg-card/60 hover:border-border'
                                    }`}
                                >
                                    <div className="flex flex-col min-w-0 pr-2 flex-1">
                                        {isEditingThisTpl ? (
                                            <div className="flex items-center gap-1 mb-1">
                                                <input
                                                    type="text"
                                                    value={editingTplName}
                                                    onChange={(e) => setEditingTplName(e.target.value)}
                                                    className="h-6 px-1.5 text-xs rounded bg-background border border-border focus:border-primary focus:outline-none w-full"
                                                    autoFocus
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter') handleSaveTplName(tpl.id)
                                                        if (e.key === 'Escape') setEditingTplId(null)
                                                    }}
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => handleSaveTplName(tpl.id)}
                                                    className="text-[10px] px-1.5 py-0.5 bg-primary text-primary-foreground rounded font-bold"
                                                >
                                                    OK
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setEditingTplId(null)}
                                                    className="text-[10px] text-muted-foreground hover:text-foreground px-1"
                                                >
                                                    ✕
                                                </button>
                                            </div>
                                        ) : (
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
                                                {!tpl.isBuiltin && (
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setEditingTplId(tpl.id)
                                                            setEditingTplName(tpl.name)
                                                        }}
                                                        className="text-[10px] text-muted-foreground hover:text-primary transition-colors"
                                                        title="Ganti nama template"
                                                    >
                                                        ✏️
                                                    </button>
                                                )}
                                            </div>
                                        )}
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
                                            <>
                                                {isConfirmingDeleteTpl ? (
                                                    <div className="flex items-center gap-1">
                                                        <button
                                                            type="button"
                                                            onClick={() => handleDeleteTemplate(tpl.id)}
                                                            className="px-1.5 py-0.5 rounded bg-destructive text-destructive-foreground text-[10px] font-bold shadow-xs hover:bg-destructive/90"
                                                        >
                                                            Yakin?
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => setConfirmDeleteTplId(null)}
                                                            className="text-[10px] text-muted-foreground hover:text-foreground"
                                                        >
                                                            ✕
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <button
                                                        type="button"
                                                        onClick={() => setConfirmDeleteTplId(tpl.id)}
                                                        className="p-1 text-muted-foreground hover:text-destructive transition-colors rounded hover:bg-destructive/10"
                                                        title="Hapus template kustom ini"
                                                    >
                                                        <svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
                                                            <path d="M4 6h12M8 6V4h4v2m-6 4v6m4-6v6m3-10v11a1 1 0 01-1 1H6a1 1 0 01-1-1V6" />
                                                        </svg>
                                                    </button>
                                                )}
                                            </>
                                        )}
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </div>

                {/* ── PRATINJAU LIVE KARTU SHARE (RESPONSIF & UTUH) ── */}
                <div className="pt-3 border-t border-border/50">
                    <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                        <div>
                            <p className="text-[11px] font-semibold text-foreground">
                                Pratinjau Hasil Desain ({getExchangeDisplayName(activeExchangeTab)}):
                            </p>
                            <p className="text-[10px] text-muted-foreground">
                                Tampilan kartu live yang dihasilkan saat menekan tombol &quot;Pamer PnL&quot;. Arah gradien dan skema warna aktif langsung tercermin di sini.
                            </p>
                        </div>
                        {settings.isCustomBg && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/30 font-medium">
                                Gradien: {settings.bgDimmingDirection} ({settings.bgDimming}%)
                            </span>
                        )}
                    </div>

                    {/* Wrapper terpusat dan tidak kepotong */}
                    <div className="w-full max-w-md mx-auto">
                        <div
                            className="relative overflow-hidden rounded-2xl p-5 border shadow-xl transition-all select-none"
                            style={{
                                background: settings.isCustomBg && settings.customBgUrl
                                    ? 'transparent'
                                    : currentTemplate.bg,
                                borderColor: currentTemplate.border,
                            }}
                        >
                            {/* Layer Media Background (Video / Gambar) & Arah Gradien */}
                            {settings.isCustomBg && settings.customBgUrl && (
                                <>
                                    {settings.customBgMediaType === 'video' ? (
                                        <video
                                            src={settings.customBgUrl}
                                            autoPlay
                                            loop
                                            muted
                                            playsInline
                                            className="pointer-events-none absolute inset-0 w-full h-full object-cover"
                                            style={{
                                                objectPosition: `${settings.bgPosX ?? 50}% ${settings.bgPosY ?? 50}%`,
                                            }}
                                        />
                                    ) : (
                                        <div
                                            className="pointer-events-none absolute inset-0 bg-cover"
                                            style={{
                                                backgroundImage: `url(${settings.customBgUrl})`,
                                                backgroundPosition: `${settings.bgPosX ?? 50}% ${settings.bgPosY ?? 50}%`,
                                            }}
                                        />
                                    )}

                                    {/* Layer Arah Gradien Interaktif */}
                                    <div
                                        className="pointer-events-none absolute inset-0"
                                        style={getGradientDimmingStyle(settings.bgDimming, settings.bgDimmingDirection)}
                                    />

                                    {/* Grid Overlay */}
                                    <div
                                        className="pointer-events-none absolute inset-0"
                                        style={{
                                            backgroundImage:
                                                'linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)',
                                            backgroundSize: '24px 24px',
                                        }}
                                    />
                                </>
                            )}

                            {/* Konten Kartu */}
                            <div className="relative z-10 flex flex-col gap-3">
                                {/* Header: Brand & Exchange */}
                                <div className="flex items-start justify-between gap-2">
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                        <span className="text-xs font-black tracking-wider text-white">
                                            {settings.brandTitle || 'NITIREKSO'}
                                        </span>
                                        <span
                                            className="text-[9px] font-bold px-1.5 py-0.5 rounded text-white shadow-xs"
                                            style={{ background: currentTemplate.accentProfit }}
                                        >
                                            {settings.brandSubtitle || 'JOURNAL'}
                                        </span>
                                    </div>

                                    {/* Logo Exchange & Referral */}
                                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                                        {(() => {
                                            const customLogo = settings[`${activeExchangeTab}LogoUrl` as keyof ShareSettings] as string | null
                                            const activeLogo = customLogo || getExchangeDefaultLogo(activeExchangeTab)
                                            if (activeLogo) {
                                                return <img src={activeLogo} alt={activeExchangeTab} className="h-5 max-w-[80px] object-contain drop-shadow" />
                                            }
                                            return (
                                                <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-white/10 text-white border border-white/20">
                                                    {activeExchangeTab}
                                                </span>
                                            )
                                        })()}

                                        {settings.showReferral && (
                                            <span className="text-[9px] font-semibold text-sky-300 bg-sky-500/20 border border-sky-400/30 px-1.5 py-0.5 rounded">
                                                Ref: {((settings[`${activeExchangeTab}ReferralCode` as keyof ShareSettings] as string) || '').trim() || '—'}
                                            </span>
                                        )}
                                    </div>
                                </div>

                                {/* Trade Symbol & Side */}
                                <div className="flex items-center justify-between mt-1">
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm font-extrabold text-white tracking-wide">
                                            BTCUSDT PERP
                                        </span>
                                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                                            LONG 20x
                                        </span>
                                    </div>
                                    <span className="text-[11px] text-white/60 font-mono">
                                        Durasi: 2j 15m
                                    </span>
                                </div>

                                {/* Angka ROI & PnL Besar */}
                                <div>
                                    <div
                                        className="text-3xl font-black tracking-tight leading-none"
                                        style={{ color: currentTemplate.accentProfit }}
                                    >
                                        +124.50%
                                    </div>
                                    <div className="text-sm font-bold mt-1" style={{ color: currentTemplate.accentProfit }}>
                                        +1,245.50 USDT
                                    </div>
                                </div>

                                {/* Box Info Harga & Waktu */}
                                <div className="p-2.5 rounded-xl bg-black/30 border border-white/10 flex flex-col gap-1.5 text-[11px]">
                                    <div className="grid grid-cols-2 gap-2 text-white/80">
                                        <div>
                                            <span className="text-white/40 block text-[9px] uppercase font-semibold">Harga Masuk</span>
                                            <span className="font-mono font-bold">64,250.00</span>
                                        </div>
                                        <div>
                                            <span className="text-white/40 block text-[9px] uppercase font-semibold">Harga Keluar</span>
                                            <span className="font-mono font-bold">68,245.00</span>
                                        </div>
                                    </div>

                                    {settings.showTradeTimes && (
                                        <div className="grid grid-cols-2 gap-2 pt-1.5 border-t border-white/10 text-[10px] text-white/60 font-mono">
                                            <div>
                                                <span className="text-white/40 block text-[8px] uppercase">Waktu Masuk</span>
                                                <span>30 Sep 2026, 14:20</span>
                                            </div>
                                            <div>
                                                <span className="text-white/40 block text-[8px] uppercase">Waktu Keluar</span>
                                                <span>30 Sep 2026, 16:35</span>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Footer: Profil Trader & Nitirekso Watermark */}
                                <div className="flex items-center justify-between pt-2 border-t border-white/10 mt-1">
                                    <div className="flex items-center gap-2 min-w-0">
                                        {settings.avatarUrl ? (
                                            <img
                                                src={settings.avatarUrl}
                                                alt="Avatar"
                                                className="w-6 h-6 rounded-full object-cover flex-shrink-0"
                                                style={{ border: `1.5px solid ${currentTemplate.accentProfit}` }}
                                            />
                                        ) : (
                                            <div
                                                className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold text-white flex-shrink-0"
                                                style={{ background: `${currentTemplate.accentProfit}44` }}
                                            >
                                                {(settings.traderHandle || '@trader').replace('@', '').slice(0, 2).toUpperCase() || 'TR'}
                                            </div>
                                        )}
                                        <span className="text-xs font-semibold text-white truncate">
                                            {settings.traderHandle || '@trader'}
                                        </span>
                                    </div>

                                    <span className="text-[10px] text-white/50 flex-shrink-0 font-medium tracking-wider">
                                        nitirekso
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </Card>
    )
}
