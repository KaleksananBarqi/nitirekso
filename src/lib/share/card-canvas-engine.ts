/**
 * Mesin Perenderan Kanvas Kartu Visual Mandiri (Card Canvas Engine) Nitirekso.
 *
 * Mengonsolidasikan komputasi tata letak grafis 2D, pembungkusan teks dinamis,
 * penskalaan font adaptif, gradien pencahayaan, lencana eksekusi, logo bursa,
 * dan watermark merek ke dalam deep module murni tanpa ketergantungan pada React.
 */

import {
    formatDate,
    formatDateTime,
    formatDuration,
    formatPercent,
    formatPnl,
    formatPrice,
    formatR
} from '../format'
import type { BgDimmingDirection } from '../shareSettings'
import { computeDimmingOpacities } from './dimming-style'
import type {
    CardLayoutResult,
    CardRenderSpec,
    PortfolioSummaryData,
    SingleTradeData
} from './types'

// ---------------------------------------------------------------------------
// Helper Pemecah Teks Kanvas (Dynamic Word-Wrap)
// ---------------------------------------------------------------------------

/**
 * Memecah teks panjang menjadi beberapa baris yang sesuai dengan lebar maksimum kanvas.
 * Tidak memotong kata di tengah huruf, menjaga spasi dan keterbacaan tipografi.
 */
export function wrapCanvasText(
    ctx: CanvasRenderingContext2D,
    text: string,
    maxWidth: number
): string[] {
    const trimmed = text.trim()
    if (!trimmed) return []

    const words = trimmed.split(/\s+/)
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
// Helper Penskalaan Font Otomatis (Auto Font Scaling)
// ---------------------------------------------------------------------------

/**
 * Menghitung ukuran font terbesar yang pas di dalam maxWidth tanpa terpotong.
 */
export function scaleTextToFit(
    ctx: CanvasRenderingContext2D,
    text: string,
    maxWidth: number,
    initialFontSize: number,
    minFontSize = 24,
    fontSpec = 'bold {size}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
): number {
    let size = initialFontSize
    while (size > minFontSize) {
        ctx.font = fontSpec.replace('{size}', `${size}`)
        const measured = ctx.measureText(text).width
        if (measured <= maxWidth) {
            return size
        }
        size -= 2
    }
    return minFontSize
}

// ---------------------------------------------------------------------------
// Helper Pencahayaan & Dimming Gradien Kanvas
// ---------------------------------------------------------------------------

/**
 * Menerapkan efek redup (dimming) dan gradien directional pada seluruh area kanvas.
 */
export function applyCanvasDimming(
    ctx: CanvasRenderingContext2D,
    W: number,
    H: number,
    bgDimming: number,
    direction: BgDimmingDirection = 'uniform'
): void {
    const { baseOpacity, darkOpacity, lightOpacity } = computeDimmingOpacities(bgDimming)

    switch (direction) {
        case 'top-right': {
            const grad = ctx.createLinearGradient(0, H, W, 0)
            grad.addColorStop(0, `rgba(0, 0, 0, ${darkOpacity})`)
            grad.addColorStop(0.45, `rgba(0, 0, 0, ${baseOpacity})`)
            grad.addColorStop(1, `rgba(0, 0, 0, ${lightOpacity})`)
            ctx.fillStyle = grad
            break
        }
        case 'top-left': {
            const grad = ctx.createLinearGradient(W, H, 0, 0)
            grad.addColorStop(0, `rgba(0, 0, 0, ${darkOpacity})`)
            grad.addColorStop(0.45, `rgba(0, 0, 0, ${baseOpacity})`)
            grad.addColorStop(1, `rgba(0, 0, 0, ${lightOpacity})`)
            ctx.fillStyle = grad
            break
        }
        case 'bottom-right': {
            const grad = ctx.createLinearGradient(0, 0, W, H)
            grad.addColorStop(0, `rgba(0, 0, 0, ${darkOpacity})`)
            grad.addColorStop(0.45, `rgba(0, 0, 0, ${baseOpacity})`)
            grad.addColorStop(1, `rgba(0, 0, 0, ${lightOpacity})`)
            ctx.fillStyle = grad
            break
        }
        case 'bottom-left': {
            const grad = ctx.createLinearGradient(W, 0, 0, H)
            grad.addColorStop(0, `rgba(0, 0, 0, ${darkOpacity})`)
            grad.addColorStop(0.45, `rgba(0, 0, 0, ${baseOpacity})`)
            grad.addColorStop(1, `rgba(0, 0, 0, ${lightOpacity})`)
            ctx.fillStyle = grad
            break
        }
        case 'left': {
            const grad = ctx.createLinearGradient(W, 0, 0, 0)
            grad.addColorStop(0, `rgba(0, 0, 0, ${darkOpacity})`)
            grad.addColorStop(1, `rgba(0, 0, 0, ${lightOpacity})`)
            ctx.fillStyle = grad
            break
        }
        case 'right': {
            const grad = ctx.createLinearGradient(0, 0, W, 0)
            grad.addColorStop(0, `rgba(0, 0, 0, ${darkOpacity})`)
            grad.addColorStop(1, `rgba(0, 0, 0, ${lightOpacity})`)
            ctx.fillStyle = grad
            break
        }
        case 'uniform':
        default: {
            ctx.fillStyle = `rgba(0, 0, 0, ${baseOpacity})`
            break
        }
    }
    ctx.fillRect(0, 0, W, H)
}

// ---------------------------------------------------------------------------
// Helper Konversi Timestamp Aman
// ---------------------------------------------------------------------------

function normalizeTimestamp(value: unknown): number {
    if (typeof value === 'number') return value
    if (value instanceof Date) return value.getTime()
    if (typeof value === 'string') {
        const parsed = Date.parse(value)
        if (!isNaN(parsed)) return parsed
    }
    return 0
}

// ---------------------------------------------------------------------------
// Mesin Utama Perenderan Kanvas Kartu (CardCanvasEngine)
// ---------------------------------------------------------------------------

export class CardCanvasEngine {
    /**
     * Menghitung tata letak geometris kartu dan batas dimensi secara deterministik.
     */
    measureLayout(spec: CardRenderSpec, customCtx?: CanvasRenderingContext2D): CardLayoutResult {
        const aspect = spec.aspect || 'original'
        const isSingle = spec.variant === 'pnl-single'
        const singleData = isSingle ? (spec.data as SingleTradeData) : null
        const portfolioData = !isSingle ? (spec.data as PortfolioSummaryData) : null

        let width = 1080
        let height = 1080

        switch (aspect) {
            case '16:9':
                width = 1280
                height = 720
                break
            case '1:1':
                width = 1080
                height = 1080
                break
            case '4:5':
                width = 1080
                height = 1350
                break
            case '9:16':
                width = 1080
                height = 1920
                break
            case 'original':
            default:
                width = isSingle ? 1080 : 1280
                height = isSingle ? 1080 : 720
                break
        }

        const mx = aspect === '16:9' ? 60 : 48
        const my = aspect === '16:9' ? 45 : 48
        const cardW = width - mx * 2
        const contentW = isSingle ? cardW - 104 : cardW - 60

        // Context virtual untuk pengukuran teks jika tidak disediakan
        const ctx = customCtx || this.getMeasurementContext()

        let thesisLines: string[] = []
        let thesisBoxH = 0
        let reviewLines: string[] = []
        let reviewBoxH = 0

        const isProfit = isSingle
            ? (singleData?.realizedPnl ?? 0) >= 0
            : (portfolioData?.netPnlTotal ?? 0) >= 0

        let roiFontSize = 96

        if (isSingle && singleData) {
            // Pengukuran teks Thesis
            if (singleData.showThesis !== false && singleData.thesis?.trim()) {
                ctx.font = 'italic 24px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                thesisLines = wrapCanvasText(ctx, singleData.thesis.trim(), contentW - 48)
                if (singleData.showFullText === false && thesisLines.length > 4) {
                    thesisLines = thesisLines.slice(0, 4)
                    thesisLines[3] = (thesisLines[3] || '') + '…'
                }
                thesisBoxH = 46 + thesisLines.length * 36 + 22
            }

            // Pengukuran teks Review
            if (singleData.showReview !== false && singleData.review?.trim()) {
                ctx.font = '22px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                reviewLines = wrapCanvasText(ctx, singleData.review.trim(), contentW - 48)
                if (singleData.showFullText === false && reviewLines.length > 3) {
                    reviewLines = reviewLines.slice(0, 3)
                    reviewLines[2] = (reviewLines[2] || '') + '…'
                }
                reviewBoxH = 44 + reviewLines.length * 34 + 22
            }

            // Perhitungan tinggi kartu dinamis (Auto Flow Y)
            const hasReferralDisplay = spec.branding?.showReferral !== false && !!spec.branding?.referralCode?.trim()
            const headerH = hasReferralDisplay ? 68 : 40
            const padTop = 52
            const padBottom = 48
            const symbolH = 48
            const roiH = singleData.showRoi !== false ? 92 : 0
            const pnlH = singleData.showPnl !== false ? 46 : 0
            const statsH = singleData.showTradeTimes ? 158 : 132
            const planBoxH = 120
            const footerH = (spec.branding?.showProfile !== false || spec.branding?.showWatermark !== false) ? 68 : 0

            const hasBadges = Boolean(
                (singleData.showSetup !== false && singleData.setupTag) ||
                (singleData.showGrade !== false && singleData.executionGrade) ||
                (singleData.showEmotion !== false && singleData.emotionTag)
            )
            const badgesH = hasBadges ? 40 : 0

            let innerH = padTop + headerH + 32 + symbolH + (hasBadges ? 16 + badgesH : 0) + 24
            if (singleData.showRoi !== false) innerH += roiH + 16
            if (singleData.showPnl !== false) innerH += pnlH + 28
            innerH += statsH
            if (singleData.showPlan) {
                innerH += 16 + planBoxH + 20
            } else {
                innerH += 28
            }
            if (thesisBoxH > 0) innerH += thesisBoxH + 20
            if (reviewBoxH > 0) innerH += reviewBoxH + 20
            if (footerH > 0) innerH += 24 + 1 + 24 + footerH
            innerH += padBottom

            if (aspect === 'original') {
                height = innerH + my * 2
            }

            // Hitung skala font ROI hero
            if (singleData.showRoi !== false) {
                const roiText = formatPercent(singleData.roiPercent ?? 0)
                roiFontSize = scaleTextToFit(ctx, roiText, contentW, 96, 40)
            }

            const cardH = aspect === 'original' ? innerH : Math.min(innerH, height - my * 2)
            const cardY = aspect === 'original' ? my : Math.max(my, (height - cardH) / 2)

            return {
                width,
                height,
                contentWidth: contentW,
                contentHeight: innerH,
                cardX: mx,
                cardY,
                cardWidth: cardW,
                cardHeight: cardH,
                thesisLines,
                thesisBoxH,
                reviewLines,
                reviewBoxH,
                roiFontSize,
                isProfit
            }
        }

        // Tata letak untuk variant 'portfolio-summary'
        const cardH = height - my * 2
        return {
            width,
            height,
            contentWidth: contentW,
            contentHeight: cardH,
            cardX: mx,
            cardY: my,
            cardWidth: cardW,
            cardHeight: cardH,
            thesisLines: [],
            thesisBoxH: 0,
            reviewLines: [],
            reviewBoxH: 0,
            roiFontSize: 44,
            isProfit
        }
    }

    /**
     * Helper statis untuk merender spesifikasi kartu langsung ke canvas.
     */
    static render(spec: CardRenderSpec, canvas: HTMLCanvasElement): CardLayoutResult {
        const engine = new CardCanvasEngine()
        return engine.render(spec, canvas)
    }

    /**
     * Merender spesifikasi kartu lengkap ke elemen HTMLCanvasElement.
     */
    render(spec: CardRenderSpec, canvas: HTMLCanvasElement): CardLayoutResult {
        const initialCtx = canvas.getContext('2d')
        const layout = this.measureLayout(spec, initialCtx || undefined)

        // Sesuaikan ukuran kanvas jika belum presisi
        if (canvas.width !== layout.width || canvas.height !== layout.height) {
            canvas.width = layout.width
            canvas.height = layout.height
        }

        const ctx = canvas.getContext('2d')
        if (!ctx) return layout

        const { width: W, height: H } = layout
        const { theme, privacy, branding } = spec
        const accent = layout.isProfit ? theme.accentProfit : theme.accentLoss
        const isTransparentMode = Boolean(theme.isTransparent)

        // 1. Gambar Lapisan Background Luar
        if (isTransparentMode) {
            ctx.clearRect(0, 0, W, H)
        } else {
            const bgGrad = ctx.createLinearGradient(0, 0, W, H)
            if (theme.isCustom && theme.bgStart && theme.bgEnd) {
                bgGrad.addColorStop(0, theme.bgStart)
                bgGrad.addColorStop(1, theme.bgEnd)
                ctx.fillStyle = bgGrad
            } else if (theme.id === 'cyberpunk') {
                const radGrad = ctx.createRadialGradient(W * 0.3, H * 0.2, 50, W * 0.5, H * 0.5, W)
                radGrad.addColorStop(0, '#1e0836')
                radGrad.addColorStop(0.6, '#0a0014')
                radGrad.addColorStop(1, '#000000')
                ctx.fillStyle = radGrad
            } else if (theme.id === 'emerald') {
                bgGrad.addColorStop(0, '#064e3b')
                bgGrad.addColorStop(0.6, '#022c22')
                bgGrad.addColorStop(1, '#020617')
                ctx.fillStyle = bgGrad
            } else if (theme.id === 'sunset') {
                bgGrad.addColorStop(0, '#2e1065')
                bgGrad.addColorStop(0.4, '#1e0a30')
                bgGrad.addColorStop(1, '#0f172a')
                ctx.fillStyle = bgGrad
            } else if (theme.id === 'obsidian') {
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

        // 2. Custom Media (Gambar atau Video Canvas) jika disediakan
        if (theme.customMedia) {
            const media = theme.customMedia
            const mWidth = (media as HTMLImageElement).naturalWidth || (media as HTMLVideoElement).videoWidth || (media as HTMLCanvasElement).width || 1920
            const mHeight = (media as HTMLImageElement).naturalHeight || (media as HTMLVideoElement).videoHeight || (media as HTMLCanvasElement).height || 1080
            const mediaAspect = mWidth / mHeight
            const canvasAspect = W / H

            let dw = W, dh = H, dx = 0, dy = 0
            const posX = theme.mediaPosX ?? 50
            const posY = theme.mediaPosY ?? 50

            if (mediaAspect > canvasAspect) {
                dh = H
                dw = H * mediaAspect
                dx = (W - dw) * (posX / 100)
                dy = (H - dh) * (posY / 100)
            } else {
                dw = W
                dh = W / mediaAspect
                dx = (W - dw) * (posX / 100)
                dy = (H - dh) * (posY / 100)
            }

            try {
                ctx.drawImage(media, dx, dy, dw, dh)
            } catch (e) {
                console.warn('[CardCanvasEngine] Gagal menggambar custom media:', e)
            }

            if (theme.dimming && theme.dimming > 0) {
                applyCanvasDimming(ctx, W, H, theme.dimming, theme.dimmingDirection)
            }
        }

        // 3. Grid Texture & Ambient Glow
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.02)'
        ctx.lineWidth = 1
        for (let x = 0; x < W; x += 64) {
            ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke()
        }
        for (let y = 0; y < H; y += 64) {
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke()
        }

        const glowRad = ctx.createRadialGradient(W / 2, layout.cardY + 200, 30, W / 2, layout.cardY + 200, W * 0.45)
        glowRad.addColorStop(0, `${accent}1c`)
        glowRad.addColorStop(1, 'transparent')
        ctx.fillStyle = glowRad
        ctx.fillRect(0, 0, W, H)

        // 4. Wadah Kartu Glassmorphism (Container)
        const cornerRadius = 32
        ctx.save()
        ctx.beginPath()
        ctx.roundRect(layout.cardX, layout.cardY, layout.cardWidth, layout.cardHeight, cornerRadius)
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

        // 5. Perenderan Konten sesuai Varian
        if (spec.variant === 'portfolio-summary') {
            this.renderPortfolioSummary(ctx, layout, spec.data as PortfolioSummaryData, theme, privacy, branding, accent)
        } else {
            this.renderSingleTrade(ctx, layout, spec.data as SingleTradeData, theme, privacy, branding, accent)
        }

        return layout
    }

    /**
     * Merender kartu rincian trade individu (pnl-single).
     */
    private renderSingleTrade(
        ctx: CanvasRenderingContext2D,
        layout: CardLayoutResult,
        data: SingleTradeData,
        theme: CardRenderSpec['theme'],
        privacy: CardRenderSpec['privacy'],
        branding: CardRenderSpec['branding'],
        accent: string
    ): void {
        const { cardX, cardY, cardWidth, contentWidth, roiFontSize, thesisLines, thesisBoxH, reviewLines, reviewBoxH } = layout
        const cx = cardX + 52
        const contentW = contentWidth

        const totalContentH = layout.contentHeight
        const cardH = layout.cardHeight
        const padTop = 52
        const padBottom = 48
        const isAspect16x9 = layout.width === 1280 && layout.height === 720
        const isOverflow = isAspect16x9 || totalContentH > (cardH - padTop - padBottom)

        let scale = 1
        if (isOverflow && totalContentH > 0) {
            // Berikan batas atas target tinggi dengan margin pengaman vertikal
            const targetMaxH = cardH - 40
            if (totalContentH > targetMaxH) {
                scale = Math.min(1, targetMaxH / totalContentH)
            }
        }

        const canTransform = typeof ctx.translate === 'function' && typeof ctx.scale === 'function'
        const shouldScale = scale < 0.999 && canTransform
        if (shouldScale) {
            ctx.save()
            // Translasi dan penskalaan terpusat secara proporsional di dalam batas kartu
            const tx = (cardX + cardWidth / 2) * (1 - scale)
            const ty = cardY * (1 - scale) + (cardH - totalContentH * scale) / 2
            ctx.translate(tx, ty)
            ctx.scale(scale, scale)
        }

        const brandTitle = branding?.brandTitle?.trim() || 'NITIREKSO'
        const brandSubtitle = branding?.brandSubtitle?.trim() || 'Trading Journal'
        const traderHandle = branding?.traderHandle?.trim() || '@trader'
        const exchangeName = (branding?.exchange || 'MEXC').toUpperCase()
        const referralCode = branding?.referralCode?.trim() || ''
        const hasReferralDisplay = branding?.showReferral !== false && Boolean(referralCode)

        let curY = cardY + 52

        // A. Header: Branding & Exchange Logo / Badge
        ctx.save()
        ctx.font = 'bold 30px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
        ctx.fillStyle = '#ffffff'
        ctx.fillText(brandTitle, cx, curY + 28)

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

        // Sisi Kanan Header: Logo Exchange / Badge + Referral
        const rightEdgeX = cardX + cardWidth - 52
        const activeLogoImg = branding?.exchangeLogo

        if (activeLogoImg) {
            const maxLogoH = 34
            const imgW = (activeLogoImg as any).width || (activeLogoImg as any).naturalWidth
            const imgH = (activeLogoImg as any).height || (activeLogoImg as any).naturalHeight
            const logoAspect = (imgW && imgH) ? (imgW / imgH) : 2.5
            const logoW = Math.min(140, maxLogoH * logoAspect)
            const logoX = rightEdgeX - logoW
            ctx.drawImage(activeLogoImg, logoX, curY + 2, logoW, maxLogoH)

            if (hasReferralDisplay) {
                const refText = `Ref: ${referralCode}`
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
            ctx.font = 'bold 22px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
            const exW = ctx.measureText(exchangeName).width + 32
            const exX = rightEdgeX - exW
            ctx.fillStyle = 'rgba(255, 255, 255, 0.08)'
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)'
            ctx.lineWidth = 1
            ctx.beginPath()
            ctx.roundRect(exX, curY + 2, exW, 32, 8)
            ctx.fill()
            ctx.stroke()
            ctx.fillStyle = '#cbd5e1'
            ctx.fillText(exchangeName, exX + 16, curY + 25)

            if (hasReferralDisplay) {
                const refText = `Ref: ${referralCode}`
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

        const headerH = hasReferralDisplay ? 68 : 40
        curY += headerH + 32

        // B. Symbol + Direction + Leverage
        ctx.save()
        ctx.font = 'bold 48px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
        ctx.fillStyle = '#ffffff'
        ctx.fillText(data.symbol, cx, curY + 36)

        if (data.showSide !== false) {
            const symW = ctx.measureText(data.symbol).width
            ctx.fillStyle = 'rgba(255, 255, 255, 0.25)'
            ctx.fillRect(cx + symW + 20, curY + 6, 2, 34)

            ctx.font = 'bold 28px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
            ctx.fillStyle = accent
            const dirStr = (data.direction || 'LONG').toUpperCase()
            ctx.fillText(dirStr, cx + symW + 36, curY + 34)

            const dirW = ctx.measureText(dirStr).width
            const lev = data.leverage || 1
            ctx.fillStyle = '#ffffff'
            ctx.font = 'bold 26px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
            ctx.fillText(`${lev}X`, cx + symW + 36 + dirW + 12, curY + 34)
        }
        ctx.restore()

        const symbolH = 48
        const hasBadges = Boolean(
            (data.showSetup !== false && data.setupTag) ||
            (data.showGrade !== false && data.executionGrade) ||
            (data.showEmotion !== false && data.emotionTag)
        )

        // B2. Journal Meta Badges (Setup, Grade, Emotion)
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

            if (data.showSetup !== false && data.setupTag) {
                drawBadge(data.setupTag, '🎯', '#38bdf8', 'rgba(56, 189, 248, 0.14)', 'rgba(56, 189, 248, 0.32)')
            }
            if (data.showGrade !== false && data.executionGrade) {
                const gradeColors: Record<string, { text: string; bg: string; border: string }> = {
                    A: { text: '#34d399', bg: 'rgba(52, 211, 153, 0.16)', border: 'rgba(52, 211, 153, 0.36)' },
                    B: { text: '#38bdf8', bg: 'rgba(56, 189, 248, 0.16)', border: 'rgba(56, 189, 248, 0.36)' },
                    C: { text: '#fbbf24', bg: 'rgba(251, 191, 36, 0.16)', border: 'rgba(251, 191, 36, 0.36)' },
                    D: { text: '#f87171', bg: 'rgba(248, 113, 113, 0.16)', border: 'rgba(248, 113, 113, 0.36)' }
                }
                const defaultGradeColor = { text: '#38bdf8', bg: 'rgba(56, 189, 248, 0.16)', border: 'rgba(56, 189, 248, 0.36)' }
                const gradeColor = gradeColors[data.executionGrade] || defaultGradeColor
                drawBadge(`Grade ${data.executionGrade}`, '⭐', gradeColor.text, gradeColor.bg, gradeColor.border)
            }
            if (data.showEmotion !== false && data.emotionTag) {
                const emotionIcons: Record<string, string> = {
                    calm: '😌',
                    fomo: '⚡',
                    greed: '🔥',
                    revenge: '😤',
                    anxious: '😰',
                    overconfident: '😎'
                }
                const emoIcon = emotionIcons[data.emotionTag.toLowerCase()] || '🧠'
                drawBadge(data.emotionTag.charAt(0).toUpperCase() + data.emotionTag.slice(1), emoIcon, '#c084fc', 'rgba(192, 132, 252, 0.15)', 'rgba(192, 132, 252, 0.35)')
            }
            ctx.restore()
            curY += 40 + 24
        } else {
            curY += symbolH + 24
        }

        // C. ROI Hero Text
        if (data.showRoi !== false) {
            ctx.save()
            ctx.font = `bold ${roiFontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`
            ctx.fillStyle = accent
            ctx.fillText(formatPercent(data.roiPercent ?? 0), cx, curY + Math.min(76, roiFontSize * 0.8))
            ctx.restore()
            curY += 92 + 16
        }

        // D. PnL Amount & R-Multiple
        if (data.showPnl !== false) {
            ctx.save()
            ctx.font = '600 38px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
            ctx.fillStyle = accent
            const hideNominal = Boolean(privacy?.hideNominal)
            const pnlStr = hideNominal ? '••••' : `${formatPnl(data.realizedPnl)} USDT`
            ctx.fillText(pnlStr, cx, curY + 32)

            if (data.rMultiple !== null && data.rMultiple !== undefined) {
                const pnlW = ctx.measureText(pnlStr).width
                ctx.fillStyle = '#38bdf8'
                ctx.font = '500 32px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                ctx.fillText(`  ·  ${formatR(data.rMultiple)}`, cx + pnlW, curY + 32)
            }
            ctx.restore()
            curY += 46 + 28
        }

        // E. Stats Row Grid (Entry Price, Exit Price, Duration, R-Multiple)
        const statsH = data.showTradeTimes ? 158 : 132
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
            ctx.fillStyle = theme.textSub
            ctx.fillText(title, colX, curY + 44)

            ctx.font = 'bold 26px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
            ctx.fillStyle = valColor
            ctx.fillText(val, colX, curY + 86)

            if (subText) {
                ctx.font = '15px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                ctx.fillStyle = theme.textSub
                ctx.fillText(subText, colX, curY + 124)
            }
        }

        const actualRVal = data.rMultiple !== null && data.rMultiple !== undefined ? formatR(data.rMultiple) : '—'
        const actualRColor = data.rMultiple !== null && data.rMultiple !== undefined
            ? (data.rMultiple > 0 ? theme.accentProfit : data.rMultiple < 0 ? theme.accentLoss : '#ffffff')
            : '#ffffff'

        const entryMs = normalizeTimestamp(data.entryTime)
        const exitMs = normalizeTimestamp(data.exitTime)
        const entryTimeText = data.showTradeTimes && entryMs ? formatDateTime(entryMs) : undefined
        const exitTimeText = data.showTradeTimes ? (exitMs ? formatDateTime(exitMs) : 'Posisi Terbuka') : undefined
        const durationStr = data.duration || ((entryMs && exitMs) ? formatDuration(entryMs, exitMs) : '—')

        drawStatCol('Entry Price', formatPrice(data.entryPrice), 0, '#ffffff', entryTimeText)
        drawStatCol('Exit Price', formatPrice(data.exitPrice), 1, '#ffffff', exitTimeText)
        drawStatCol('Duration', data.showDuration !== false ? durationStr : '—', 2)
        drawStatCol('R-Multiple', actualRVal, 3, actualRColor)

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)'
        ctx.beginPath()
        ctx.moveTo(cx + statColW, curY + 24); ctx.lineTo(cx + statColW, curY + statsH - 24)
        ctx.moveTo(cx + statColW * 2, curY + 24); ctx.lineTo(cx + statColW * 2, curY + statsH - 24)
        ctx.moveTo(cx + statColW * 3, curY + 24); ctx.lineTo(cx + statColW * 3, curY + statsH - 24)
        ctx.stroke()
        ctx.restore()

        curY += statsH + (data.showPlan ? 16 : 28)

        // E2. Plan Risk Grid (Plan SL, Plan TP, Plan R:R)
        if (data.showPlan) {
            const planBoxH = 120
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
                ctx.fillStyle = theme.textSub
                ctx.fillText(title, colX, curY + 44)
                ctx.font = 'bold 26px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                ctx.fillStyle = valColor
                ctx.fillText(val, colX, curY + 86)
            }

            const slStr = data.plannedStop !== null && data.plannedStop !== undefined ? formatPrice(data.plannedStop) : '—'
            const tpStr = data.plannedTarget !== null && data.plannedTarget !== undefined ? formatPrice(data.plannedTarget) : '—'
            const rrStr = data.plannedRr !== null && data.plannedRr !== undefined ? `1:${data.plannedRr.toFixed(2)}` : '—'

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

        // F. Trade Thesis
        if (thesisBoxH > 0 && thesisLines.length > 0) {
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

        // G. Post-Trade Review
        if (reviewBoxH > 0 && reviewLines.length > 0) {
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

        // H. Footer: Avatar, Trader Handle & Watermark
        const showProfile = branding?.showProfile !== false
        const showWatermark = branding?.showWatermark !== false

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

                if (branding?.avatarImage) {
                    ctx.save()
                    ctx.beginPath()
                    ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2)
                    ctx.closePath()
                    ctx.clip()
                    ctx.drawImage(branding.avatarImage, avatarX, avatarY, avatarSize, avatarSize)
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
                ctx.fillStyle = theme.textSub
                const exitMs = normalizeTimestamp(data.exitTime)
                ctx.fillText(exitMs ? formatDate(exitMs) : 'Aktif', avatarX + avatarSize + 18, avatarY + 52)
                ctx.restore()
            }

            if (showWatermark) {
                ctx.save()
                const wmLogoImg = branding?.watermarkLogo
                const logoSize = 42
                const gap = 12

                ctx.font = 'bold 22px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                const wm1 = 'nitirekso'
                const w1W = ctx.measureText(wm1).width

                ctx.font = '18px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                const wm2 = 'Trading Journal'
                const w2W = ctx.measureText(wm2).width

                const textBlockW = Math.max(w1W, w2W)
                const hasLogo = Boolean(wmLogoImg)
                const totalW = hasLogo ? logoSize + gap + textBlockW : textBlockW
                const startX = cardX + cardWidth - 52 - totalW

                if (hasLogo && wmLogoImg) {
                    ctx.save()
                    ctx.beginPath()
                    ctx.roundRect(startX, curY + 12, logoSize, logoSize, 8)
                    ctx.clip()
                    ctx.drawImage(wmLogoImg, startX, curY + 12, logoSize, logoSize)
                    ctx.restore()
                }

                const textStartX = hasLogo ? startX + logoSize + gap : startX
                ctx.font = 'bold 22px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                ctx.fillStyle = 'rgba(255, 255, 255, 0.9)'
                ctx.fillText(wm1, textStartX, curY + 28)

                ctx.font = '18px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                ctx.fillStyle = theme.textSub
                ctx.fillText(wm2, textStartX, curY + 50)
                ctx.restore()
            }
        }

        if (shouldScale) {
            ctx.restore()
        }
    }

    /**
     * Menggambar kurva ekuitas kumulatif pada kanvas dengan efek gradien area dan glow garis.
     */
    private drawEquityCurve(
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

    /**
     * Merender kartu ringkasan analitik portofolio (portfolio-summary).
     */
    private renderPortfolioSummary(
        ctx: CanvasRenderingContext2D,
        layout: CardLayoutResult,
        data: PortfolioSummaryData,
        theme: CardRenderSpec['theme'],
        privacy: CardRenderSpec['privacy'],
        branding: CardRenderSpec['branding'],
        accent: string
    ): void {
        const { cardX, cardY, cardWidth, cardHeight } = layout
        const padX = cardX
        const padY = cardY

        const brandTitle = branding?.brandTitle?.trim() || 'NITIREKSO'
        const brandSubtitle = branding?.brandSubtitle?.trim() || 'PORTFOLIO ANALYTICS'
        const traderHandle = branding?.traderHandle?.trim() || '@trader'
        const periodLabel = data.periodLabel?.trim() || 'Semua Periode'
        const hideNominal = Boolean(privacy?.hideNominal)
        const isProfit = data.netPnlTotal >= 0

        // 1. Header Branding & Periode
        ctx.save()
        const headerY = padY + 48
        ctx.font = 'bold 34px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
        ctx.fillStyle = '#ffffff'
        ctx.fillText(brandTitle, padX + 36, headerY)

        const titleW = ctx.measureText(brandTitle).width
        ctx.font = 'bold 20px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
        const subW = ctx.measureText(brandSubtitle).width + 24
        ctx.fillStyle = `${accent}22`
        ctx.strokeStyle = `${accent}55`
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.roundRect(padX + 36 + titleW + 16, headerY - 24, subW, 30, 6)
        ctx.fill()
        ctx.stroke()
        ctx.fillStyle = accent
        ctx.fillText(brandSubtitle, padX + 36 + titleW + 28, headerY - 2)

        // Periode badge kanan
        ctx.font = 'bold 20px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
        const periodW = ctx.measureText(periodLabel).width + 24
        const periodX = padX + cardWidth - 36 - periodW

        // Badge Referral jika diaktifkan
        if (branding?.showReferral && branding?.referralCode?.trim()) {
            const refText = `REF: ${branding.referralCode.trim()}`
            ctx.font = 'bold 16px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
            const refW = ctx.measureText(refText).width + 20
            const refX = periodX - refW - 12
            ctx.beginPath()
            ctx.roundRect(refX, headerY - 24, refW, 30, 6)
            ctx.fillStyle = 'rgba(56, 189, 248, 0.15)'
            ctx.fill()
            ctx.strokeStyle = 'rgba(56, 189, 248, 0.4)'
            ctx.lineWidth = 1
            ctx.stroke()
            ctx.fillStyle = '#38bdf8'
            ctx.fillText(refText, refX + 10, headerY - 2)
            ctx.font = 'bold 20px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
        }

        ctx.fillStyle = 'rgba(255, 255, 255, 0.08)'
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.roundRect(periodX, headerY - 24, periodW, 30, 6)
        ctx.fill()
        ctx.stroke()
        ctx.fillStyle = '#cbd5e1'
        ctx.fillText(periodLabel, periodX + 12, headerY - 2)
        ctx.restore()

        // 2. Hero PnL & Win Rate Box
        const heroX = padX + 36
        const heroY = headerY + 28
        const heroW = cardWidth - 72
        const heroH = 110

        ctx.save()
        ctx.fillStyle = 'rgba(255, 255, 255, 0.03)'
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.roundRect(heroX, heroY, heroW, heroH, 16)
        ctx.fill()
        ctx.stroke()

        // Label NET PNL
        ctx.font = '16px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
        ctx.fillStyle = theme.textSub
        ctx.fillText('TOTAL NET REALIZED P&L', heroX + 24, heroY + 34)

        // Nilai PnL
        ctx.font = 'bold 44px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
        ctx.fillStyle = isProfit ? theme.accentProfit : theme.accentLoss
        const pnlText = hideNominal
            ? (isProfit ? '+★★★★★' : '-★★★★★')
            : `${isProfit ? '+' : ''}${formatPnl(data.netPnlTotal)} USDT`
        ctx.fillText(pnlText, heroX + 24, heroY + 86)

        // Win Rate Box di sisi kanan hero
        const winBoxW = 200
        const winBoxH = heroH - 24
        const winBoxX = heroX + heroW - winBoxW - 12
        const winBoxY = heroY + 12

        ctx.fillStyle = `${accent}22`
        ctx.strokeStyle = `${accent}55`
        ctx.lineWidth = 1.2
        ctx.beginPath()
        ctx.roundRect(winBoxX, winBoxY, winBoxW, winBoxH, 12)
        ctx.fill()
        ctx.stroke()

        ctx.font = 'bold 15px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
        ctx.fillStyle = '#94a3b8'
        ctx.fillText('WIN RATE', winBoxX + 20, winBoxY + 30)

        ctx.font = 'bold 36px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
        ctx.fillStyle = accent
        ctx.fillText(`${data.winRate.toFixed(1)}%`, winBoxX + 20, winBoxY + 70)
        ctx.restore()

        let curY = heroY + heroH + 16

        // 3. Kurva Ekuitas (Equity Curve Chart) jika tersedia
        if (data.showChart !== false && data.equityCurve && data.equityCurve.length >= 2) {
            const chartH = layout.height >= 1350 ? 280 : (layout.height >= 1080 ? 200 : 120)
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

            ctx.font = '600 15px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
            ctx.fillStyle = 'rgba(255, 255, 255, 0.55)'
            ctx.fillText('EQUITY GROWTH TRAJECTORY', chartX + 20, curY + 26)

            ctx.font = '500 14px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
            ctx.fillStyle = 'rgba(255, 255, 255, 0.4)'
            ctx.fillText(`${data.equityCurve.length} points`, chartX + chartW - 90, curY + 26)

            this.drawEquityCurve(ctx, data.equityCurve, chartX + 16, curY + 34, chartW - 32, chartH - 48, accent)
            ctx.restore()

            curY += chartH + 16
        }

        // 4. Grid Metrik Portofolio
        const hasRichMetrics = Boolean(
            data.totalR !== undefined ||
            data.expectancyR !== undefined ||
            data.recoveryFactor !== undefined ||
            data.maxConsecutiveWins !== undefined ||
            data.avgWin !== undefined
        )

        if (hasRichMetrics) {
            const gridW = heroW
            const isVerticalLayout = layout.height >= 1350
            const gridCols = isVerticalLayout ? 2 : 4
            const gridGap = isVerticalLayout ? 14 : 12
            const gridItemW = (gridW - (gridCols - 1) * gridGap) / gridCols
            const gridItemH = isVerticalLayout ? 80 : (layout.height >= 1080 ? 72 : 60)

            const recoveryStr = data.recoveryFactor !== undefined && data.recoveryFactor !== null
                ? (!Number.isFinite(data.recoveryFactor) ? '∞' : data.recoveryFactor.toFixed(2))
                : '—'

            const streakStr = data.maxConsecutiveWins !== undefined
                ? `${data.maxConsecutiveWins}W / ${data.maxConsecutiveLosses ?? 0}L`
                : '—'

            const metricsData = [
                {
                    label: 'TOTAL TRADES',
                    value: `${data.totalTrades} (${data.winCount ?? 0}W/${data.lossCount ?? 0}L)`
                },
                {
                    label: 'PROFIT FACTOR',
                    value: data.profitFactor !== undefined
                        ? (Number.isFinite(data.profitFactor) ? data.profitFactor.toFixed(2) : '∞')
                        : '—'
                },
                {
                    label: 'TOTAL R',
                    value: data.totalR !== undefined && data.totalR !== null
                        ? `${data.totalR >= 0 ? '+' : ''}${data.totalR.toFixed(2)} R`
                        : '—'
                },
                {
                    label: 'EXPECTANCY (R)',
                    value: data.expectancyR !== undefined && data.expectancyR !== null
                        ? `${data.expectancyR >= 0 ? '+' : ''}${data.expectancyR.toFixed(2)} R`
                        : (hideNominal ? '••••' : (data.expectancy !== undefined && data.expectancy !== null ? `${formatPnl(data.expectancy)} USDT` : '—'))
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
                    value: hideNominal ? '••••' : (data.maxDrawdown !== undefined ? `${formatPnl(data.maxDrawdown)} USDT` : (data.maxDrawdownPercent !== undefined ? `${data.maxDrawdownPercent.toFixed(1)}%` : '—'))
                },
                {
                    label: 'AVG WIN / LOSS',
                    value: hideNominal ? '•••• / ••••' : `${formatPnl(data.avgWin || 0)} / ${formatPnl(data.avgLoss || 0)}`
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

                ctx.font = '600 12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                ctx.fillStyle = 'rgba(255, 255, 255, 0.5)'
                ctx.fillText(item.label, gx + 14, gy + 22)

                ctx.font = 'bold 17px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                ctx.fillStyle = '#ffffff'
                ctx.fillText(item.value, gx + 14, gy + (gridItemH >= 70 ? 54 : 46))
            })
            ctx.restore()

            const numRows = Math.ceil(metricsData.length / gridCols)
            curY += numRows * (gridItemH + gridGap) + 12
        } else {
            const gridW = heroW
            const gridH = 100
            const colW = gridW / 4

            ctx.save()
            ctx.fillStyle = 'rgba(255, 255, 255, 0.03)'
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)'
            ctx.lineWidth = 1
            ctx.beginPath()
            ctx.roundRect(heroX, curY, gridW, gridH, 16)
            ctx.fill()
            ctx.stroke()

            const drawCol = (label: string, val: string, idx: number, color = '#ffffff') => {
                const cxCol = heroX + colW * idx + 20
                ctx.font = '16px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                ctx.fillStyle = theme.textSub
                ctx.fillText(label, cxCol, curY + 34)
                ctx.font = 'bold 26px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                ctx.fillStyle = color
                ctx.fillText(val, cxCol, curY + 74)
            }

            const winLoss = `${data.winCount ?? 0}W / ${data.lossCount ?? 0}L`
            const pf = data.profitFactor !== undefined ? data.profitFactor.toFixed(2) : '—'
            const drawdownText = data.maxDrawdownPercent !== undefined ? `${data.maxDrawdownPercent.toFixed(1)}%` : '—'

            drawCol('TOTAL TRADES', `${data.totalTrades}`, 0)
            drawCol('WIN / LOSS', winLoss, 1, '#38bdf8')
            drawCol('PROFIT FACTOR', pf, 2, '#34d399')
            drawCol('MAX DRAWDOWN', drawdownText, 3, '#f87171')

            ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)'
            ctx.beginPath()
            ctx.moveTo(heroX + colW, curY + 16); ctx.lineTo(heroX + colW, curY + gridH - 16)
            ctx.moveTo(heroX + colW * 2, curY + 16); ctx.lineTo(heroX + colW * 2, curY + gridH - 16)
            ctx.moveTo(heroX + colW * 3, curY + 16); ctx.lineTo(heroX + colW * 3, curY + gridH - 16)
            ctx.stroke()
            ctx.restore()

            curY += gridH + 16
        }

        // 5. Catatan Trader (Trader Note) jika ada
        if (data.traderNote?.trim()) {
            ctx.save()
            ctx.font = 'italic 16px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
            const noteLines = wrapCanvasText(ctx, `“${data.traderNote.trim()}”`, heroW - 40)
            const noteH = noteLines.length * 24 + 16
            ctx.beginPath()
            ctx.roundRect(heroX, curY, heroW, noteH, 10)
            ctx.fillStyle = `${accent}15`
            ctx.fill()
            ctx.strokeStyle = `${accent}33`
            ctx.lineWidth = 1
            ctx.stroke()

            ctx.fillStyle = '#ffffff'
            noteLines.forEach((line, i) => {
                ctx.fillText(line, heroX + 20, curY + 24 + i * 24)
            })
            ctx.restore()
        }

        // 6. Footer: Trader Profile & Watermark
        const footerY = padY + cardHeight - 34
        ctx.save()
        if (branding?.showProfile !== false) {
            const avatarX = heroX
            const avatarY = footerY - 14

            if (branding?.avatarImage) {
                try {
                    ctx.save()
                    ctx.beginPath()
                    ctx.arc(avatarX + 18, avatarY + 18, 18, 0, Math.PI * 2)
                    ctx.clip()
                    ctx.drawImage(branding.avatarImage, avatarX, avatarY, 36, 36)
                    ctx.restore()
                    ctx.beginPath()
                    ctx.arc(avatarX + 18, avatarY + 18, 18, 0, Math.PI * 2)
                    ctx.strokeStyle = accent
                    ctx.lineWidth = 2
                    ctx.stroke()
                } catch {
                    // Fallback jika avatar error saat digambar
                }
            } else {
                ctx.beginPath()
                ctx.arc(avatarX + 18, avatarY + 18, 18, 0, Math.PI * 2)
                ctx.fillStyle = `${accent}33`
                ctx.fill()
                ctx.strokeStyle = accent
                ctx.lineWidth = 2
                ctx.stroke()

                ctx.font = 'bold 15px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                ctx.fillStyle = '#ffffff'
                const initials = traderHandle.replace('@', '').slice(0, 2).toUpperCase() || 'TR'
                ctx.fillText(initials, avatarX + 8, avatarY + 24)
            }

            ctx.font = 'bold 17px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
            ctx.fillStyle = '#ffffff'
            ctx.fillText(traderHandle, avatarX + 46, avatarY + 16)

            ctx.font = '500 13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
            ctx.fillStyle = 'rgba(255, 255, 255, 0.5)'
            ctx.fillText('Verified Trader • nitirekso.app', avatarX + 46, avatarY + 34)
        }

        if (branding?.showWatermark !== false) {
            ctx.font = '500 15px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
            ctx.fillStyle = 'rgba(255, 255, 255, 0.4)'
            const wm = `${brandTitle} • ${formatDate(Date.now())}`
            const wmW = ctx.measureText(wm).width
            ctx.fillText(wm, heroX + heroW - wmW, footerY + 12)
        }
        ctx.restore()
    }

    /**
     * Context canvas virtual internal untuk pengukuran teks headless.
     */
    private getMeasurementContext(): CanvasRenderingContext2D {
        if (typeof document !== 'undefined' && document.createElement) {
            const canvas = document.createElement('canvas')
            const ctx = canvas.getContext('2d')
            if (ctx) return ctx
        }

        // Fallback untuk lingkungan headless murni (Node.js/Vitest worker)
        let currentFont = '20px sans-serif'
        return {
            get font() { return currentFont },
            set font(val: string) { currentFont = val },
            measureText: (text: string) => {
                const match = currentFont.match(/(\d+)px/)
                const fontSize = match && match[1] ? parseInt(match[1], 10) : 20
                const charWidth = fontSize * 0.55
                return {
                    width: text.length * charWidth,
                    actualBoundingBoxAscent: fontSize * 0.8,
                    actualBoundingBoxDescent: fontSize * 0.2
                } as TextMetrics
            }
        } as unknown as CanvasRenderingContext2D
    }
}
