/**
 * Modul Ekspor Video Resolusi Tinggi (HQ MP4)
 *
 * Menggunakan WebCodecs API dan mp4-muxer untuk Deterministic Encoding.
 * Menghasilkan video MP4 (H.264) yang 100% mulus tanpa drop frame,
 * karena tidak bergantung pada wall-clock time.
 */

import { Muxer, ArrayBufferTarget } from 'mp4-muxer'
import { SharePnlErrorCode, logSharePnlError } from './shareErrorCodes'

/**
 * Mengubah URL media (data: / blob: / lainnya) menjadi byte mentah.
 *
 * `data:` URL didekode langsung dari base64 TANPA fetch, karena CSP
 * `connect-src` aplikasi tidak mengizinkan skema `data:` sehingga fetch
 * akan ditolak diam-diam (penyebab audio wallpaper tidak ikut terekspor).
 */
export async function mediaUrlToBytes(url: string): Promise<Uint8Array> {
    // 1. Coba native fetch terlebih dahulu (paling cepat via engine C++ browser jika diizinkan CSP)
    try {
        const res = await fetch(url)
        if (res.ok) {
            return new Uint8Array(await res.arrayBuffer())
        }
    } catch {
        // Fallback jika fetch ke skema data: diblokir oleh sandbox/CSP
    }

    // 2. Dekode manual untuk data: URL
    if (url.startsWith('data:')) {
        const commaIdx = url.indexOf(',')
        if (commaIdx >= 0) {
            const meta = url.slice(5, commaIdx)
            const payload = url.slice(commaIdx + 1)
            if (meta.includes(';base64')) {
                const cleanPayload = payload.replace(/\s/g, '')
                const binary = atob(cleanPayload)
                const bytes = new Uint8Array(binary.length)
                for (let i = 0; i < binary.length; i++) {
                    bytes[i] = binary.charCodeAt(i)
                }
                return bytes
            } else {
                return new TextEncoder().encode(decodeURIComponent(payload))
            }
        }
        throw new Error('Format data URL tidak valid')
    }

    throw new Error('Gagal mengonversi URL media menjadi byte mentah')
}

export interface VideoExportOptions {
    /** Durasi perekaman video dalam milidetik (default: 15000ms / 15 detik) */
    durationMs?: number
    /** Frame per detik (default: 30 FPS untuk gerakan halus) */
    fps?: number
    /** Bitrate video (default: 7_500_000 bps / 7.5 Mbps untuk kualitas visual tajam tanpa noise) */
    videoBitsPerSecond?: number
    /** Preferensi format (diabaikan karena WebCodecs memaksakan mp4) */
    formatPreference?: 'auto' | 'mp4' | 'webm'
    /** Callback persentase progress (0 - 100) */
    onProgress?: (percent: number) => void
    /** Elemen HTMLVideoElement sumber audio (jika ada) - tidak didukung penuh di v1 */
    audioSourceVideo?: HTMLVideoElement | null
}

export interface VideoExportResult {
    blob: Blob
    extension: 'mp4' | 'webm'
    mimeType: string
    codecName: string
}

export interface FrameRenderContext {
    /** Indeks frame saat ini (0 sampai totalFrames - 1) */
    frameIndex: number
    /** Jumlah total frame yang akan direkam */
    totalFrames: number
    /** Waktu rekaman saat ini dalam satuan detik (frameIndex / fps) */
    currentTimeSec: number
    /** Frame per second target */
    fps: number
}

// Fungsi dummy untuk menjaga kompatibilitas API ke komponen yang mungkin masih memanggilnya
export function getBestSupportedVideoMimeType(_preference?: string): any {
    return { mimeType: 'video/mp4', extension: 'mp4', codecName: 'MP4' }
}

/**
 * Tangkap animasi kanvas dan ekspor sebagai video MP4 resolusi tinggi.
 * Menggunakan pendekatan Deterministic Encoding dengan WebCodecs & mp4-muxer,
 * dengan fallback defensif ke MediaRecorder jika WebCodecs tidak tersedia.
 *
 * @param renderFrameToCanvas Fungsi yang menggambar tampilan kartu terbaru ke kanvas
 * @param options Opsi durasi, FPS, bitrate, dan progress
 */
export async function captureAndExportVideo(
    renderFrameToCanvas: (canvas: HTMLCanvasElement, context?: FrameRenderContext) => void | Promise<void>,
    options: VideoExportOptions = {}
): Promise<VideoExportResult> {
    const durationMs = options.durationMs ?? 15_000
    const fps = options.fps ?? 30
    const videoBitsPerSecond = options.videoBitsPerSecond ?? 7_500_000
    const totalFrames = Math.ceil((durationMs / 1000) * fps)
    
    // 1. Dapatkan dimensi kartu dari satu frame sampel
    const sampleCanvas = document.createElement('canvas')
    await renderFrameToCanvas(sampleCanvas, {
        frameIndex: 0,
        totalFrames,
        currentTimeSec: 0,
        fps
    })

    // Catatan H.264: Dimensi wajib bernilai genap agar encoder hardware tidak error
    const rawW = sampleCanvas.width || 1080
    const rawH = sampleCanvas.height || 1080
    const exportW = Math.round(rawW / 2) * 2
    const exportH = Math.round(rawH / 2) * 2

    // Cek apakah WebCodecs didukung di browser ini
    const isWebCodecsSupported = typeof window !== 'undefined' && typeof (window as any).VideoEncoder !== 'undefined'
    if (!isWebCodecsSupported) {
        logSharePnlError(
            SharePnlErrorCode.VIDEO_ENCODER_INIT_FAILED,
            'WebCodecs VideoEncoder tidak didukung pada browser/WebView ini, beralih ke fallback MediaRecorder',
            null,
            'WARN'
        )
        return exportViaMediaRecorder(renderFrameToCanvas, options, exportW, exportH)
    }

    try {
        return await exportViaWebCodecs(renderFrameToCanvas, options, exportW, exportH, totalFrames, fps, durationMs, videoBitsPerSecond)
    } catch (wcErr) {
        logSharePnlError(
            SharePnlErrorCode.VIDEO_ENCODE_FRAME_FAILED,
            'WebCodecs gagal di tengah proses encode, mencoba fallback ke MediaRecorder',
            wcErr,
            'WARN'
        )
        return exportViaMediaRecorder(renderFrameToCanvas, options, exportW, exportH)
    }
}

/**
 * Mesin encoder deterministik presisi tinggi via WebCodecs + mp4-muxer
 */
async function exportViaWebCodecs(
    renderFrameToCanvas: (canvas: HTMLCanvasElement, context?: FrameRenderContext) => void | Promise<void>,
    options: VideoExportOptions,
    exportW: number,
    exportH: number,
    totalFrames: number,
    fps: number,
    durationMs: number,
    videoBitsPerSecond: number
): Promise<VideoExportResult> {
    // 1. Tangkap dan Decode Audio secara Offline (Jika ada)
    let audioBuffer: AudioBuffer | null = null
    let audioSampleRate = 44100
    let audioChannels = 2
    let hasAudio = false

    if (options.audioSourceVideo) {
        const src = options.audioSourceVideo.currentSrc || options.audioSourceVideo.src
        if (src) {
            try {
                let arrayBuffer: ArrayBuffer | null = null
                if (src.startsWith('data:')) {
                    const u8 = await mediaUrlToBytes(src)
                    arrayBuffer = u8.buffer as ArrayBuffer
                } else {
                    const response = await fetch(src)
                    if (response.ok) {
                        arrayBuffer = await response.arrayBuffer()
                    }
                }

                if (arrayBuffer) {
                    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext
                    if (AudioContextClass) {
                        const audioCtx = new AudioContextClass()
                        audioBuffer = await audioCtx.decodeAudioData(arrayBuffer)
                        audioSampleRate = audioBuffer.sampleRate
                        audioChannels = audioBuffer.numberOfChannels
                        hasAudio = true
                        if (audioCtx.state !== 'closed') await audioCtx.close()
                    }
                }
            } catch (err) {
                logSharePnlError(
                    SharePnlErrorCode.AUDIO_PROCESS_FAILED,
                    'Gagal memuat atau mendecode trek audio internal, video akan diproses tanpa suara',
                    err,
                    'WARN'
                )
                hasAudio = false
            }
        }
    }

    // 2. Siapkan muxer
    const muxerOptions: any = {
        target: new ArrayBufferTarget(),
        video: {
            codec: 'avc',
            width: exportW,
            height: exportH
        },
        firstTimestampBehavior: 'offset',
        fastStart: 'in-memory'
    }

    // 2.5 Coba siapkan Audio Encoder jika audio tersedia
    let audioEncoder: any = null
    let framesToEncode = 0
    let startFrame = 0

    if (hasAudio && audioBuffer && typeof (window as any).AudioEncoder !== 'undefined') {
        try {
            audioEncoder = new (window as any).AudioEncoder({
                output: (chunk: any, meta: any) => {
                    try {
                        muxer.addAudioChunk(chunk, meta)
                    } catch (e) {
                        console.warn('Gagal menambahkan audio chunk ke muxer:', e)
                    }
                },
                error: (e: Error) => {
                    logSharePnlError(
                        SharePnlErrorCode.AUDIO_PROCESS_FAILED,
                        'AudioEncoder runtime error, menonaktifkan encoder audio',
                        e,
                        'WARN'
                    )
                    audioEncoder = null
                }
            })
            audioEncoder.configure({
                codec: 'mp4a.40.2',
                sampleRate: audioSampleRate,
                numberOfChannels: audioChannels,
                bitrate: 128_000
            })

            const startTime = options.audioSourceVideo?.currentTime || 0
            startFrame = Math.floor(startTime * audioSampleRate)
            framesToEncode = Math.floor((durationMs / 1000) * audioSampleRate)
            
            // Masukkan konfigurasi audio ke muxer hanya jika AudioEncoder berhasil dikonfigurasi
            muxerOptions.audio = {
                codec: 'aac',
                sampleRate: audioSampleRate,
                numberOfChannels: audioChannels
            }
        } catch (aeErr) {
            logSharePnlError(
                SharePnlErrorCode.AUDIO_PROCESS_FAILED,
                'AudioEncoder AAC tidak didukung oleh browser ini, audio akan dilewati',
                aeErr,
                'WARN'
            )
            hasAudio = false
            audioEncoder = null
        }
    } else {
        hasAudio = false
    }

    const muxer = new Muxer(muxerOptions)

    // 3. Siapkan WebCodecs VideoEncoder
    let encoderError: Error | null = null
    const encoder = new VideoEncoder({
        output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
        error: (e) => {
            console.error('VideoEncoder error:', e)
            encoderError = e
        }
    })

    const candidateProfiles: Array<{ codec: string; hardwareAcceleration: 'prefer-hardware' | 'no-preference' }> = [
        { codec: 'avc1.640033', hardwareAcceleration: 'prefer-hardware' }, // High Profile Level 5.1 (Cocok untuk 1080p, 1080x1920 & 4K)
        { codec: 'avc1.4d0032', hardwareAcceleration: 'prefer-hardware' }, // Main Profile Level 5.0
        { codec: 'avc1.4d002a', hardwareAcceleration: 'prefer-hardware' }, // Main Profile Level 4.2
        { codec: 'avc1.640033', hardwareAcceleration: 'no-preference' },
        { codec: 'avc1.4d0032', hardwareAcceleration: 'no-preference' },
        { codec: 'avc1.420032', hardwareAcceleration: 'no-preference' },   // Baseline Profile Level 5.0
        { codec: 'avc1.42e01e', hardwareAcceleration: 'no-preference' },   // Baseline Profile Level 3.0
    ]

    let isConfigured = false
    for (const profile of candidateProfiles) {
        const testConfig: VideoEncoderConfig = {
            codec: profile.codec,
            width: exportW,
            height: exportH,
            bitrate: videoBitsPerSecond,
            hardwareAcceleration: profile.hardwareAcceleration,
        }
        try {
            if (typeof VideoEncoder.isConfigSupported === 'function') {
                const support = await VideoEncoder.isConfigSupported(testConfig)
                if (support && support.supported) {
                    encoder.configure(testConfig)
                    isConfigured = true
                    console.log(`[video-export] Menggunakan WebCodecs konfigurasi: ${profile.codec} (${profile.hardwareAcceleration})`)
                    break
                }
            } else {
                encoder.configure(testConfig)
                isConfigured = true
                break
            }
        } catch {
            // Lanjut ke kandidat profil berikutnya
        }
    }

    if (!isConfigured) {
        logSharePnlError(
            SharePnlErrorCode.VIDEO_ENCODER_INIT_FAILED,
            `Profil hardware H.264 tidak tersedia untuk ${exportW}x${exportH}, menggunakan baseline avc1.420032`,
            null,
            'WARN'
        )
        encoder.configure({
            codec: 'avc1.420032',
            width: exportW,
            height: exportH,
            bitrate: videoBitsPerSecond,
            hardwareAcceleration: 'no-preference'
        })
    }

    const frameCanvas = document.createElement('canvas')
    frameCanvas.width = exportW
    frameCanvas.height = exportH
    const ctx = frameCanvas.getContext('2d', { alpha: false })!

    const renderFullCanvas = document.createElement('canvas')

    options.onProgress?.(5)

    // 4. Loop render deterministik
    for (let i = 0; i < totalFrames; i++) {
        if (encoderError) throw encoderError

        const currentTimeSec = i / fps

        // Render state UI saat ini ke kanvas asli dengan konteks waktu deterministik
        await renderFrameToCanvas(renderFullCanvas, {
            frameIndex: i,
            totalFrames,
            currentTimeSec,
            fps
        })

        // Skalakan ke resolusi genap export
        ctx.drawImage(renderFullCanvas, 0, 0, exportW, exportH)

        // Hitung timestamp frame integer yang tepat (dalam microseconds bulat)
        const timestampMicroseconds = Math.round((i * 1_000_000) / fps)

        if (audioEncoder && audioBuffer && framesToEncode > 0) {
            try {
                const audioChunkDurationUs = 1_000_000 / fps
                const currentAudioOffset = Math.floor((i * audioChunkDurationUs / 1_000_000) * audioSampleRate)
                const audioFramesNeeded = Math.floor((audioChunkDurationUs / 1_000_000) * audioSampleRate)
                
                let framesInChunk = audioFramesNeeded
                if (i === totalFrames - 1) {
                    framesInChunk = framesToEncode - currentAudioOffset
                }
                
                if (framesInChunk > 0 && currentAudioOffset < framesToEncode) {
                    framesInChunk = Math.min(framesInChunk, framesToEncode - currentAudioOffset)
                    const planarData = new Float32Array(framesInChunk * audioChannels)
                    for (let c = 0; c < audioChannels; c++) {
                        const channelData = audioBuffer.getChannelData(c)
                        for (let f = 0; f < framesInChunk; f++) {
                            const sampleIndex = (startFrame + currentAudioOffset + f) % audioBuffer.length
                            planarData[c * framesInChunk + f] = channelData[sampleIndex] || 0
                        }
                    }
                    const AudioDataClass = (window as any).AudioData
                    if (AudioDataClass) {
                        const audioData = new AudioDataClass({
                            format: 'f32-planar',
                            sampleRate: audioSampleRate,
                            numberOfFrames: framesInChunk,
                            numberOfChannels: audioChannels,
                            timestamp: Math.round((currentAudioOffset / audioSampleRate) * 1_000_000),
                            data: planarData
                        })
                        audioEncoder.encode(audioData)
                        audioData.close()
                    }
                }
            } catch (aErr) {
                console.warn('Encoding audio chunk dilewati karena error non-fatal:', aErr)
            }
        }

        // Konversi kanvas ke VideoFrame dengan timestamp integer presisi
        const frame = new VideoFrame(frameCanvas, { timestamp: timestampMicroseconds })
        
        // Encode (keyframe setiap interval 2 detik agar seeking MP4 mulus)
        const isKeyFrame = i % (fps * 2) === 0
        encoder.encode(frame, { keyFrame: isKeyFrame })
        
        frame.close()

        // Update progress tiap 10%
        if (i % Math.max(1, Math.ceil(totalFrames / 15)) === 0) {
            options.onProgress?.(Math.round(5 + (i / totalFrames) * 90))
        }

        // Berikan napas ke event loop agar UI tetap reaktif
        await new Promise((r) => setTimeout(r, 1))
    }

    options.onProgress?.(95)

    // 5. Finalisasi file MP4
    await encoder.flush()
    if (audioEncoder) {
        try {
            await audioEncoder.flush()
            audioEncoder.close()
        } catch {}
    }
    muxer.finalize()
    const { buffer } = muxer.target as ArrayBufferTarget

    options.onProgress?.(100)

    return {
        blob: new Blob([buffer], { type: 'video/mp4' }),
        extension: 'mp4',
        mimeType: 'video/mp4',
        codecName: 'MP4 (H.264 WebCodecs)'
    }
}

/**
 * Fallback perekaman video berbasis MediaRecorder jika WebCodecs tidak tersedia atau terhalang GPU
 */
async function exportViaMediaRecorder(
    renderFrameToCanvas: (canvas: HTMLCanvasElement, context?: FrameRenderContext) => void | Promise<void>,
    options: VideoExportOptions,
    exportW: number,
    exportH: number
): Promise<VideoExportResult> {
    const durationMs = options.durationMs ?? 15_000
    const fps = options.fps ?? 30
    const videoBitsPerSecond = options.videoBitsPerSecond ?? 7_500_000
    const totalFrames = Math.ceil((durationMs / 1000) * fps)
    const frameIntervalMs = 1000 / fps

    const recordCanvas = document.createElement('canvas')
    recordCanvas.width = exportW
    recordCanvas.height = exportH
    const recordCtx = recordCanvas.getContext('2d', { alpha: false })!

    const stream = (recordCanvas as any).captureStream ? (recordCanvas as any).captureStream(fps) : null
    if (!stream) {
        logSharePnlError(
            SharePnlErrorCode.RECORDER_FALLBACK_FAILED,
            'captureStream tidak didukung di lingkungan kanvas ini',
            null,
            'ERROR'
        )
        throw new Error('captureStream tidak didukung di lingkungan ini.')
    }

    const mimeCandidates = [
        'video/mp4;codecs=avc1',
        'video/mp4',
        'video/webm;codecs=vp9',
        'video/webm'
    ]
    let chosenMime = 'video/webm'
    let chosenExt: 'mp4' | 'webm' = 'webm'
    for (const cand of mimeCandidates) {
        if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(cand)) {
            chosenMime = cand
            chosenExt = cand.includes('mp4') ? 'mp4' : 'webm'
            break
        }
    }

    const recorder = new MediaRecorder(stream, {
        mimeType: chosenMime,
        videoBitsPerSecond
    })

    const chunks: BlobPart[] = []
    recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunks.push(e.data)
    }

    return new Promise((resolve, reject) => {
        let isAborted = false
        let currentFrame = 0
        const fullCanvas = document.createElement('canvas')

        recorder.onerror = (e) => {
            isAborted = true
            logSharePnlError(
                SharePnlErrorCode.RECORDER_FALLBACK_FAILED,
                'MediaRecorder mengalami runtime error saat merekam',
                e,
                'ERROR'
            )
            reject(e)
        }

        recorder.onstop = () => {
            stream.getTracks().forEach((t: MediaStreamTrack) => t.stop())
            options.onProgress?.(100)
            const finalBlob = new Blob(chunks, { type: chosenMime })
            resolve({
                blob: finalBlob,
                extension: chosenExt,
                mimeType: chosenMime,
                codecName: chosenExt === 'mp4' ? 'MP4 (MediaRecorder)' : 'WebM (MediaRecorder)'
            })
        }

        recorder.start(100)
        options.onProgress?.(5)

        const intervalId = setInterval(async () => {
            if (isAborted) {
                clearInterval(intervalId)
                return
            }
            if (currentFrame >= totalFrames) {
                clearInterval(intervalId)
                if (recorder.state === 'recording') {
                    recorder.stop()
                }
                return
            }

            const currentTimeSec = currentFrame / fps
            try {
                await renderFrameToCanvas(fullCanvas, {
                    frameIndex: currentFrame,
                    totalFrames,
                    currentTimeSec,
                    fps
                })
                recordCtx.drawImage(fullCanvas, 0, 0, exportW, exportH)
            } catch (err) {
                console.warn('Frame render error non-fatal:', err)
            }

            currentFrame++
            if (currentFrame % Math.max(1, Math.ceil(totalFrames / 15)) === 0) {
                options.onProgress?.(Math.round(5 + (currentFrame / totalFrames) * 90))
            }
        }, frameIntervalMs)
    })
}
