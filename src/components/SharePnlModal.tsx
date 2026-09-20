import { useCallback, useEffect, useRef, useState } from 'react'
import { type ExecutionGrade, type TradeDetail, computePlannedRR } from '@shared/domain'
import { Modal } from './ui'
import { formatDate, formatDateTime, formatDuration, formatPercent, formatPnl, formatPrice, formatR } from '../lib/format'
import { cn } from '../lib/utils'
import {
    BG_TEMPLATES,
    BUILTIN_TEMPLATES,
    EXCHANGES,
    loadShareSettings,
    loadCustomBgList,
    addCustomBgItem,
    getAllShareTemplates,
    saveCustomShareTemplate,
    deleteCustomShareTemplate,
    getActiveTemplateId,
    setActiveTemplateId,
    type BgTemplate,
    type ExchangeName,
    type ShareCardTemplate,
    type CustomBgItem
} from '../lib/shareSettings'

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
// Helper Pemecah Teks Canvas (Word Wrap Dinamis)
// ---------------------------------------------------------------------------

function wrapCanvasText(
    ctx: CanvasRenderingContext2D,
    text: string,
    maxWidth: number
): string[] {
    const words = text.split(/\s+/)
    const lines: string[] = []
    let currentLine = ''

    for (const word of words) {
        const testLine = currentLine ? `${currentLine} ${word}` : word
        const metrics = ctx.measureText(testLine)
        if (metrics.width > maxWidth && currentLine) {
            lines.push(currentLine)
            currentLine = word
        } else {
            currentLine = testLine
        }
    }
    if (currentLine) {
        lines.push(currentLine)
    }
    return lines
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

    const initialBgIdx = Math.max(
        0,
        BG_TEMPLATES.findIndex((t) => t.id === (activeTemplate?.bgPresetId || savedSettings.bgPresetId))
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
    const activeCustomBgUrl = activeCustomBgItem ? activeCustomBgItem.dataUrl : (savedSettings.customBgUrl || null)

    const bg: BgTemplate = BG_TEMPLATES[selectedBgIdx] ?? BG_TEMPLATES[0]!
    const accent = isWin ? bg.accentProfit : bg.accentLoss

    // Data Identitas & Branding dari Settings
    const avatarUrl = savedSettings.avatarUrl
    const traderHandle = savedSettings.traderHandle
    const brandTitle = savedSettings.brandTitle || 'NITIREKSO'
    const brandSubtitle = savedSettings.brandSubtitle || 'JOURNAL'
    const bgDimming = savedSettings.bgDimming

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

    // Data Exchange & Referral dari Settings
    const mexcLogoUrl = savedSettings.mexcLogoUrl
    const mexcReferralCode = savedSettings.mexcReferralCode
    const bitunixLogoUrl = savedSettings.bitunixLogoUrl
    const bitunixReferralCode = savedSettings.bitunixReferralCode

    // Default exchange berdasarkan trade (hanya MEXC & Bitunix)
    const defaultExchange: ExchangeName = trade.trade.exchange === 'bitunix' ? 'bitunix' : 'mexc'
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

    // Upload background gambar baru langsung dari modal
    const handleUploadNewBg = (file: File | undefined) => {
        if (!file) return
        if (!file.type.startsWith('image/')) {
            alert('Harap pilih berkas gambar (PNG, JPG, SVG, WebP).')
            return
        }
        if (file.size > 8 * 1024 * 1024) {
            alert('Ukuran berkas maksimal 8MB.')
            return
        }
        const reader = new FileReader()
        reader.onload = (e) => {
            const dataUrl = e.target?.result as string
            if (dataUrl) {
                const cleanName = file.name.replace(/\.[^/.]+$/, '').slice(0, 18) || `Wallpaper ${customBgList.length + 1}`
                const created = addCustomBgItem({ name: cleanName, dataUrl })
                const updatedList = loadCustomBgList()
                setCustomBgList(updatedList)
                setSelectedCustomBgId(created.id)
                setIsCustomBgActive(true)
            }
        }
        reader.readAsDataURL(file)
    }

    // Switch ke template terpilih
    const handleSelectTemplate = (tpl: ShareCardTemplate) => {
        setActiveTplId(tpl.id)
        setActiveTemplateId(tpl.id)
        const bgIdx = BG_TEMPLATES.findIndex((b) => b.id === tpl.bgPresetId)
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
        const currentBgId = BG_TEMPLATES[selectedBgIdx]?.id || 'dark-navy'
        const saved = saveCustomShareTemplate({
            name: trimmed,
            bgPresetId: currentBgId,
            customBgId: isCustomBgActive ? selectedCustomBgId : null,
            isCustomBg: isCustomBgActive,
            bgDimming: savedSettings.bgDimming,
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
        const currentBgId = BG_TEMPLATES[selectedBgIdx]?.id || 'dark-navy'
        saveCustomShareTemplate({
            id: activeTemplate.id,
            name: activeTemplate.name,
            bgPresetId: currentBgId,
            customBgId: isCustomBgActive ? selectedCustomBgId : null,
            isCustomBg: isCustomBgActive,
            bgDimming: savedSettings.bgDimming,
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
    const currentBgId = BG_TEMPLATES[selectedBgIdx]?.id || 'dark-navy'
    const isModified = activeTemplate ? (
        activeTemplate.bgPresetId !== currentBgId ||
        activeTemplate.isCustomBg !== isCustomBgActive ||
        (isCustomBgActive && activeTemplate.customBgId !== selectedCustomBgId) ||
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

    // Ref elemen canvas
    const canvasRef = useRef<HTMLCanvasElement>(null)

    // Preloader image refs untuk canvas export
    const avatarImgRef = useRef<HTMLImageElement | null>(null)
    const customBgImgRef = useRef<HTMLImageElement | null>(null)
    const mexcLogoImgRef = useRef<HTMLImageElement | null>(null)
    const bitunixLogoImgRef = useRef<HTMLImageElement | null>(null)

    // Preload gambar Avatar
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

    // Preload gambar Custom Background Aktif
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

    // Preload logo MEXC
    useEffect(() => {
        if (mexcLogoUrl) {
            const img = new Image()
            img.crossOrigin = 'anonymous'
            img.src = mexcLogoUrl
            img.onload = () => { mexcLogoImgRef.current = img }
        } else {
            mexcLogoImgRef.current = null
        }
    }, [mexcLogoUrl])

    // Preload logo Bitunix
    useEffect(() => {
        if (bitunixLogoUrl) {
            const img = new Image()
            img.crossOrigin = 'anonymous'
            img.src = bitunixLogoUrl
            img.onload = () => { bitunixLogoImgRef.current = img }
        } else {
            bitunixLogoImgRef.current = null
        }
    }, [bitunixLogoUrl])

    // Logo & Referral aktif berdasarkan exchange terpilih
    const activeLogoImg = selectedExchange === 'mexc' ? mexcLogoImgRef.current : bitunixLogoImgRef.current
    const activeLogoUrl = selectedExchange === 'mexc' ? mexcLogoUrl : bitunixLogoUrl
    const activeReferral = selectedExchange === 'mexc' ? mexcReferralCode : bitunixReferralCode

    // -----------------------------------------------------------------------
    // Mesin Render Canvas Dinamis (Auto-Flow Y Layout Engine)
    // -----------------------------------------------------------------------
    const drawToCanvas = useCallback((): HTMLCanvasElement => {
        const canvas = canvasRef.current || document.createElement('canvas')
        const ctx = canvas.getContext('2d')
        if (!ctx) return canvas

        // 1. Ukuran Kartu Standar & Usable Area
        const W = 1080
        const mx = 48
        const cw = W - mx * 2 // 984px
        const cx = mx + 52
        const contentW = cw - 104 // 880px

        // 2. Hitung Ukuran Teks Thesis (Penuh atau Compact)
        ctx.font = 'italic 24px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
        let thesisLines: string[] = []
        let thesisBoxH = 0
        if (showThesis && customThesis.trim()) {
            thesisLines = wrapCanvasText(ctx, customThesis.trim(), contentW - 48)
            if (!showFullText && thesisLines.length > 4) {
                thesisLines = thesisLines.slice(0, 4)
                thesisLines[3] = (thesisLines[3] || '') + '…'
            }
            thesisBoxH = 46 + thesisLines.length * 36 + 22
        }

        // 3. Hitung Ukuran Teks Review (Penuh atau Compact)
        ctx.font = '22px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
        let reviewLines: string[] = []
        let reviewBoxH = 0
        if (showReview && customReview.trim()) {
            reviewLines = wrapCanvasText(ctx, customReview.trim(), contentW - 48)
            if (!showFullText && reviewLines.length > 3) {
                reviewLines = reviewLines.slice(0, 3)
                reviewLines[2] = (reviewLines[2] || '') + '…'
            }
            reviewBoxH = 44 + reviewLines.length * 34 + 22
        }

        // 4. Hitung Tinggi Total Kartu Secara Dinamis
        const hasReferralDisplay = showReferral && !!activeReferral.trim()
        const headerH = hasReferralDisplay ? 68 : 40
        const my = 48
        const padTop = 52
        const padBottom = 48
        const symbolH = 48
        const roiH = showRoi ? 92 : 0
        const pnlH = showPnl ? 46 : 0
        const statsH = showTradeTimes ? 158 : 132
        const planBoxH = 120
        const footerH = (showProfile || showWatermark) ? 68 : 0

        const hasBadges = (showSetup && !!setupTag) || (showGrade && !!executionGrade) || (showEmotion && !!emotionTag)
        const badgesH = hasBadges ? 40 : 0

        let innerH = padTop + headerH + 32 + symbolH + (hasBadges ? 16 + badgesH : 0) + 24
        if (showRoi) innerH += roiH + 16
        if (showPnl) innerH += pnlH + 28
        innerH += statsH
        if (showPlan) {
            innerH += 16 + planBoxH + 20
        } else {
            innerH += 28
        }
        if (thesisBoxH > 0) innerH += thesisBoxH + 20
        if (reviewBoxH > 0) innerH += reviewBoxH + 20
        if (footerH > 0) innerH += 24 + 1 + 24 + footerH
        innerH += padBottom

        const ch = innerH
        const H = ch + my * 2

        canvas.width = W
        canvas.height = H

        // 5. Gambar Latar Belakang Luar
        const isTransparentMode = !isCustomBgActive && bg.isTransparent

        if (isTransparentMode) {
            ctx.clearRect(0, 0, W, H)
        } else {
            const bgGrad = ctx.createLinearGradient(0, 0, W, H)
            if (bg.id === 'cyberpunk') {
                const radGrad = ctx.createRadialGradient(W * 0.3, H * 0.2, 50, W * 0.5, H * 0.5, W)
                radGrad.addColorStop(0, '#1e0836')
                radGrad.addColorStop(0.6, '#0a0014')
                radGrad.addColorStop(1, '#000000')
                ctx.fillStyle = radGrad
            } else if (bg.id === 'emerald') {
                bgGrad.addColorStop(0, '#064e3b')
                bgGrad.addColorStop(0.6, '#022c22')
                bgGrad.addColorStop(1, '#020617')
                ctx.fillStyle = bgGrad
            } else if (bg.id === 'sunset') {
                bgGrad.addColorStop(0, '#2e1065')
                bgGrad.addColorStop(0.4, '#1e0a30')
                bgGrad.addColorStop(1, '#0f172a')
                ctx.fillStyle = bgGrad
            } else if (bg.id === 'obsidian') {
                bgGrad.addColorStop(0, '#18181b')
                bgGrad.addColorStop(0.6, '#09090b')
                bgGrad.addColorStop(1, '#000000')
                ctx.fillStyle = bgGrad
            } else {
                bgGrad.addColorStop(0, '#0d1117')
                bgGrad.addColorStop(0.5, '#0a0e1a')
                bgGrad.addColorStop(1, '#060912')
                ctx.fillStyle = bgGrad
            }
            ctx.fillRect(0, 0, W, H)
        }

        // 6. Custom Background (dari Settings) jika aktif
        if (isCustomBgActive && customBgImgRef.current && customBgImgRef.current.complete) {
            const img = customBgImgRef.current
            const imgAspect = img.width / img.height
            const canvasAspect = W / H
            let dw = W, dh = H, dx = 0, dy = 0

            if (imgAspect > canvasAspect) {
                dh = H
                dw = H * imgAspect
                dx = (W - dw) / 2
            } else {
                dw = W
                dh = W / imgAspect
                dy = (H - dh) / 2
            }
            ctx.drawImage(img, dx, dy, dw, dh)

            ctx.fillStyle = `rgba(0, 0, 0, ${bgDimming / 100})`
            ctx.fillRect(0, 0, W, H)
        }

        // 7. Grid Texture & Ambient Glow
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.02)'
        ctx.lineWidth = 1
        for (let x = 0; x < W; x += 64) {
            ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke()
        }
        for (let y = 0; y < H; y += 64) {
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke()
        }

        const glowRad = ctx.createRadialGradient(W / 2, my + 200, 30, W / 2, my + 200, W * 0.45)
        glowRad.addColorStop(0, `${accent}1c`)
        glowRad.addColorStop(1, 'transparent')
        ctx.fillStyle = glowRad
        ctx.fillRect(0, 0, W, H)

        // 8. Kontainer Kartu Glassmorphism
        const cr = 32
        ctx.save()
        ctx.beginPath()
        ctx.roundRect(mx, my, cw, ch, cr)
        if (isTransparentMode) {
            ctx.fillStyle = 'rgba(11, 15, 25, 0.88)'
            ctx.strokeStyle = `${accent}66`
        } else {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.03)'
            ctx.strokeStyle = `${accent}44`
        }
        ctx.lineWidth = 1.5
        ctx.fill()
        ctx.stroke()
        ctx.restore()

        // -------------------------------------------------------------------
        // Penataan Elemen Berurutan Secara Dinamis (Auto Flow Y)
        // -------------------------------------------------------------------
        let curY = my + padTop

        // A. Header: Logo/Nama Brand + Logo Exchange & Kode Referral
        ctx.save()
        // Nama Brand Utama (dinamis dari settings)
        ctx.font = 'bold 30px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
        ctx.fillStyle = '#ffffff'
        ctx.fillText(brandTitle, cx, curY + 28)

        // Sub-label Badge Brand (dinamis dari settings)
        const brandTitleW = ctx.measureText(brandTitle).width
        ctx.font = 'bold 18px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
        const badgeW = ctx.measureText(brandSubtitle).width + 24
        ctx.fillStyle = `${accent}26`
        ctx.strokeStyle = `${accent}55`
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.roundRect(cx + brandTitleW + 16, curY + 6, badgeW, 28, 6)
        ctx.fill()
        ctx.stroke()
        ctx.fillStyle = accent
        ctx.fillText(brandSubtitle, cx + brandTitleW + 28, curY + 26)

        // Exchange Logo / Badge (Sisi Kanan)
        const rightEdgeX = mx + cw - 52
        if (activeLogoImg && activeLogoImg.complete) {
            // Render gambar logo kustom
            const maxLogoH = 34
            const logoAspect = activeLogoImg.width / activeLogoImg.height
            const logoW = Math.min(140, maxLogoH * logoAspect)
            const logoX = rightEdgeX - logoW
            ctx.drawImage(activeLogoImg, logoX, curY + 2, logoW, maxLogoH)

            // Tampilkan Referral di bawah logo jika ada
            if (hasReferralDisplay) {
                const refText = `Ref: ${activeReferral}`
                ctx.font = 'bold 18px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                const refW = ctx.measureText(refText).width + 20
                const refX = rightEdgeX - refW
                const refY = curY + maxLogoH + 8

                ctx.fillStyle = 'rgba(56, 189, 248, 0.15)'
                ctx.strokeStyle = 'rgba(56, 189, 248, 0.35)'
                ctx.lineWidth = 1
                ctx.beginPath()
                ctx.roundRect(refX, refY, refW, 24, 6)
                ctx.fill()
                ctx.stroke()
                ctx.fillStyle = '#38bdf8'
                ctx.fillText(refText, refX + 10, refY + 18)
            }
        } else {
            // Render badge teks default exchange (MEXC / BITUNIX)
            const exText = selectedExchange.toUpperCase()
            ctx.font = 'bold 22px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
            const exW = ctx.measureText(exText).width + 32
            const exX = rightEdgeX - exW
            ctx.fillStyle = 'rgba(255, 255, 255, 0.08)'
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)'
            ctx.lineWidth = 1
            ctx.beginPath()
            ctx.roundRect(exX, curY + 2, exW, 32, 8)
            ctx.fill()
            ctx.stroke()
            ctx.fillStyle = '#cbd5e1'
            ctx.fillText(exText, exX + 16, curY + 25)

            // Tampilkan Referral di bawah badge exchange
            if (hasReferralDisplay) {
                const refText = `Ref: ${activeReferral}`
                ctx.font = 'bold 18px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                const refW = ctx.measureText(refText).width + 20
                const refX = rightEdgeX - refW
                const refY = curY + 40

                ctx.fillStyle = 'rgba(56, 189, 248, 0.15)'
                ctx.strokeStyle = 'rgba(56, 189, 248, 0.35)'
                ctx.lineWidth = 1
                ctx.beginPath()
                ctx.roundRect(refX, refY, refW, 24, 6)
                ctx.fill()
                ctx.stroke()
                ctx.fillStyle = '#38bdf8'
                ctx.fillText(refText, refX + 10, refY + 18)
            }
        }
        ctx.restore()

        curY += headerH + 32

        // B. Symbol + Direction + Leverage
        ctx.save()
        ctx.font = 'bold 48px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
        ctx.fillStyle = '#ffffff'
        ctx.fillText(trade.trade.symbol, cx, curY + 36)

        if (showSide) {
            const symW = ctx.measureText(trade.trade.symbol).width
            ctx.fillStyle = 'rgba(255, 255, 255, 0.25)'
            ctx.fillRect(cx + symW + 20, curY + 6, 2, 34)

            ctx.font = 'bold 28px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
            ctx.fillStyle = accent
            const dirStr = trade.trade.direction.toUpperCase()
            ctx.fillText(dirStr, cx + symW + 36, curY + 34)

            const dirW = ctx.measureText(dirStr).width
            ctx.fillStyle = '#ffffff'
            ctx.font = 'bold 26px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
            ctx.fillText(`${leverage}X`, cx + symW + 36 + dirW + 12, curY + 34)
        }
        ctx.restore()

        // B2. Journal Meta Badges (Setup, Grade, Emotion) di Canvas
        if (hasBadges) {
            curY += symbolH + 16
            ctx.save()
            let badgeX = cx
            const badgeY = curY
            const badgeH = 36
            const badgeRadius = 10

            const drawBadge = (label: string, icon: string, textColor: string, bgColor: string, borderColor: string) => {
                ctx.font = 'bold 20px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                const fullText = `${icon} ${label}`
                const textW = ctx.measureText(fullText).width
                const pillW = textW + 28

                if (badgeX + pillW > cx + contentW) return

                ctx.fillStyle = bgColor
                ctx.strokeStyle = borderColor
                ctx.lineWidth = 1.2
                ctx.beginPath()
                ctx.roundRect(badgeX, badgeY, pillW, badgeH, badgeRadius)
                ctx.fill()
                ctx.stroke()

                ctx.fillStyle = textColor
                ctx.fillText(fullText, badgeX + 14, badgeY + 25)

                badgeX += pillW + 12
            }

            if (showSetup && setupTag) {
                drawBadge(setupTag, '🎯', '#38bdf8', 'rgba(56, 189, 248, 0.14)', 'rgba(56, 189, 248, 0.32)')
            }

            if (showGrade && executionGrade) {
                const gradeColors: Record<string, { text: string; bg: string; border: string }> = {
                    A: { text: '#34d399', bg: 'rgba(52, 211, 153, 0.16)', border: 'rgba(52, 211, 153, 0.36)' },
                    B: { text: '#38bdf8', bg: 'rgba(56, 189, 248, 0.16)', border: 'rgba(56, 189, 248, 0.36)' },
                    C: { text: '#fbbf24', bg: 'rgba(251, 191, 36, 0.16)', border: 'rgba(251, 191, 36, 0.36)' },
                    D: { text: '#f87171', bg: 'rgba(248, 113, 113, 0.16)', border: 'rgba(248, 113, 113, 0.36)' }
                }
                const defaultGradeColor = { text: '#38bdf8', bg: 'rgba(56, 189, 248, 0.16)', border: 'rgba(56, 189, 248, 0.36)' }
                const gc = gradeColors[executionGrade] || defaultGradeColor
                drawBadge(`Grade ${executionGrade}`, '⭐', gc.text, gc.bg, gc.border)
            }

            if (showEmotion && emotionTag) {
                const emotionIcons: Record<string, string> = {
                    calm: '😌',
                    fomo: '⚡',
                    greed: '🔥',
                    revenge: '😤',
                    anxious: '😰',
                    overconfident: '😎'
                }
                const emoIcon = emotionIcons[emotionTag.toLowerCase()] || '🧠'
                drawBadge(emotionTag.charAt(0).toUpperCase() + emotionTag.slice(1), emoIcon, '#c084fc', 'rgba(192, 132, 252, 0.15)', 'rgba(192, 132, 252, 0.35)')
            }

            ctx.restore()
            curY += badgesH + 24
        } else {
            curY += symbolH + 24
        }

        // C. ROI Hero Text
        if (showRoi) {
            ctx.save()
            ctx.font = 'bold 96px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
            ctx.fillStyle = accent
            ctx.fillText(formatPercent(roiPercent), cx, curY + 76)
            ctx.restore()
            curY += roiH + 16
        }

        // D. PnL Amount & R-Multiple
        if (showPnl) {
            ctx.save()
            ctx.font = '600 38px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
            ctx.fillStyle = accent
            const pnlStr = `${formatPnl(trade.trade.realizedPnl)} USDT`
            ctx.fillText(pnlStr, cx, curY + 32)

            if (trade.rMultiple !== null && trade.rMultiple !== undefined) {
                const pnlW = ctx.measureText(pnlStr).width
                ctx.fillStyle = '#38bdf8'
                ctx.font = '500 32px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                ctx.fillText(`  ·  ${formatR(trade.rMultiple)}`, cx + pnlW, curY + 32)
            }
            ctx.restore()
            curY += pnlH + 28
        }

        // E. Stats Row Grid (Entry, Exit, Duration, Aktual R:R)
        ctx.save()
        ctx.fillStyle = 'rgba(255, 255, 255, 0.04)'
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.roundRect(cx, curY, contentW, statsH, 18)
        ctx.fill()
        ctx.stroke()

        const statColW = contentW / 4
        const drawStatCol = (title: string, val: string, colIdx: number, valColor = '#ffffff', subText?: string) => {
            const colX = cx + statColW * colIdx + 20
            ctx.font = '20px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
            ctx.fillStyle = bg.textSub
            ctx.fillText(title, colX, curY + 44)

            ctx.font = 'bold 26px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
            ctx.fillStyle = valColor
            ctx.fillText(val, colX, curY + 86)

            if (subText) {
                ctx.font = '15px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                ctx.fillStyle = bg.textSub
                ctx.fillText(subText, colX, curY + 124)
            }
        }

        const actualRVal = trade.rMultiple !== null && trade.rMultiple !== undefined
            ? formatR(trade.rMultiple)
            : '—'
        const actualRColor = trade.rMultiple !== null && trade.rMultiple !== undefined
            ? (trade.rMultiple > 0 ? bg.accentProfit : trade.rMultiple < 0 ? bg.accentLoss : '#ffffff')
            : '#ffffff'

        const entryTimeText = showTradeTimes && trade.trade.entryTime ? formatDateTime(trade.trade.entryTime) : undefined
        const exitTimeText = showTradeTimes ? (trade.trade.exitTime ? formatDateTime(trade.trade.exitTime) : 'Posisi Terbuka') : undefined

        drawStatCol('Entry Price', formatPrice(trade.trade.entryPrice), 0, '#ffffff', entryTimeText)
        drawStatCol('Exit Price', formatPrice(trade.trade.exitPrice), 1, '#ffffff', exitTimeText)
        drawStatCol('Duration', showDuration ? duration : '—', 2)
        drawStatCol('R-Multiple', actualRVal, 3, actualRColor)

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)'
        ctx.beginPath()
        ctx.moveTo(cx + statColW, curY + 24); ctx.lineTo(cx + statColW, curY + statsH - 24)
        ctx.moveTo(cx + statColW * 2, curY + 24); ctx.lineTo(cx + statColW * 2, curY + statsH - 24)
        ctx.moveTo(cx + statColW * 3, curY + 24); ctx.lineTo(cx + statColW * 3, curY + statsH - 24)
        ctx.stroke()
        ctx.restore()

        curY += statsH + (showPlan ? 16 : 28)

        // E2. Plan Risk Grid (Plan SL, Plan TP, Plan R:R)
        if (showPlan) {
            ctx.save()
            ctx.fillStyle = 'rgba(255, 255, 255, 0.03)'
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)'
            ctx.lineWidth = 1
            ctx.beginPath()
            ctx.roundRect(cx, curY, contentW, planBoxH, 18)
            ctx.fill()
            ctx.stroke()

            const planColW = contentW / 3
            const drawPlanCol = (title: string, val: string, colIdx: number, valColor: string) => {
                const colX = cx + planColW * colIdx + 24
                ctx.font = '20px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                ctx.fillStyle = bg.textSub
                ctx.fillText(title, colX, curY + 44)

                ctx.font = 'bold 26px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                ctx.fillStyle = valColor
                ctx.fillText(val, colX, curY + 86)
            }

            const slStr = plannedStop !== null ? formatPrice(plannedStop) : '—'
            const tpStr = plannedTarget !== null ? formatPrice(plannedTarget) : '—'
            const rrStr = plannedRr !== null ? `1:${plannedRr.toFixed(2)}` : '—'

            drawPlanCol('Plan SL', slStr, 0, '#f87171')
            drawPlanCol('Plan TP', tpStr, 1, '#34d399')
            drawPlanCol('Plan R:R', rrStr, 2, '#38bdf8')

            ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)'
            ctx.beginPath()
            ctx.moveTo(cx + planColW, curY + 20); ctx.lineTo(cx + planColW, curY + planBoxH - 20)
            ctx.moveTo(cx + planColW * 2, curY + 20); ctx.lineTo(cx + planColW * 2, curY + planBoxH - 20)
            ctx.stroke()
            ctx.restore()

            curY += planBoxH + 20
        }

        // F. Trade Thesis (Dinamis: Penuh / Compact)
        if (thesisBoxH > 0) {
            ctx.save()
            ctx.fillStyle = 'rgba(15, 23, 42, 0.7)'
            ctx.strokeStyle = `${accent}44`
            ctx.lineWidth = 1.5
            ctx.beginPath()
            ctx.roundRect(cx, curY, contentW, thesisBoxH, 18)
            ctx.fill()
            ctx.stroke()

            ctx.font = 'bold 22px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
            ctx.fillStyle = accent
            ctx.fillText('💡 Trade Thesis', cx + 24, curY + 34)

            ctx.font = 'italic 24px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
            ctx.fillStyle = 'rgba(255, 255, 255, 0.88)'
            thesisLines.forEach((l, i) => {
                ctx.fillText(l, cx + 24, curY + 70 + i * 36)
            })
            ctx.restore()

            curY += thesisBoxH + 20
        }

        // G. Post-Trade Review (Dinamis: Penuh / Compact)
        if (reviewBoxH > 0) {
            ctx.save()
            ctx.fillStyle = 'rgba(15, 23, 42, 0.55)'
            ctx.strokeStyle = 'rgba(148, 163, 184, 0.2)'
            ctx.lineWidth = 1
            ctx.beginPath()
            ctx.roundRect(cx, curY, contentW, reviewBoxH, 18)
            ctx.fill()
            ctx.stroke()

            ctx.font = 'bold 20px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
            ctx.fillStyle = '#38bdf8'
            ctx.fillText('📝 Post-Trade Review', cx + 24, curY + 32)

            ctx.font = '22px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
            ctx.fillStyle = 'rgba(255, 255, 255, 0.8)'
            reviewLines.forEach((l, i) => {
                ctx.fillText(l, cx + 24, curY + 66 + i * 34)
            })
            ctx.restore()

            curY += reviewBoxH + 20
        }

        // H. Footer: Avatar Gambar / Inisial + Handle + Watermark
        if (showProfile || showWatermark) {
            curY += 12

            ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)'
            ctx.lineWidth = 1
            ctx.beginPath()
            ctx.moveTo(cx, curY)
            ctx.lineTo(cx + contentW, curY)
            ctx.stroke()

            curY += 24

            if (showProfile) {
                const avatarSize = 54
                const avatarX = cx
                const avatarY = curY + 4

                if (avatarImgRef.current && avatarImgRef.current.complete) {
                    ctx.save()
                    ctx.beginPath()
                    ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2)
                    ctx.closePath()
                    ctx.clip()
                    ctx.drawImage(avatarImgRef.current, avatarX, avatarY, avatarSize, avatarSize)
                    ctx.restore()

                    ctx.save()
                    ctx.strokeStyle = accent
                    ctx.lineWidth = 2.5
                    ctx.beginPath()
                    ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2)
                    ctx.stroke()
                    ctx.restore()
                } else {
                    ctx.save()
                    ctx.fillStyle = `${accent}33`
                    ctx.strokeStyle = accent
                    ctx.lineWidth = 2
                    ctx.beginPath()
                    ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2)
                    ctx.fill()
                    ctx.stroke()

                    ctx.fillStyle = '#ffffff'
                    ctx.font = 'bold 22px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                    const initText = traderHandle.replace('@', '').slice(0, 2).toUpperCase() || 'TR'
                    const initW = ctx.measureText(initText).width
                    ctx.fillText(initText, avatarX + (avatarSize - initW) / 2, avatarY + 35)
                    ctx.restore()
                }

                ctx.save()
                ctx.font = 'bold 26px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                ctx.fillStyle = '#ffffff'
                ctx.fillText(traderHandle, avatarX + avatarSize + 18, avatarY + 26)

                ctx.font = '20px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                ctx.fillStyle = bg.textSub
                ctx.fillText(formatDate(trade.trade.exitTime), avatarX + avatarSize + 18, avatarY + 52)
                ctx.restore()
            }

            if (showWatermark) {
                ctx.save()
                ctx.font = 'bold 22px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                ctx.fillStyle = 'rgba(255, 255, 255, 0.75)'
                const wm1 = 'nitirekso'
                const w1W = ctx.measureText(wm1).width
                ctx.fillText(wm1, mx + cw - 52 - w1W, curY + 26)

                ctx.font = '18px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                ctx.fillStyle = bg.textSub
                const wm2 = 'Trading Journal'
                const w2W = ctx.measureText(wm2).width
                ctx.fillText(wm2, mx + cw - 52 - w2W, curY + 52)
                ctx.restore()
            }
        }

        return canvas
    }, [
        bg, accent, selectedExchange, trade,
        showSide, showPnl, showRoi, showProfile, showWatermark, showDuration,
        showPlan, plannedStop, plannedTarget, plannedRr,
        showSetup, setupTag, showGrade, executionGrade, showEmotion, emotionTag,
        showThesis, customThesis, showReview, customReview, showFullText, showReferral,
        traderHandle, brandTitle, brandSubtitle, activeLogoImg, activeReferral,
        duration, roiPercent, leverage,
        isCustomBgActive, bgDimming
    ])

    // Update canvas preview saat parameter berubah
    useEffect(() => {
        drawToCanvas()
    }, [drawToCanvas])

    // -----------------------------------------------------------------------
    // Aksi Export (Download PNG & Copy Clipboard)
    // -----------------------------------------------------------------------
    const handleDownload = () => {
        setDownloading(true)
        try {
            const canvas = drawToCanvas()
            const link = document.createElement('a')
            const dateStr = new Date().toISOString().slice(0, 10)
            link.download = `${brandTitle}-${trade.trade.symbol}-${dateStr}.png`
            link.href = canvas.toDataURL('image/png')
            link.click()
        } finally {
            setDownloading(false)
        }
    }

    const handleCopy = async () => {
        try {
            const canvas = drawToCanvas()
            canvas.toBlob(async (blob) => {
                if (!blob) return
                try {
                    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
                    setCopySuccess(true)
                    setTimeout(() => setCopySuccess(false), 2500)
                } catch {
                    alert('Clipboard browser tidak mendukung penulisan gambar. Silakan gunakan tombol "Save PNG".')
                }
            }, 'image/png')
        } catch {
            // Abaikan kesalahan clipboard
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
                {/* ── CARD LIVE PREVIEW ── */}
                <div className="p-3 bg-muted/20 rounded-2xl flex items-center justify-center">
                    <div className="w-full max-w-[540px]">
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
                            customBgUrl={activeCustomBgUrl}
                            bgDimming={bgDimming}
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
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                if (confirm(`Hapus template "${tpl.name}"?`)) {
                                                    handleDeleteTemplate(tpl.id)
                                                }
                                            }}
                                            title="Hapus template kustom ini"
                                            className="ml-1 p-0.5 text-muted-foreground hover:text-destructive text-[11px] rounded transition-colors"
                                        >
                                            ✕
                                        </button>
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
                        {/* Grup 1: Preset Warna */}
                        <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-xs font-semibold text-muted-foreground mr-1 flex items-center gap-1">
                                <span>🎨</span>
                                <span>Tema Preset:</span>
                            </span>
                            {BG_TEMPLATES.map((t, i) => {
                                const isSelected = !isCustomBgActive && selectedBgIdx === i
                                return (
                                    <button
                                        key={t.id}
                                        type="button"
                                        onClick={() => {
                                            setSelectedBgIdx(i)
                                            setIsCustomBgActive(false)
                                        }}
                                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition-all ${
                                            isSelected
                                                ? 'border-primary bg-primary/15 text-foreground font-bold shadow-xs ring-1 ring-primary/40'
                                                : 'border-border/60 bg-muted/30 text-muted-foreground hover:text-foreground'
                                        }`}
                                    >
                                        <span
                                            className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                                            style={{
                                                background: t.isTransparent ? 'linear-gradient(45deg, #38bdf8 0%, #a855f7 100%)' : t.accentProfit,
                                            }}
                                        />
                                        <span>{t.label}</span>
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
                            <span>Wallpaper Kustom:</span>
                        </span>

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
                <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-border/40 bg-card/30">
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
                            disabled: downloading,
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
                                const refStr = showReferral && activeReferral ? `\nRef Code: ${activeReferral}` : ''
                                const text = `${trade.trade.symbol} ${trade.trade.direction.toUpperCase()} ${leverage}x | ${formatPercent(roiPercent)} ROI | ${formatPnl(trade.trade.realizedPnl)} USDT${refStr}\n\n#Trading #Crypto #${brandTitle} ${traderHandle}`
                                window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`, '_blank')
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
            </div>
        </Modal>
    )
}

// ---------------------------------------------------------------------------
// Komponen PnlCard — HTML Live Preview
// ---------------------------------------------------------------------------

interface PnlCardProps {
    trade: TradeDetail
    bg: BgTemplate
    accent: string
    roiPercent: number
    duration: string
    leverage: number
    selectedExchange: ExchangeName
    traderHandle: string
    brandTitle: string
    brandSubtitle: string
    activeLogoUrl: string | null
    activeReferral: string
    avatarUrl: string | null
    isCustomBgActive: boolean
    customBgUrl: string | null
    bgDimming: number
    showSide: boolean
    showPnl: boolean
    showRoi: boolean
    showTradeTimes: boolean
    showProfile: boolean
    showWatermark: boolean
    showDuration: boolean
    showPlan: boolean
    plannedStop: number | null
    plannedTarget: number | null
    plannedRr: number | null
    setupTag: string | null
    executionGrade: ExecutionGrade | null
    emotionTag: string | null
    showSetup: boolean
    showGrade: boolean
    showEmotion: boolean
    showReferral: boolean
    showThesis: boolean
    customThesis: string
    showReview: boolean
    customReview: string
    showFullText: boolean
}

function PnlCard({
    trade, bg, accent, roiPercent, duration, leverage, selectedExchange,
    traderHandle, brandTitle, brandSubtitle, activeLogoUrl, activeReferral,
    avatarUrl, isCustomBgActive, customBgUrl, bgDimming,
    showSide, showPnl, showRoi, showTradeTimes, showProfile, showWatermark, showDuration,
    showPlan, plannedStop, plannedTarget, plannedRr,
    setupTag, executionGrade, emotionTag, showSetup, showGrade, showEmotion,
    showReferral, showThesis, customThesis, showReview, customReview, showFullText
}: PnlCardProps) {
    const isTransparentMode = !isCustomBgActive && bg.isTransparent
    const hasReferralDisplay = showReferral && !!activeReferral.trim()

    return (
        <div
            className="relative overflow-hidden transition-all duration-200 select-none"
            style={{
                borderRadius: 24,
                padding: '24px 28px 20px',
                background: isCustomBgActive
                    ? 'transparent'
                    : isTransparentMode
                        ? 'linear-gradient(135deg, rgba(15, 23, 42, 0.88) 0%, rgba(10, 15, 30, 0.92) 100%)'
                        : bg.bg,
                border: isTransparentMode ? `1.5px solid ${accent}66` : `1px solid ${bg.border}`,
                boxShadow: isTransparentMode ? `0 8px 32px rgba(0, 0, 0, 0.5), 0 0 24px ${accent}22` : '0 12px 36px rgba(0, 0, 0, 0.35)',
            }}
        >
            {/* Custom Image Background */}
            {isCustomBgActive && customBgUrl && (
                <>
                    <div
                        className="pointer-events-none absolute inset-0 bg-cover bg-center"
                        style={{ backgroundImage: `url(${customBgUrl})` }}
                    />
                    <div
                        className="pointer-events-none absolute inset-0"
                        style={{ backgroundColor: `rgba(0, 0, 0, ${bgDimming / 100})` }}
                    />
                </>
            )}

            {/* Grid Pattern Overlay */}
            <div
                className="pointer-events-none absolute inset-0"
                style={{
                    backgroundImage: 'linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)',
                    backgroundSize: '48px 48px',
                }}
            />

            {/* Ambient Radial Glow */}
            <div
                className="pointer-events-none absolute inset-0"
                style={{
                    background: `radial-gradient(ellipse at 50% 25%, ${accent}20 0%, transparent 65%)`,
                }}
            />

            {/* Konten Utama */}
            <div className="relative z-10">
                {/* ── Header: Logo/Brand + Logo Exchange & Kode Referral ── */}
                <div className="flex items-start justify-between mb-5">
                    <div className="flex items-center gap-2">
                        <span className="font-bold text-white text-base tracking-widest uppercase">
                            {brandTitle}
                        </span>
                        <span
                            className="text-[10px] font-bold px-1.5 py-0.5 rounded tracking-wide"
                            style={{ background: `${accent}25`, color: accent, border: `1px solid ${accent}44` }}
                        >
                            {brandSubtitle}
                        </span>
                    </div>

                    {/* Sisi Kanan: Logo Exchange + Kode Referral di Bawahnya */}
                    <div className="flex flex-col items-end gap-1">
                        {activeLogoUrl ? (
                            <img src={activeLogoUrl} alt={selectedExchange} className="h-6 max-w-[110px] object-contain" />
                        ) : (
                            <span
                                className="text-[11px] font-bold uppercase px-2.5 py-1 rounded-md tracking-wider"
                                style={{
                                    background: 'rgba(255,255,255,0.08)',
                                    border: '1px solid rgba(255,255,255,0.14)',
                                    color: '#cbd5e1'
                                }}
                            >
                                {selectedExchange}
                            </span>
                        )}

                        {hasReferralDisplay && (
                            <span
                                className="text-[9px] font-bold tracking-wide px-1.5 py-0.5 rounded"
                                style={{
                                    background: 'rgba(56, 189, 248, 0.15)',
                                    border: '1px solid rgba(56, 189, 248, 0.35)',
                                    color: '#38bdf8'
                                }}
                            >
                                Ref: {activeReferral}
                            </span>
                        )}
                    </div>
                </div>

                {/* ── Symbol + Direction ── */}
                <div className="flex items-center gap-3 mb-2">
                    <span className="text-2xl font-bold text-white leading-none tracking-tight">
                        {trade.trade.symbol}
                    </span>
                    {showSide && (
                        <>
                            <div className="w-px h-4 opacity-30" style={{ background: '#d9d9d9' }} />
                            <div className="flex items-center gap-1.5 text-sm font-semibold">
                                <span style={{ color: accent }}>
                                    {trade.trade.direction.toUpperCase()}
                                </span>
                                <span className="text-white">{leverage}X</span>
                            </div>
                        </>
                    )}
                </div>

                {/* ── Journal Badges: Setup, Grade, Emosi ── */}
                {((showSetup && setupTag) || (showGrade && executionGrade) || (showEmotion && emotionTag)) && (
                    <div className="flex flex-wrap items-center gap-2 mb-2.5">
                        {showSetup && setupTag && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-sky-500/15 text-sky-400 border border-sky-500/30 shadow-xs">
                                <span>🎯</span>
                                <span>{setupTag}</span>
                            </span>
                        )}
                        {showGrade && executionGrade && (
                            <span
                                className={cn(
                                    'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border shadow-xs',
                                    executionGrade === 'A'
                                        ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                                        : executionGrade === 'B'
                                            ? 'bg-sky-500/15 text-sky-400 border-sky-500/30'
                                            : executionGrade === 'C'
                                                ? 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                                                : 'bg-rose-500/15 text-rose-400 border-rose-500/30'
                                )}
                            >
                                <span>⭐</span>
                                <span>Grade {executionGrade}</span>
                            </span>
                        )}
                        {showEmotion && emotionTag && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-purple-500/15 text-purple-300 border border-purple-500/30 shadow-xs">
                                <span>
                                    {emotionTag.toLowerCase() === 'calm' ? '😌' :
                                     emotionTag.toLowerCase() === 'fomo' ? '⚡' :
                                     emotionTag.toLowerCase() === 'revenge' ? '😤' :
                                     emotionTag.toLowerCase() === 'anxious' ? '😰' :
                                     emotionTag.toLowerCase() === 'overconfident' ? '😎' : '🧠'}
                                </span>
                                <span className="capitalize">{emotionTag}</span>
                            </span>
                        )}
                    </div>
                )}

                {/* ── ROI Hero ── */}
                {showRoi && (
                    <div
                        className="text-5xl font-extrabold leading-none my-3 tracking-tight"
                        style={{ color: accent, fontVariantNumeric: 'tabular-nums' }}
                    >
                        {formatPercent(roiPercent)}
                    </div>
                )}

                {/* ── PnL Amount ── */}
                {showPnl && (
                    <div className="flex items-center gap-2 mb-4">
                        <span className="text-xl font-bold" style={{ color: accent, fontVariantNumeric: 'tabular-nums' }}>
                            {formatPnl(trade.trade.realizedPnl)} USDT
                        </span>
                        {trade.rMultiple !== null && trade.rMultiple !== undefined && (
                            <span className="text-sm font-semibold" style={{ color: '#38bdf8' }}>
                                · {formatR(trade.rMultiple)}
                            </span>
                        )}
                    </div>
                )}

                {/* ── Key Metrics Grid (Entry, Exit, Duration, Aktual R:R) ── */}
                <div
                    className="grid grid-cols-4 gap-2 p-3 rounded-xl mb-3"
                    style={{
                        background: 'rgba(255, 255, 255, 0.04)',
                        border: '1px solid rgba(255, 255, 255, 0.08)'
                    }}
                >
                    <div>
                        <div className="text-[10px] leading-tight mb-1" style={{ color: bg.textSub }}>Entry Price</div>
                        <div className="text-xs font-bold text-white truncate">{formatPrice(trade.trade.entryPrice)}</div>
                        {showTradeTimes && trade.trade.entryTime && (
                            <div className="text-[9px] leading-tight mt-1 truncate font-medium" style={{ color: bg.textSub }}>
                                {formatDateTime(trade.trade.entryTime)}
                            </div>
                        )}
                    </div>
                    <div>
                        <div className="text-[10px] leading-tight mb-1" style={{ color: bg.textSub }}>Exit Price</div>
                        <div className="text-xs font-bold text-white truncate">{formatPrice(trade.trade.exitPrice)}</div>
                        {showTradeTimes && (
                            <div className="text-[9px] leading-tight mt-1 truncate font-medium" style={{ color: bg.textSub }}>
                                {trade.trade.exitTime ? formatDateTime(trade.trade.exitTime) : 'Posisi Terbuka'}
                            </div>
                        )}
                    </div>
                    <div>
                        <div className="text-[10px] leading-tight mb-1" style={{ color: bg.textSub }}>Duration</div>
                        <div className="text-xs font-bold text-white truncate">{showDuration ? duration : '—'}</div>
                    </div>
                    <div>
                        <div className="text-[10px] leading-tight mb-1" style={{ color: bg.textSub }}>R-Multiple</div>
                        <div
                            className="text-xs font-bold truncate"
                            style={{
                                color: trade.rMultiple !== null && trade.rMultiple !== undefined
                                    ? (trade.rMultiple > 0 ? '#10b981' : trade.rMultiple < 0 ? '#ef4444' : '#ffffff')
                                    : '#94a3b8'
                            }}
                        >
                            {trade.rMultiple !== null && trade.rMultiple !== undefined ? formatR(trade.rMultiple) : '—'}
                        </div>
                    </div>
                </div>

                {/* ── Planned Risk Grid (Plan SL, Plan TP, Plan R:R) ── */}
                {showPlan && (
                    <div
                        className="grid grid-cols-3 gap-2 p-3 rounded-xl mb-3"
                        style={{
                            background: 'rgba(255, 255, 255, 0.03)',
                            border: '1px solid rgba(255, 255, 255, 0.06)'
                        }}
                    >
                        <div>
                            <div className="text-[10px] leading-tight mb-1" style={{ color: bg.textSub }}>Plan SL</div>
                            <div className="text-xs font-bold text-rose-400 truncate">
                                {plannedStop !== null && plannedStop !== undefined ? formatPrice(plannedStop) : '—'}
                            </div>
                        </div>
                        <div>
                            <div className="text-[10px] leading-tight mb-1" style={{ color: bg.textSub }}>Plan TP</div>
                            <div className="text-xs font-bold text-emerald-400 truncate">
                                {plannedTarget !== null && plannedTarget !== undefined ? formatPrice(plannedTarget) : '—'}
                            </div>
                        </div>
                        <div>
                            <div className="text-[10px] leading-tight mb-1" style={{ color: bg.textSub }}>Plan R:R</div>
                            <div className="text-xs font-bold text-sky-400 truncate">
                                {plannedRr !== null && plannedRr !== undefined ? `1:${plannedRr.toFixed(2)}` : '—'}
                            </div>
                        </div>
                    </div>
                )}

                {/* ── Trade Thesis (Dinamis: Penuh / Compact) ── */}
                {showThesis && customThesis.trim() && (
                    <div
                        className="mt-2.5 rounded-xl px-3.5 py-2.5"
                        style={{
                            background: 'rgba(15, 23, 42, 0.7)',
                            border: `1px solid ${accent}33`,
                        }}
                    >
                        <div className="text-[11px] font-bold mb-1" style={{ color: accent }}>
                            💡 Trade Thesis
                        </div>
                        <p className={`text-xs italic leading-relaxed text-white/90 ${showFullText ? 'whitespace-pre-wrap' : 'line-clamp-3'}`}>
                            "{customThesis}"
                        </p>
                    </div>
                )}

                {/* ── Post-Trade Review (Dinamis: Penuh / Compact) ── */}
                {showReview && customReview.trim() && (
                    <div
                        className="mt-2 rounded-xl px-3.5 py-2.5"
                        style={{
                            background: 'rgba(15, 23, 42, 0.55)',
                            border: '1px solid rgba(148, 163, 184, 0.2)',
                        }}
                    >
                        <div className="text-[11px] font-bold mb-1 text-sky-400">
                            📝 Post-Trade Review
                        </div>
                        <p className={`text-xs leading-relaxed text-white/80 ${showFullText ? 'whitespace-pre-wrap' : 'line-clamp-2'}`}>
                            {customReview}
                        </p>
                    </div>
                )}

                {/* ── Footer: Profile + Watermark ── */}
                {(showProfile || showWatermark) && (
                    <div
                        className="flex items-center justify-between mt-4 pt-3"
                        style={{ borderTop: '1px solid rgba(255, 255, 255, 0.1)' }}
                    >
                        {showProfile && (
                            <div className="flex items-center gap-2.5">
                                {avatarUrl ? (
                                    <img
                                        src={avatarUrl}
                                        alt="Avatar"
                                        className="w-9 h-9 rounded-full object-cover flex-shrink-0"
                                        style={{ border: `1.5px solid ${accent}` }}
                                    />
                                ) : (
                                    <div
                                        className="w-9 h-9 rounded-full flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0"
                                        style={{ background: `${accent}33`, border: `1.5px solid ${accent}` }}
                                    >
                                        {traderHandle.replace('@', '').slice(0, 2).toUpperCase() || 'TR'}
                                    </div>
                                )}
                                <div>
                                    <div className="text-xs font-bold text-white leading-tight">
                                        {traderHandle}
                                    </div>
                                    <div className="text-[10px]" style={{ color: bg.textSub }}>
                                        {formatDate(trade.trade.exitTime)}
                                    </div>
                                </div>
                            </div>
                        )}

                        {showWatermark && (
                            <div className="text-[10px] text-right leading-tight ml-auto" style={{ color: bg.textSub }}>
                                <div className="font-semibold text-white/80">nitirekso</div>
                                <div>Trading Journal</div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    )
}
