/**
 * Modul Komposisi Frame Rasio Media Sosial (TikTok 9:16)
 *
 * Mengomposisikan kartu PnL dinamis ke dalam frame portrait 9:16 (1080×1920)
 * dengan latar belakang blur adaptif (dari kartu atau wallpaper) dan safe-zone UI TikTok.
 * Berjalan optimal pada canvas recording MediaRecorder 60fps tanpa memory leak.
 */

import { type ExportAspect, type FrameBgSource, ASPECT_PRESETS } from './shareSettings'

export interface ComposeAspectFrameOptions {
    aspect: ExportAspect
    bgSource?: FrameBgSource
    blurPx?: number
    dimPercent?: number
    wallpaperSource?: HTMLImageElement | HTMLVideoElement | null
    solidColor?: string
}

// Cache canvas offscreen kecil untuk optimasi blur cepat & bebas lag
let smallBlurCanvas: HTMLCanvasElement | null = null

function getSmallBlurCanvas(width: number, height: number): HTMLCanvasElement {
    if (!smallBlurCanvas) {
        smallBlurCanvas = document.createElement('canvas')
    }
    if (smallBlurCanvas.width !== width || smallBlurCanvas.height !== height) {
        smallBlurCanvas.width = width
        smallBlurCanvas.height = height
    }
    return smallBlurCanvas
}

/**
 * Mengomposisikan sourceCanvas ke dalam targetCanvas dengan rasio yang dipilih.
 * Jika aspect === 'original', sourceCanvas disalin langsung 1:1.
 * Jika aspect === '9:16', kartu diletakkan di tengah frame 1080×1920 dengan latar belakang blur.
 */
export function composeAspectFrame(
    sourceCanvas: HTMLCanvasElement,
    targetCanvas: HTMLCanvasElement,
    options: ComposeAspectFrameOptions
): HTMLCanvasElement {
    const {
        aspect = '9:16',
        bgSource = 'card-blur',
        blurPx = 25,
        dimPercent = 40,
        wallpaperSource = null,
        solidColor = '#0b0f19'
    } = options

    const srcW = sourceCanvas.width || 1080
    const srcH = sourceCanvas.height || 1080

    // Mode Asli: Salin langsung tanpa frame tambahan
    if (aspect === 'original') {
        if (targetCanvas.width !== srcW || targetCanvas.height !== srcH) {
            targetCanvas.width = srcW
            targetCanvas.height = srcH
        }
        const ctx = targetCanvas.getContext('2d')
        if (ctx) {
            ctx.drawImage(sourceCanvas, 0, 0)
        }
        return targetCanvas
    }

    // Mode TikTok 9:16 (1080 × 1920)
    const targetW = ASPECT_PRESETS['9:16'].w
    const targetH = ASPECT_PRESETS['9:16'].h

    if (targetCanvas.width !== targetW || targetCanvas.height !== targetH) {
        targetCanvas.width = targetW
        targetCanvas.height = targetH
    }

    const ctx = targetCanvas.getContext('2d', { alpha: false })
    if (!ctx) return targetCanvas

    // 1. Gambar Background Blur / Solid
    if (bgSource === 'solid') {
        ctx.fillStyle = solidColor
        ctx.fillRect(0, 0, targetW, targetH)
    } else {
        // Tentukan gambar sumber latar belakang: wallpaper kustom atau kartu itu sendiri
        let mediaSrc: CanvasImageSource | null = null

        if (bgSource === 'wallpaper-blur' && wallpaperSource) {
            if (wallpaperSource instanceof HTMLVideoElement) {
                if (wallpaperSource.readyState >= 2) {
                    mediaSrc = wallpaperSource
                }
            } else if (wallpaperSource instanceof HTMLImageElement && wallpaperSource.complete) {
                mediaSrc = wallpaperSource
            }
        }

        // Fallback ke sourceCanvas jika wallpaper tidak tersedia
        if (!mediaSrc) {
            mediaSrc = sourceCanvas
        }

        // --- Optimasi Fast Box Blur lewat Canvas Downscaling (1/8 resolusi) ---
        // Menggambar blur resolusi penuh 1080x1920 di 60fps sangat berat,
        // teknik downscale -> blur -> upscale menghasilkan efek frosted glass halus & instan.
        const downW = Math.round(targetW / 8) // 135px
        const downH = Math.round(targetH / 8) // 240px
        const sCanvas = getSmallBlurCanvas(downW, downH)
        const sCtx = sCanvas.getContext('2d')

        if (sCtx) {
            sCtx.clearRect(0, 0, downW, downH)

            // Hitung cover-fit ke small canvas
            let mWidth = srcW
            let mHeight = srcH
            if (mediaSrc instanceof HTMLVideoElement) {
                mWidth = mediaSrc.videoWidth || srcW
                mHeight = mediaSrc.videoHeight || srcH
            } else if (mediaSrc instanceof HTMLImageElement) {
                mWidth = mediaSrc.naturalWidth || srcW
                mHeight = mediaSrc.naturalHeight || srcH
            }

            const mediaAspect = mWidth / mHeight
            const targetAspect = downW / downH
            let dw = downW
            let dh = downH
            let dx = 0
            let dy = 0

            if (mediaAspect > targetAspect) {
                dh = downH
                dw = downH * mediaAspect
                dx = (downW - dw) / 2
            } else {
                dw = downW
                dh = downW / mediaAspect
                dy = (downH - dh) / 2
            }

            // Terapkan blur ringan pada canvas kecil
            const scaledBlur = Math.max(2, Math.round(blurPx / 8))
            sCtx.filter = `blur(${scaledBlur}px)`
            sCtx.drawImage(mediaSrc, dx, dy, dw, dh)
            sCtx.filter = 'none'

            // Upscale kembali ke target canvas dengan smoothing tinggi
            ctx.imageSmoothingEnabled = true
            ctx.imageSmoothingQuality = 'high'
            ctx.drawImage(sCanvas, 0, 0, targetW, targetH)
        } else {
            ctx.fillStyle = solidColor
            ctx.fillRect(0, 0, targetW, targetH)
        }
    }

    // 2. Lapisan Dimming & Vignette agar kartu utama di tengah lebih menonjol
    const dimAlpha = Math.max(0, Math.min(0.95, dimPercent / 100))
    ctx.fillStyle = `rgba(0, 0, 0, ${dimAlpha})`
    ctx.fillRect(0, 0, targetW, targetH)

    // Gradien vignette atas & bawah (safe zone HUD TikTok)
    const vignetteGrad = ctx.createLinearGradient(0, 0, 0, targetH)
    vignetteGrad.addColorStop(0, 'rgba(0, 0, 0, 0.45)')
    vignetteGrad.addColorStop(0.18, 'rgba(0, 0, 0, 0.05)')
    vignetteGrad.addColorStop(0.82, 'rgba(0, 0, 0, 0.05)')
    vignetteGrad.addColorStop(1, 'rgba(0, 0, 0, 0.55)')
    ctx.fillStyle = vignetteGrad
    ctx.fillRect(0, 0, targetW, targetH)

    // 3. Posisikan Kartu di Area Aman (Safe Zone TikTok 9:16)
    // Safe area TikTok:
    // - Top margin: ~160px (Search, Live, Following/For You tabs)
    // - Bottom margin: ~320px (Caption, Creator name, Sound track disk)
    // - Right margin: ~130px (Like, Comment, Favorite, Share action bar)
    // - Left margin: ~50px
    const maxUsableW = targetW - 130 - 50 // 900px
    const maxUsableH = targetH - 160 - 320 // 1440px

    const scaleW = maxUsableW / srcW
    const scaleH = maxUsableH / srcH
    const cardScale = Math.min(1.0, scaleW, scaleH)

    const cardW = Math.round(srcW * cardScale)
    const cardH = Math.round(srcH * cardScale)

    // Pusatkan horizontal dengan offset sedikit ke kiri (karena action bar di kanan)
    const cardX = Math.round((targetW - 130 + 50 - cardW) / 2)
    // Pusatkan vertikal di dalam area aman (sedikit di atas tengah absolut)
    const cardY = Math.round(160 + (maxUsableH - cardH) / 2)

    // Bayangan lembut kartu
    ctx.save()
    ctx.shadowColor = 'rgba(0, 0, 0, 0.65)'
    ctx.shadowBlur = Math.round(36 * cardScale)
    ctx.shadowOffsetX = 0
    ctx.shadowOffsetY = Math.round(18 * cardScale)

    // Gambar kartu PnL
    ctx.drawImage(sourceCanvas, cardX, cardY, cardW, cardH)
    ctx.restore()

    return targetCanvas
}
