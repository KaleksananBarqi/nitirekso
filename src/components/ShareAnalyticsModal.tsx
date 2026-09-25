import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { TradeDetail } from '@shared/domain'
import { Modal } from './ui'
import { summarize, buildEquityCurve, computeDrawdown } from '../lib/analytics/metrics'
import { formatDate, formatPnl, formatRatio } from '../lib/format'
import { cn } from '../lib/utils'
import {
    BG_TEMPLATES,
    BUILTIN_TEMPLATES,
    loadShareSettings,
    loadCustomBgList,
    addCustomBgItem,
    getAllShareTemplates,
    saveCustomShareTemplate,
    deleteCustomShareTemplate,
    getActiveTemplateId,
    setActiveTemplateId,
    type BgTemplate,
    type ShareCardTemplate,
    type CustomBgItem
} from '../lib/shareSettings'

// ---------------------------------------------------------------------------
// Tipe Props & Opsi Rasio Kartu
// ---------------------------------------------------------------------------

export type CardAspectRatio = '16:9' | '1:1' | '4:5'

export interface ShareAnalyticsModalProps {
    isOpen: boolean
    onClose: () => void
    trades: TradeDetail[]
    initialPeriodLabel?: string
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
// Helper Gambar Canvas (Kurva Ekuitas di Canvas)
// ---------------------------------------------------------------------------

function drawEquityCurveOnCanvas(
    ctx: CanvasRenderingContext2D,
    points: { equity: number }[],
    x: number,
    y: number,
    w: number,
    h: number,
    color: string
): void {
    if (points.length < 2) return

    const minPnl = Math.min(...points.map((p) => p.equity))
    const maxPnl = Math.max(...points.map((p) => p.equity))
    const range = maxPnl - minPnl || 1

    const getCoord = (p: { equity: number }, idx: number) => {
        const px = x + (idx / (points.length - 1)) * w
        const py = y + h - ((p.equity - minPnl) / range) * (h - 24) - 12
        return { px, py }
    }

    // 1. Area Fill Gradient
    ctx.save()
    const areaGrad = ctx.createLinearGradient(0, y, 0, y + h)
    areaGrad.addColorStop(0, `${color}44`)
    areaGrad.addColorStop(1, `${color}00`)

    ctx.beginPath()
    const first = getCoord(points[0]!, 0)
    ctx.moveTo(first.px, first.py)

    for (let i = 1; i < points.length; i++) {
        const pt = getCoord(points[i]!, i)
        ctx.lineTo(pt.px, pt.py)
    }

    ctx.lineTo(x + w, y + h)
    ctx.lineTo(x, y + h)
    ctx.closePath()
    ctx.fillStyle = areaGrad
    ctx.fill()

    // 2. Stroke Line dengan Glow
    ctx.beginPath()
    ctx.moveTo(first.px, first.py)
    for (let i = 1; i < points.length; i++) {
        const pt = getCoord(points[i]!, i)
        ctx.lineTo(pt.px, pt.py)
    }
    ctx.strokeStyle = color
    ctx.lineWidth = 4
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.shadowColor = color
    ctx.shadowBlur = 12
    ctx.stroke()

    // 3. Dot di Titik Terakhir
    const last = getCoord(points[points.length - 1]!, points.length - 1)
    ctx.beginPath()
    ctx.arc(last.px, last.py, 6, 0, Math.PI * 2)
    ctx.fillStyle = '#ffffff'
    ctx.fill()
    ctx.lineWidth = 3
    ctx.strokeStyle = color
    ctx.stroke()
    ctx.restore()
}

// ---------------------------------------------------------------------------
// Komponen Utama Modal Pamer Analisa
// ---------------------------------------------------------------------------

export function ShareAnalyticsModal({
    isOpen,
    onClose,
    trades,
    initialPeriodLabel = 'All-Time Performance'
}: ShareAnalyticsModalProps): React.JSX.Element | null {
    if (!isOpen) return null
    return (
        <ShareAnalyticsModalContent
            trades={trades}
            initialPeriodLabel={initialPeriodLabel}
            onClose={onClose}
        />
    )
}

function ShareAnalyticsModalContent({
    trades,
    initialPeriodLabel,
    onClose
}: {
    trades: TradeDetail[]
    initialPeriodLabel: string
    onClose: () => void
}): React.JSX.Element {
    // --- Kalkulasi Metrik Analitik ---
    const summary = useMemo(() => summarize(trades), [trades])
    const curve = useMemo(() => buildEquityCurve(trades), [trades])
    const drawdown = useMemo(() => computeDrawdown(curve), [curve])
    const isProfit = summary.netPnlTotal >= 0

    // --- Muat Konfigurasi Branding, Template & Galeri Wallpaper ---
    const [savedSettings] = useState(() => loadShareSettings())
    const [customBgList, setCustomBgList] = useState<CustomBgItem[]>(() => loadCustomBgList())
    const [templates, setTemplates] = useState<ShareCardTemplate[]>(() => getAllShareTemplates())
    const [activeTemplateId, setActiveTplId] = useState<string>(() => getActiveTemplateId())

    const activeTemplate = templates.find((t) => t.id === activeTemplateId) || templates[0]!

    const initialBgIdx = Math.max(
        0,
        BG_TEMPLATES.findIndex((t) => t.id === (activeTemplate?.bgPresetId || savedSettings.bgPresetId))
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

    const bg: BgTemplate = BG_TEMPLATES[selectedBgIdx] ?? BG_TEMPLATES[0]!
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

        const bgIdx = BG_TEMPLATES.findIndex((b) => b.id === tpl.bgPresetId)
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

    // --- Render ke Canvas Beresolusi Tinggi (Retina Export Engine 2x) ---
    const renderCanvas = useCallback((): HTMLCanvasElement | null => {
        const canvas = canvasRef.current
        if (!canvas) return null
        const ctx = canvas.getContext('2d')
        if (!ctx) return null

        let canvasW = 1280
        let canvasH = 720
        if (aspectRatio === '1:1') {
            canvasW = 1080
            canvasH = 1080
        } else if (aspectRatio === '4:5') {
            canvasW = 1080
            canvasH = 1350
        }

        canvas.width = canvasW
        canvas.height = canvasH
        ctx.clearRect(0, 0, canvasW, canvasH)

        const isTransparentMode = !isCustomBgActive && bg.isTransparent

        // 1. Gambar Background
        if (!isTransparentMode) {
            if (isCustomBgActive && customBgImgRef.current && customBgImgRef.current.complete) {
                const img = customBgImgRef.current
                const imgAspect = img.width / img.height
                const canvasAspect = canvasW / canvasH
                let drawW = canvasW
                let drawH = canvasH
                let drawX = 0
                let drawY = 0
                if (imgAspect > canvasAspect) {
                    drawW = canvasH * imgAspect
                    drawX = (canvasW - drawW) / 2
                } else {
                    drawH = canvasW / imgAspect
                    drawY = (canvasH - drawH) / 2
                }
                ctx.drawImage(img, drawX, drawY, drawW, drawH)
                ctx.fillStyle = `rgba(0, 0, 0, ${bgDimming / 100})`
                ctx.fillRect(0, 0, canvasW, canvasH)
            } else {
                // Preset gradient
                const grad = ctx.createLinearGradient(0, 0, 0, canvasH)
                if (bg.id === 'cyberpunk') {
                    grad.addColorStop(0, '#1e0836')
                    grad.addColorStop(0.5, '#0a0014')
                    grad.addColorStop(1, '#000000')
                } else if (bg.id === 'emerald') {
                    grad.addColorStop(0, '#064e3b')
                    grad.addColorStop(0.6, '#022c22')
                    grad.addColorStop(1, '#020617')
                } else if (bg.id === 'sunset') {
                    grad.addColorStop(0, '#2e1065')
                    grad.addColorStop(0.5, '#1e0a30')
                    grad.addColorStop(1, '#0f172a')
                } else if (bg.id === 'obsidian') {
                    grad.addColorStop(0, '#18181b')
                    grad.addColorStop(0.6, '#09090b')
                    grad.addColorStop(1, '#000000')
                } else {
                    grad.addColorStop(0, '#0d1117')
                    grad.addColorStop(0.5, '#0a0e1a')
                    grad.addColorStop(1, '#060912')
                }
                ctx.fillStyle = grad
                ctx.fillRect(0, 0, canvasW, canvasH)
            }
        }

        // 2. Kartu Glassmorphism Container
        const padX = aspectRatio === '16:9' ? 60 : 48
        const padY = aspectRatio === '16:9' ? 45 : 48
        const cardW = canvasW - padX * 2
        const cardH = canvasH - padY * 2
        const cardR = 28

        ctx.save()
        ctx.beginPath()
        ctx.roundRect(padX, padY, cardW, cardH, cardR)
        ctx.fillStyle = isTransparentMode ? 'rgba(10, 15, 30, 0.94)' : 'rgba(15, 23, 42, 0.72)'
        ctx.fill()
        ctx.strokeStyle = `${accent}55`
        ctx.lineWidth = 2
        ctx.stroke()
        ctx.restore()

        // 3. Header Branding & Periode
        ctx.save()
        const headerY = padY + 48
        ctx.font = 'bold 34px sans-serif'
        ctx.fillStyle = accent
        ctx.fillText(brandTitle, padX + 36, headerY)

        const titleWidth = ctx.measureText(brandTitle).width
        ctx.font = '300 24px sans-serif'
        ctx.fillStyle = 'rgba(255, 255, 255, 0.65)'
        ctx.fillText(brandSubtitle, padX + 36 + titleWidth + 12, headerY)

        ctx.font = '500 18px sans-serif'
        ctx.fillStyle = 'rgba(255, 255, 255, 0.55)'
        ctx.fillText(periodLabel, padX + 36, headerY + 28)

        // Badge Referral di Kanan Atas (jika aktif)
        if (showReferral && activeReferral) {
            const refText = `REF: ${activeReferral}`
            ctx.font = 'bold 16px sans-serif'
            const refW = ctx.measureText(refText).width + 20
            const badgeH = 34
            const refX = padX + cardW - 36 - refW
            const badgeY = padY + 28
            ctx.beginPath()
            ctx.roundRect(refX, badgeY, refW, badgeH, 10)
            ctx.fillStyle = 'rgba(56, 189, 248, 0.15)'
            ctx.fill()
            ctx.strokeStyle = 'rgba(56, 189, 248, 0.4)'
            ctx.lineWidth = 1.5
            ctx.stroke()
            ctx.fillStyle = '#38bdf8'
            ctx.fillText(refText, refX + 10, badgeY + 23)
        }
        ctx.restore()

        // 4. Hero Section: Total PnL & Win Rate
        const heroY = headerY + 60
        const heroH = aspectRatio === '16:9' ? 120 : 130
        const heroW = cardW - 72
        const heroX = padX + 36

        ctx.save()
        ctx.beginPath()
        ctx.roundRect(heroX, heroY, heroW, heroH, 18)
        ctx.fillStyle = 'rgba(255, 255, 255, 0.05)'
        ctx.fill()
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)'
        ctx.lineWidth = 1
        ctx.stroke()

        // Label Total Net PnL
        ctx.font = '600 16px sans-serif'
        ctx.fillStyle = 'rgba(255, 255, 255, 0.6)'
        ctx.fillText('TOTAL NET REALIZED P&L', heroX + 24, heroY + 36)

        // Nilai PnL
        ctx.font = '900 44px monospace'
        ctx.fillStyle = isProfit ? '#4ade80' : '#f87171'
        const pnlText = hideNominal
            ? (isProfit ? '+★★★★★' : '-★★★★★')
            : `${isProfit ? '+' : ''}${formatPnl(summary.netPnlTotal)} USDT`
        ctx.fillText(pnlText, heroX + 24, heroY + 86)

        // Box Win Rate di Kanan Hero
        const winBoxW = 170
        const winBoxH = heroH - 24
        const winBoxX = heroX + heroW - winBoxW - 12
        const winBoxY = heroY + 12

        ctx.beginPath()
        ctx.roundRect(winBoxX, winBoxY, winBoxW, winBoxH, 14)
        ctx.fillStyle = `${accent}22`
        ctx.fill()
        ctx.strokeStyle = `${accent}55`
        ctx.lineWidth = 1.5
        ctx.stroke()

        ctx.font = 'bold 15px sans-serif'
        ctx.fillStyle = 'rgba(255, 255, 255, 0.7)'
        ctx.fillText('WIN RATE', winBoxX + 20, winBoxY + 30)

        ctx.font = '900 34px sans-serif'
        ctx.fillStyle = accent
        const winRateStr = summary.winRate !== null ? (summary.winRate * 100).toFixed(1) : '0.0'
        ctx.fillText(`${winRateStr}%`, winBoxX + 20, winBoxY + 70)
        ctx.restore()

        // 5. Kurva Ekuitas (Chart)
        const gap1 = aspectRatio === '4:5' ? 28 : (aspectRatio === '1:1' ? 22 : 16)
        let curY = heroY + heroH + gap1
        if (showChart && curve.length >= 2) {
            const chartH = aspectRatio === '4:5' ? 320 : (aspectRatio === '1:1' ? 220 : 135)
            const chartW = heroW
            const chartX = heroX

            ctx.save()
            ctx.beginPath()
            ctx.roundRect(chartX, curY, chartW, chartH, 16)
            ctx.fillStyle = 'rgba(0, 0, 0, 0.35)'
            ctx.fill()
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)'
            ctx.lineWidth = 1
            ctx.stroke()

            ctx.font = '600 15px sans-serif'
            ctx.fillStyle = 'rgba(255, 255, 255, 0.55)'
            ctx.fillText('EQUITY GROWTH TRAJECTORY', chartX + 20, curY + 28)

            ctx.font = '500 14px sans-serif'
            ctx.fillStyle = 'rgba(255, 255, 255, 0.4)'
            ctx.fillText(`${curve.length} points`, chartX + chartW - 90, curY + 28)

            drawEquityCurveOnCanvas(ctx, curve, chartX + 16, curY + 34, chartW - 32, chartH - 50, accent)
            ctx.restore()

            const gap2 = aspectRatio === '4:5' ? 26 : (aspectRatio === '1:1' ? 20 : 16)
            curY += chartH + gap2
        }

        // 6. Bento Grid Stat Bar (8 Metrik Kuantitatif & Risiko Nitirekso)
        const gridW = heroW
        const gridCols = aspectRatio === '4:5' ? 2 : 4
        const gridGap = aspectRatio === '4:5' ? 14 : 12
        const gridItemW = (gridW - (gridCols - 1) * gridGap) / gridCols
        const gridItemH = aspectRatio === '4:5' ? 82 : (aspectRatio === '1:1' ? 74 : 64)

        const recoveryStr = summary.recoveryFactor !== null
            ? (!Number.isFinite(summary.recoveryFactor) ? '∞' : summary.recoveryFactor.toFixed(2))
            : '—'

        const streakStr = `${summary.maxConsecutiveWins}W / ${summary.maxConsecutiveLosses}L`

        const metricsData = [
            {
                label: 'TOTAL TRADES',
                value: `${summary.totalTrades} (${summary.wins}W/${summary.losses}L)`
            },
            {
                label: 'PROFIT FACTOR',
                value: summary.profitFactor !== Number.POSITIVE_INFINITY ? formatRatio(summary.profitFactor) : '∞'
            },
            {
                label: 'TOTAL R',
                value: summary.totalR !== null
                    ? `${summary.totalR >= 0 ? '+' : ''}${summary.totalR.toFixed(2)} R`
                    : '—'
            },
            {
                label: 'EXPECTANCY (R)',
                value: summary.expectancyR !== null
                    ? `${summary.expectancyR >= 0 ? '+' : ''}${summary.expectancyR.toFixed(2)} R`
                    : (hideNominal ? '★★★' : (summary.expectancy !== null ? `${formatPnl(summary.expectancy)} USDT` : '—'))
            },
            {
                label: 'RECOVERY FACTOR',
                value: recoveryStr
            },
            {
                label: 'MAX STREAK',
                value: streakStr
            },
            {
                label: 'MAX DRAWDOWN',
                value: hideNominal ? '★★★' : `${formatPnl(drawdown.maxDrawdown)} USDT`
            },
            {
                label: 'AVG WIN / LOSS',
                value: hideNominal ? '★★★ / ★★★' : `${formatPnl(summary.avgWin || 0)} / ${formatPnl(summary.avgLoss || 0)}`
            }
        ]

        ctx.save()
        metricsData.forEach((item, idx) => {
            const row = Math.floor(idx / gridCols)
            const col = idx % gridCols
            const gx = heroX + col * (gridItemW + gridGap)
            const gy = curY + row * (gridItemH + gridGap)

            ctx.beginPath()
            ctx.roundRect(gx, gy, gridItemW, gridItemH, 12)
            ctx.fillStyle = 'rgba(255, 255, 255, 0.04)'
            ctx.fill()
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)'
            ctx.lineWidth = 1
            ctx.stroke()

            ctx.font = '600 12px sans-serif'
            ctx.fillStyle = 'rgba(255, 255, 255, 0.5)'
            ctx.fillText(item.label, gx + 14, gy + 24)

            ctx.font = 'bold 17px monospace'
            ctx.fillStyle = '#ffffff'
            ctx.fillText(item.value, gx + 14, gy + (gridItemH >= 78 ? 56 : 50))
        })
        ctx.restore()

        const numRows = Math.ceil(metricsData.length / gridCols)
        curY += numRows * (gridItemH + gridGap) + 12

        // Catatan Trader Kustom (jika ada)
        if (customTraderNote.trim()) {
            ctx.save()
            const noteLines = wrapCanvasText(ctx, `“${customTraderNote.trim()}”`, heroW - 40)
            const noteH = noteLines.length * 24 + 20
            ctx.beginPath()
            ctx.roundRect(heroX, curY, heroW, noteH, 10)
            ctx.fillStyle = `${accent}12`
            ctx.fill()
            ctx.strokeStyle = `${accent}33`
            ctx.lineWidth = 1
            ctx.stroke()

            ctx.font = 'italic 16px sans-serif'
            ctx.fillStyle = '#ffffff'
            noteLines.forEach((line, i) => {
                ctx.fillText(line, heroX + 20, curY + 26 + i * 24)
            })
            ctx.restore()
        }

        // 7. Footer: Profil Trader & Watermark
        const footerY = padY + cardH - 32
        ctx.save()
        if (showProfile) {
            const avatarX = padX + 36
            const avatarY = footerY - 14

            if (avatarImgRef.current && avatarImgRef.current.complete) {
                ctx.save()
                ctx.beginPath()
                ctx.arc(avatarX + 18, avatarY + 18, 18, 0, Math.PI * 2)
                ctx.clip()
                ctx.drawImage(avatarImgRef.current, avatarX, avatarY, 36, 36)
                ctx.restore()
                ctx.beginPath()
                ctx.arc(avatarX + 18, avatarY + 18, 18, 0, Math.PI * 2)
                ctx.strokeStyle = accent
                ctx.lineWidth = 2
                ctx.stroke()
            } else {
                ctx.beginPath()
                ctx.arc(avatarX + 18, avatarY + 18, 18, 0, Math.PI * 2)
                ctx.fillStyle = `${accent}33`
                ctx.fill()
                ctx.strokeStyle = accent
                ctx.lineWidth = 2
                ctx.stroke()

                ctx.font = 'bold 15px sans-serif'
                ctx.fillStyle = '#ffffff'
                const initials = traderHandle.replace('@', '').slice(0, 2).toUpperCase() || 'TR'
                ctx.fillText(initials, avatarX + 8, avatarY + 24)
            }

            ctx.font = 'bold 18px sans-serif'
            ctx.fillStyle = '#ffffff'
            ctx.fillText(traderHandle, avatarX + 46, avatarY + 16)

            ctx.font = '500 13px sans-serif'
            ctx.fillStyle = 'rgba(255, 255, 255, 0.5)'
            ctx.fillText('Verified Trader • nitirekso.app', avatarX + 46, avatarY + 34)
        }

        if (showWatermark) {
            ctx.font = '500 15px sans-serif'
            ctx.fillStyle = 'rgba(255, 255, 255, 0.4)'
            const wm = `${brandTitle} • ${formatDate(Date.now())}`
            const wmW = ctx.measureText(wm).width
            ctx.fillText(wm, padX + cardW - 36 - wmW, footerY + 12)
        }
        ctx.restore()

        return canvas
    }, [
        aspectRatio, isCustomBgActive, bg, accent, isProfit, customTraderNote,
        bgDimming, brandTitle, brandSubtitle, periodLabel,
        showReferral, activeReferral, hideNominal, summary, drawdown, showChart,
        curve, showProfile, avatarUrl, traderHandle, showWatermark
    ])

    // Update canvas render saat dependencies berubah
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

    const handleDownload = (): void => {
        const canvas = renderCanvas()
        if (!canvas) return
        setDownloading(true)
        try {
            const link = document.createElement('a')
            link.download = `Analytics-${periodLabel.replace(/\s+/g, '-')}-${Date.now()}.png`
            link.href = canvas.toDataURL('image/png')
            link.click()
        } finally {
            setDownloading(false)
        }
    }

    const handleTwitterShare = (): void => {
        const refStr = showReferral && activeReferral ? `\nRef Code: ${activeReferral}` : ''
        const pnlStr = hideNominal ? 'Profitable' : `${isProfit ? '+' : ''}${formatPnl(summary.netPnlTotal)} USDT`
        const winRateStr = summary.winRate !== null ? (summary.winRate * 100).toFixed(1) : '0.0'
        const pfStr = summary.profitFactor !== Number.POSITIVE_INFINITY ? formatRatio(summary.profitFactor) : '∞'
        const noteStr = customTraderNote ? `\n\n"${customTraderNote}"` : ''
        const text = `📊 Performance Report (${periodLabel}):\nNet P&L: ${pnlStr} | ${winRateStr}% Win Rate (${summary.totalTrades} Trades)\nMax Drawdown: ${formatPnl(drawdown.maxDrawdown)} USDT | Profit Factor: ${pfStr}${refStr}${noteStr}\n\n#TradingJournal #Crypto #${brandTitle} ${traderHandle}`

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
                        <AnalyticsCardPreview
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
                            {BG_TEMPLATES.map((t, i) => {
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
                                                ? `${t.label} (Aktif sebagai warna aksen & teks kartu)`
                                                : `${t.label} (Aktif sebagai background & warna aksen)`
                                        }
                                    >
                                        <span
                                            className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                                            style={{
                                                background: t.isTransparent ? 'linear-gradient(45deg, #38bdf8 0%, #a855f7 100%)' : t.accentProfit,
                                            }}
                                        />
                                        <span>{t.label}</span>
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
                            onClick: handleDownload,
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

// ---------------------------------------------------------------------------
// HTML Live Card Preview Komponen
// ---------------------------------------------------------------------------

interface AnalyticsCardPreviewProps {
    summary: ReturnType<typeof summarize>
    curve: ReturnType<typeof buildEquityCurve>
    drawdown: ReturnType<typeof computeDrawdown>
    bg: BgTemplate
    accent: string
    isProfit: boolean
    traderHandle: string
    brandTitle: string
    brandSubtitle: string
    activeReferral: string
    avatarUrl: string | null
    isCustomBgActive: boolean
    customBgUrl: string | null
    bgDimming: number
    showProfile: boolean
    showWatermark: boolean
    showChart: boolean
    hideNominal: boolean
    showReferral: boolean
    periodLabel: string
    customTraderNote?: string
    aspectRatio: CardAspectRatio
}

function AnalyticsCardPreview({
    summary, curve, drawdown, bg, accent, isProfit,
    traderHandle, brandTitle, brandSubtitle, activeReferral, avatarUrl,
    isCustomBgActive, customBgUrl, bgDimming, showProfile, showWatermark,
    showChart, hideNominal, showReferral, periodLabel, customTraderNote, aspectRatio
}: AnalyticsCardPreviewProps): React.JSX.Element {
    const isTransparentMode = !isCustomBgActive && bg.isTransparent

    // Render SVG Kurva Sederhana untuk Live Preview
    const svgCurvePath = useMemo(() => {
        if (curve.length < 2) return ''
        const minPnl = Math.min(...curve.map((p) => p.equity))
        const maxPnl = Math.max(...curve.map((p) => p.equity))
        const range = maxPnl - minPnl || 1
        const w = 440
        const h = 75

        return curve
            .map((p, i) => {
                const px = (i / (curve.length - 1)) * w
                const py = h - ((p.equity - minPnl) / range) * (h - 16) - 8
                return `${i === 0 ? 'M' : 'L'} ${px.toFixed(1)} ${py.toFixed(1)}`
            })
            .join(' ')
    }, [curve])

    return (
        <div
            className={cn(
                "relative overflow-hidden transition-all duration-200 select-none text-white font-sans",
                aspectRatio === '16:9' ? 'aspect-[16/9]' : aspectRatio === '1:1' ? 'aspect-square' : 'aspect-[4/5]'
            )}
            style={{
                borderRadius: 22,
                padding: aspectRatio === '16:9' ? '20px 24px 16px' : '22px 24px 18px',
                background: isCustomBgActive
                    ? 'transparent'
                    : isTransparentMode
                        ? 'linear-gradient(135deg, rgba(15, 23, 42, 0.88) 0%, rgba(10, 15, 30, 0.92) 100%)'
                        : bg.bg,
                border: isTransparentMode ? `1.5px solid ${accent}66` : `1px solid ${bg.border}`,
                boxShadow: isTransparentMode ? `0 8px 32px rgba(0, 0, 0, 0.5), 0 0 24px ${accent}22` : '0 12px 36px rgba(0, 0, 0, 0.35)'
            }}
        >
            {/* Custom Image Wallpaper */}
            {isCustomBgActive && customBgUrl && (
                <>
                    <img
                        src={customBgUrl}
                        alt="Background"
                        className="absolute inset-0 h-full w-full object-cover pointer-events-none"
                    />
                    <div
                        className="absolute inset-0 pointer-events-none"
                        style={{ backgroundColor: `rgba(0, 0, 0, ${bgDimming / 100})` }}
                    />
                </>
            )}

            <div className="relative z-10 flex flex-col justify-between h-full gap-2">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div>
                        <div className="flex items-baseline gap-1.5">
                            <span className="text-lg font-black tracking-wider" style={{ color: accent }}>
                                {brandTitle}
                            </span>
                            <span className="text-xs font-light text-white/60 tracking-wider">
                                {brandSubtitle}
                            </span>
                        </div>
                        <p className="text-[10px] text-white/50">{periodLabel}</p>
                    </div>

                    <div className="flex items-center gap-1.5">
                        {showReferral && activeReferral && (
                            <span className="text-[9px] font-bold text-sky-400 bg-sky-500/15 px-2 py-0.5 rounded border border-sky-400/30">
                                REF: {activeReferral}
                            </span>
                        )}
                    </div>
                </div>

                {/* Hero Stat Box */}
                <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3 flex items-center justify-between">
                    <div>
                        <span className="text-[9px] uppercase font-semibold text-white/50 tracking-wider">Total Net Profit</span>
                        <div className="text-xl font-black tabular-nums mt-0.5" style={{ color: isProfit ? '#4ade80' : '#f87171' }}>
                            {hideNominal
                                ? (isProfit ? '+★★★★★' : '-★★★★★')
                                : `${isProfit ? '+' : ''}${formatPnl(summary.netPnlTotal)} USDT`}
                        </div>
                    </div>
                    <div
                        className="rounded-lg p-2 text-center border"
                        style={{ background: `${accent}18`, borderColor: `${accent}44` }}
                    >
                        <span className="text-[9px] uppercase font-bold text-white/60 block">Win Rate</span>
                        <span className="text-base font-black" style={{ color: accent }}>
                            {summary.winRate !== null ? (summary.winRate * 100).toFixed(1) : '0.0'}%
                        </span>
                    </div>
                </div>

                {/* Kurva Ekuitas Mini */}
                {showChart && curve.length >= 2 && (
                    <div className="rounded-xl border border-white/10 bg-black/20 p-2">
                        <div className="flex items-center justify-between mb-0.5 text-[9px] text-white/50 font-semibold">
                            <span>EQUITY GROWTH</span>
                            <span>{curve.length} points</span>
                        </div>
                        <svg
                            viewBox="0 0 440 75"
                            className={cn(
                                "w-full overflow-visible",
                                aspectRatio === '4:5' ? "h-20" : aspectRatio === '1:1' ? "h-16" : "h-12"
                            )}
                        >
                            <path
                                d={svgCurvePath}
                                fill="none"
                                stroke={accent}
                                strokeWidth="2.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            />
                        </svg>
                    </div>
                )}

                {/* Bento Grid Stats (8 Metrik Kuantitatif & Risiko Nitirekso) */}
                <div className={cn(
                    "grid gap-1.5 text-left",
                    aspectRatio === '4:5' ? "grid-cols-2" : "grid-cols-4"
                )}>
                    <div className="rounded-lg border border-white/5 bg-white/[0.03] p-1.5">
                        <span className="text-[8px] text-white/50 uppercase block">Total Trades</span>
                        <span className="text-[11px] font-bold text-white">{summary.totalTrades} ({summary.wins}W/{summary.losses}L)</span>
                    </div>
                    <div className="rounded-lg border border-white/5 bg-white/[0.03] p-1.5">
                        <span className="text-[8px] text-white/50 uppercase block">Profit Factor</span>
                        <span className="text-[11px] font-bold text-white">{summary.profitFactor !== Number.POSITIVE_INFINITY ? formatRatio(summary.profitFactor) : '∞'}</span>
                    </div>
                    <div className="rounded-lg border border-white/5 bg-white/[0.03] p-1.5">
                        <span className="text-[8px] text-white/50 uppercase block">Total R</span>
                        <span className="text-[11px] font-bold text-white">
                            {summary.totalR !== null ? `${summary.totalR >= 0 ? '+' : ''}${summary.totalR.toFixed(2)} R` : '—'}
                        </span>
                    </div>
                    <div className="rounded-lg border border-white/5 bg-white/[0.03] p-1.5">
                        <span className="text-[8px] text-white/50 uppercase block">Expectancy (R)</span>
                        <span className="text-[11px] font-bold text-white">
                            {summary.expectancyR !== null
                                ? `${summary.expectancyR >= 0 ? '+' : ''}${summary.expectancyR.toFixed(2)} R`
                                : (hideNominal ? '★★★' : (summary.expectancy !== null ? `${formatPnl(summary.expectancy)} USDT` : '—'))}
                        </span>
                    </div>
                    <div className="rounded-lg border border-white/5 bg-white/[0.03] p-1.5">
                        <span className="text-[8px] text-white/50 uppercase block">Recovery Factor</span>
                        <span className="text-[11px] font-bold text-white">
                            {summary.recoveryFactor !== null ? (!Number.isFinite(summary.recoveryFactor) ? '∞' : summary.recoveryFactor.toFixed(2)) : '—'}
                        </span>
                    </div>
                    <div className="rounded-lg border border-white/5 bg-white/[0.03] p-1.5">
                        <span className="text-[8px] text-white/50 uppercase block">Max Streak</span>
                        <span className="text-[11px] font-bold text-white">{summary.maxConsecutiveWins}W / {summary.maxConsecutiveLosses}L</span>
                    </div>
                    <div className="rounded-lg border border-white/5 bg-white/[0.03] p-1.5">
                        <span className="text-[8px] text-white/50 uppercase block">Max Drawdown</span>
                        <span className="text-[11px] font-bold text-white">
                            {hideNominal ? '★★★' : `${formatPnl(drawdown.maxDrawdown)} USDT`}
                        </span>
                    </div>
                    <div className="rounded-lg border border-white/5 bg-white/[0.03] p-1.5">
                        <span className="text-[8px] text-white/50 uppercase block">Avg Win / Loss</span>
                        <span className="text-[11px] font-bold text-white">{hideNominal ? '★★★ / ★★★' : `${formatPnl(summary.avgWin || 0)} / ${formatPnl(summary.avgLoss || 0)}`}</span>
                    </div>
                </div>

                {/* Catatan Trader Kustom (jika ada) */}
                {customTraderNote && (
                    <div className="rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[10px] text-white/80 italic">
                        "{customTraderNote}"
                    </div>
                )}

                {/* Footer Profile & Watermark */}
                {(showProfile || showWatermark) && (
                    <div className="flex items-center justify-between border-t border-white/10 pt-2">
                        {showProfile ? (
                            <div className="flex items-center gap-1.5">
                                {avatarUrl ? (
                                    <img
                                        src={avatarUrl}
                                        alt="Avatar"
                                        className="h-6 w-6 rounded-full object-cover"
                                        style={{ border: `1.5px solid ${accent}` }}
                                    />
                                ) : (
                                    <div
                                        className="flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold text-white"
                                        style={{ background: `${accent}33`, border: `1.5px solid ${accent}` }}
                                    >
                                        {traderHandle.replace('@', '').slice(0, 2).toUpperCase() || 'TR'}
                                    </div>
                                )}
                                <div>
                                    <div className="text-[11px] font-bold text-white leading-tight">{traderHandle}</div>
                                    <div className="text-[8px] text-white/50 leading-tight">Verified Trader</div>
                                </div>
                            </div>
                        ) : <div />}

                        {showWatermark && (
                            <span className="text-[9px] text-white/40 font-medium">
                                {brandTitle} • {formatDate(Date.now())}
                            </span>
                        )}
                    </div>
                )}
            </div>
        </div>
    )
}
