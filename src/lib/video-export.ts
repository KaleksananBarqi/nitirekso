/**
 * Modul Ekspor Video Resolusi Tinggi (HQ MP4)
 *
 * Menggunakan WebCodecs API dan mp4-muxer untuk Deterministic Encoding.
 * Menghasilkan video MP4 (H.264) yang 100% mulus tanpa drop frame,
 * karena tidak bergantung pada wall-clock time.
 */

import { Muxer, ArrayBufferTarget } from 'mp4-muxer'

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
 * Menggunakan pendekatan Deterministic Encoding.
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

    // 1.5. Tangkap dan Decode Audio secara Offline (Jika ada)
    let audioBuffer: AudioBuffer | null = null
    let audioSampleRate = 44100
    let audioChannels = 2
    let hasAudio = false

    if (options.audioSourceVideo) {
        const src = options.audioSourceVideo.currentSrc || options.audioSourceVideo.src
        if (src) {
            try {
                const response = await fetch(src)
                const arrayBuffer = await response.arrayBuffer()
                const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)()
                audioBuffer = await audioCtx.decodeAudioData(arrayBuffer)
                audioSampleRate = audioBuffer.sampleRate
                audioChannels = audioBuffer.numberOfChannels
                hasAudio = true
                if (audioCtx.state !== 'closed') await audioCtx.close()
            } catch (err) {
                console.warn('Gagal memuat/decode trek audio (Video akan bisu):', err)
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

    if (hasAudio) {
        muxerOptions.audio = {
            codec: 'aac',
            sampleRate: audioSampleRate,
            numberOfChannels: audioChannels
        }
    }
    const muxer = new Muxer(muxerOptions)

    // 2.5 Siapkan Audio Encoder (Jika Ada)
    let audioEncoderError: Error | null = null
    let audioEncoder: any = null
    let framesToEncode = 0
    let startFrame = 0

    if (hasAudio && audioBuffer) {
        audioEncoder = new window.AudioEncoder({
            output: (chunk: any, meta: any) => muxer.addAudioChunk(chunk, meta),
            error: (e: Error) => {
                console.error('AudioEncoder error:', e)
                audioEncoderError = e
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
    }

    // 3. Siapkan WebCodecs VideoEncoder
    let encoderError: Error | null = null
    const encoder = new VideoEncoder({
        output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
        error: (e) => {
            console.error('VideoEncoder error:', e)
            encoderError = e
        }
    })

    encoder.configure({
        codec: 'avc1.4d002a', // H.264 Main Profile Level 4.2
        width: exportW,
        height: exportH,
        bitrate: videoBitsPerSecond,
        hardwareAcceleration: 'prefer-hardware'
    })

    const frameCanvas = document.createElement('canvas')
    frameCanvas.width = exportW
    frameCanvas.height = exportH
    const ctx = frameCanvas.getContext('2d', { alpha: false })!

    const renderFullCanvas = document.createElement('canvas')

    options.onProgress?.(5)

    // 4. Loop render deterministik
    for (let i = 0; i < totalFrames; i++) {
        if (encoderError) throw encoderError
        if (audioEncoderError) throw audioEncoderError

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

        // Hitung timestamp frame yang tepat (dalam microseconds)
        const timestampMicroseconds = (i * 1000000) / fps

        if (audioEncoder && audioBuffer && framesToEncode > 0) {
            const audioChunkDurationUs = 1000000 / fps
            const currentAudioOffset = Math.floor((i * audioChunkDurationUs / 1000000) * audioSampleRate)
            const audioFramesNeeded = Math.floor((audioChunkDurationUs / 1000000) * audioSampleRate)
            
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
                const audioData = new AudioData({
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

        // Konversi kanvas ke VideoFrame (jika didukung) atau createImageBitmap
        const frame = new VideoFrame(frameCanvas, { timestamp: timestampMicroseconds })
        
        // Encode (pilih keyframe setiap interval 2 detik agar seeking MP4 mulus)
        const isKeyFrame = i % (fps * 2) === 0
        encoder.encode(frame, { keyFrame: isKeyFrame })
        
        frame.close()

        // Update progress tiap 10% agar UI tidak terlalu sering dirender u/ progress
        if (i % Math.ceil(totalFrames / 10) === 0) {
            options.onProgress?.(Math.round(5 + (i / totalFrames) * 90))
        }

        // Berikan sedikit waktu agar event loop browser tetap responsif untuk update progress UI
        await new Promise((r) => setTimeout(r, 2))
    }

    options.onProgress?.(95)

    // 5. Finalisasi file
    await encoder.flush()
    if (audioEncoder) {
        await audioEncoder.flush()
        audioEncoder.close()
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
