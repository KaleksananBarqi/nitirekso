/**
 * Layanan Orkestrasi Ekspor Media Kartu Visual (MediaExportService).
 *
 * Deep module mandiri yang menyerap seluruh orkestrasi perenderan dan ekspor media kartu:
 * - Siklus loop render per frame deterministik (bebas wall-clock drop).
 * - Sinkronisasi seek video wallpaper per milidetik tanpa intervensi DOM React.
 * - Pembingkaian rasio aspek media sosial (TikTok & Instagram Reels 9:16 portrait) dengan background blur adaptif.
 * - Perekaman WebCodecs deterministik (H.264 MP4), fallback MediaRecorder, dan animasi GIF.
 * - Penarikan trek audio AAC dari wallpaper video dan muxing backend FFmpeg via IPC Tauri.
 * - Dialog native save file Tauri dengan fallback unduhan browser otomatis.
 */

import { CardCanvasEngine } from './card-canvas-engine'
import { composeAspectFrame } from '../share-frame'
import {
    captureAndExportVideo,
    mediaUrlToBytes,
    type FrameRenderContext
} from '../video-export'
import { captureAndExportGif } from '../gif-export'
import { SharePnlErrorCode, logSharePnlError } from '../shareErrorCodes'
import type {
    CardRenderSpec,
    MediaExportOptions,
    MediaExportResult
} from './types'

/**
 * Membuat elemen kanvas baru secara aman di lingkungan browser maupun lingkungan pengujian/SSR.
 */
function createOffscreenCanvas(width = 1080, height = 1080): HTMLCanvasElement {
    if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
        const c = document.createElement('canvas')
        c.width = width
        c.height = height
        return c
    }
    return {
        width,
        height,
        getContext: () => null,
        toBlob: (cb: (b: Blob | null) => void) => cb(new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], { type: 'image/png' })),
        toDataURL: () => 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='
    } as unknown as HTMLCanvasElement
}

/**
 * Menyinkronkan posisi waktu pemutaran video latar belakang secara deterministik.
 * Menunggu sinyal event `seeked` dan frame commit dari browser sebelum melanjutkan render kanvas.
 */
async function seekVideoToTime(vid: HTMLVideoElement, timeSec: number): Promise<void> {
    if (!vid.duration || !isFinite(vid.duration) || vid.duration <= 0) return

    const targetTime = timeSec % vid.duration
    if (Math.abs(vid.currentTime - targetTime) <= 0.001) return

    vid.currentTime = targetTime

    await new Promise<void>((resolve) => {
        let resolved = false
        const onDone = () => {
            if (resolved) return
            resolved = true
            vid.removeEventListener('seeked', onDone)
            resolve()
        }
        vid.addEventListener('seeked', onDone, { once: true })
        // Batas waktu pengaman 250ms jika event seek terhambat oleh thread browser
        setTimeout(onDone, 250)
    })

    // Pastikan frame video baru benar-benar ter-commit ke context rendering kanvas
    if ('requestVideoFrameCallback' in vid && typeof (vid as any).requestVideoFrameCallback === 'function') {
        await new Promise<void>((r) => {
            ;(vid as any).requestVideoFrameCallback(() => r())
            setTimeout(r, 40)
        })
    } else {
        await new Promise((r) => setTimeout(r, 8))
    }
}

/**
 * Mengonversi elemen kanvas menjadi objek Blob secara aman di lingkungan browser maupun headless mock.
 */
async function canvasToBlob(canvas: HTMLCanvasElement, mimeType: string): Promise<Blob> {
    if (typeof canvas.toBlob === 'function') {
        return new Promise<Blob>((resolve, reject) => {
            canvas.toBlob((b) => {
                if (b) {
                    resolve(b)
                } else {
                    reject(new Error(`Gagal membuat Blob untuk tipe ${mimeType}`))
                }
            }, mimeType)
        })
    }

    if (typeof canvas.toDataURL === 'function') {
        const dataUrl = canvas.toDataURL(mimeType)
        const bytes = await mediaUrlToBytes(dataUrl)
        return new Blob([bytes as unknown as BlobPart], { type: mimeType })
    }

    // Fallback headless / pengujian vitest tanpa canvas native
    return new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], { type: mimeType })
}

/**
 * Menjalankan pengunduhan berkas melalui elemen `<a>` DOM browser.
 */
function triggerBrowserDownload(blob: Blob, filename: string): void {
    if (typeof document === 'undefined') return

    try {
        const createObjUrl = typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function'
            ? URL.createObjectURL
            : null
        if (!createObjUrl) return

        const url = createObjUrl(blob)
        const link = document.createElement('a')
        link.download = filename
        link.href = url
        link.click()

        if (typeof URL.revokeObjectURL === 'function') {
            URL.revokeObjectURL(url)
        }
    } catch (e) {
        console.warn('[MediaExportService] Unduhan browser dilewati atau gagal:', e)
    }
}

/**
 * Menyimpan berkas media menggunakan dialog native sistem (Tauri) atau fallback ke browser download.
 *
 * @param filename Nama berkas target
 * @param blob Data biner media
 * @returns Path berkas tersimpan jika dipilih via dialog native, atau null jika dibatalkan/via browser.
 */
export async function saveMediaFile(filename: string, blob: Blob): Promise<string | null> {
    const isMp4 = filename.toLowerCase().endsWith('.mp4')

    if (isMp4 && typeof window !== 'undefined' && window.api?.saveVideoFile) {
        try {
            const arrayBuffer = await blob.arrayBuffer()
            const saveRes = await window.api.saveVideoFile(filename, new Uint8Array(arrayBuffer))
            if (saveRes?.ok && saveRes.data) {
                return saveRes.data
            }
            if (saveRes?.ok && saveRes.data === null) {
                // Pemilihan folder penyimpanan dibatalkan oleh pengguna
                return null
            }
            if (saveRes && !saveRes.ok) {
                logSharePnlError(
                    SharePnlErrorCode.FILE_SAVE_FAILED,
                    `Penyimpanan via native dialog gagal: ${saveRes.error || 'Unknown error'}`,
                    saveRes,
                    'WARN'
                )
                triggerBrowserDownload(blob, filename)
                return null
            }
        } catch (saveErr) {
            logSharePnlError(
                SharePnlErrorCode.FILE_SAVE_FAILED,
                'Gagal memanggil native save file dialog, beralih ke unduhan browser',
                saveErr,
                'WARN'
            )
            triggerBrowserDownload(blob, filename)
            return null
        }
    }

    // Default fallback untuk lingkungan web atau format PNG / GIF
    triggerBrowserDownload(blob, filename)
    return null
}

/**
 * Menyusun nama berkas otomatis berdasarkan konfigurasi branding, data kartu, tanggal, dan format.
 */
export function resolveFilename(options: MediaExportOptions): string {
    const format = options.format
    if (options.filename && options.filename.trim().length > 0) {
        const trimmed = options.filename.trim()
        if (trimmed.toLowerCase().endsWith(`.${format}`)) {
            return trimmed
        }
        return `${trimmed}.${format}`
    }

    const dateStr = new Date().toISOString().slice(0, 10)
    const aspectSuffix = options.aspect === '9:16' ? '-9x16' : ''
    const brand = options.spec.branding?.brandTitle || 'nitirekso'
    const symbol = (options.spec.data && 'symbol' in options.spec.data && options.spec.data.symbol)
        ? options.spec.data.symbol
        : 'card'

    return `${brand}-${symbol}-${dateStr}${aspectSuffix}.${format}`
}

/**
 * Titik masuk terpadu ekspor media visual kartu (PNG, MP4, atau GIF).
 * Menyerap seluruh siklus komputasi kanvas, pembingkaian 9:16 vertikal, sinkronisasi video,
 * peracikan audio, kompresi encoding, dan penyimpanan berkas.
 *
 * @param options Konfigurasi ekspor terpadu
 * @returns Hasil ekspor berupa Blob biner, nama berkas, path penyimpanan, dan ekstensi
 */
export async function exportCardMedia(options: MediaExportOptions): Promise<MediaExportResult> {
    const filename = resolveFilename(options)
    const format = options.format
    const wpMedia = options.wallpaperMediaElement ?? (options.spec.theme.customMedia as any) ?? null

    const isVideoWallpaper = wpMedia && (
        (typeof HTMLVideoElement !== 'undefined' && wpMedia instanceof HTMLVideoElement) ||
        (typeof (wpMedia as any).currentTime === 'number' && typeof (wpMedia as any).pause === 'function')
    )
    const activeVideo = isVideoWallpaper ? (wpMedia as HTMLVideoElement) : null
    let wasPlaying = false

    // Jeda pemutaran live preview jika video sedang berjalan agar seek deterministik dapat dikontrol
    if (activeVideo) {
        try {
            wasPlaying = !activeVideo.paused
            activeVideo.pause()
            activeVideo.currentTime = 0
        } catch {
            // Abaikan pencegahan pemutaran browser
        }
    }

    try {
        // Kanvas perantara untuk render kartu murni sebelum pembingkaian
        let rawCardCanvas: HTMLCanvasElement | null = null

        const renderFrame = async (targetCanvas: HTMLCanvasElement, context?: FrameRenderContext): Promise<void> => {
            const currentTimeSec = context?.currentTimeSec ?? 0

            // Sinkronkan video wallpaper ke detik yang tepat
            if (activeVideo) {
                await seekVideoToTime(activeVideo, currentTimeSec)
            }

            // Pastikan tema kanvas menyertakan media wallpaper terbaru
            const frameSpec: CardRenderSpec = wpMedia
                ? {
                    ...options.spec,
                    theme: {
                        ...options.spec.theme,
                        customMedia: wpMedia
                    }
                }
                : options.spec

            if (options.aspect === '9:16') {
                if (!rawCardCanvas) {
                    rawCardCanvas = createOffscreenCanvas()
                }
                CardCanvasEngine.render(frameSpec, rawCardCanvas)
                composeAspectFrame(rawCardCanvas, targetCanvas, {
                    aspect: '9:16',
                    bgSource: options.frameBgSource ?? 'card-blur',
                    blurPx: options.frameBlur ?? 25,
                    dimPercent: options.frameDim ?? 40,
                    wallpaperSource: wpMedia
                })
            } else {
                CardCanvasEngine.render(frameSpec, targetCanvas)
            }
        }

        // -------------------------------------------------------------------
        // 1. Ekspor Gambar PNG Statis
        // -------------------------------------------------------------------
        if (format === 'png') {
            options.onProgress?.(10)
            const finalCanvas = createOffscreenCanvas()
            await renderFrame(finalCanvas, {
                frameIndex: 0,
                totalFrames: 1,
                currentTimeSec: 0,
                fps: 1
            })
            options.onProgress?.(50)

            const blob = await canvasToBlob(finalCanvas, 'image/png')
            options.onProgress?.(80)

            triggerBrowserDownload(blob, filename)
            options.onProgress?.(100)

            return {
                blob,
                filename,
                savedFilePath: null,
                extension: 'png'
            }
        }

        // -------------------------------------------------------------------
        // 2. Ekspor Animasi GIF Bergerak
        // -------------------------------------------------------------------
        if (format === 'gif') {
            options.onProgress?.(5)
            const fps = options.fps ?? 8
            const durationMs = options.durationMs ?? 2000
            const frameCount = Math.max(1, Math.round((durationMs / 1000) * fps))

            const blob = await captureAndExportGif(renderFrame, {
                fps,
                frameCount,
                durationMs,
                onProgress: options.onProgress
            })

            triggerBrowserDownload(blob, filename)
            options.onProgress?.(100)

            return {
                blob,
                filename,
                savedFilePath: null,
                extension: 'gif'
            }
        }

        // -------------------------------------------------------------------
        // 3. Ekspor Video MP4 Resolusi Tinggi
        // -------------------------------------------------------------------
        const durationMs = options.durationMs ?? 15_000
        const fps = options.fps ?? 30
        const videoBitsPerSecond = options.videoBitsPerSecond ?? 8_000_000

        const videoResult = await captureAndExportVideo(renderFrame, {
            durationMs,
            fps,
            videoBitsPerSecond,
            onProgress: (pct) => options.onProgress?.(Math.round(pct * 0.9)),
            audioSourceVideo: activeVideo || undefined
        })

        let finalBlob = videoResult.blob

        // 3.1 Penyiapan data biner audio latar belakang untuk remuxing FFmpeg
        let bgAudioData = options.wallpaperAudioData
        if (!bgAudioData && options.wallpaperAudioUrl) {
            try {
                bgAudioData = await mediaUrlToBytes(options.wallpaperAudioUrl)
            } catch (err) {
                console.warn('[MediaExportService] Gagal memuat audio wallpaper dari URL:', err)
            }
        } else if (!bgAudioData && activeVideo) {
            const vSrc = activeVideo.currentSrc || activeVideo.src
            if (vSrc) {
                try {
                    bgAudioData = await mediaUrlToBytes(vSrc)
                } catch (err) {
                    console.warn('[MediaExportService] Gagal memuat audio wallpaper dari elemen video:', err)
                }
            }
        }

        // 3.2 Remuxing MP4 via backend Rust / FFmpeg (faststart atom & audio AAC)
        if (videoResult.extension === 'mp4' && typeof window !== 'undefined' && window.api?.remuxVideoMp4) {
            try {
                const arrayBuffer = await videoResult.blob.arrayBuffer()
                const remuxRes = await window.api.remuxVideoMp4(new Uint8Array(arrayBuffer), bgAudioData)
                if (remuxRes?.ok && remuxRes.data && remuxRes.data.length > 0) {
                    finalBlob = new Blob([remuxRes.data as unknown as BlobPart], { type: 'video/mp4' })
                } else if (remuxRes && !remuxRes.ok) {
                    logSharePnlError(
                        SharePnlErrorCode.BACKEND_REMUX_FAILED,
                        `Remuxing backend FFmpeg gagal: ${remuxRes.error || 'Unknown error'}`,
                        remuxRes,
                        'WARN'
                    )
                }
            } catch (remuxErr) {
                logSharePnlError(
                    SharePnlErrorCode.BACKEND_REMUX_FAILED,
                    'Remuxing video gagal di backend, beralih menggunakan rekaman asli',
                    remuxErr,
                    'WARN'
                )
            }
        }

        // 3.3 Simpan berkas melalui native dialog atau fallback unduhan browser
        const savedFilePath = await saveMediaFile(filename, finalBlob)
        options.onProgress?.(100)

        return {
            blob: finalBlob,
            filename,
            savedFilePath,
            extension: 'mp4'
        }
    } finally {
        // Kembalikan status pemutaran live preview agar tidak macet di UI
        if (activeVideo) {
            try {
                if (wasPlaying) {
                    void activeVideo.play().catch(() => {})
                }
            } catch {
                // Abaikan kesalahan pemutaran
            }
        }
    }
}

/**
 * Antarmuka terpadu MediaExportService untuk seluruh operasi ekspor media Nitirekso.
 * Mengarahkan seluruh pemanggilan secara langsung ke fungsi utama `exportCardMedia` dan `saveMediaFile`.
 */
export class MediaExportService {
    /**
     * Eksekusi ekspor media (PNG, MP4, atau GIF).
     */
    static export = exportCardMedia

    /**
     * Simpan ulang data media biner menggunakan dialog native atau browser download.
     */
    static saveMedia = saveMediaFile

    /**
     * Susun nama berkas deterministik sesuai opsi ekspor.
     */
    static resolveFilename = resolveFilename
}
