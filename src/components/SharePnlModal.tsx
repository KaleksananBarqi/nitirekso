import { useCallback, useEffect, useRef, useState } from 'react'
import { type TradeDetail, computePlannedRR } from '@shared/domain'
import { Modal } from './ui'
import { formatDuration } from '../lib/format'
import { cn } from '../lib/utils'
import {
    BUILTIN_TEMPLATES,
    EXCHANGES,
    loadShareSettings,
    saveShareSettings,
    loadCustomBgList,
    initIndexedDbCustomBg,
    addCustomBgItem,
    updateCustomBgItem,
    deleteCustomBgItem,
    getAllShareTemplates,
    saveCustomShareTemplate,
    deleteCustomShareTemplate,
    getActiveTemplateId,
    setActiveTemplateId,
    getAllBgTemplates,
    resolveMediaType,
    getPlayableMediaUrl,
    type BgTemplate,
    type ExchangeName,
    type ShareCardTemplate,
    type CustomBgItem,
    type BgDimmingDirection,
    type ExportAspect,
    type FrameBgSource,
    type VideoDurationMode,
    VIDEO_DURATION_OPTIONS
} from '../lib/shareSettings'
import { nitireksoLogo, getExchangeDefaultLogo } from '../lib/exchangeAssets'
import { composeAspectFrame } from '../lib/share-frame'
import { SharePnlErrorCode, logSharePnlError, getSharePnlUserMessage } from '../lib/shareErrorCodes'
import { BackgroundAdjustBar } from './share/BackgroundAdjustBar'
import { AspectFrameControls } from './share/AspectFrameControls'
import { CaptionMakerPanel } from './share/CaptionMakerPanel'
import { PnlCard } from './share/PnlCard'
import { buildCaptionContext, renderCaption } from '../lib/caption-generator'
import { useHidePnl } from '../hooks/useHidePnl'
import {
    CardCanvasEngine,
    buildPnlCardSpec,
    getGradientDimmingStyle,
    applyCanvasDimming,
    exportCardMedia,
    MediaExportService
} from '../lib/share'

// ---------------------------------------------------------------------------
// Re-export Helper Dimming Gradient & Canvas (Kompatibilitas Antarmuka Modul)
// ---------------------------------------------------------------------------

export { getGradientDimmingStyle, applyCanvasDimming }

// ---------------------------------------------------------------------------
// Tipe Props
// ---------------------------------------------------------------------------

export interface SharePnlModalProps {
    trade?: TradeDetail | null
    detail?: TradeDetail | null
    isOpen?: boolean
    onClose: () => void
}

// ---------------------------------------------------------------------------
// Entry Point Modal
// ---------------------------------------------------------------------------

export function SharePnlModal({ trade: propTrade, detail: propDetail, isOpen = true, onClose }: SharePnlModalProps): React.JSX.Element | null {
    const trade = propTrade || propDetail
    if (!isOpen || !trade) return null
    return <SharePnlModalContent trade={trade} onClose={onClose} />
}

// ---------------------------------------------------------------------------
// Komponen Utama Modal
// ---------------------------------------------------------------------------

function SharePnlModalContent({ trade, onClose }: { trade: TradeDetail; onClose: () => void }): React.JSX.Element {
    const { hidePnl } = useHidePnl()

    // --- Kalkulasi Metrik Finansial ---
    const isWin = trade.trade.realizedPnl >= 0
    const leverage = trade.trade.leverage || 1
    const margin = trade.trade.entryPrice > 0
        ? (trade.trade.size * trade.trade.entryPrice) / leverage
        : 0
    const roiPercent = margin > 0 ? (trade.trade.realizedPnl / margin) * 100 : 0
    const duration = formatDuration(trade.trade.entryTime, trade.trade.exitTime)

    // --- Muat Konfigurasi Branding, Template & Galeri Background dari Storage ---
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

    // --- State: Background & Galeri ---
    const initialCustomBgId = activeTemplate?.customBgId || savedSettings.customBgId || (customBgList[0]?.id ?? null)
    const [selectedBgIdx, setSelectedBgIdx] = useState<number>(initialBgIdx)
    const [selectedCustomBgId, setSelectedCustomBgId] = useState<string | null>(initialCustomBgId)
    const [isCustomBgActive, setIsCustomBgActive] = useState<boolean>(
        activeTemplate ? (activeTemplate.isCustomBg && (!!activeTemplate.customBgId || customBgList.length > 0)) : (savedSettings.isCustomBg && customBgList.length > 0)
    )

    // Wallpaper kustom yang sedang aktif
    const activeCustomBgItem = customBgList.find((b) => b.id === selectedCustomBgId) || customBgList[0] || null
    const activeCustomBgUrl = activeCustomBgItem ? (activeCustomBgItem.blobUrl || activeCustomBgItem.dataUrl) : (savedSettings.customBgUrl || null)
    const activeCustomBgMediaType = resolveMediaType(activeCustomBgItem?.mediaType, activeCustomBgUrl, 'image')
    const activeCustomBgPlayableUrl = getPlayableMediaUrl(activeCustomBgUrl, activeCustomBgMediaType)

    // State: Dimming & Arah Gradien Reaktif Langsung di Modal
    const [bgDimming, setBgDimming] = useState<number>(() => (savedSettings.bgDimming !== undefined ? savedSettings.bgDimming : 75))
    const [bgDimmingDirection, setBgDimmingDirection] = useState<BgDimmingDirection>(() => savedSettings.bgDimmingDirection || 'uniform')

    // State: Opsi Rasio Video 9:16 TikTok & Frame Backdrop
    const [exportAspect, setExportAspect] = useState<ExportAspect>(() => savedSettings.exportAspect || 'original')
    const [frameBgSource, setFrameBgSource] = useState<FrameBgSource>(() => savedSettings.frameBgSource || 'card-blur')
    const [frameBlur, setFrameBlur] = useState<number>(() => savedSettings.frameBlur ?? 25)
    const [frameDim, setFrameDim] = useState<number>(() => savedSettings.frameDim ?? 40)

    // State: Caption Maker Preset ID
    const [captionPresetId, setCaptionPresetId] = useState<string>(() => savedSettings.captionPresetId || 'tiktok-jurnal')

    // State: Opsi Durasi Ekspor Video (source, 15s, 30s, 60s) & Deteksi Durasi Sumber
    const [videoDurationMode, setVideoDurationMode] = useState<VideoDurationMode>(
        () => savedSettings.videoDurationMode || 'source'
    )
    const [sourceVideoDurationSec, setSourceVideoDurationSec] = useState<number | null>(null)

    // State: Konfirmasi Hapus Background Kustom Inline
    const [confirmDeleteBgId, setConfirmDeleteBgId] = useState<string | null>(null)

    // --- State: Posisi Wallpaper Kustom (Pan X & Pan Y dalam %) ---
    const initialBgPosX = activeTemplate?.bgPosX ?? activeCustomBgItem?.bgPosX ?? savedSettings.bgPosX ?? 50
    const initialBgPosY = activeTemplate?.bgPosY ?? activeCustomBgItem?.bgPosY ?? savedSettings.bgPosY ?? 50
    const [bgPosX, setBgPosX] = useState<number>(initialBgPosX)
    const [bgPosY, setBgPosY] = useState<number>(initialBgPosY)
    const [isSavedDefaultBgPos, setIsSavedDefaultBgPos] = useState<boolean>(false)
    const [confirmDeleteTplId, setConfirmDeleteTplId] = useState<string | null>(null)

    // Ref dan state untuk Drag-to-Pan Background Live Preview
    const cardContainerRef = useRef<HTMLDivElement>(null)
    const [isDraggingBg, setIsDraggingBg] = useState<boolean>(false)
    const dragStartRef = useRef<{ x: number; y: number; startBgPosX: number; startBgPosY: number } | null>(null)

    const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
        if (!isCustomBgActive) return
        const target = e.target as HTMLElement
        if (target.closest('button, input, select, textarea, a')) return

        setIsDraggingBg(true)
        dragStartRef.current = {
            x: e.clientX,
            y: e.clientY,
            startBgPosX: bgPosX,
            startBgPosY: bgPosY,
        }
        ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    }

    const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
        if (!isDraggingBg || !dragStartRef.current) return
        const container = cardContainerRef.current
        if (!container) return

        const rect = container.getBoundingClientRect()
        const deltaX = e.clientX - dragStartRef.current.x
        const deltaY = e.clientY - dragStartRef.current.y

        // Sensitivitas drag: 1x lebar container = 100% pergeseran
        const moveRatioX = (deltaX / rect.width) * 100
        const moveRatioY = (deltaY / rect.height) * 100

        const nextX = Math.round(Math.max(0, Math.min(100, dragStartRef.current.startBgPosX - moveRatioX)))
        const nextY = Math.round(Math.max(0, Math.min(100, dragStartRef.current.startBgPosY - moveRatioY)))

        setBgPosX(nextX)
        setBgPosY(nextY)
    }

    const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
        if (isDraggingBg) {
            setIsDraggingBg(false)
            dragStartRef.current = null
            try {
                ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
            } catch {
                // Abaikan jika pointer capture gagal dilepas
            }
        }
    }

    const handleSaveDefaultBgPos = () => {
        if (!selectedCustomBgId) return
        updateCustomBgItem(selectedCustomBgId, { bgPosX, bgPosY })
        setCustomBgList(loadCustomBgList())
        setIsSavedDefaultBgPos(true)
        setTimeout(() => setIsSavedDefaultBgPos(false), 2000)
    }

    const bg: BgTemplate = allBgTemplates[selectedBgIdx] ?? allBgTemplates[0]!
    const accent = isWin ? bg.accentProfit : bg.accentLoss

    // Data Identitas & Branding dari Settings
    const avatarUrl = savedSettings.avatarUrl
    const traderHandle = savedSettings.traderHandle
    const brandTitle = savedSettings.brandTitle || 'NITIREKSO'
    const brandSubtitle = savedSettings.brandSubtitle || 'JOURNAL'

    // Data Planned Risk
    const plannedStop = trade.plannedRisk?.plannedStop ?? null
    const plannedTarget = trade.plannedRisk?.plannedTarget ?? null
    const plannedRr = trade.plannedRisk?.plannedRr ?? computePlannedRR(
        trade.trade.direction,
        trade.trade.entryPrice,
        plannedStop,
        plannedTarget
    )

    // Data Jurnal (Setup, Grade, Emosi)
    const setupTag = trade.journal?.setupTag ?? null
    const executionGrade = trade.journal?.executionGrade ?? null
    const emotionTag = trade.journal?.emotionTag ?? null

    // Default exchange berdasarkan trade (mexc, bitunix, bybit, binance, bingx)
    const tradeEx = (trade.trade.exchange || '').toLowerCase()
    const defaultExchange: ExchangeName = (EXCHANGES as readonly string[]).includes(tradeEx)
        ? (tradeEx as ExchangeName)
        : 'mexc'
    const [selectedExchange, setSelectedExchange] = useState<ExchangeName>(defaultExchange)

    // --- State: Toggle Visibilitas Elemen ---
    const [showSide, setShowSide] = useState<boolean>(activeTemplate?.showSide ?? true)
    const [showPnl, setShowPnl] = useState<boolean>(activeTemplate?.showPnl ?? true)
    const [showRoi, setShowRoi] = useState<boolean>(activeTemplate?.showRoi ?? true)
    const [showTradeTimes, setShowTradeTimes] = useState<boolean>(activeTemplate?.showTradeTimes ?? savedSettings.showTradeTimes ?? true)
    const [showProfile, setShowProfile] = useState<boolean>(activeTemplate?.showProfile ?? true)
    const [showWatermark, setShowWatermark] = useState<boolean>(activeTemplate?.showWatermark ?? true)
    const [showDuration, setShowDuration] = useState<boolean>(activeTemplate?.showDuration ?? true)
    const [showPlan, setShowPlan] = useState<boolean>(activeTemplate?.showPlan ?? true)
    const [showSetup, setShowSetup] = useState<boolean>(activeTemplate ? activeTemplate.showSetup : !!setupTag)
    const [showGrade, setShowGrade] = useState<boolean>(activeTemplate ? activeTemplate.showGrade : !!executionGrade)
    const [showEmotion, setShowEmotion] = useState<boolean>(activeTemplate ? activeTemplate.showEmotion : !!emotionTag)
    const [showReferral, setShowReferral] = useState<boolean>(activeTemplate ? activeTemplate.showReferral : savedSettings.showReferral)
    const [showThesis, setShowThesis] = useState<boolean>(activeTemplate ? activeTemplate.showThesis : !!(trade.journal?.preTradeThesis))
    const [showReview, setShowReview] = useState<boolean>(activeTemplate ? activeTemplate.showReview : !!(trade.journal?.postTradeReview))

    // --- State: Opsi Tampilkan Semua Teks (Tanpa Terpotong) ---
    const [showFullText, setShowFullText] = useState<boolean>(activeTemplate ? activeTemplate.showFullText : savedSettings.showFullText)

    // --- State: Dialog Simpan Template Baru & Inline Actions ---
    const [isSaveModalOpen, setIsSaveModalOpen] = useState<boolean>(false)
    const [newTemplateName, setNewTemplateName] = useState<string>('')

    const uploadBgModalInputRef = useRef<HTMLInputElement>(null)

    // Upload background gambar atau video baru langsung dari modal
    const handleUploadNewBg = (file: File | undefined) => {
        if (!file) return
        const isImage = file.type.startsWith('image/') || /\.(png|jpe?g|webp|svg|gif|avif)$/i.test(file.name)
        const isVideo = file.type.startsWith('video/') || /\.(mp4|webm|mov|ogg)$/i.test(file.name)
        if (!isImage && !isVideo) {
            logSharePnlError(
                SharePnlErrorCode.UPLOAD_UNSUPPORTED_FORMAT,
                `Berkas "${file.name}" (${file.type || 'tipe tidak diketahui'}) ditolak`,
                { name: file.name, type: file.type, size: file.size },
                'WARN'
            )
            alert(getSharePnlUserMessage(SharePnlErrorCode.UPLOAD_UNSUPPORTED_FORMAT, 'Harap pilih berkas gambar (PNG, JPG, SVG, WebP) atau video (MP4, WebM).'))
            return
        }
        if (file.size > 25 * 1024 * 1024) {
            const sizeMb = (file.size / (1024 * 1024)).toFixed(2)
            logSharePnlError(
                SharePnlErrorCode.UPLOAD_FILE_SIZE_EXCEEDED,
                `Ukuran berkas "${file.name}" sebesar ${sizeMb}MB melebihi batas 25MB`,
                { name: file.name, size: file.size },
                'WARN'
            )
            alert(getSharePnlUserMessage(SharePnlErrorCode.UPLOAD_FILE_SIZE_EXCEEDED, `Ukuran berkas (${sizeMb}MB) melebihi batas maksimal 25MB.`))
            return
        }

        const detectedType: 'image' | 'video' = isVideo ? 'video' : 'image'
        const cleanName = file.name.replace(/\.[^/.]+$/, '').slice(0, 18) || `${detectedType === 'video' ? 'Video' : 'Wallpaper'} ${customBgList.length + 1}`

        if (isVideo) {
            // Untuk video: Buat Blob URL langsung agar instan diputar oleh player Chromium
            const blobUrl = URL.createObjectURL(file)
            const created = addCustomBgItem({
                name: cleanName,
                dataUrl: blobUrl,
                mediaType: 'video',
                blob: file,
                blobUrl
            })
            const updatedList = loadCustomBgList()
            setCustomBgList(updatedList)
            setSelectedCustomBgId(created.id)
            setIsCustomBgActive(true)
            setBgPosX(50)
            setBgPosY(50)
            saveShareSettings({
                customBgId: created.id,
                isCustomBg: true,
                customBgMediaType: 'video',
                customBgUrl: blobUrl,
                bgPosX: 50,
                bgPosY: 50
            })
            return
        }

        const reader = new FileReader()
        reader.onload = (e) => {
            const dataUrl = e.target?.result as string
            if (dataUrl) {
                const created = addCustomBgItem({ name: cleanName, dataUrl, mediaType: 'image', blob: file })
                const updatedList = loadCustomBgList()
                setCustomBgList(updatedList)
                setSelectedCustomBgId(created.id)
                setIsCustomBgActive(true)
                setBgPosX(50)
                setBgPosY(50)
                saveShareSettings({
                    customBgId: created.id,
                    isCustomBg: true,
                    customBgMediaType: 'image',
                    customBgUrl: created.dataUrl,
                    bgPosX: 50,
                    bgPosY: 50
                })
            }
        }
        reader.onerror = (err) => {
            logSharePnlError(
                SharePnlErrorCode.UPLOAD_READ_FAILED,
                `Gagal membaca berkas gambar "${file.name}" via FileReader`,
                err,
                'ERROR'
            )
        }
        reader.readAsDataURL(file)
    }

    // Hapus wallpaper kustom langsung dari modal
    const handleDeleteCustomBg = (id: string) => {
        deleteCustomBgItem(id)
        const updated = loadCustomBgList()
        setCustomBgList(updated)
        setConfirmDeleteBgId(null)
        if (selectedCustomBgId === id) {
            if (updated.length > 0) {
                const next = updated[0]!
                setSelectedCustomBgId(next.id)
                const px = next.bgPosX ?? 50
                const py = next.bgPosY ?? 50
                setBgPosX(px)
                setBgPosY(py)
                saveShareSettings({
                    customBgId: next.id,
                    customBgUrl: next.dataUrl,
                    customBgMediaType: resolveMediaType(next.mediaType, next.dataUrl, 'image'),
                    bgPosX: px,
                    bgPosY: py,
                })
            } else {
                setSelectedCustomBgId(null)
                setIsCustomBgActive(false)
                saveShareSettings({
                    isCustomBg: false,
                    customBgId: null,
                    customBgUrl: null,
                })
            }
        }
    }

    // Switch ke template terpilih
    const handleSelectTemplate = (tpl: ShareCardTemplate) => {
        setActiveTplId(tpl.id)
        setActiveTemplateId(tpl.id)
        const bgIdx = allBgTemplates.findIndex((b) => b.id === tpl.bgPresetId)
        if (bgIdx >= 0) setSelectedBgIdx(bgIdx)
        if (tpl.isCustomBg) {
            setIsCustomBgActive(true)
            if (tpl.customBgId) {
                setSelectedCustomBgId(tpl.customBgId)
            } else if (customBgList.length > 0) {
                setSelectedCustomBgId(customBgList[0]!.id)
            }
        } else {
            setIsCustomBgActive(false)
        }
        setBgPosX(tpl.bgPosX ?? 50)
        setBgPosY(tpl.bgPosY ?? 50)
        if (tpl.bgDimming !== undefined) setBgDimming(tpl.bgDimming)
        if (tpl.bgDimmingDirection !== undefined) setBgDimmingDirection(tpl.bgDimmingDirection)
        if (tpl.exportAspect !== undefined) setExportAspect(tpl.exportAspect)
        if (tpl.frameBgSource !== undefined) setFrameBgSource(tpl.frameBgSource)
        if (tpl.frameBlur !== undefined) setFrameBlur(tpl.frameBlur)
        if (tpl.frameDim !== undefined) setFrameDim(tpl.frameDim)
        if (tpl.captionPresetId !== undefined) setCaptionPresetId(tpl.captionPresetId)
        if (tpl.videoDurationMode !== undefined) setVideoDurationMode(tpl.videoDurationMode)
        setShowSide(tpl.showSide)
        setShowPnl(tpl.showPnl)
        setShowRoi(tpl.showRoi)
        setShowTradeTimes(tpl.showTradeTimes)
        setShowDuration(tpl.showDuration)
        setShowProfile(tpl.showProfile)
        setShowWatermark(tpl.showWatermark)
        setShowPlan(tpl.showPlan)
        setShowSetup(tpl.showSetup)
        setShowGrade(tpl.showGrade)
        setShowEmotion(tpl.showEmotion)
        setShowReferral(tpl.showReferral)
        setShowThesis(tpl.showThesis)
        setShowReview(tpl.showReview)
        setShowFullText(tpl.showFullText)
    }

    // Simpan konfigurasi saat ini sebagai template baru
    const handleSaveNewTemplate = () => {
        const trimmed = newTemplateName.trim()
        if (!trimmed) return
        const currentBgId = allBgTemplates[selectedBgIdx]?.id || 'dark-navy'
        const saved = saveCustomShareTemplate({
            name: trimmed,
            bgPresetId: currentBgId,
            customBgId: isCustomBgActive ? selectedCustomBgId : null,
            isCustomBg: isCustomBgActive,
            bgDimming,
            bgDimmingDirection,
            bgPosX,
            bgPosY,
            exportAspect,
            frameBgSource,
            frameBlur,
            frameDim,
            captionPresetId,
            showSide,
            showPnl,
            showRoi,
            showTradeTimes,
            showDuration,
            showProfile,
            showWatermark,
            showPlan,
            showSetup,
            showGrade,
            showEmotion,
            showReferral,
            showThesis,
            showReview,
            showFullText
        })
        const updated = getAllShareTemplates()
        setTemplates(updated)
        setActiveTplId(saved.id)
        setActiveTemplateId(saved.id)
        setNewTemplateName('')
        setIsSaveModalOpen(false)
    }

    // Perbarui konfigurasi template kustom aktif
    const handleUpdateActiveTemplate = () => {
        if (!activeTemplate || activeTemplate.isBuiltin) return
        const currentBgId = allBgTemplates[selectedBgIdx]?.id || 'dark-navy'
        saveCustomShareTemplate({
            id: activeTemplate.id,
            name: activeTemplate.name,
            bgPresetId: currentBgId,
            customBgId: isCustomBgActive ? selectedCustomBgId : null,
            isCustomBg: isCustomBgActive,
            bgDimming,
            bgDimmingDirection,
            bgPosX,
            bgPosY,
            exportAspect,
            frameBgSource,
            frameBlur,
            frameDim,
            captionPresetId,
            showSide,
            showPnl,
            showRoi,
            showTradeTimes,
            showDuration,
            showProfile,
            showWatermark,
            showPlan,
            showSetup,
            showGrade,
            showEmotion,
            showReferral,
            showThesis,
            showReview,
            showFullText
        })
        setTemplates(getAllShareTemplates())
    }

    // Hapus template kustom
    const handleDeleteTemplate = (id: string) => {
        deleteCustomShareTemplate(id)
        const updated = getAllShareTemplates()
        setTemplates(updated)
        const fallback = updated[0] || BUILTIN_TEMPLATES[0]!
        setActiveTplId(fallback.id)
        setActiveTemplateId(fallback.id)
        handleSelectTemplate(fallback)
    }

    // Deteksi apakah konfigurasi telah dimodifikasi dari template aktif
    const currentBgId = allBgTemplates[selectedBgIdx]?.id || 'dark-navy'
    const isModified = activeTemplate ? (
        activeTemplate.bgPresetId !== currentBgId ||
        activeTemplate.isCustomBg !== isCustomBgActive ||
        (isCustomBgActive && activeTemplate.customBgId !== selectedCustomBgId) ||
        (activeTemplate.bgPosX ?? 50) !== bgPosX ||
        (activeTemplate.bgPosY ?? 50) !== bgPosY ||
        (activeTemplate.bgDimming !== undefined && activeTemplate.bgDimming !== bgDimming) ||
        (activeTemplate.bgDimmingDirection !== undefined && activeTemplate.bgDimmingDirection !== bgDimmingDirection) ||
        (activeTemplate.exportAspect !== undefined && activeTemplate.exportAspect !== exportAspect) ||
        (activeTemplate.frameBgSource !== undefined && activeTemplate.frameBgSource !== frameBgSource) ||
        (activeTemplate.frameBlur !== undefined && activeTemplate.frameBlur !== frameBlur) ||
        (activeTemplate.frameDim !== undefined && activeTemplate.frameDim !== frameDim) ||
        (activeTemplate.captionPresetId !== undefined && activeTemplate.captionPresetId !== captionPresetId) ||
        activeTemplate.showSide !== showSide ||
        activeTemplate.showPnl !== showPnl ||
        activeTemplate.showRoi !== showRoi ||
        activeTemplate.showTradeTimes !== showTradeTimes ||
        activeTemplate.showDuration !== showDuration ||
        activeTemplate.showProfile !== showProfile ||
        activeTemplate.showWatermark !== showWatermark ||
        activeTemplate.showPlan !== showPlan ||
        activeTemplate.showSetup !== showSetup ||
        activeTemplate.showGrade !== showGrade ||
        activeTemplate.showEmotion !== showEmotion ||
        activeTemplate.showReferral !== showReferral ||
        activeTemplate.showThesis !== showThesis ||
        activeTemplate.showReview !== showReview ||
        activeTemplate.showFullText !== showFullText
    ) : false

    // --- State: Konten Teks Editable ---
    const [customThesis, setCustomThesis] = useState<string>(trade.journal?.preTradeThesis || '')
    const [customReview, setCustomReview] = useState<string>(trade.journal?.postTradeReview || '')

    // --- State: Status Aksi ---
    const [copySuccess, setCopySuccess] = useState(false)
    const [downloading, setDownloading] = useState(false)
    const [exportingGif, setExportingGif] = useState(false)
    const [gifProgress, setGifProgress] = useState(0)
    const [exportingVideo, setExportingVideo] = useState(false)
    const [videoProgress, setVideoProgress] = useState(0)
    const [videoQuality, setVideoQuality] = useState<'standard' | 'jernih' | 'super'>('jernih')

    // State pratinjau dan hasil penyimpanan video ekspor
    const [exportedVideoResult, setExportedVideoResult] = useState<{
        url: string
        blob: Blob
        filename: string
        savedPath: string | null
    } | null>(null)
    const [isSavingExportedAgain, setIsSavingExportedAgain] = useState(false)

    // Muat galeri wallpaper kustom dari IndexedDB (untuk video/gambar berukuran besar)
    useEffect(() => {
        void initIndexedDbCustomBg().then((items) => {
            if (items && items.length > 0) {
                setCustomBgList(items)
            }
        })
    }, [])

    // Logo & Referral aktif berdasarkan exchange terpilih (otomatis fallback ke logo resmi bawaan)
    const customExchangeLogo = (savedSettings[`${selectedExchange}LogoUrl` as keyof typeof savedSettings] as string | null) || null
    const activeLogoUrl = customExchangeLogo || getExchangeDefaultLogo(selectedExchange)
    const activeReferral = (savedSettings[`${selectedExchange}ReferralCode` as keyof typeof savedSettings] as string | null) || ''

    // Ref elemen canvas
    const canvasRef = useRef<HTMLCanvasElement>(null)

    // Preloader image & video refs untuk canvas export
    const avatarImgRef = useRef<HTMLImageElement | null>(null)
    const customBgImgRef = useRef<HTMLImageElement | null>(null)
    const offscreenBgVideoRef = useRef<HTMLVideoElement | null>(null)
    const domBgVideoRef = useRef<HTMLVideoElement | null>(null)
    const lastValidBgCanvasRef = useRef<HTMLCanvasElement | null>(null)
    const exchangeLogoImgRef = useRef<HTMLImageElement | null>(null)
    const nitireksoLogoImgRef = useRef<HTMLImageElement | null>(null)
    const [, setMediaVersion] = useState(0)
    const triggerCanvasRedraw = useCallback(() => setMediaVersion((v) => v + 1), [])

    // Preload logo Nitirekso (untuk watermark canvas)
    useEffect(() => {
        const img = new Image()
        img.crossOrigin = 'anonymous'
        img.src = nitireksoLogo
        img.onload = () => {
            nitireksoLogoImgRef.current = img
            triggerCanvasRedraw()
        }
    }, [triggerCanvasRedraw])

    // Preload gambar Avatar
    useEffect(() => {
        if (avatarUrl) {
            const img = new Image()
            img.crossOrigin = 'anonymous'
            img.src = avatarUrl
            img.onload = () => {
                avatarImgRef.current = img
                triggerCanvasRedraw()
            }
        } else {
            avatarImgRef.current = null
        }
    }, [avatarUrl, triggerCanvasRedraw])

    // Preload gambar atau video Custom Background Aktif untuk mesin canvas / video export
    useEffect(() => {
        const playableUrl = activeCustomBgPlayableUrl
        if (playableUrl) {
            if (activeCustomBgMediaType === 'video') {
                const vid = document.createElement('video')
                if (playableUrl.startsWith('http://') || playableUrl.startsWith('https://')) {
                    vid.crossOrigin = 'anonymous'
                }
                vid.src = playableUrl
                vid.preload = 'auto'
                vid.muted = true
                vid.defaultMuted = true
                vid.loop = true
                vid.playsInline = true

                // Pasang ke DOM secara tersembunyi agar WebView2/Chromium mengaktifkan hardware decoding surface
                vid.style.position = 'fixed'
                vid.style.top = '-9999px'
                vid.style.left = '-9999px'
                vid.style.width = '320px'
                vid.style.height = '180px'
                vid.style.opacity = '0'
                vid.style.pointerEvents = 'none'
                vid.style.zIndex = '-9999'
                document.body.appendChild(vid)
                offscreenBgVideoRef.current = vid

                const updateDuration = () => {
                    if (vid.duration && !isNaN(vid.duration) && isFinite(vid.duration) && vid.duration > 0) {
                        setSourceVideoDurationSec(Math.round(vid.duration))
                    }
                }
                vid.onerror = () => {
                    logSharePnlError(
                        SharePnlErrorCode.PLAYBACK_LOAD_FAILED,
                        `Gagal memuat berkas video latar belakang (${playableUrl.slice(0, 50)}...)`,
                        vid.error,
                        'WARN'
                    )
                }
                vid.onloadedmetadata = updateDuration
                vid.onloadeddata = () => {
                    offscreenBgVideoRef.current = vid
                    updateDuration()
                    void vid.play().catch((playErr) => {
                        logSharePnlError(
                            SharePnlErrorCode.PLAYBACK_LOAD_FAILED,
                            'Autoplay video preview ditahan oleh browser',
                            playErr,
                            'INFO'
                        )
                    })
                }
                vid.oncanplay = () => {
                    offscreenBgVideoRef.current = vid
                    updateDuration()
                    void vid.play().catch(() => {})
                }
                customBgImgRef.current = null

                return () => {
                    if (vid.parentNode) {
                        vid.parentNode.removeChild(vid)
                    }
                    try {
                        vid.pause()
                        vid.src = ''
                    } catch {}
                }
            } else {
                setSourceVideoDurationSec(null)
                const img = new Image()
                if (playableUrl.startsWith('http://') || playableUrl.startsWith('https://')) {
                    img.crossOrigin = 'anonymous'
                }
                img.src = playableUrl
                img.onload = () => {
                    customBgImgRef.current = img
                    triggerCanvasRedraw()
                }
                offscreenBgVideoRef.current = null
            }
        } else {
            setSourceVideoDurationSec(null)
            customBgImgRef.current = null
            offscreenBgVideoRef.current = null
        }
    }, [activeCustomBgPlayableUrl, activeCustomBgMediaType, triggerCanvasRedraw])

    // Preload logo exchange aktif
    useEffect(() => {
        if (activeLogoUrl) {
            const img = new Image()
            img.crossOrigin = 'anonymous'
            img.src = activeLogoUrl
            img.onload = () => {
                exchangeLogoImgRef.current = img
                triggerCanvasRedraw()
            }
        } else {
            exchangeLogoImgRef.current = null
        }
    }, [activeLogoUrl, triggerCanvasRedraw])

    // -----------------------------------------------------------------------
    // Pembangun Spesifikasi Render & Delegasi ke CardCanvasEngine
    // -----------------------------------------------------------------------
    const buildCurrentSpec = useCallback(() => {
        let customMedia: CanvasImageSource | null = null
        if (isCustomBgActive) {
            const activeVid = offscreenBgVideoRef.current || domBgVideoRef.current
            if (activeCustomBgMediaType === 'video' && activeVid) {
                const hasValidFrame = (activeVid.videoWidth > 0 && activeVid.videoHeight > 0) || activeVid.readyState >= 1
                if (hasValidFrame) {
                    customMedia = activeVid
                    if (!lastValidBgCanvasRef.current) {
                        lastValidBgCanvasRef.current = document.createElement('canvas')
                    }
                    const vidW = activeVid.videoWidth || 1920
                    const vidH = activeVid.videoHeight || 1080
                    if (lastValidBgCanvasRef.current.width !== vidW || lastValidBgCanvasRef.current.height !== vidH) {
                        lastValidBgCanvasRef.current.width = vidW
                        lastValidBgCanvasRef.current.height = vidH
                    }
                    const cacheCtx = lastValidBgCanvasRef.current.getContext('2d')
                    if (cacheCtx) {
                        try {
                            cacheCtx.drawImage(activeVid, 0, 0)
                        } catch {
                            // Abaikan jika frame belum siap
                        }
                    }
                } else if (lastValidBgCanvasRef.current) {
                    customMedia = lastValidBgCanvasRef.current
                }
            } else if (customBgImgRef.current && customBgImgRef.current.complete) {
                customMedia = customBgImgRef.current
            }
        }

        return buildPnlCardSpec({
            trade,
            bg,
            isCustomBgActive,
            customMedia,
            bgDimming,
            bgDimmingDirection,
            bgPosX,
            bgPosY,
            brandTitle,
            brandSubtitle,
            traderHandle,
            selectedExchange,
            activeReferral,
            exchangeLogo: (exchangeLogoImgRef.current && exchangeLogoImgRef.current.complete) ? exchangeLogoImgRef.current : null,
            avatarImage: (avatarImgRef.current && avatarImgRef.current.complete) ? avatarImgRef.current : null,
            watermarkLogo: (nitireksoLogoImgRef.current && nitireksoLogoImgRef.current.complete) ? nitireksoLogoImgRef.current : null,
            showProfile,
            showWatermark,
            showReferral,
            showSide,
            showPnl,
            showRoi,
            showTradeTimes,
            showDuration,
            showPlan,
            plannedStop,
            plannedTarget,
            plannedRr,
            showSetup,
            setupTag,
            showGrade,
            executionGrade,
            showEmotion,
            emotionTag,
            showThesis,
            customThesis,
            showReview,
            customReview,
            showFullText,
            roiPercent,
            duration,
            leverage,
            hideNominal: hidePnl,
        })
    }, [
        trade, bg, isCustomBgActive, activeCustomBgMediaType,
        bgDimming, bgDimmingDirection, bgPosX, bgPosY,
        brandTitle, brandSubtitle, traderHandle, selectedExchange, activeReferral,
        showProfile, showWatermark, showReferral,
        showSide, showPnl, showRoi, showTradeTimes, showDuration,
        showPlan, plannedStop, plannedTarget, plannedRr,
        showSetup, setupTag, showGrade, executionGrade, showEmotion, emotionTag,
        showThesis, customThesis, showReview, customReview, showFullText,
        roiPercent, duration, leverage, hidePnl,
    ])

    const drawToCanvas = useCallback((targetCanvas?: HTMLCanvasElement): HTMLCanvasElement => {
        const canvas = targetCanvas || canvasRef.current || document.createElement('canvas')
        const spec = buildCurrentSpec()
        CardCanvasEngine.render(spec, canvas)
        return canvas
    }, [buildCurrentSpec])

    // Update canvas preview saat parameter berubah
    useEffect(() => {
        drawToCanvas()
    }, [drawToCanvas])

    // Mengambil elemen media latar belakang aktif (video atau gambar)
    const getActiveWallpaperMedia = useCallback(() => {
        return activeCustomBgMediaType === 'video'
            ? ((offscreenBgVideoRef.current && (offscreenBgVideoRef.current.videoWidth > 0 || offscreenBgVideoRef.current.readyState >= 1))
                ? offscreenBgVideoRef.current
                : (domBgVideoRef.current && (domBgVideoRef.current.videoWidth > 0 || domBgVideoRef.current.readyState >= 1))
                    ? domBgVideoRef.current
                    : (lastValidBgCanvasRef.current || null))
            : (customBgImgRef.current || null)
    }, [activeCustomBgMediaType])

    // Mendapatkan canvas final yang telah dikomposisikan dengan rasio aspek yang dipilih (misal TikTok 9:16)
    const getFinalRenderCanvas = useCallback((): HTMLCanvasElement => {
        const rawCardCanvas = drawToCanvas()
        if (exportAspect === '9:16') {
            const targetCanvas = document.createElement('canvas')
            const activeWp = getActiveWallpaperMedia()

            try {
                composeAspectFrame(rawCardCanvas, targetCanvas, {
                    aspect: '9:16',
                    bgSource: frameBgSource,
                    blurPx: frameBlur,
                    dimPercent: frameDim,
                    wallpaperSource: isCustomBgActive ? activeWp : null,
                })
            } catch (err) {
                logSharePnlError(
                    SharePnlErrorCode.CANVAS_RENDER_FAILED,
                    'Gagal mengomposisikan framing 9:16 pada kanvas ekspor',
                    err,
                    'ERROR'
                )
                return rawCardCanvas
            }
            return targetCanvas
        }
        return rawCardCanvas
    }, [drawToCanvas, exportAspect, getActiveWallpaperMedia, frameBgSource, frameBlur, frameDim, isCustomBgActive])

    const handleDownload = async () => {
        setDownloading(true)
        try {
            const spec = buildCurrentSpec()
            const activeWp = getActiveWallpaperMedia()
            await exportCardMedia({
                spec,
                format: 'png',
                aspect: exportAspect,
                frameBgSource,
                frameBlur,
                frameDim,
                wallpaperMediaElement: isCustomBgActive ? activeWp : null,
            })
        } catch (err) {
            logSharePnlError(
                SharePnlErrorCode.FILE_SAVE_FAILED,
                'Gagal menghasilkan atau mengunduh berkas gambar PNG kartu',
                err,
                'ERROR'
            )
        } finally {
            setDownloading(false)
        }
    }

    // Menghitung durasi efektif ekspor video dalam detik
    const getEffectiveDurationSec = (): number => {
        if (videoDurationMode === '15') return 15
        if (videoDurationMode === '30') return 30
        if (videoDurationMode === '60') return 60

        // Mode 'source': gunakan durasi video latar belakang jika tersedia
        if (activeCustomBgMediaType === 'video') {
            const liveDuration = offscreenBgVideoRef.current?.duration || domBgVideoRef.current?.duration
            if (liveDuration && !isNaN(liveDuration) && isFinite(liveDuration) && liveDuration > 0) {
                // Batas aman maksimal 300 detik (5 menit) dan minimal 3 detik
                return Math.min(300, Math.max(3, Math.round(liveDuration)))
            }
            if (sourceVideoDurationSec && sourceVideoDurationSec > 0) {
                return Math.min(300, Math.max(3, sourceVideoDurationSec))
            }
        }

        // Fallback default jika bukan video atau belum terbaca
        return 15
    }

    const handleExportVideo = async () => {
        setExportingVideo(true)
        setVideoProgress(0)
        try {
            const spec = buildCurrentSpec()
            const activeWp = getActiveWallpaperMedia()
            const effectiveSec = getEffectiveDurationSec()
            const durationMs = effectiveSec * 1000

            let fps = 30
            let videoBitsPerSecond = 8_000_000
            if (videoQuality === 'standard') {
                fps = 30
                videoBitsPerSecond = 2_500_000
            } else if (videoQuality === 'super') {
                fps = 60
                videoBitsPerSecond = 16_000_000
            }

            const result = await exportCardMedia({
                spec,
                format: 'mp4',
                aspect: exportAspect,
                durationMs,
                fps,
                videoBitsPerSecond,
                frameBgSource,
                frameBlur,
                frameDim,
                wallpaperMediaElement: isCustomBgActive ? activeWp : null,
                wallpaperAudioUrl: (isCustomBgActive && activeCustomBgMediaType === 'video' && activeCustomBgUrl) ? activeCustomBgUrl : undefined,
                onProgress: (pct) => setVideoProgress(pct),
            })

            const previewUrl = URL.createObjectURL(result.blob)
            setExportedVideoResult({
                url: previewUrl,
                blob: result.blob,
                filename: result.filename,
                savedPath: result.savedFilePath ?? null
            })
        } catch (err) {
            logSharePnlError(
                SharePnlErrorCode.VIDEO_ENCODE_FRAME_FAILED,
                'Proses ekspor video kartu Share PnL gagal',
                err,
                'ERROR'
            )
        } finally {
            setExportingVideo(false)
            setVideoProgress(0)
        }
    }

    // Simpan ulang berkas video yang telah selesai diekspor ke folder pilihan lain
    const handleSaveExportedAgain = async () => {
        if (!exportedVideoResult) return
        setIsSavingExportedAgain(true)
        try {
            const savedPath = await MediaExportService.saveMedia(
                exportedVideoResult.filename,
                exportedVideoResult.blob
            )
            if (savedPath) {
                setExportedVideoResult((prev) => prev ? { ...prev, savedPath } : null)
            }
        } catch (e) {
            logSharePnlError(
                SharePnlErrorCode.FILE_SAVE_FAILED,
                'Gagal menyimpan ulang berkas video hasil ekspor',
                e,
                'ERROR'
            )
        } finally {
            setIsSavingExportedAgain(false)
        }
    }

    const handleExportGif = async () => {
        setExportingGif(true)
        setGifProgress(0)
        try {
            const spec = buildCurrentSpec()
            const activeWp = getActiveWallpaperMedia()
            await exportCardMedia({
                spec,
                format: 'gif',
                aspect: exportAspect,
                durationMs: 2000,
                fps: 8,
                frameBgSource,
                frameBlur,
                frameDim,
                wallpaperMediaElement: isCustomBgActive ? activeWp : null,
                onProgress: (pct) => setGifProgress(pct),
            })
        } catch (err) {
            logSharePnlError(
                SharePnlErrorCode.VIDEO_ENCODE_FRAME_FAILED,
                'Gagal mengekspor kartu ke animasi GIF',
                err,
                'ERROR'
            )
        } finally {
            setExportingGif(false)
            setGifProgress(0)
        }
    }

    const handleCopy = async () => {
        try {
            const canvas = getFinalRenderCanvas()
            canvas.toBlob(async (blob) => {
                if (!blob) {
                    logSharePnlError(
                        SharePnlErrorCode.CLIPBOARD_COPY_FAILED,
                        'Konversi kanvas kartu ke Blob PNG menghasilkan nilai kosong (null)',
                        null,
                        'ERROR'
                    )
                    return
                }
                try {
                    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
                    setCopySuccess(true)
                    setTimeout(() => setCopySuccess(false), 2500)
                } catch (err) {
                    logSharePnlError(
                        SharePnlErrorCode.CLIPBOARD_COPY_FAILED,
                        'Gagal menyalin gambar ke clipboard sistem',
                        err,
                        'ERROR'
                    )
                }
            }, 'image/png')
        } catch (err) {
            logSharePnlError(
                SharePnlErrorCode.CLIPBOARD_COPY_FAILED,
                'Gagal memproses gambar kartu untuk clipboard',
                err,
                'ERROR'
            )
        }
    }

    // -----------------------------------------------------------------------
    // Render Modal UI
    // -----------------------------------------------------------------------
    return (
        <Modal
            isOpen={true}
            onClose={onClose}
            title="Profit Sharing Card"
            size="xl"
        >
            <div className="flex flex-col gap-0 max-h-[85vh] overflow-y-auto">
                {/* ── CARD LIVE PREVIEW DENGAN DRAG-TO-PAN ── */}
                <div className="p-3 bg-muted/20 rounded-2xl flex flex-col items-center justify-center gap-1.5">
                    {/* Petunjuk Drag Reposisi saat wallpaper kustom aktif */}
                    {isCustomBgActive && (
                        <div className="flex items-center justify-between w-full max-w-[540px] px-1 text-[11px] text-muted-foreground select-none">
                            <span className="flex items-center gap-1.5">
                                <span className="text-primary font-bold">✋ Geser Wallpaper:</span>
                                <span>Tarik langsung kartu di bawah untuk mengubah sudut pandang</span>
                            </span>
                            <div className="flex items-center gap-2">
                                <span className="font-mono text-[10px] bg-background/80 px-2 py-0.5 rounded border border-border/60">
                                    X: {bgPosX}% | Y: {bgPosY}%
                                </span>
                                {(bgPosX !== 50 || bgPosY !== 50) && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setBgPosX(50)
                                            setBgPosY(50)
                                        }}
                                        className="text-[10px] text-primary hover:underline"
                                    >
                                        ↺ 50%
                                    </button>
                                )}
                            </div>
                        </div>
                    )}

                    {exportAspect === '9:16' ? (
                        <div className="relative mx-auto w-full max-w-[340px] aspect-[9/16] rounded-2xl overflow-hidden border border-border shadow-2xl flex items-center justify-center select-none bg-slate-950">
                            {/* Backdrop Blur 9:16 */}
                            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                                {frameBgSource === 'wallpaper-blur' && isCustomBgActive && activeCustomBgUrl ? (
                                    activeCustomBgMediaType === 'video' ? (
                                        <video
                                            src={activeCustomBgPlayableUrl || activeCustomBgUrl || ''}
                                            autoPlay
                                            muted
                                            loop
                                            playsInline
                                            className="absolute inset-0 w-full h-full object-cover scale-125"
                                            style={{ filter: `blur(${frameBlur}px)` }}
                                        />
                                    ) : (
                                        <div
                                            className="absolute inset-0 w-full h-full bg-cover bg-center scale-125"
                                            style={{
                                                backgroundImage: `url(${activeCustomBgUrl})`,
                                                filter: `blur(${frameBlur}px)`
                                            }}
                                        />
                                    )
                                ) : (
                                    <div
                                        className="absolute inset-0 w-full h-full scale-125"
                                        style={{
                                            background: bg.bg,
                                            filter: `blur(${frameBlur}px)`
                                        }}
                                    />
                                )}
                                <div
                                    className="absolute inset-0"
                                    style={{ backgroundColor: `rgba(0,0,0,${frameDim / 100})` }}
                                />
                            </div>

                            {/* Badge Indikator TikTok 9:16 */}
                            <div className="absolute top-2.5 left-2.5 z-20 flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-black/60 backdrop-blur text-[10px] text-amber-400 font-semibold border border-amber-400/30">
                                <span>📱 Rasio TikTok 9:16</span>
                            </div>

                            {/* Kartu PnlCard Normal di tengah bingkai vertikal 9:16 sebagai Floating Overlay */}
                            <div
                                ref={cardContainerRef}
                                onPointerDown={handlePointerDown}
                                onPointerMove={handlePointerMove}
                                onPointerUp={handlePointerUp}
                                onPointerCancel={handlePointerUp}
                                className={cn(
                                    "absolute z-10 w-[500px] left-1/2 top-1/2 transition-all rounded-[26px]",
                                    isCustomBgActive && (
                                        isDraggingBg
                                            ? "cursor-grabbing touch-none ring-2 ring-primary/80 shadow-2xl"
                                            : "cursor-grab touch-none hover:ring-1 hover:ring-primary/40"
                                    )
                                )}
                                style={{
                                    transform: 'translate(-50%, -50%) scale(0.60)',
                                    transformOrigin: 'center center',
                                    boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.85), 0 0 25px rgba(0, 0, 0, 0.5)',
                                }}
                            >
                                <PnlCard
                                    trade={trade}
                                    bg={bg}
                                    accent={accent}
                                    roiPercent={roiPercent}
                                    duration={duration}
                                    leverage={leverage}
                                    selectedExchange={selectedExchange}
                                    traderHandle={traderHandle}
                                    brandTitle={brandTitle}
                                    brandSubtitle={brandSubtitle}
                                    activeLogoUrl={activeLogoUrl}
                                    activeReferral={activeReferral}
                                    avatarUrl={avatarUrl}
                                    isCustomBgActive={isCustomBgActive}
                                    customBgUrl={activeCustomBgPlayableUrl || activeCustomBgUrl}
                                    customBgMediaType={activeCustomBgMediaType}
                                    bgDimming={bgDimming}
                                    bgDimmingDirection={bgDimmingDirection}
                                    bgPosX={bgPosX}
                                    bgPosY={bgPosY}
                                    videoRef={domBgVideoRef}
                                    showSide={showSide}
                                    showPnl={showPnl}
                                    showRoi={showRoi}
                                    showTradeTimes={showTradeTimes}
                                    showProfile={showProfile}
                                    showWatermark={showWatermark}
                                    showDuration={showDuration}
                                    showPlan={showPlan}
                                    plannedStop={plannedStop}
                                    plannedTarget={plannedTarget}
                                    plannedRr={plannedRr}
                                    setupTag={setupTag}
                                    executionGrade={executionGrade}
                                    emotionTag={emotionTag}
                                    showSetup={showSetup}
                                    showGrade={showGrade}
                                    showEmotion={showEmotion}
                                    showReferral={showReferral}
                                    showThesis={showThesis}
                                    customThesis={customThesis}
                                    showReview={showReview}
                                    customReview={customReview}
                                    showFullText={showFullText}
                                />
                            </div>
                        </div>
                    ) : (
                        <div
                            ref={cardContainerRef}
                            onPointerDown={handlePointerDown}
                            onPointerMove={handlePointerMove}
                            onPointerUp={handlePointerUp}
                            onPointerCancel={handlePointerUp}
                            className={cn(
                                "w-full max-w-[540px] transition-all",
                                isCustomBgActive && (
                                    isDraggingBg
                                        ? "cursor-grabbing touch-none ring-2 ring-primary/80 rounded-[26px] shadow-2xl scale-[1.008]"
                                        : "cursor-grab touch-none hover:ring-1 hover:ring-primary/40 rounded-[26px]"
                                )
                            )}
                        >
                            <PnlCard
                                trade={trade}
                                bg={bg}
                                accent={accent}
                                roiPercent={roiPercent}
                                duration={duration}
                                leverage={leverage}
                                selectedExchange={selectedExchange}
                                traderHandle={traderHandle}
                                brandTitle={brandTitle}
                                brandSubtitle={brandSubtitle}
                                activeLogoUrl={activeLogoUrl}
                                activeReferral={activeReferral}
                                avatarUrl={avatarUrl}
                                isCustomBgActive={isCustomBgActive}
                                customBgUrl={activeCustomBgPlayableUrl || activeCustomBgUrl}
                                customBgMediaType={activeCustomBgMediaType}
                                bgDimming={bgDimming}
                                bgDimmingDirection={bgDimmingDirection}
                                bgPosX={bgPosX}
                                bgPosY={bgPosY}
                                videoRef={domBgVideoRef}
                                showSide={showSide}
                                showPnl={showPnl}
                                showRoi={showRoi}
                                showTradeTimes={showTradeTimes}
                                showProfile={showProfile}
                                showWatermark={showWatermark}
                                showDuration={showDuration}
                                showPlan={showPlan}
                                plannedStop={plannedStop}
                                plannedTarget={plannedTarget}
                                plannedRr={plannedRr}
                                setupTag={setupTag}
                                executionGrade={executionGrade}
                                emotionTag={emotionTag}
                                showSetup={showSetup}
                                showGrade={showGrade}
                                showEmotion={showEmotion}
                                showReferral={showReferral}
                                showThesis={showThesis}
                                customThesis={customThesis}
                                showReview={showReview}
                                customReview={customReview}
                                showFullText={showFullText}
                            />
                        </div>
                    )}
                    {/* Hidden canvas for export */}
                    <canvas ref={canvasRef} className="hidden" />
                </div>

                {/* ── DIALOG MINI SIMPAN TEMPLATE BARU ── */}
                {isSaveModalOpen && (
                    <div className="mx-4 mt-2.5 p-3 rounded-xl bg-primary/10 border border-primary/30 flex items-center justify-between gap-3 flex-wrap">
                        <div className="flex-1 min-w-[200px]">
                            <label className="text-[11px] font-bold text-primary block mb-1">
                                💾 Simpan Konfigurasi Desain Sebagai Template:
                            </label>
                            <input
                                type="text"
                                value={newTemplateName}
                                onChange={(e) => setNewTemplateName(e.target.value)}
                                placeholder="Contoh: Twitter No-USD, Hit & Run Scalp..."
                                className="w-full h-8 px-2.5 text-xs rounded-md bg-background border border-border focus:border-primary focus:outline-none"
                                autoFocus
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleSaveNewTemplate()
                                    if (e.key === 'Escape') setIsSaveModalOpen(false)
                                }}
                            />
                        </div>
                        <div className="flex items-center gap-2 mt-3 sm:mt-0">
                            <button
                                type="button"
                                onClick={handleSaveNewTemplate}
                                disabled={!newTemplateName.trim()}
                                className="h-8 px-3.5 rounded-md bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/90 disabled:opacity-50 transition-colors shadow-xs"
                            >
                                Simpan
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setIsSaveModalOpen(false)
                                    setNewTemplateName('')
                                }}
                                className="h-8 px-2.5 rounded-md bg-muted text-muted-foreground text-xs font-medium hover:text-foreground transition-colors"
                            >
                                Batal
                            </button>
                        </div>
                    </div>
                )}

                {/* ── TEMPLATE SELECTOR BAR ── */}
                <div className="border-t border-border/40 px-4 py-2 bg-card/40 flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs font-bold text-foreground mr-1 flex items-center gap-1">
                            <span>✨</span>
                            <span>Template:</span>
                        </span>
                        {templates.map((tpl) => {
                            const isActive = activeTemplateId === tpl.id
                            return (
                                <div key={tpl.id} className="relative group flex items-center">
                                    <button
                                        type="button"
                                        onClick={() => handleSelectTemplate(tpl)}
                                        className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold border transition-all ${
                                            isActive
                                                ? 'border-primary bg-primary/20 text-primary-foreground shadow-xs ring-1 ring-primary/40'
                                                : 'border-border/60 bg-muted/30 text-muted-foreground hover:text-foreground hover:bg-muted/50'
                                        }`}
                                    >
                                        <span>{tpl.isBuiltin ? (tpl.id === 'privacy-no-usd' ? '🕊️' : tpl.id === 'glass-sticker' ? '💎' : '⭐') : '🎨'}</span>
                                        <span>{tpl.name}</span>
                                    </button>
                                    {!tpl.isBuiltin && (
                                        confirmDeleteTplId === tpl.id ? (
                                            <div className="flex items-center gap-1 ml-1 bg-destructive/15 border border-destructive/30 px-1 py-0.5 rounded">
                                                <button
                                                    type="button"
                                                    onClick={(e) => {
                                                        e.stopPropagation()
                                                        handleDeleteTemplate(tpl.id)
                                                        setConfirmDeleteTplId(null)
                                                    }}
                                                    className="text-[10px] font-bold text-destructive hover:underline"
                                                    title="Yakin ingin menghapus template ini?"
                                                >
                                                    Hapus?
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={(e) => {
                                                        e.stopPropagation()
                                                        setConfirmDeleteTplId(null)
                                                    }}
                                                    className="text-[10px] text-muted-foreground hover:text-foreground"
                                                >
                                                    ✕
                                                </button>
                                            </div>
                                        ) : (
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    setConfirmDeleteTplId(tpl.id)
                                                }}
                                                title="Hapus template kustom ini"
                                                className="ml-1 p-0.5 text-muted-foreground hover:text-destructive text-[11px] rounded transition-colors"
                                            >
                                                ✕
                                            </button>
                                        )
                                    )}
                                </div>
                            )
                        })}

                        <button
                            type="button"
                            onClick={() => setIsSaveModalOpen(true)}
                            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold border border-dashed border-primary/50 bg-primary/10 text-primary hover:bg-primary/20 transition-all shadow-xs"
                        >
                            <span>+ Simpan Desain</span>
                        </button>
                    </div>

                    {/* Tombol Perbarui jika ada modifikasi pada template kustom */}
                    {activeTemplate && !activeTemplate.isBuiltin && isModified && (
                        <button
                            type="button"
                            onClick={handleUpdateActiveTemplate}
                            className="text-[11px] font-bold text-amber-400 bg-amber-500/10 border border-amber-500/30 px-2.5 py-1 rounded-lg hover:bg-amber-500/20 transition-colors animate-pulse"
                        >
                            💾 Perbarui Template
                        </button>
                    )}
                </div>

                {/* ── BACKGROUND & WALLPAPER SELECTOR ── */}
                <div className="border-t border-border/40 px-4 py-2.5 bg-card/30 flex flex-col gap-2">
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
                                        onClick={() => {
                                            setSelectedBgIdx(i)
                                        }}
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
                            onClick={() => {
                                setIsCustomBgActive(false)
                                saveShareSettings({ isCustomBg: false })
                            }}
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
                            const resolvedItemType = resolveMediaType(bgItem.mediaType, bgItem.dataUrl, 'image')
                            const isVideo = resolvedItemType === 'video'
                            const isConfirmingDelete = confirmDeleteBgId === bgItem.id
                            return (
                                <div key={bgItem.id} className="relative group/bg flex items-center">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setSelectedCustomBgId(bgItem.id)
                                            setIsCustomBgActive(true)
                                            const px = bgItem.bgPosX ?? bgItem.posX ?? 50
                                            const py = bgItem.bgPosY ?? bgItem.posY ?? 50
                                            setBgPosX(px)
                                            setBgPosY(py)
                                            saveShareSettings({
                                                customBgId: bgItem.id,
                                                isCustomBg: true,
                                                customBgMediaType: resolvedItemType,
                                                customBgUrl: bgItem.dataUrl,
                                                bgPosX: px,
                                                bgPosY: py
                                            })
                                        }}
                                        className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-medium border transition-all ${
                                            isSelected
                                                ? 'border-primary bg-primary/20 text-foreground font-bold shadow-xs ring-1 ring-primary/50'
                                                : 'border-border/60 bg-muted/20 text-muted-foreground hover:text-foreground hover:border-border'
                                        }`}
                                    >
                                        {isVideo ? (
                                            <span className="w-4 h-4 rounded bg-amber-500/20 text-amber-400 flex items-center justify-center text-[10px] font-bold">
                                                ▶
                                            </span>
                                        ) : (
                                            <img
                                                src={bgItem.dataUrl}
                                                alt={bgItem.name}
                                                className="w-4 h-4 rounded object-cover border border-white/20"
                                            />
                                        )}
                                        <span className="truncate max-w-[95px]">{bgItem.name}</span>
                                        {isVideo && <span className="text-[9px] text-amber-400 font-mono">vid</span>}
                                    </button>

                                    {/* Tombol Hapus Wallpaper Kustom Langsung di Modal */}
                                    {isConfirmingDelete ? (
                                        <div className="absolute left-0 bottom-full mb-1 z-30 flex items-center gap-1 bg-background/95 backdrop-blur border border-destructive/50 px-2 py-1 rounded-md shadow-lg whitespace-nowrap">
                                            <span className="text-[10px] text-destructive font-medium">Hapus?</span>
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    handleDeleteCustomBg(bgItem.id)
                                                }}
                                                className="text-[10px] px-1.5 py-0.5 rounded bg-destructive text-destructive-foreground font-bold hover:bg-destructive/90 transition-colors"
                                            >
                                                Ya
                                            </button>
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    setConfirmDeleteBgId(null)
                                                }}
                                                className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground hover:text-foreground transition-colors"
                                            >
                                                Batal
                                            </button>
                                        </div>
                                    ) : (
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                setConfirmDeleteBgId(bgItem.id)
                                            }}
                                            title="Hapus wallpaper ini dari koleksi"
                                            className="opacity-0 group-hover/bg:opacity-100 -ml-2 mr-0.5 p-0.5 text-[11px] text-muted-foreground hover:text-destructive transition-all rounded"
                                        >
                                            ✕
                                        </button>
                                    )}
                                </div>
                            )
                        })}

                        {/* Hidden input file untuk upload */}
                        <input
                            ref={uploadBgModalInputRef}
                            type="file"
                            accept="image/*,video/mp4,video/webm"
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
                            title="Upload gambar atau klip video (MP4/WebM) baru ke koleksi Anda"
                        >
                            <span>+ Upload Media</span>
                        </button>
                    </div>

                    {/* Panel Kontrol Reposisi Wallpaper Kustom */}
                    {isCustomBgActive && (
                        <div className="p-2.5 rounded-xl bg-muted/30 border border-border/50 flex flex-col gap-2">
                            <div className="flex items-center justify-between flex-wrap gap-2">
                                <div className="flex items-center gap-1.5">
                                    <span className="text-[11px] font-bold text-foreground">
                                        🧭 Reposisi Wallpaper:
                                    </span>
                                    <span className="text-[10px] text-muted-foreground">
                                        (Geser langsung pada kartu live di atas, atau gunakan slider berikut)
                                    </span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setBgPosX(50)
                                            setBgPosY(50)
                                        }}
                                        className="text-[10px] px-2 py-0.5 rounded border border-border bg-background hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                                        title="Kembalikan posisi ke tengah (50% 50%)"
                                    >
                                        ↺ Tengah (50%)
                                    </button>
                                    {selectedCustomBgId && (
                                        <button
                                            type="button"
                                            onClick={handleSaveDefaultBgPos}
                                            className={`text-[10px] px-2.5 py-0.5 rounded font-semibold border transition-all ${
                                                isSavedDefaultBgPos
                                                    ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                                                    : 'bg-primary/15 text-primary border-primary/30 hover:bg-primary/25'
                                            }`}
                                            title="Simpan posisi X & Y ini sebagai nilai bawaan wallpaper saat ini"
                                        >
                                            {isSavedDefaultBgPos ? '✓ Tersimpan!' : '💾 Simpan Posisi Bawaan'}
                                        </button>
                                    )}
                                </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-0.5">
                                <div className="flex items-center gap-2">
                                    <span className="text-[10px] font-semibold text-muted-foreground min-w-[58px]">
                                        Posisi X: <span className="font-mono text-foreground">{bgPosX}%</span>
                                    </span>
                                    <input
                                        type="range"
                                        min="0"
                                        max="100"
                                        value={bgPosX}
                                        onChange={(e) => setBgPosX(Number(e.target.value))}
                                        className="flex-1 accent-primary h-1.5 cursor-ew-resize"
                                    />
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="text-[10px] font-semibold text-muted-foreground min-w-[58px]">
                                        Posisi Y: <span className="font-mono text-foreground">{bgPosY}%</span>
                                    </span>
                                    <input
                                        type="range"
                                        min="0"
                                        max="100"
                                        value={bgPosY}
                                        onChange={(e) => setBgPosY(Number(e.target.value))}
                                        className="flex-1 accent-primary h-1.5 cursor-ns-resize"
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Panel Kontrol Dimming & Arah Gradien Langsung di Modal */}
                    {isCustomBgActive && (
                        <div className="pt-0.5">
                            <BackgroundAdjustBar
                                bgDimming={bgDimming}
                                bgDimmingDirection={bgDimmingDirection}
                                onDimmingChange={(val) => {
                                    setBgDimming(val)
                                    saveShareSettings({ bgDimming: val })
                                }}
                                onDirectionChange={(dir) => {
                                    setBgDimmingDirection(dir)
                                    saveShareSettings({ bgDimmingDirection: dir })
                                }}
                            />
                        </div>
                    )}

                    <div className="text-[11px] text-muted-foreground/80 italic flex items-center gap-1">
                        <span>💡</span>
                        <span>
                            {isCustomBgActive
                                ? `Wallpaper kustom aktif. Skema warna '${bg.label}' mengatur warna aksen PnL & teks.`
                                : `Menggunakan latar belakang warna murni '${bg.label}'.`}
                        </span>
                    </div>
                </div>

                {/* ── TOGGLE CHECKBOXES ── */}
                <div className="border-t border-border/40 px-4 py-2.5 bg-card/10">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                            Komponen Tampilan:
                        </span>
                        {/* Toggle Teks Lengkap Tanpa Terpotong */}
                        <label className="flex cursor-pointer items-center gap-1.5 text-xs font-semibold select-none text-primary">
                            <input
                                type="checkbox"
                                checked={showFullText}
                                onChange={(e) => setShowFullText(e.target.checked)}
                                className="h-3.5 w-3.5 rounded border-border text-primary accent-primary"
                            />
                            <span>Tampilkan Semua Teks (Tanpa Terpotong)</span>
                        </label>
                    </div>

                    <div className="flex flex-wrap gap-x-4 gap-y-2">
                        {([
                            ['Side', showSide, setShowSide],
                            ['PnL (USD)', showPnl, setShowPnl],
                            ['ROI', showRoi, setShowRoi],
                            ['Waktu Trade', showTradeTimes, setShowTradeTimes],
                            ['Duration', showDuration, setShowDuration],
                            ['Setup', showSetup, setShowSetup],
                            ['Grade', showGrade, setShowGrade],
                            ['Emosi', showEmotion, setShowEmotion],
                            ['Profile', showProfile, setShowProfile],
                            ['Watermark', showWatermark, setShowWatermark],
                            ['Risk Plan', showPlan, setShowPlan],
                            ['Referral Code', showReferral, setShowReferral],
                            ['Thesis', showThesis, setShowThesis],
                            ['Review', showReview, setShowReview],
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

                    {/* Edit Trade Thesis Inline */}
                    {showThesis && (
                        <div className="mt-2.5">
                            <div className="flex items-center justify-between mb-1">
                                <span className="text-[11px] font-semibold text-sky-400">💡 Trade Thesis:</span>
                            </div>
                            <textarea
                                value={customThesis}
                                onChange={(e) => setCustomThesis(e.target.value)}
                                rows={showFullText ? 3 : 2}
                                placeholder="Tulis alasan masuk posisi / thesis trading di sini..."
                                className="w-full rounded-lg border border-border/60 bg-background px-3 py-1.5 text-xs text-foreground resize-none focus:border-primary focus:outline-none placeholder:text-muted-foreground/60"
                            />
                        </div>
                    )}

                    {/* Edit Post-Trade Review Inline */}
                    {showReview && (
                        <div className="mt-1.5">
                            <div className="flex items-center justify-between mb-1">
                                <span className="text-[11px] font-semibold text-sky-400">📝 Post-Trade Review:</span>
                            </div>
                            <textarea
                                value={customReview}
                                onChange={(e) => setCustomReview(e.target.value)}
                                rows={showFullText ? 3 : 2}
                                placeholder="Tulis evaluasi / pelajaran setelah trade ditutup..."
                                className="w-full rounded-lg border border-border/60 bg-background px-3 py-1.5 text-xs text-foreground resize-none focus:border-primary focus:outline-none placeholder:text-muted-foreground/60"
                            />
                        </div>
                    )}
                </div>

                {/* ── CAPTION MAKER AUTO-GENERATOR (TIKTOK / REELS / TWITTER) ── */}
                <div className="border-t border-border/40 px-4 py-2.5 bg-card/25">
                    <CaptionMakerPanel
                        tradeDetail={trade}
                        showPnl={showPnl}
                        traderHandle={traderHandle}
                        brandTitle={brandTitle}
                        selectedExchange={selectedExchange}
                        activeReferral={showReferral ? activeReferral : ''}
                        customThesis={customThesis}
                        customReview={customReview}
                        captionPresetId={captionPresetId}
                        onPresetChange={(id) => {
                            setCaptionPresetId(id)
                            saveShareSettings({ captionPresetId: id })
                        }}
                    />
                </div>

                {/* ── EXCHANGE SELECTOR BAR (HANYA MEXC & BITUNIX) ── */}
                <div className="flex items-center justify-between gap-3 px-4 py-2 border-t border-border/40 bg-card/20">
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs text-muted-foreground font-medium">Exchange:</span>
                        {EXCHANGES.map((ex) => (
                            <button
                                key={ex}
                                type="button"
                                onClick={() => setSelectedExchange(ex)}
                                className={`rounded-md px-3 py-1 text-xs font-bold uppercase transition-all ${selectedExchange === ex
                                    ? 'text-white shadow-xs'
                                    : 'bg-muted text-muted-foreground hover:text-foreground'
                                    }`}
                                style={selectedExchange === ex ? { background: accent } : {}}
                            >
                                {ex}
                            </button>
                        ))}

                        {/* Referral Code preview */}
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
                <div className="flex flex-col gap-2.5 px-4 py-3 border-t border-border/40 bg-card/30">
                    {/* Kontrol Rasio Video (TikTok 9:16 vs Asli) */}
                    <AspectFrameControls
                        exportAspect={exportAspect}
                        frameBgSource={frameBgSource}
                        frameBlur={frameBlur}
                        frameDim={frameDim}
                        hasCustomWallpaper={isCustomBgActive && !!activeCustomBgUrl}
                        onAspectChange={(asp) => {
                            setExportAspect(asp)
                            saveShareSettings({ exportAspect: asp })
                        }}
                        onBgSourceChange={(src) => {
                            setFrameBgSource(src)
                            saveShareSettings({ frameBgSource: src })
                        }}
                        onBlurChange={(b) => {
                            setFrameBlur(b)
                            saveShareSettings({ frameBlur: b })
                        }}
                        onDimChange={(d) => {
                            setFrameDim(d)
                            saveShareSettings({ frameDim: d })
                        }}
                    />

                    <div className="flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-border/30">
                        <div className="flex flex-wrap items-center gap-3">
                            {/* Selector Durasi Video */}
                            <div className="flex items-center gap-1.5">
                                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Durasi:</span>
                                <select
                                    value={videoDurationMode}
                                    onChange={(e) => {
                                        const val = e.target.value as VideoDurationMode
                                        setVideoDurationMode(val)
                                        saveShareSettings({ videoDurationMode: val })
                                    }}
                                    className="text-xs bg-background/50 border border-border/60 rounded px-2 py-1 outline-none text-foreground cursor-pointer hover:bg-background/80"
                                >
                                    {VIDEO_DURATION_OPTIONS.map((opt) => {
                                        let label = opt.label
                                        if (opt.value === 'source') {
                                            const activeDur = sourceVideoDurationSec || offscreenBgVideoRef.current?.duration || domBgVideoRef.current?.duration
                                            label = activeCustomBgMediaType === 'video' && activeDur
                                                ? `Sesuai Video Sumber (~${Math.round(activeDur)}s)`
                                                : 'Sesuai Video Sumber (Default 15s)'
                                        }
                                        return (
                                            <option key={opt.value} value={opt.value}>
                                                {label}
                                            </option>
                                        )
                                    })}
                                </select>
                            </div>

                            {/* Selector Kualitas Video */}
                            <div className="flex items-center gap-1.5">
                                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Kualitas:</span>
                                <select
                                    value={videoQuality}
                                    onChange={(e) => setVideoQuality(e.target.value as any)}
                                    className="text-xs bg-background/50 border border-border/60 rounded px-2 py-1 outline-none text-foreground cursor-pointer hover:bg-background/80"
                                >
                                    <option value="standard">Standard (2.5 Mbps, 30fps)</option>
                                    <option value="jernih">Jernih (8.0 Mbps, 30fps)</option>
                                    <option value="super">Super Jernih (16.0 Mbps, 60fps)</option>
                                </select>
                            </div>
                        </div>

                        {exportAspect === '9:16' && (
                            <span className="text-[11px] text-primary font-medium flex items-center gap-1">
                                <span>📱</span>
                                <span>Video Rasio 9:16 (Format TikTok & IG Reels)</span>
                            </span>
                        )}
                    </div>
                    <div className="flex items-center justify-between gap-2">
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
                            onClick: handleDownload,
                            disabled: downloading || exportingVideo || exportingGif,
                        },
                        {
                            icon: (
                                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8">
                                    <path d="M15 10l5-3v10l-5-3v-4z" />
                                    <rect x="2" y="6" width="13" height="12" rx="3" />
                                </svg>
                            ),
                            label: exportingVideo
                                ? `Proses (${videoProgress}%)`
                                : exportAspect === '9:16'
                                    ? `Save Video 9:16 (${getEffectiveDurationSec()}s 📱)`
                                    : `Save Video (${getEffectiveDurationSec()}s${activeCustomBgMediaType === 'video' ? ' 🎬' : ''})`,
                            onClick: () => void handleExportVideo(),
                            disabled: exportingVideo || downloading || exportingGif,
                        },
                        {
                            icon: (
                                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8">
                                    <rect x="3" y="5" width="18" height="14" rx="3" />
                                    <path d="M7 15V9h3a2 2 0 0 1 0 4H7" />
                                    <path d="M14 9v6" />
                                    <path d="M17 9h3v2h-2v2h2v2h-3V9" />
                                </svg>
                            ),
                            label: exportingGif ? `Proses (${gifProgress}%)` : 'Save GIF',
                            onClick: () => void handleExportGif(),
                            disabled: exportingGif || exportingVideo || downloading,
                        },
                        {
                            icon: (
                                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8">
                                    <rect x="9" y="9" width="13" height="13" rx="2" />
                                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                                </svg>
                            ),
                            label: copySuccess ? 'Tersalin ke Clipboard!' : 'Copy Image',
                            onClick: () => void handleCopy(),
                            disabled: false,
                        },
                        {
                            icon: (
                                <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                                </svg>
                            ),
                            label: 'Share Twitter / X',
                            onClick: () => {
                                const captionCtx = buildCaptionContext(trade, {
                                    traderHandle,
                                    brandTitle,
                                    selectedExchange,
                                    activeReferral: showReferral && activeReferral ? activeReferral : '',
                                    customThesis,
                                    customReview
                                })
                                const text = renderCaption('twitter-x', captionCtx, {
                                    hidePnl: !showPnl
                                })
                                const tweetUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`
                                if (window.api?.openExternalUrl) {
                                    void window.api.openExternalUrl(tweetUrl)
                                } else {
                                    window.open(tweetUrl, '_blank')
                                }
                            },
                            disabled: false,
                        },
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

                    {/* ── PANEL PRATINJAU VIDEO HASIL EKSPOR ── */}
                    {exportedVideoResult && (
                        <div className="mt-2.5 p-3.5 rounded-2xl bg-card/90 border border-primary/40 shadow-2xl flex flex-col gap-2.5 animate-in fade-in slide-in-from-bottom-2">
                            <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2 min-w-0">
                                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                                    <span className="text-xs font-bold text-foreground shrink-0">
                                        🎬 Pratinjau Video Hasil Ekspor:
                                    </span>
                                    <span className="text-[11px] text-muted-foreground font-mono truncate">
                                        {exportedVideoResult.filename}
                                    </span>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => {
                                        URL.revokeObjectURL(exportedVideoResult.url)
                                        setExportedVideoResult(null)
                                    }}
                                    className="text-xs text-muted-foreground hover:text-foreground px-2 py-0.5 rounded hover:bg-muted/50 transition-colors shrink-0"
                                    title="Tutup pemutar pratinjau hasil ekspor"
                                >
                                    ✕ Tutup
                                </button>
                            </div>

                            {/* Pemutar Video Hasil Render */}
                            <div className="relative rounded-xl overflow-hidden bg-black max-h-[320px] flex items-center justify-center border border-border/50">
                                <video
                                    key={exportedVideoResult.url}
                                    src={exportedVideoResult.url}
                                    controls
                                    autoPlay
                                    loop
                                    playsInline
                                    className="max-h-[320px] w-auto max-w-full rounded-xl"
                                />
                            </div>

                            {/* Status Lokasi Penyimpanan & Tombol Pilih Folder */}
                            <div className="flex items-center justify-between flex-wrap gap-2 pt-1 border-t border-border/30 text-xs">
                                <div className="flex items-center gap-1.5 text-muted-foreground min-w-0">
                                    {exportedVideoResult.savedPath ? (
                                        <span className="text-emerald-400 font-medium truncate">
                                            ✓ Tersimpan di: <span className="font-mono text-foreground break-all">{exportedVideoResult.savedPath}</span>
                                        </span>
                                    ) : (
                                        <span className="text-amber-400 font-medium">
                                            ℹ️ Berkas belum tersimpan di folder pilihan.
                                        </span>
                                    )}
                                </div>
                                <button
                                    type="button"
                                    onClick={() => void handleSaveExportedAgain()}
                                    disabled={isSavingExportedAgain}
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground font-bold hover:bg-primary/90 disabled:opacity-50 transition-colors shadow-xs ml-auto"
                                    title="Buka dialog pemilihan folder untuk menyimpan berkas video ini"
                                >
                                    <span>📂</span>
                                    <span>{exportedVideoResult.savedPath ? 'Simpan ke Folder Lain...' : 'Pilih Folder & Simpan...'}</span>
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </Modal>
    )
}

