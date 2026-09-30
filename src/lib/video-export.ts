/**
 * Modul Ekspor Video Resolusi Tinggi (HQ MP4 / WebM)
 *
 * Merekam animasi kartu Share PnL (wallpaper video / transisi efek)
 * secara langsung dari HTML Canvas menggunakan MediaRecorder API.
 * Menghasilkan video TrueColor 24-bit/32-bit tanpa color banding (jauh lebih jernih daripada GIF).
 */

export interface VideoFormatSupport {
    mimeType: string
    extension: 'mp4' | 'webm'
    codecName: string
}

/**
 * Deteksi format video terbaik yang didukung oleh runtime Chromium / Electron.
 * Mengutamakan MP4 (H.264/AVC) untuk kompatibilitas maksimal di media sosial,
 * dengan fallback mulus ke WebM (VP9/VP8).
 */
export function getBestSupportedVideoMimeType(
    preference: 'auto' | 'mp4' | 'webm' = 'auto'
): VideoFormatSupport {
    if (typeof window === 'undefined' || typeof MediaRecorder === 'undefined') {
        throw new Error('MediaRecorder tidak didukung di lingkungan ini.')
    }

    const mp4Candidates: Array<{ mimeType: string; extension: 'mp4'; codecName: string }> = [
        { mimeType: 'video/mp4;codecs=avc1.42E01E,mp4a.40.2', extension: 'mp4', codecName: 'MP4 (H.264/AVC)' },
        { mimeType: 'video/mp4;codecs=avc1', extension: 'mp4', codecName: 'MP4 (H.264)' },
        { mimeType: 'video/mp4;codecs=h264', extension: 'mp4', codecName: 'MP4 (H.264)' },
        { mimeType: 'video/mp4', extension: 'mp4', codecName: 'MP4' }
    ]

    const webmCandidates: Array<{ mimeType: string; extension: 'webm'; codecName: string }> = [
        { mimeType: 'video/webm;codecs=vp9,opus', extension: 'webm', codecName: 'WebM (VP9 HQ)' },
        { mimeType: 'video/webm;codecs=vp9', extension: 'webm', codecName: 'WebM (VP9)' },
        { mimeType: 'video/webm;codecs=vp8,opus', extension: 'webm', codecName: 'WebM (VP8)' },
        { mimeType: 'video/webm;codecs=vp8', extension: 'webm', codecName: 'WebM (VP8)' },
        { mimeType: 'video/webm', extension: 'webm', codecName: 'WebM' }
    ]

    if (preference === 'mp4') {
        for (const candidate of mp4Candidates) {
            if (MediaRecorder.isTypeSupported(candidate.mimeType)) {
                return candidate
            }
        }
    } else if (preference === 'webm') {
        for (const candidate of webmCandidates) {
            if (MediaRecorder.isTypeSupported(candidate.mimeType)) {
                return candidate
            }
        }
    }

    // Default 'auto': Coba MP4 terlebih dahulu karena kompatibilitas tertinggi untuk share medsos
    for (const candidate of mp4Candidates) {
        if (MediaRecorder.isTypeSupported(candidate.mimeType)) {
            return candidate
        }
    }

    // Fallback ke WebM jika MP4 tidak didukung
    for (const candidate of webmCandidates) {
        if (MediaRecorder.isTypeSupported(candidate.mimeType)) {
            return candidate
        }
    }

    return { mimeType: 'video/webm', extension: 'webm', codecName: 'WebM' }
}

export interface VideoExportOptions {
    /** Durasi perekaman video dalam milidetik (default: 15000ms / 15 detik) */
    durationMs?: number
    /** Frame per detik (default: 30 FPS untuk gerakan halus) */
    fps?: number
    /** Bitrate video (default: 7_500_000 bps / 7.5 Mbps untuk kualitas visual tajam tanpa noise) */
    videoBitsPerSecond?: number
    /** Preferensi format (auto, mp4, atau webm) */
    formatPreference?: 'auto' | 'mp4' | 'webm'
    /** Callback persentase progress (0 - 100) */
    onProgress?: (percent: number) => void
}

export interface VideoExportResult {
    blob: Blob
    extension: 'mp4' | 'webm'
    mimeType: string
    codecName: string
}

/**
 * Tangkap animasi kanvas dan ekspor sebagai video resolusi tinggi (MP4 / WebM).
 *
 * @param renderFrameToCanvas Fungsi yang menggambar tampilan kartu terbaru ke kanvas
 * @param options Opsi durasi, FPS, bitrate, dan progress
 */
export async function captureAndExportVideo(
    renderFrameToCanvas: (canvas: HTMLCanvasElement) => void,
    options: VideoExportOptions = {}
): Promise<VideoExportResult> {
    const durationMs = options.durationMs ?? 15_000
    const fps = options.fps ?? 30
    const videoBitsPerSecond = options.videoBitsPerSecond ?? 7_500_000
    const formatSupport = getBestSupportedVideoMimeType(options.formatPreference ?? 'auto')

    // 1. Dapatkan dimensi kartu dari satu frame sampel
    const sampleCanvas = document.createElement('canvas')
    renderFrameToCanvas(sampleCanvas)

    // Catatan H.264: Dimensi wajib bernilai genap agar encoder hardware tidak error
    const rawW = sampleCanvas.width || 1080
    const rawH = sampleCanvas.height || 1080
    const exportW = Math.round(rawW / 2) * 2
    const exportH = Math.round(rawH / 2) * 2

    // 2. Siapkan kanvas perekam
    const recordCanvas = document.createElement('canvas')
    recordCanvas.width = exportW
    recordCanvas.height = exportH
    const recordCtx = recordCanvas.getContext('2d', { alpha: false })
    if (!recordCtx) {
        throw new Error('Gagal menginisialisasi 2D context pada perekam kanvas.')
    }

    // Render frame pertama
    renderFrameToCanvas(sampleCanvas)
    recordCtx.drawImage(sampleCanvas, 0, 0, exportW, exportH)

    // 3. Buat MediaStream dari kanvas
    // TypeScript lib.dom mendukung captureStream pada HTMLCanvasElement
    const stream = (recordCanvas as unknown as { captureStream: (fps: number) => MediaStream }).captureStream(fps)
    if (!stream) {
        throw new Error('Metode captureStream tidak didukung pada elemen kanvas browser.')
    }

    // 4. Inisialisasi MediaRecorder
    let recorder: MediaRecorder
    try {
        recorder = new MediaRecorder(stream, {
            mimeType: formatSupport.mimeType,
            videoBitsPerSecond
        })
    } catch {
        // Fallback jika codec spesifik ditolak saat instansiasi
        recorder = new MediaRecorder(stream, { videoBitsPerSecond })
    }

    const recordedChunks: BlobPart[] = []
    recorder.ondataavailable = (event: BlobEvent) => {
        if (event.data && event.data.size > 0) {
            recordedChunks.push(event.data)
        }
    }

    return new Promise<VideoExportResult>((resolve, reject) => {
        let isAborted = false
        const startTime = performance.now()
        const frameIntervalMs = 1000 / fps
        let lastFrameTime = startTime
        let animationFrameId: number | null = null

        recorder.onerror = (err) => {
            isAborted = true
            if (animationFrameId !== null) cancelAnimationFrame(animationFrameId)
            stream.getTracks().forEach((track) => track.stop())
            reject(err)
        }

        recorder.onstop = () => {
            if (animationFrameId !== null) cancelAnimationFrame(animationFrameId)
            stream.getTracks().forEach((track) => track.stop())

            options.onProgress?.(100)
            const finalBlob = new Blob(recordedChunks, { type: formatSupport.mimeType })
            resolve({
                blob: finalBlob,
                extension: formatSupport.extension,
                mimeType: formatSupport.mimeType,
                codecName: formatSupport.codecName
            })
        }

        // Mulai merekam dengan timeslice 100ms
        recorder.start(100)
        options.onProgress?.(5)

        // 5. Loop render setiap frame secara presisi
        const frameCanvas = document.createElement('canvas')

        const renderLoop = (currentTime: number) => {
            if (isAborted) return

            const elapsed = currentTime - startTime
            if (elapsed >= durationMs) {
                // Selesai durasi perekaman
                options.onProgress?.(98)
                if (recorder.state === 'recording') {
                    recorder.stop()
                }
                return
            }

            // Gambar frame jika interval waktu mencukupi
            if (currentTime - lastFrameTime >= frameIntervalMs * 0.9) {
                renderFrameToCanvas(frameCanvas)
                recordCtx.drawImage(frameCanvas, 0, 0, exportW, exportH)
                lastFrameTime = currentTime

                const progressPercent = Math.min(95, Math.max(5, Math.round((elapsed / durationMs) * 100)))
                options.onProgress?.(progressPercent)
            }

            animationFrameId = requestAnimationFrame(renderLoop)
        }

        animationFrameId = requestAnimationFrame(renderLoop)
    })
}
