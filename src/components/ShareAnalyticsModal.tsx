import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { TradeDetail } from '@shared/domain'
import { Modal } from './ui'
import { compilePerformanceReport, type PerformanceReport } from '../lib/analytics'
import { formatPnl, formatRatio } from '../lib/format'
import { cn } from '../lib/utils'
import { useHidePnl } from '../hooks/useHidePnl'
import {
    BUILTIN_TEMPLATES,
    loadShareSettings,
    loadCustomBgList,
    addCustomBgItem,
    getAllShareTemplates,
    saveCustomShareTemplate,
    deleteCustomShareTemplate,
    getActiveTemplateId,
    setActiveTemplateId,
    getAllBgTemplates,
    type BgTemplate,
    type ShareCardTemplate,
    type CustomBgItem
} from '../lib/shareSettings'
import {
    CardCanvasEngine,
    buildPortfolioSummaryCardSpec,
    exportCardMedia
} from '../lib/share'
import { AnalyticsCard } from './share/AnalyticsCard'

// ---------------------------------------------------------------------------
// Tipe Props & Opsi Rasio Kartu
// ---------------------------------------------------------------------------

export type CardAspectRatio = '16:9' | '1:1' | '4:5'

export interface ShareAnalyticsModalProps {
    isOpen: boolean
    onClose: () => void
    trades: TradeDetail[]
    initialPeriodLabel?: string
    /** Laporan performa terpadu opsional untuk menghemat komputasi ulang. */
    report?: PerformanceReport
}

// ---------------------------------------------------------------------------
// Komponen Utama Modal Pamer Analisa
// ---------------------------------------------------------------------------

export function ShareAnalyticsModal({
    isOpen,
    onClose,
    trades,
    initialPeriodLabel = 'All-Time Performance',
    report
}: ShareAnalyticsModalProps): React.JSX.Element | null {
    if (!isOpen) return null
    return (
        <ShareAnalyticsModalContent
            trades={trades}
            initialPeriodLabel={initialPeriodLabel}
            report={report}
            onClose={onClose}
        />
    )
}

function ShareAnalyticsModalContent({
    trades,
    initialPeriodLabel,
    report: initialReport,
    onClose
}: {
    trades: TradeDetail[]
    initialPeriodLabel: string
    report?: PerformanceReport
    onClose: () => void
}): React.JSX.Element {
    // --- Kalkulasi Metrik Analitik Terpadu ---
    const { hidePnl } = useHidePnl()
    const report = useMemo(
        () => initialReport ?? compilePerformanceReport(trades),
        [initialReport, trades]
    )
    const { summary, equityCurve: curve, drawdownStats: drawdown } = report
    const isProfit = summary.netPnlTotal >= 0

    // --- Muat Konfigurasi Branding, Template & Galeri Wallpaper ---
    const [savedSettings] = useState(() => loadShareSettings())
    const [customBgList, setCustomBgList] = useState<CustomBgItem[]>(() => loadCustomBgList())
    const [templates, setTemplates] = useState<ShareCardTemplate[]>(() => getAllShareTemplates())
    const [activeTemplateId, setActiveTplId] = useState<string>(() => getActiveTemplateId())

    const activeTemplate = templates.find((t) => t.id === activeTemplateId) || templates[0]!
    const [allBgTemplates] = useState<BgTemplate[]>(() => getAllBgTemplates())

    const initialBgIdx = Math.max(
        0,
        allBgTemplates.findIndex((t) => t.id === (activeTemplate?.bgPresetId || savedSettings.bgPresetId))
    )

    // --- State: Skema Warna & Wallpaper ---
    const initialCustomBgId = activeTemplate?.customBgId || savedSettings.customBgId || (customBgList[0]?.id ?? null)
    const [selectedBgIdx, setSelectedBgIdx] = useState<number>(initialBgIdx)
    const [selectedCustomBgId, setSelectedCustomBgId] = useState<string | null>(initialCustomBgId)
    const [isCustomBgActive, setIsCustomBgActive] = useState<boolean>(
        activeTemplate
            ? activeTemplate.isCustomBg && (!!activeTemplate.customBgId || customBgList.length > 0)
            : savedSettings.isCustomBg && customBgList.length > 0
    )

    // Wallpaper kustom yang sedang aktif
    const activeCustomBgItem = customBgList.find((b) => b.id === selectedCustomBgId) || customBgList[0] || null
    const activeCustomBgUrl = activeCustomBgItem ? activeCustomBgItem.dataUrl : (savedSettings.customBgUrl || null)
    const bgPosX = activeCustomBgItem?.bgPosX ?? savedSettings.bgPosX ?? 50
    const bgPosY = activeCustomBgItem?.bgPosY ?? savedSettings.bgPosY ?? 50

    const bg: BgTemplate = allBgTemplates[selectedBgIdx] ?? allBgTemplates[0]!
    const accent = isProfit ? bg.accentProfit : bg.accentLoss

    // Data Identitas & Branding dari Settings
    const avatarUrl = savedSettings.avatarUrl
    const traderHandle = savedSettings.traderHandle
    const brandTitle = savedSettings.brandTitle || 'NITIREKSO'
    const brandSubtitle = 'ANALYTICS'
    const bgDimming = savedSettings.bgDimming

    // Referral code dari settings jika tersedia
    const activeReferral = savedSettings.mexcReferralCode || savedSettings.bitunixReferralCode || ''

    // State Format & Rasio Kartu
    const [aspectRatio, setAspectRatio] = useState<CardAspectRatio>('16:9')

    // State Toggle Tampilan Komponen
    const [showProfile, setShowProfile] = useState<boolean>(activeTemplate?.showProfile ?? true)
    const [showWatermark, setShowWatermark] = useState<boolean>(activeTemplate?.showWatermark ?? true)
    const [showChart, setShowChart] = useState<boolean>(true)
    const [hideNominal, setHideNominal] = useState<boolean>(false)
    const [showReferral, setShowReferral] = useState<boolean>(activeTemplate ? activeTemplate.showReferral : savedSettings.showReferral)
    const [periodLabel, setPeriodLabel] = useState<string>(initialPeriodLabel)
    const [customTraderNote, setCustomTraderNote] = useState<string>('')

    // State Template Management Modal
    const [isSavingTemplate, setIsSavingTemplate] = useState<boolean>(false)
    const [newTemplateName, setNewTemplateName] = useState<string>('')

    // State Notifikasi Feedback
    const [copied, setCopied] = useState(false)
    const [downloading, setDownloading] = useState(false)

    // Refs
    const canvasRef = useRef<HTMLCanvasElement | null>(null)
    const uploadBgModalInputRef = useRef<HTMLInputElement | null>(null)
    const avatarImgRef = useRef<HTMLImageElement | null>(null)
    const customBgImgRef = useRef<HTMLImageElement | null>(null)

    // Upload background baru langsung dari modal
    const handleUploadNewBg = (file?: File) => {
        if (!file) return
        const reader = new FileReader()
        reader.onload = (e) => {
            const dataUrl = e.target?.result as string
            if (!dataUrl) return
            const name = file.name.replace(/\.[^/.]+$/, '').slice(0, 15)
            const newItem = addCustomBgItem({ name, dataUrl })
            const updated = loadCustomBgList()
            setCustomBgList(updated)
            setSelectedCustomBgId(newItem.id)
            setIsCustomBgActive(true)
        }
        reader.readAsDataURL(file)
    }

    // Preload Avatar
    useEffect(() => {
        if (avatarUrl) {
            const img = new Image()
            img.crossOrigin = 'anonymous'
            img.src = avatarUrl
            img.onload = () => { avatarImgRef.current = img }
        } else {
            avatarImgRef.current = null
        }
    }, [avatarUrl])

    // Preload Custom Wallpaper
    useEffect(() => {
        if (activeCustomBgUrl) {
            const img = new Image()
            img.crossOrigin = 'anonymous'
            img.src = activeCustomBgUrl
            img.onload = () => { customBgImgRef.current = img }
        } else {
            customBgImgRef.current = null
        }
    }, [activeCustomBgUrl])

    // Switch Template
    const handleApplyTemplate = (tpl: ShareCardTemplate) => {
        setActiveTplId(tpl.id)
        setActiveTemplateId(tpl.id)

        const bgIdx = allBgTemplates.findIndex((b) => b.id === tpl.bgPresetId)
        if (bgIdx >= 0) setSelectedBgIdx(bgIdx)

        if (tpl.isCustomBg && tpl.customBgId) {
            setSelectedCustomBgId(tpl.customBgId)
            setIsCustomBgActive(true)
        } else {
            setIsCustomBgActive(false)
        }

        setShowProfile(tpl.showProfile)
        setShowWatermark(tpl.showWatermark)
        setShowReferral(tpl.showReferral)
    }

    // Simpan Template Kustom Baru
    const handleSaveNewTemplate = () => {
        if (!newTemplateName.trim()) return
        const newTpl: ShareCardTemplate = {
            id: `custom-${Date.now()}`,
            name: newTemplateName.trim(),
            isBuiltin: false,
            bgPresetId: bg.id,
            isCustomBg: isCustomBgActive,
            customBgId: isCustomBgActive ? selectedCustomBgId : null,
            bgDimming,
            showSide: true,
            showPnl: true,
            showRoi: true,
            showTradeTimes: true,
            showProfile,
            showWatermark,
            showDuration: true,
            showPlan: true,
            showSetup: true,
            showGrade: true,
            showEmotion: true,
            showReferral,
            showThesis: false,
            showReview: false,
            showFullText: false
        }
        saveCustomShareTemplate(newTpl)
        const updated = getAllShareTemplates()
        setTemplates(updated)
        setActiveTplId(newTpl.id)
        setActiveTemplateId(newTpl.id)
        setNewTemplateName('')
        setIsSavingTemplate(false)
    }

    // Hapus Template Kustom
    const handleDeleteTemplate = (id: string, e: React.MouseEvent) => {
        e.stopPropagation()
        deleteCustomShareTemplate(id)
        const updated = getAllShareTemplates()
        setTemplates(updated)
        if (activeTemplateId === id) {
            setActiveTplId(updated[0]?.id || BUILTIN_TEMPLATES[0]!.id)
            setActiveTemplateId(updated[0]?.id || BUILTIN_TEMPLATES[0]!.id)
        }
    }

    // --- Pemetaan Spesifikasi Murni Kartu Analitik ---
    const buildCurrentSpec = useCallback(() => {
        return buildPortfolioSummaryCardSpec({
            report,
            summary,
            curve,
            drawdown,
            bg,
            accent,
            isCustomBgActive,
            customMedia: isCustomBgActive ? customBgImgRef.current : null,
            bgDimming,
            bgPosX,
            bgPosY,
            brandTitle,
            brandSubtitle,
            traderHandle,
            activeReferral: showReferral ? activeReferral : null,
            avatarImage: avatarImgRef.current,
            showProfile,
            showWatermark,
            showReferral,
            showChart,
            hideNominal: hideNominal || hidePnl,
            periodLabel,
            customTraderNote,
            aspect: aspectRatio,
        })
    }, [
        report,
        summary,
        curve,
        drawdown,
        bg,
        accent,
        isCustomBgActive,
        bgDimming,
        bgPosX,
        bgPosY,
        brandTitle,
        brandSubtitle,
        traderHandle,
        activeReferral,
        showProfile,
        showWatermark,
        showReferral,
        showChart,
        hideNominal,
        hidePnl,
        periodLabel,
        customTraderNote,
        aspectRatio
    ])

    // --- Render ke Canvas Beresolusi Tinggi via CardCanvasEngine ---
    const renderCanvas = useCallback((): HTMLCanvasElement | null => {
        const canvas = canvasRef.current
        if (!canvas) return null
        const spec = buildCurrentSpec()
        CardCanvasEngine.render(spec, canvas)
        return canvas
    }, [buildCurrentSpec])

    // Update canvas render saat spesifikasi berubah
    useEffect(() => {
        renderCanvas()
    }, [renderCanvas])

    // --- Action Handlers ---

    const handleCopy = async (): Promise<void> => {
        const canvas = renderCanvas()
        if (!canvas) return
        try {
            canvas.toBlob(async (blob) => {
                if (!blob) return
                await navigator.clipboard.write([
                    new ClipboardItem({ 'image/png': blob })
                ])
                setCopied(true)
                setTimeout(() => setCopied(false), 2500)
            }, 'image/png')
        } catch (err) {
            console.error('Gagal menyalin gambar:', err)
        }
    }

    const handleDownload = async (): Promise<void> => {
        setDownloading(true)
        try {
            const spec = buildCurrentSpec()
            const filename = `Analytics-${periodLabel.replace(/\s+/g, '-')}-${Date.now()}.png`
            await exportCardMedia({
                spec,
                format: 'png',
                filename,
                wallpaperMediaElement: isCustomBgActive ? customBgImgRef.current : null
            })
        } catch (err) {
            console.error('Gagal mengekspor kartu analitik:', err)
        } finally {
            setDownloading(false)
        }
    }

    const handleTwitterShare = (): void => {
        const refStr = showReferral && activeReferral ? `\nRef Code: ${activeReferral}` : ''
        const pnlStr = hideNominal || hidePnl ? 'Profitable' : `${isProfit ? '+' : ''}${formatPnl(summary.netPnlTotal)} USDT`
        const winRateStr = summary.winRate !== null ? (summary.winRate * 100).toFixed(1) : '0.0'
        const pfStr = summary.profitFactor !== Number.POSITIVE_INFINITY ? formatRatio(summary.profitFactor) : '∞'
        const ddStr = hideNominal || hidePnl ? '••••' : `${formatPnl(drawdown.maxDrawdown)} USDT`
        const noteStr = customTraderNote ? `\n\n"${customTraderNote}"` : ''
        const text = `📊 Performance Report (${periodLabel}):\nNet P&L: ${pnlStr} | ${winRateStr}% Win Rate (${summary.totalTrades} Trades)\nMax Drawdown: ${ddStr} | Profit Factor: ${pfStr}${refStr}${noteStr}\n\n#DYOR #notfinancialadvice #CryptoTrading #TradingJournal #Crypto`

        const tweetUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`
        if (window.api?.openExternalUrl) {
            void window.api.openExternalUrl(tweetUrl)
        } else {
            window.open(tweetUrl, '_blank')
        }
    }

    return (
        <Modal
            isOpen={true}
            onClose={onClose}
            title="📊 Pamer Analytics (Performance Card)"
            size="xl"
        >
            <div className="flex flex-col gap-3.5 max-h-[85vh] overflow-y-auto pr-1">
                {/* ── BAR TEMPLATE KARTU ── */}
                <div className="flex items-center justify-between flex-wrap gap-2 px-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs font-semibold text-muted-foreground mr-1 flex items-center gap-1">
                            <span>📋</span>
                            <span>Template:</span>
                        </span>
                        {templates.map((tpl) => {
                            const isActive = tpl.id === activeTemplateId
                            return (
                                <button
                                    key={tpl.id}
                                    type="button"
                                    onClick={() => handleApplyTemplate(tpl)}
                                    className={`group flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition-all ${
                                        isActive
                                            ? 'border-primary bg-primary/20 text-foreground font-bold shadow-xs ring-1 ring-primary/50'
                                            : 'border-border/60 bg-muted/20 text-muted-foreground hover:text-foreground hover:border-border'
                                    }`}
                                >
                                    <span>{tpl.name}</span>
                                    {!tpl.isBuiltin && (
                                        <span
                                            onClick={(e) => handleDeleteTemplate(tpl.id, e)}
                                            className="text-[11px] text-muted-foreground hover:text-destructive transition-colors ml-0.5"
                                            title="Hapus template kustom"
                                        >
                                            ✕
                                        </span>
                                    )}
                                </button>
                            )
                        })}

                        {!isSavingTemplate ? (
                            <button
                                type="button"
                                onClick={() => setIsSavingTemplate(true)}
                                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold border border-dashed border-border bg-muted/20 text-muted-foreground hover:text-primary hover:border-primary/60 transition-all"
                            >
                                <span>+ Simpan Template</span>
                            </button>
                        ) : (
                            <div className="flex items-center gap-1.5 bg-muted/30 p-1 rounded-lg border border-border">
                                <input
                                    type="text"
                                    value={newTemplateName}
                                    onChange={(e) => setNewTemplateName(e.target.value)}
                                    placeholder="Nama Template..."
                                    className="px-2 py-0.5 text-xs bg-background border border-border/60 rounded focus:border-primary focus:outline-none"
                                />
                                <button
                                    type="button"
                                    onClick={handleSaveNewTemplate}
                                    className="px-2 py-0.5 text-xs font-bold bg-primary text-primary-foreground rounded hover:opacity-90"
                                >
                                    Simpan
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setIsSavingTemplate(false)}
                                    className="px-1 text-xs text-muted-foreground hover:text-foreground"
                                >
                                    ✕
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Selector Rasio Kartu */}
                    <div className="flex items-center gap-1 bg-muted/30 p-0.5 rounded-lg border border-border/50 text-xs">
                        <span className="text-[11px] font-medium text-muted-foreground px-1.5">Rasio:</span>
                        {(['16:9', '1:1', '4:5'] as CardAspectRatio[]).map((r) => (
                            <button
                                key={r}
                                type="button"
                                onClick={() => setAspectRatio(r)}
                                className={`px-2 py-0.5 rounded font-semibold transition-all ${
                                    aspectRatio === r
                                        ? 'bg-primary text-primary-foreground shadow-xs'
                                        : 'text-muted-foreground hover:text-foreground'
                                }`}
                            >
                                {r}
                            </button>
                        ))}
                    </div>
                </div>

                {/* ── CARD PREVIEW CONTAINER ── */}
                <div className="flex flex-col items-center justify-center rounded-2xl border border-border/60 bg-muted/20 p-4">
                    <div className={cn(
                        "w-full transition-all duration-200",
                        aspectRatio === '16:9' ? 'max-w-[580px]' : aspectRatio === '1:1' ? 'max-w-[480px]' : 'max-w-[420px]'
                    )}>
                        <AnalyticsCard
                            summary={summary}
                            curve={curve}
                            drawdown={drawdown}
                            bg={bg}
                            accent={accent}
                            isProfit={isProfit}
                            traderHandle={traderHandle}
                            brandTitle={brandTitle}
                            brandSubtitle={brandSubtitle}
                            activeReferral={activeReferral}
                            avatarUrl={avatarUrl}
                            isCustomBgActive={isCustomBgActive}
                            customBgUrl={activeCustomBgUrl}
                            bgDimming={bgDimming}
                            bgPosX={bgPosX}
                            bgPosY={bgPosY}
                            showProfile={showProfile}
                            showWatermark={showWatermark}
                            showChart={showChart}
                            hideNominal={hideNominal}
                            showReferral={showReferral}
                            periodLabel={periodLabel}
                            customTraderNote={customTraderNote}
                            aspectRatio={aspectRatio}
                        />
                    </div>
                </div>

                {/* Canvas tersembunyi untuk ekspor kualitas tinggi */}
                <canvas ref={canvasRef} className="hidden" />

                {/* ── BACKGROUND & WALLPAPER SELECTOR (SINKRON DENGAN SHARE PNL) ── */}
                <div className="border-t border-border/40 px-3 py-2.5 bg-card/30 rounded-xl flex flex-col gap-2">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                        {/* Grup 1: Skema Warna (Aksen & Teks) */}
                        <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-xs font-semibold text-muted-foreground mr-1 flex items-center gap-1">
                                <span>🎨</span>
                                <span>Skema Warna:</span>
                            </span>
                            {allBgTemplates.map((t, i) => {
                                const isColorSelected = selectedBgIdx === i
                                return (
                                    <button
                                        key={t.id}
                                        type="button"
                                        onClick={() => setSelectedBgIdx(i)}
                                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition-all ${
                                            isColorSelected
                                                ? isCustomBgActive
                                                    ? 'border-primary/80 bg-primary/15 text-foreground font-semibold shadow-xs ring-1 ring-primary/50'
                                                    : 'border-primary bg-primary/20 text-foreground font-bold shadow-xs ring-2 ring-primary/60'
                                                : 'border-border/60 bg-muted/30 text-muted-foreground hover:text-foreground'
                                        }`}
                                        title={
                                            isCustomBgActive
                                                ? `${t.label}${t.isCustom ? ' (Kustom)' : ''} (Aktif sebagai warna aksen & teks kartu)`
                                                : `${t.label}${t.isCustom ? ' (Kustom)' : ''} (Aktif sebagai background & warna aksen)`
                                        }
                                    >
                                        <span
                                            className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                                            style={{
                                                background: t.isTransparent
                                                    ? 'linear-gradient(45deg, #38bdf8 0%, #a855f7 100%)'
                                                    : t.isCustom && t.bgStart && t.bgEnd
                                                        ? `linear-gradient(135deg, ${t.bgStart}, ${t.bgEnd})`
                                                        : t.accentProfit,
                                            }}
                                        />
                                        <span>{t.label}</span>
                                        {t.isCustom && (
                                            <span className="text-[9px] px-1 py-0.2 rounded bg-primary/20 text-primary font-mono">
                                                custom
                                            </span>
                                        )}
                                        {isColorSelected && (
                                            <span className="text-[10px] opacity-75 font-mono">
                                                {isCustomBgActive ? '(Aksen)' : '✓'}
                                            </span>
                                        )}
                                    </button>
                                )
                            })}
                        </div>

                        <span className="text-[11px] text-muted-foreground hidden sm:inline">
                            ⚙️ Brand & Reff di <span className="font-medium text-foreground">Settings</span>
                        </span>
                    </div>

                    {/* Grup 2: Galeri Wallpaper Kustom */}
                    <div className="flex items-center gap-2 flex-wrap pt-1 border-t border-border/20">
                        <span className="text-xs font-semibold text-muted-foreground mr-1 flex items-center gap-1">
                            <span>🖼️</span>
                            <span>Wallpaper:</span>
                        </span>

                        {/* Opsi Polos (Gunakan Warna Tema Saja) */}
                        <button
                            type="button"
                            onClick={() => setIsCustomBgActive(false)}
                            className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium border transition-all ${
                                !isCustomBgActive
                                    ? 'border-primary bg-primary/20 text-foreground font-bold shadow-xs ring-1 ring-primary/50'
                                    : 'border-border/60 bg-muted/20 text-muted-foreground hover:text-foreground hover:border-border'
                            }`}
                            title="Gunakan latar belakang warna solid/gradien dari tema di atas"
                        >
                            <span>🚫</span>
                            <span>Warna Tema Polos</span>
                        </button>

                        {customBgList.map((bgItem) => {
                            const isSelected = isCustomBgActive && selectedCustomBgId === bgItem.id
                            return (
                                <button
                                    key={bgItem.id}
                                    type="button"
                                    onClick={() => {
                                        setSelectedCustomBgId(bgItem.id)
                                        setIsCustomBgActive(true)
                                    }}
                                    className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-medium border transition-all ${
                                        isSelected
                                            ? 'border-primary bg-primary/20 text-foreground font-bold shadow-xs ring-1 ring-primary/50'
                                            : 'border-border/60 bg-muted/20 text-muted-foreground hover:text-foreground hover:border-border'
                                    }`}
                                >
                                    <img
                                        src={bgItem.dataUrl}
                                        alt={bgItem.name}
                                        className="w-4 h-4 rounded object-cover border border-white/20"
                                    />
                                    <span className="truncate max-w-[100px]">{bgItem.name}</span>
                                </button>
                            )
                        })}

                        {/* Hidden input file untuk upload */}
                        <input
                            ref={uploadBgModalInputRef}
                            type="file"
                            accept="image/*"
                            onChange={(e) => {
                                handleUploadNewBg(e.target.files?.[0])
                                if (uploadBgModalInputRef.current) uploadBgModalInputRef.current.value = ''
                            }}
                            className="hidden"
                        />

                        {/* Tombol Upload Cepat Langsung di Modal */}
                        <button
                            type="button"
                            onClick={() => uploadBgModalInputRef.current?.click()}
                            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold border border-dashed border-border bg-muted/30 text-muted-foreground hover:text-primary hover:border-primary/60 transition-all"
                            title="Upload gambar wallpaper baru ke koleksi Anda"
                        >
                            <span>+ Upload BG</span>
                        </button>
                    </div>

                    <div className="text-[11px] text-muted-foreground/80 italic flex items-center gap-1">
                        <span>💡</span>
                        <span>
                            {isCustomBgActive
                                ? `Wallpaper kustom aktif. Skema warna '${bg.label}' mengatur warna aksen PnL & teks.`
                                : `Menggunakan latar belakang warna murni '${bg.label}'.`}
                        </span>
                    </div>
                </div>

                {/* ── TOGGLE OPTIONS & CATATAN TRADER ── */}
                <div className="border-t border-border/40 px-2 pt-2.5 flex flex-col gap-2.5">
                    <div className="flex flex-wrap gap-x-5 gap-y-2">
                        {([
                            ['Profil Trader', showProfile, setShowProfile],
                            ['Watermark', showWatermark, setShowWatermark],
                            ['Kurva Equity', showChart, setShowChart],
                            ['Sembunyikan Nominal ($)', hideNominal, setHideNominal],
                            ['Kode Referral', showReferral, setShowReferral],
                        ] as [string, boolean, (v: boolean) => void][]).map(([label, checked, setter]) => (
                            <label key={label} className="flex cursor-pointer items-center gap-1.5 text-xs select-none">
                                <span
                                    className="inline-flex items-center justify-center rounded w-4 h-4 flex-shrink-0 transition-colors"
                                    style={{
                                        background: checked ? accent : 'transparent',
                                        border: `1.5px solid ${checked ? accent : 'rgba(148,163,184,0.5)'}`,
                                    }}
                                    onClick={() => setter(!checked)}
                                >
                                    {checked && (
                                        <svg viewBox="0 0 12 12" width="10" height="10" fill="none">
                                            <path d="M2 6l3 3 5-5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                        </svg>
                                    )}
                                </span>
                                <span className="text-foreground font-medium">{label}</span>
                            </label>
                        ))}
                    </div>

                    {/* Baris Input Label Periode & Catatan Trader */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1">
                        <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground whitespace-nowrap">Label Periode:</span>
                            <input
                                type="text"
                                value={periodLabel}
                                onChange={(e) => setPeriodLabel(e.target.value)}
                                placeholder="All-Time Performance"
                                className="w-full rounded-md border border-border/60 bg-background px-2.5 py-1 text-xs text-foreground focus:border-primary focus:outline-none"
                            />
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground whitespace-nowrap">Catatan/Quote:</span>
                            <input
                                type="text"
                                value={customTraderNote}
                                onChange={(e) => setCustomTraderNote(e.target.value)}
                                placeholder="Contoh: Disiplin pada trading plan..."
                                className="w-full rounded-md border border-border/60 bg-background px-2.5 py-1 text-xs text-foreground focus:border-primary focus:outline-none"
                            />
                        </div>
                    </div>
                </div>

                {/* ── INFO PORTOFOLIO / FOOTER KONTROL ── */}
                <div className="flex items-center justify-between gap-3 px-3 py-2 border-t border-border/40 bg-card/20 rounded-lg">
                    <div className="flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
                            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                            Portofolio: Semua Akun / Multi-Exchange
                        </span>
                        {showReferral && activeReferral && (
                            <span className="text-[11px] font-semibold text-sky-400 ml-1">
                                (Kode Reff: {activeReferral})
                            </span>
                        )}
                    </div>

                    <div className="text-xs text-muted-foreground">
                        Trader: <span className="font-semibold text-foreground">{traderHandle}</span>
                    </div>
                </div>

                {/* ── ACTION BUTTONS ── */}
                <div className="flex items-center justify-between gap-3 px-2 py-2 border-t border-border/40">
                    {[
                        {
                            icon: (
                                <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8">
                                    <path d="M4 14l6 6 6-6" />
                                    <path d="M10 3v17" />
                                    <path d="M2 17v1a2 2 0 002 2h12a2 2 0 002-2v-1" />
                                </svg>
                            ),
                            label: downloading ? 'Menyimpan...' : 'Save PNG (HQ)',
                            onClick: () => void handleDownload(),
                            disabled: downloading
                        },
                        {
                            icon: (
                                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8">
                                    <rect x="9" y="9" width="13" height="13" rx="2" />
                                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                                </svg>
                            ),
                            label: copied ? 'Tersalin ke Clipboard!' : 'Copy Image',
                            onClick: () => void handleCopy(),
                            disabled: false
                        },
                        {
                            icon: (
                                <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                                </svg>
                            ),
                            label: 'Share Twitter / X',
                            onClick: handleTwitterShare,
                            disabled: false
                        }
                    ].map(({ icon, label, onClick, disabled }) => (
                        <button
                            key={label}
                            type="button"
                            onClick={onClick}
                            disabled={disabled}
                            className="flex flex-1 flex-col items-center gap-1 py-2 text-foreground/85 hover:text-foreground transition-all rounded-xl hover:bg-muted/40 disabled:opacity-50"
                        >
                            <div
                                className="flex h-9 w-9 items-center justify-center rounded-full transition-transform hover:scale-105"
                                style={{ background: 'rgba(255, 255, 255, 0.08)', color: accent }}
                            >
                                {icon}
                            </div>
                            <span className="text-[11px] font-medium leading-tight">{label}</span>
                        </button>
                    ))}
                </div>
            </div>
        </Modal>
    )
}
