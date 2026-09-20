import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { TradeDetail } from '@shared/domain'
import { Modal } from './ui'
import { summarize, buildEquityCurve, computeDrawdown } from '../lib/analytics/metrics'
import { formatDate, formatPnl, formatRatio } from '../lib/format'
import {
    BG_TEMPLATES,
    EXCHANGES,
    loadShareSettings,
    type BgTemplate,
    type ExchangeName
} from '../lib/shareSettings'

// ---------------------------------------------------------------------------
// Tipe Props
// ---------------------------------------------------------------------------

export interface ShareAnalyticsModalProps {
    isOpen: boolean
    onClose: () => void
    trades: TradeDetail[]
}

// ---------------------------------------------------------------------------
// Helper Gambar Canvas (Kurva Ekuitas di Canvas)
// ---------------------------------------------------------------------------

function drawEquityCurveOnCanvas(
    ctx: CanvasRenderingContext2D,
    points: { x: number; y: number }[],
    x: number,
    y: number,
    w: number,
    h: number,
    color: string
): void {
    if (points.length < 2) return

    const minPnl = Math.min(...points.map((p) => p.y))
    const maxPnl = Math.max(...points.map((p) => p.y))
    const range = maxPnl - minPnl || 1

    const getCoord = (p: { x: number; y: number }, idx: number) => {
        const px = x + (idx / (points.length - 1)) * w
        const py = y + h - ((p.y - minPnl) / range) * (h - 20) - 10
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
    ctx.lineWidth = 2.5
    ctx.strokeStyle = color
    ctx.stroke()
    ctx.restore()
}

// ---------------------------------------------------------------------------
// Komponen Utama Modal Pamer Analisa
// ---------------------------------------------------------------------------

export function ShareAnalyticsModal({ isOpen, onClose, trades }: ShareAnalyticsModalProps): React.JSX.Element | null {
    if (!isOpen) return null
    return <ShareAnalyticsModalContent trades={trades} onClose={onClose} />
}

function ShareAnalyticsModalContent({ trades, onClose }: { trades: TradeDetail[]; onClose: () => void }): React.JSX.Element {
    // --- Kalkulasi Metrik Analitik ---
    const summary = useMemo(() => summarize(trades), [trades])
    const curve = useMemo(() => buildEquityCurve(trades), [trades])
    const drawdown = useMemo(() => computeDrawdown(curve), [curve])
    const isProfit = summary.netPnlTotal >= 0

    // --- Muat Konfigurasi Branding dari Settings ---
    const [savedSettings] = useState(() => loadShareSettings())

    const initialBgIdx = Math.max(
        0,
        BG_TEMPLATES.findIndex((t) => t.id === savedSettings.bgPresetId)
    )

    // State: Background Preset
    const [selectedBgIdx, setSelectedBgIdx] = useState<number>(initialBgIdx)
    const [isCustomBgActive, setIsCustomBgActive] = useState<boolean>(savedSettings.isCustomBg && !!savedSettings.customBgUrl)

    const bg: BgTemplate = BG_TEMPLATES[selectedBgIdx] ?? BG_TEMPLATES[0]!
    const accent = isProfit ? bg.accentProfit : bg.accentLoss

    // Data Identitas & Branding dari Settings
    const avatarUrl = savedSettings.avatarUrl
    const traderHandle = savedSettings.traderHandle
    const brandTitle = savedSettings.brandTitle || 'NITIREKSO'
    const brandSubtitle = 'ANALYTICS'
    const customBgUrl = savedSettings.customBgUrl
    const bgDimming = savedSettings.bgDimming

    // Exchange selector
    const [selectedExchange, setSelectedExchange] = useState<ExchangeName>('mexc')
    const activeReferral = selectedExchange === 'bitunix' ? savedSettings.bitunixReferralCode : savedSettings.mexcReferralCode

    // State Toggle Tampilan
    const [showProfile, setShowProfile] = useState(true)
    const [showWatermark, setShowWatermark] = useState(true)
    const [showChart, setShowChart] = useState(true)
    const [hideNominal, setHideNominal] = useState(false)
    const [showReferral, setShowReferral] = useState<boolean>(savedSettings.showReferral)
    const [periodLabel, setPeriodLabel] = useState('All-Time Performance')

    // State Notifikasi Feedback
    const [copied, setCopied] = useState(false)
    const [downloading, setDownloading] = useState(false)

    // Refs
    const canvasRef = useRef<HTMLCanvasElement | null>(null)
    const avatarImgRef = useRef<HTMLImageElement | null>(null)
    const customBgImgRef = useRef<HTMLImageElement | null>(null)
    const mexcLogoImgRef = useRef<HTMLImageElement | null>(null)
    const bitunixLogoImgRef = useRef<HTMLImageElement | null>(null)

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
        if (customBgUrl) {
            const img = new Image()
            img.crossOrigin = 'anonymous'
            img.src = customBgUrl
            img.onload = () => { customBgImgRef.current = img }
        } else {
            customBgImgRef.current = null
        }
    }, [customBgUrl])

    // Preload Logo Exchanges
    useEffect(() => {
        if (savedSettings.mexcLogoUrl) {
            const img = new Image()
            img.crossOrigin = 'anonymous'
            img.src = savedSettings.mexcLogoUrl
            img.onload = () => { mexcLogoImgRef.current = img }
        }
        if (savedSettings.bitunixLogoUrl) {
            const img = new Image()
            img.crossOrigin = 'anonymous'
            img.src = savedSettings.bitunixLogoUrl
            img.onload = () => { bitunixLogoImgRef.current = img }
        }
    }, [savedSettings.mexcLogoUrl, savedSettings.bitunixLogoUrl])

    // --- Render ke Canvas Beresolusi Tinggi (Export Engine Retina 2x) ---
    const renderCanvas = useCallback((): HTMLCanvasElement | null => {
        const canvas = canvasRef.current
        if (!canvas) return null
        const ctx = canvas.getContext('2d')
        if (!ctx) return null

        const canvasW = 1080
        const canvasH = 1350
        canvas.width = canvasW
        canvas.height = canvasH

        ctx.clearRect(0, 0, canvasW, canvasH)

        const isTransparentMode = !isCustomBgActive && bg.isTransparent

        // 1. Gambar Background Keseluruhan
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
                // Background preset gradient
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

        // 2. Card Container
        const cardMargin = 40
        const cardX = cardMargin
        const cardY = cardMargin
        const cardW = canvasW - cardMargin * 2
        const cardH = canvasH - cardMargin * 2
        const cardRadius = 32

        ctx.save()
        if (isTransparentMode) {
            ctx.fillStyle = 'rgba(15, 23, 42, 0.90)'
            ctx.strokeStyle = `${accent}66`
            ctx.lineWidth = 2.5
        } else {
            ctx.fillStyle = 'rgba(10, 15, 29, 0.72)'
            ctx.strokeStyle = bg.border
            ctx.lineWidth = 1.5
        }
        ctx.beginPath()
        ctx.roundRect(cardX, cardY, cardW, cardH, cardRadius)
        ctx.fill()
        ctx.stroke()
        ctx.restore()

        const cx = cardX + 48
        const cw = cardW - 96
        let curY = cardY + 54

        // A. Header: Branding + Exchange Badge + Referral
        ctx.save()
        ctx.font = 'bold 36px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
        ctx.fillStyle = accent
        ctx.fillText(brandTitle, cx, curY)
        const brandW = ctx.measureText(brandTitle).width

        ctx.font = '300 36px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)'
        ctx.fillText(` ${brandSubtitle}`, cx + brandW, curY)

        // Exchange Badge
        const exBadgeText = selectedExchange.toUpperCase()
        ctx.font = 'bold 22px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
        const exTextW = ctx.measureText(exBadgeText).width
        const exBadgeW = exTextW + 36
        const exBadgeH = 44
        const exBadgeX = cardX + cardW - 48 - exBadgeW
        const exBadgeY = curY - 34

        ctx.fillStyle = `${accent}22`
        ctx.strokeStyle = `${accent}88`
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.roundRect(exBadgeX, exBadgeY, exBadgeW, exBadgeH, 12)
        ctx.fill()
        ctx.stroke()

        ctx.fillStyle = accent
        ctx.fillText(exBadgeText, exBadgeX + 18, exBadgeY + 30)

        // Referral Code jika ada
        if (showReferral && activeReferral) {
            const refText = `REF: ${activeReferral}`
            ctx.font = 'bold 18px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
            ctx.fillStyle = '#38bdf8'
            const refW = ctx.measureText(refText).width
            ctx.fillText(refText, exBadgeX - refW - 16, curY - 4)
        }
        ctx.restore()

        curY += 60

        // Subheader: Periode Badge
        ctx.save()
        ctx.font = '500 24px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
        ctx.fillStyle = bg.textSub
        ctx.fillText(periodLabel, cx, curY)
        ctx.restore()

        curY += 40

        // B. Hero Stat Box (Net Profit / ROI & Win Rate)
        const heroBoxH = 220
        ctx.save()
        ctx.fillStyle = 'rgba(255, 255, 255, 0.03)'
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.roundRect(cx, curY, cw, heroBoxH, 20)
        ctx.fill()
        ctx.stroke()

        // Label Hero
        ctx.font = '22px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
        ctx.fillStyle = bg.textSub
        ctx.fillText('TOTAL NET PROFIT', cx + 32, curY + 46)

        // Value Hero
        ctx.font = 'bold 68px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
        ctx.fillStyle = isProfit ? '#4ade80' : '#f87171'
        const heroPnlText = hideNominal
            ? (isProfit ? '+★★★★★' : '-★★★★★')
            : `${isProfit ? '+' : ''}${formatPnl(summary.netPnlTotal)} USDT`
        ctx.fillText(heroPnlText, cx + 32, curY + 128)

        // Win Rate Pill di kanan hero box
        const wrPillW = 200
        const wrPillH = 90
        const wrPillX = cx + cw - wrPillW - 32
        const wrPillY = curY + 55

        ctx.fillStyle = `${accent}18`
        ctx.strokeStyle = `${accent}55`
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.roundRect(wrPillX, wrPillY, wrPillW, wrPillH, 16)
        ctx.fill()
        ctx.stroke()

        ctx.font = '20px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
        ctx.fillStyle = bg.textSub
        ctx.fillText('WIN RATE', wrPillX + 24, wrPillY + 34)

        ctx.font = 'bold 36px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
        ctx.fillStyle = accent
        const winRateStr = summary.winRate !== null ? `${(summary.winRate * 100).toFixed(1)}%` : '—'
        ctx.fillText(winRateStr, wrPillX + 24, wrPillY + 74)
        ctx.restore()

        curY += heroBoxH + 28

        // C. Equity Curve Chart Box
        if (showChart && curve.length >= 2) {
            const chartBoxH = 260
            ctx.save()
            ctx.fillStyle = 'rgba(15, 23, 42, 0.45)'
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)'
            ctx.lineWidth = 1
            ctx.beginPath()
            ctx.roundRect(cx, curY, cw, chartBoxH, 20)
            ctx.fill()
            ctx.stroke()

            // Judul Kurva
            ctx.font = 'bold 20px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
            ctx.fillStyle = bg.textSub
            ctx.fillText('📈 PERFORMANCE EQUITY CURVE', cx + 24, curY + 36)

            const curvePoints = curve.map((c) => ({ x: c.time, y: c.equity }))
            drawEquityCurveOnCanvas(ctx, curvePoints, cx + 24, curY + 54, cw - 48, chartBoxH - 74, accent)
            ctx.restore()

            curY += chartBoxH + 28
        }

        // D. Bento Stats Grid (2 Baris x 3 Kolom)
        const statsRowsH = 260
        ctx.save()
        ctx.fillStyle = 'rgba(255, 255, 255, 0.03)'
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.roundRect(cx, curY, cw, statsRowsH, 20)
        ctx.fill()
        ctx.stroke()

        const colW = cw / 3
        const rowH = statsRowsH / 2

        const bentoStats = [
            { label: 'Total Trades', val: `${summary.totalTrades} (${summary.wins}W / ${summary.losses}L)` },
            { label: 'Profit Factor', val: summary.profitFactor !== Number.POSITIVE_INFINITY ? formatRatio(summary.profitFactor) : '∞' },
            { label: 'Max Drawdown', val: `${formatPnl(drawdown.maxDrawdown)} USDT` },
            { label: 'Expectancy', val: summary.expectancy !== null ? `${formatPnl(summary.expectancy)} USDT` : '—' },
            { label: 'Avg Win / Loss', val: hideNominal ? '★★★ / ★★★' : `${formatPnl(summary.avgWin || 0)} / ${formatPnl(summary.avgLoss || 0)}` },
            { label: 'Total Biaya / Fee', val: hideNominal ? '★★★ USDT' : `${formatPnl(summary.feeTotal + summary.fundingFeeTotal)} USDT` },
        ]

        bentoStats.forEach((st, idx) => {
            const rIdx = Math.floor(idx / 3)
            const cIdx = idx % 3
            const cellX = cx + cIdx * colW + 28
            const cellY = curY + rIdx * rowH + 42

            ctx.font = '20px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
            ctx.fillStyle = bg.textSub
            ctx.fillText(st.label, cellX, cellY)

            ctx.font = 'bold 26px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
            ctx.fillStyle = '#ffffff'
            ctx.fillText(st.val, cellX, cellY + 44)
        })

        // Grid dividers
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)'
        ctx.beginPath()
        // Horizontal divider
        ctx.moveTo(cx, curY + rowH); ctx.lineTo(cx + cw, curY + rowH)
        // Vertical dividers
        ctx.moveTo(cx + colW, curY + 20); ctx.lineTo(cx + colW, curY + statsRowsH - 20)
        ctx.moveTo(cx + colW * 2, curY + 20); ctx.lineTo(cx + colW * 2, curY + statsRowsH - 20)
        ctx.stroke()
        ctx.restore()

        curY += statsRowsH + 34

        // E. Footer: Profile Avatar + Trader Handle + Watermark
        if (showProfile || showWatermark) {
            ctx.save()
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)'
            ctx.lineWidth = 1
            ctx.beginPath()
            ctx.moveTo(cx, curY)
            ctx.lineTo(cx + cw, curY)
            ctx.stroke()

            curY += 28

            if (showProfile) {
                const avatarSize = 58
                const avatarX = cx
                const avatarY = curY

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
                    ctx.font = 'bold 24px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                    const initText = traderHandle.replace('@', '').slice(0, 2).toUpperCase() || 'TR'
                    const initW = ctx.measureText(initText).width
                    ctx.fillText(initText, avatarX + (avatarSize - initW) / 2, avatarY + 38)
                    ctx.restore()
                }

                ctx.save()
                ctx.font = 'bold 28px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                ctx.fillStyle = '#ffffff'
                ctx.fillText(traderHandle, avatarX + avatarSize + 18, avatarY + 28)

                ctx.font = '20px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                ctx.fillStyle = bg.textSub
                ctx.fillText('Verified Trader Stats', avatarX + avatarSize + 18, avatarY + 54)
                ctx.restore()
            }

            if (showWatermark) {
                ctx.save()
                ctx.font = 'bold 22px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                ctx.fillStyle = 'rgba(255, 255, 255, 0.45)'
                const wmText = `${brandTitle} • ${formatDate(Date.now())}`
                const wmW = ctx.measureText(wmText).width
                ctx.fillText(wmText, cx + cw - wmW, curY + 36)
                ctx.restore()
            }
            ctx.restore()
        }

        return canvas
    }, [
        bg, accent, isCustomBgActive, bgDimming, brandTitle, brandSubtitle,
        selectedExchange, activeReferral, showReferral, periodLabel, summary,
        drawdown, curve, showChart, hideNominal, showProfile, showWatermark,
        traderHandle
    ])

    // Update canvas render saat state berubah
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
        const refStr = showReferral && activeReferral ? `\nRef Code (${selectedExchange.toUpperCase()}): ${activeReferral}` : ''
        const pnlStr = hideNominal ? 'Profitable' : `${isProfit ? '+' : ''}${formatPnl(summary.netPnlTotal)} USDT`
        const winRateStr = summary.winRate !== null ? (summary.winRate * 100).toFixed(1) : '0.0'
        const pfStr = summary.profitFactor !== Number.POSITIVE_INFINITY ? formatRatio(summary.profitFactor) : '∞'
        const text = `📊 Performance Update: ${pnlStr} | ${winRateStr}% Win Rate (${summary.totalTrades} Trades)\nMax Drawdown: ${formatPnl(drawdown.maxDrawdown)} USDT | Profit Factor: ${pfStr}${refStr}\n\n#TradingJournal #Crypto #${brandTitle} ${traderHandle}`
        window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`, '_blank')
    }

    return (
        <Modal
            isOpen={true}
            onClose={onClose}
            title="📊 Pamer Analytics (Performance Card)"
            size="xl"
        >
            <div className="flex flex-col gap-4">
                {/* ── CARD PREVIEW CONTAINER ── */}
                <div className="flex flex-col items-center justify-center rounded-2xl border border-border/60 bg-muted/20 p-4">
                    <div className="w-full max-w-[540px]">
                        <AnalyticsCardPreview
                            summary={summary}
                            curve={curve}
                            drawdown={drawdown}
                            bg={bg}
                            accent={accent}
                            isProfit={isProfit}
                            selectedExchange={selectedExchange}
                            traderHandle={traderHandle}
                            brandTitle={brandTitle}
                            brandSubtitle={brandSubtitle}
                            activeReferral={activeReferral}
                            avatarUrl={avatarUrl}
                            isCustomBgActive={isCustomBgActive}
                            customBgUrl={customBgUrl}
                            bgDimming={bgDimming}
                            showProfile={showProfile}
                            showWatermark={showWatermark}
                            showChart={showChart}
                            hideNominal={hideNominal}
                            showReferral={showReferral}
                            periodLabel={periodLabel}
                        />
                    </div>
                </div>

                {/* Canvas tersembunyi untuk ekspor kualitas tinggi */}
                <canvas ref={canvasRef} className="hidden" />

                {/* ── BACKGROUND PRESET SELECTOR ── */}
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/40 px-2 pt-3">
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs text-muted-foreground font-medium">Tema:</span>
                        {BG_TEMPLATES.map((tmpl, idx) => (
                            <button
                                key={tmpl.id}
                                type="button"
                                onClick={() => {
                                    setSelectedBgIdx(idx)
                                    setIsCustomBgActive(false)
                                }}
                                className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs transition-all ${
                                    !isCustomBgActive && selectedBgIdx === idx
                                        ? 'ring-2 font-semibold text-foreground'
                                        : 'text-muted-foreground hover:text-foreground'
                                }`}
                                style={{
                                    background: tmpl.bg,
                                    boxShadow: !isCustomBgActive && selectedBgIdx === idx ? `0 0 0 2px ${tmpl.accentProfit}` : undefined
                                }}
                            >
                                <span className="h-2 w-2 rounded-full" style={{ background: tmpl.accentProfit }} />
                                <span className="text-[11px] text-white">{tmpl.label}</span>
                            </button>
                        ))}

                        {customBgUrl && (
                            <button
                                type="button"
                                onClick={() => setIsCustomBgActive(true)}
                                className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs transition-all border ${
                                    isCustomBgActive
                                        ? 'border-primary ring-2 ring-primary font-semibold text-foreground bg-primary/20'
                                        : 'border-border text-muted-foreground hover:text-foreground bg-muted/40'
                                }`}
                            >
                                <span>🖼️ Custom BG</span>
                            </button>
                        )}
                    </div>

                    <span className="text-[11px] text-muted-foreground">
                        ⚙️ Avatar, Wallpaper & Reff diatur di <span className="font-medium text-foreground">Settings</span>
                    </span>
                </div>

                {/* ── TOGGLE OPTIONS & CONTROLS ── */}
                <div className="border-t border-border/40 px-2 pt-3">
                    <div className="flex flex-wrap gap-x-5 gap-y-2.5">
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

                    {/* Edit Periode Label */}
                    <div className="mt-3 flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">Label Periode:</span>
                        <input
                            type="text"
                            value={periodLabel}
                            onChange={(e) => setPeriodLabel(e.target.value)}
                            placeholder="All-Time Performance"
                            className="rounded-md border border-border/60 bg-background px-2.5 py-1 text-xs text-foreground focus:border-primary focus:outline-none"
                        />
                    </div>
                </div>

                {/* ── EXCHANGE SELECTOR BAR (MEXC & BITUNIX) ── */}
                <div className="flex items-center justify-between gap-3 px-2 py-2 border-t border-border/40 bg-card/20 rounded-lg">
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs text-muted-foreground font-medium">Exchange:</span>
                        {EXCHANGES.map((ex) => (
                            <button
                                key={ex}
                                type="button"
                                onClick={() => setSelectedExchange(ex)}
                                className={`rounded-md px-3 py-1 text-xs font-bold uppercase transition-all ${
                                    selectedExchange === ex
                                        ? 'text-white shadow-xs'
                                        : 'bg-muted text-muted-foreground hover:text-foreground'
                                }`}
                                style={selectedExchange === ex ? { background: accent } : {}}
                            >
                                {ex}
                            </button>
                        ))}

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
    selectedExchange: ExchangeName
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
}

function AnalyticsCardPreview({
    summary, curve, drawdown, bg, accent, isProfit, selectedExchange,
    traderHandle, brandTitle, brandSubtitle, activeReferral, avatarUrl,
    isCustomBgActive, customBgUrl, bgDimming, showProfile, showWatermark,
    showChart, hideNominal, showReferral, periodLabel
}: AnalyticsCardPreviewProps): React.JSX.Element {
    const isTransparentMode = !isCustomBgActive && bg.isTransparent

    // Render SVG Kurva Sederhana untuk Live Preview
    const svgCurvePath = useMemo(() => {
        if (curve.length < 2) return ''
        const minPnl = Math.min(...curve.map((p) => p.equity))
        const maxPnl = Math.max(...curve.map((p) => p.equity))
        const range = maxPnl - minPnl || 1
        const w = 440
        const h = 80

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
            className="relative overflow-hidden transition-all duration-200 select-none text-white font-sans"
            style={{
                borderRadius: 24,
                padding: '24px 28px 20px',
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

            <div className="relative z-10 flex flex-col gap-4">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div>
                        <div className="flex items-baseline gap-1.5">
                            <span className="text-xl font-black tracking-wider" style={{ color: accent }}>
                                {brandTitle}
                            </span>
                            <span className="text-sm font-light text-white/60 tracking-wider">
                                {brandSubtitle}
                            </span>
                        </div>
                        <p className="text-[11px] text-white/50">{periodLabel}</p>
                    </div>

                    <div className="flex items-center gap-2">
                        {showReferral && activeReferral && (
                            <span className="text-[10px] font-bold text-sky-400 bg-sky-500/10 px-2 py-0.5 rounded border border-sky-400/30">
                                REF: {activeReferral}
                            </span>
                        )}
                        <span
                            className="rounded-lg px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-white"
                            style={{ background: `${accent}33`, border: `1px solid ${accent}88` }}
                        >
                            {selectedExchange}
                        </span>
                    </div>
                </div>

                {/* Hero Stat Box */}
                <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4 flex items-center justify-between">
                    <div>
                        <span className="text-[10px] uppercase font-semibold text-white/50 tracking-wider">Total Net Profit</span>
                        <div className="text-2xl font-black tabular-nums mt-0.5" style={{ color: isProfit ? '#4ade80' : '#f87171' }}>
                            {hideNominal
                                ? (isProfit ? '+★★★★★' : '-★★★★★')
                                : `${isProfit ? '+' : ''}${formatPnl(summary.netPnlTotal)} USDT`}
                        </div>
                    </div>
                    <div
                        className="rounded-xl p-2.5 text-center border"
                        style={{ background: `${accent}18`, borderColor: `${accent}44` }}
                    >
                        <span className="text-[9px] uppercase font-bold text-white/60 block">Win Rate</span>
                        <span className="text-lg font-black" style={{ color: accent }}>
                            {summary.winRate !== null ? (summary.winRate * 100).toFixed(1) : '0.0'}%
                        </span>
                    </div>
                </div>

                {/* Kurva Ekuitas Mini */}
                {showChart && curve.length >= 2 && (
                    <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                        <div className="flex items-center justify-between mb-1 text-[10px] text-white/50 font-semibold">
                            <span>EQUITY GROWTH</span>
                            <span>{curve.length} points</span>
                        </div>
                        <svg viewBox="0 0 440 80" className="w-full h-16 overflow-visible">
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

                {/* Bento Grid Stats */}
                <div className="grid grid-cols-3 gap-2 text-left">
                    <div className="rounded-lg border border-white/5 bg-white/[0.03] p-2">
                        <span className="text-[9px] text-white/50 uppercase block">Total Trades</span>
                        <span className="text-xs font-bold text-white">{summary.totalTrades} ({summary.wins}W/{summary.losses}L)</span>
                    </div>
                    <div className="rounded-lg border border-white/5 bg-white/[0.03] p-2">
                        <span className="text-[9px] text-white/50 uppercase block">Profit Factor</span>
                        <span className="text-xs font-bold text-white">{summary.profitFactor !== Number.POSITIVE_INFINITY ? formatRatio(summary.profitFactor) : '∞'}</span>
                    </div>
                    <div className="rounded-lg border border-white/5 bg-white/[0.03] p-2">
                        <span className="text-[9px] text-white/50 uppercase block">Max Drawdown</span>
                        <span className="text-xs font-bold text-white">{formatPnl(drawdown.maxDrawdown)} USDT</span>
                    </div>
                    <div className="rounded-lg border border-white/5 bg-white/[0.03] p-2">
                        <span className="text-[9px] text-white/50 uppercase block">Expectancy</span>
                        <span className="text-xs font-bold text-white">{summary.expectancy !== null ? `${formatPnl(summary.expectancy)} USDT` : '—'}</span>
                    </div>
                    <div className="rounded-lg border border-white/5 bg-white/[0.03] p-2">
                        <span className="text-[9px] text-white/50 uppercase block">Avg Win / Loss</span>
                        <span className="text-xs font-bold text-white">{hideNominal ? '★★★ / ★★★' : `${formatPnl(summary.avgWin || 0)} / ${formatPnl(summary.avgLoss || 0)}`}</span>
                    </div>
                    <div className="rounded-lg border border-white/5 bg-white/[0.03] p-2">
                        <span className="text-[9px] text-white/50 uppercase block">Total Biaya</span>
                        <span className="text-xs font-bold text-white">{hideNominal ? '★★★' : `${formatPnl(summary.feeTotal + summary.fundingFeeTotal)} USDT`}</span>
                    </div>
                </div>

                {/* Footer Profile & Watermark */}
                {(showProfile || showWatermark) && (
                    <div className="flex items-center justify-between border-t border-white/10 pt-3 mt-1">
                        {showProfile ? (
                            <div className="flex items-center gap-2">
                                {avatarUrl ? (
                                    <img
                                        src={avatarUrl}
                                        alt="Avatar"
                                        className="h-8 w-8 rounded-full object-cover"
                                        style={{ border: `1.5px solid ${accent}` }}
                                    />
                                ) : (
                                    <div
                                        className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold text-white"
                                        style={{ background: `${accent}33`, border: `1.5px solid ${accent}` }}
                                    >
                                        {traderHandle.replace('@', '').slice(0, 2).toUpperCase() || 'TR'}
                                    </div>
                                )}
                                <div>
                                    <div className="text-xs font-bold text-white">{traderHandle}</div>
                                    <div className="text-[9px] text-white/50">Verified Trader</div>
                                </div>
                            </div>
                        ) : <div />}

                        {showWatermark && (
                            <span className="text-[10px] text-white/40 font-medium">
                                {brandTitle} • {formatDate(Date.now())}
                            </span>
                        )}
                    </div>
                )}
            </div>
        </div>
    )
}
