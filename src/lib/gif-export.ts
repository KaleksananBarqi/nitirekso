/**
 * Pure TypeScript GIF89a Encoder & Export Engine.
 *
 * Mampu merekam animasi canvas atau frame video secara berurutan dan mengompilasi
 * file .gif animasi tanpa dependensi eksternal atau native module.
 * 100% mematuhi spesifikasi standar GIF89a.
 */

// LZW Constants untuk 256 warna
const LZW_MIN_CODE_SIZE = 8

class LzwEncoder {
    private width: number
    private height: number
    private pixels: Uint8Array
    private initCodeSize: number
    private accum = new Uint8Array(256)
    private aCount = 0
    private curAccum = 0
    private curBits = 0
    private htab = new Int32Array(5003)
    private codetab = new Int32Array(5003)
    private hsize = 5003
    private freeEnt = 0
    private clearFlag = false
    private gInitBits = 0
    private ClearCode = 0
    private EOFCode = 0
    private nBits = 0
    private maxcode = 0

    constructor(width: number, height: number, pixels: Uint8Array, colorDepth: number = LZW_MIN_CODE_SIZE) {
        this.width = width
        this.height = height
        this.pixels = pixels
        this.initCodeSize = Math.max(2, colorDepth)
    }

    private charOut(c: number, outs: number[]): void {
        this.accum[this.aCount++] = c
        if (this.aCount >= 254) this.flushChar(outs)
    }

    private flushChar(outs: number[]): void {
        if (this.aCount > 0) {
            outs.push(this.aCount)
            for (let i = 0; i < this.aCount; i++) {
                outs.push(this.accum[i]!)
            }
            this.aCount = 0
        }
    }

    private output(code: number, outs: number[]): void {
        this.curAccum |= code << this.curBits
        this.curBits += this.nBits

        while (this.curBits >= 8) {
            this.charOut(this.curAccum & 0xff, outs)
            this.curAccum >>= 8
            this.curBits -= 8
        }

        if (this.freeEnt > this.maxcode || this.clearFlag) {
            if (this.clearFlag) {
                this.nBits = this.gInitBits
                this.maxcode = (1 << this.nBits) - 1
                this.clearFlag = false
            } else {
                this.nBits++
                if (this.nBits === 12) {
                    this.maxcode = 1 << 12
                } else {
                    this.maxcode = (1 << this.nBits) - 1
                }
            }
        }

        if (code === this.EOFCode) {
            while (this.curBits > 0) {
                this.charOut(this.curAccum & 0xff, outs)
                this.curAccum >>= 8
                this.curBits -= 8
            }
            this.flushChar(outs)
        }
    }

    public encode(outs: number[]): void {
        // Minimum Code Size byte
        outs.push(this.initCodeSize)

        this.gInitBits = this.initCodeSize + 1 // 9 bits untuk 256 colors
        this.clearFlag = false
        this.nBits = this.gInitBits
        this.maxcode = (1 << this.nBits) - 1

        this.ClearCode = 1 << this.initCodeSize // 256
        this.EOFCode = this.ClearCode + 1 // 257
        this.freeEnt = this.ClearCode + 2 // 258

        this.aCount = 0
        this.curAccum = 0
        this.curBits = 0

        for (let i = 0; i < this.hsize; ++i) this.htab[i] = -1

        this.output(this.ClearCode, outs)

        const total = this.width * this.height
        if (total === 0 || this.pixels.length === 0) {
            this.output(this.EOFCode, outs)
            outs.push(0)
            return
        }

        let ent = this.pixels[0]!

        for (let i = 1; i < total; ++i) {
            const c = this.pixels[i]!
            const fcode = (c << 12) + ent
            let idx = (c << 4) ^ ent

            if (this.htab[idx] === fcode) {
                ent = this.codetab[idx]!
                continue
            }

            if (this.htab[idx]! >= 0) {
                let disp = this.hsize - idx
                if (idx === 0) disp = 1
                let found = false
                do {
                    idx = (idx - disp + this.hsize) % this.hsize
                    if (this.htab[idx] === fcode) {
                        ent = this.codetab[idx]!
                        found = true
                        break
                    }
                } while (this.htab[idx]! >= 0)
                if (found) continue
            }

            this.output(ent, outs)
            ent = c

            if (this.freeEnt < 1 << 12) {
                this.codetab[idx] = this.freeEnt++
                this.htab[idx] = fcode
            } else {
                for (let j = 0; j < this.hsize; ++j) this.htab[j] = -1
                this.freeEnt = this.ClearCode + 2
                this.clearFlag = true
                this.output(this.ClearCode, outs)
            }
        }

        this.output(ent, outs)
        this.output(this.EOFCode, outs)
        outs.push(0) // block terminator
    }
}

/**
 * Palette standar seragam 256 warna RGB 3:3:2 (tepat 768 bytes).
 */
const GLOBAL_PALETTE_256: number[] = (() => {
    const pal: number[] = []
    for (let r = 0; r < 8; r++) {
        for (let g = 0; g < 8; g++) {
            for (let b = 0; b < 4; b++) {
                pal.push(Math.round((r / 7) * 255))
                pal.push(Math.round((g / 7) * 255))
                pal.push(Math.round((b / 3) * 255))
            }
        }
    }
    return pal
})()

/**
 * Kuantisasi data piksel RGBA ke 256 warna berindeks sesuai palette seragam.
 */
function quantizeRgbTo256(rgba: Uint8ClampedArray, total: number): Uint8Array {
    const indexed = new Uint8Array(total)
    for (let i = 0; i < total; i++) {
        const off = i * 4
        const r = rgba[off]!
        const g = rgba[off + 1]!
        const b = rgba[off + 2]!

        const rIdx = Math.min(7, Math.floor((r / 256) * 8))
        const gIdx = Math.min(7, Math.floor((g / 256) * 8))
        const bIdx = Math.min(3, Math.floor((b / 256) * 4))

        indexed[i] = (rIdx << 5) | (gIdx << 2) | bIdx
    }
    return indexed
}

export interface GifFrame {
    canvas: HTMLCanvasElement
    delayMs: number
}

/**
 * Kompilasi daftar frame canvas menjadi Uint8Array format GIF89a standar yang valid.
 */
export function createGif(frames: GifFrame[]): Uint8Array {
    if (frames.length === 0) throw new Error('Tidak ada frame untuk dibuat GIF')

    const firstFrame = frames[0]!
    const width = firstFrame.canvas.width
    const height = firstFrame.canvas.height
    const out: number[] = []

    // 1. Header GIF89a (6 bytes)
    const header = [0x47, 0x49, 0x46, 0x38, 0x39, 0x61] // "GIF89a"
    for (const b of header) out.push(b)

    // 2. Logical Screen Descriptor (7 bytes)
    out.push(width & 0xff, (width >> 8) & 0xff)
    out.push(height & 0xff, (height >> 8) & 0xff)
    out.push(0xf7) // GCT Flag (1), 8 bits/pixel color resolution (111), Sort (0), Size (111 = 256 colors)
    out.push(0) // Background color index
    out.push(0) // Pixel aspect ratio

    // 3. Global Color Table (256 * 3 = 768 bytes)
    for (let i = 0; i < 768; i++) {
        out.push(GLOBAL_PALETTE_256[i] ?? 0)
    }

    // 4. Netscape 2.0 Loop Extension (Infinite Loop, 19 bytes)
    out.push(0x21, 0xff, 0x0b)
    const appExt = [0x4e, 0x45, 0x54, 0x53, 0x43, 0x41, 0x50, 0x45, 0x32, 0x2e, 0x30] // "NETSCAPE2.0"
    for (const b of appExt) out.push(b)
    out.push(0x03, 0x01, 0x00, 0x00, 0x00) // Sub-block: loop count 0 (infinite)

    // 5. Frames
    const totalPixels = width * height
    for (const frame of frames) {
        const ctx = frame.canvas.getContext('2d')!
        const imgData = ctx.getImageData(0, 0, width, height)
        const indexedPixels = quantizeRgbTo256(imgData.data, totalPixels)

        const delayHundredths = Math.max(1, Math.round(frame.delayMs / 10))

        // Graphic Control Extension (8 bytes)
        out.push(0x21, 0xf9, 0x04)
        out.push(0x08) // Disposal Method = 2 (Restore to background), Non-transparent
        out.push(delayHundredths & 0xff, (delayHundredths >> 8) & 0xff) // Delay time
        out.push(0) // Transparent color index
        out.push(0) // Block terminator

        // Image Descriptor (10 bytes)
        out.push(0x2c) // Separator
        out.push(0, 0, 0, 0) // Left, Top
        out.push(width & 0xff, (width >> 8) & 0xff)
        out.push(height & 0xff, (height >> 8) & 0xff)
        out.push(0) // Local color table flag = 0 (use global)

        // LZW Image Data
        const encoder = new LzwEncoder(width, height, indexedPixels, LZW_MIN_CODE_SIZE)
        encoder.encode(out)
    }

    // 6. Trailer (1 byte)
    out.push(0x3b) // ';'

    return new Uint8Array(out)
}

/**
 * Capture animasi dari fungsi render canvas dalam rentang waktu tertentu
 * dan simpan sebagai file .gif animasi.
 */
export async function captureAndExportGif(
    renderFrameToCanvas: (canvas: HTMLCanvasElement) => void,
    options: {
        width?: number
        height?: number
        frameCount?: number
        fps?: number
        onProgress?: (percent: number) => void
    } = {}
): Promise<Blob> {
    const frameCount = options.frameCount ?? 18
    const fps = options.fps ?? 10
    const delayMs = Math.round(1000 / fps)

    const sampleCanvas = document.createElement('canvas')
    renderFrameToCanvas(sampleCanvas)
    const exportW = options.width ?? (sampleCanvas.width > 640 ? 640 : sampleCanvas.width)
    const exportH = options.height ?? Math.round((exportW / sampleCanvas.width) * sampleCanvas.height)

    const frames: GifFrame[] = []

    for (let i = 0; i < frameCount; i++) {
        const frameCanvas = document.createElement('canvas')
        frameCanvas.width = exportW
        frameCanvas.height = exportH
        const ctx = frameCanvas.getContext('2d')!

        const fullCanvas = document.createElement('canvas')
        renderFrameToCanvas(fullCanvas)

        // Downscale untuk menjaga ukuran GIF ringan dan cepat
        ctx.drawImage(fullCanvas, 0, 0, exportW, exportH)

        frames.push({ canvas: frameCanvas, delayMs })
        options.onProgress?.(Math.round(((i + 1) / frameCount) * 75))

        // Berikan napas ke event loop browser
        await new Promise((r) => setTimeout(r, delayMs))
    }

    options.onProgress?.(85)
    const gifBytes = createGif(frames)
    options.onProgress?.(100)

    return new Blob([gifBytes.buffer as ArrayBuffer], { type: 'image/gif' })
}
