/**
 * Unit Test untuk Modul Orkestrasi MediaExportService (Ticket 3 #25).
 *
 * Menguji perilaku batas modul (seam) MediaExportService:
 * - Resolusi nama berkas otomatis & kustom
 * - Ekspor gambar PNG statis (original vs rasio 9:16)
 * - Ekspor animasi GIF bergerak
 * - Ekspor video MP4 deterministik (WebCodecs, sinkronisasi video wallpaper, audio muxing, remuxing FFmpeg)
 * - Dialog native save file vs unduhan browser fallback
 * - Pemulihan pemutaran live preview pada blok finally
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
    exportCardMedia,
    resolveFilename,
    saveMediaFile,
    MediaExportService
} from './media-export-service'
import { CardCanvasEngine } from './card-canvas-engine'
import * as shareFrame from '../share-frame'
import * as videoExportModule from '../video-export'
import * as gifExportModule from '../gif-export'
import type { CardRenderSpec } from './types'

// Mock DOM elements and URL methods
const mockCreateObjectURL = vi.fn((_blob: Blob) => 'blob:mock-url')
const mockRevokeObjectURL = vi.fn((_url: string) => {})

const mockLayoutResult = () => ({} as any)

function createMockCanvasElement() {
    return {
        width: 1080,
        height: 1080,
        getContext: vi.fn(() => ({
            fillRect: vi.fn(),
            drawImage: vi.fn(),
            clearRect: vi.fn(),
        })),
        toBlob: vi.fn((cb: (b: Blob | null) => void) => cb(new Blob(['png-bytes'], { type: 'image/png' }))),
        toDataURL: vi.fn(() => 'data:image/png;base64,mock')
    }
}

const mockDocument = {
    createElement: vi.fn((tag: string) => {
        if (tag === 'a') {
            return {
                download: '',
                href: '',
                click: vi.fn()
            }
        }
        if (tag === 'canvas') {
            return createMockCanvasElement()
        }
        return {}
    })
}

describe('MediaExportService - Resolusi Nama Berkas', () => {
    const baseSpec: CardRenderSpec = {
        variant: 'pnl-single',
        data: {
            symbol: 'SOLUSDT',
            direction: 'long',
            entryPrice: 150,
            exitPrice: 180,
            realizedPnl: 300,
        },
        theme: {
            id: 'dark',
            accentProfit: '#10B981',
            accentLoss: '#EF4444',
            textSub: '#9CA3AF',
            border: '#374151',
        },
        branding: {
            brandTitle: 'NITIREKSO',
            brandSubtitle: 'Trading Journal',
            traderHandle: '@trader'
        }
    }

    it('menghasilkan nama berkas default dengan format tanggal dan ekstensi yang sesuai', () => {
        const filename = resolveFilename({
            spec: baseSpec,
            format: 'mp4',
            aspect: 'original'
        })
        const today = new Date().toISOString().slice(0, 10)
        expect(filename).toBe(`NITIREKSO-SOLUSDT-${today}.mp4`)
    })

    it('menambahkan sufiks -9x16 jika rasio aspek adalah 9:16', () => {
        const filename = resolveFilename({
            spec: baseSpec,
            format: 'png',
            aspect: '9:16'
        })
        const today = new Date().toISOString().slice(0, 10)
        expect(filename).toBe(`NITIREKSO-SOLUSDT-${today}-9x16.png`)
    })

    it('menggunakan nama berkas kustom dan memastikan ekstensi format terpasang', () => {
        const fnWithExt = resolveFilename({
            spec: baseSpec,
            format: 'gif',
            filename: 'custom-export.gif'
        })
        expect(fnWithExt).toBe('custom-export.gif')

        const fnWithoutExt = resolveFilename({
            spec: baseSpec,
            format: 'gif',
            filename: 'my-win-trade'
        })
        expect(fnWithoutExt).toBe('my-win-trade.gif')
    })

    it('menyediakan fallback jika symbol atau branding tidak tersedia', () => {
        const emptySpec: CardRenderSpec = {
            variant: 'portfolio-summary',
            data: {
                netPnlTotal: 1000,
                winRate: 65,
                totalTrades: 20
            },
            theme: baseSpec.theme
        }
        const filename = resolveFilename({
            spec: emptySpec,
            format: 'png'
        })
        const today = new Date().toISOString().slice(0, 10)
        expect(filename).toBe(`nitirekso-card-${today}.png`)
    })
})

describe('MediaExportService - saveMediaFile & Unduhan', () => {
    const originalWindow = globalThis.window
    const originalUrl = globalThis.URL
    const originalDocument = globalThis.document

    beforeEach(() => {
        vi.restoreAllMocks()
        globalThis.document = mockDocument as any
        globalThis.URL.createObjectURL = mockCreateObjectURL
        globalThis.URL.revokeObjectURL = mockRevokeObjectURL
    })

    afterEach(() => {
        globalThis.window = originalWindow
        globalThis.URL = originalUrl
        globalThis.document = originalDocument
    })

    it('memanggil native save file dialog di Tauri jika format mp4 dan mengembalikan path berkas', async () => {
        const mockSave = vi.fn().mockResolvedValue({ ok: true, data: '/path/to/exported-video.mp4' })
        ;(globalThis as any).window = {
            api: {
                saveVideoFile: mockSave
            }
        }

        const blob = new Blob(['dummy-mp4-data'], { type: 'video/mp4' })
        const savedPath = await saveMediaFile('video.mp4', blob)

        expect(mockSave).toHaveBeenCalledTimes(1)
        expect(mockSave).toHaveBeenCalledWith('video.mp4', expect.any(Uint8Array))
        expect(savedPath).toBe('/path/to/exported-video.mp4')
    })

    it('mengembalikan null jika pengguna membatalkan dialog native save', async () => {
        const mockSave = vi.fn().mockResolvedValue({ ok: true, data: null })
        ;(globalThis as any).window = {
            api: {
                saveVideoFile: mockSave
            }
        }

        const blob = new Blob(['dummy-mp4-data'], { type: 'video/mp4' })
        const savedPath = await saveMediaFile('video.mp4', blob)

        expect(mockSave).toHaveBeenCalledTimes(1)
        expect(savedPath).toBeNull()
    })

    it('beralih ke unduhan browser jika native save dialog gagal atau melempar error', async () => {
        const mockSave = vi.fn().mockRejectedValue(new Error('Tauri IPC timeout'))
        ;(globalThis as any).window = {
            api: {
                saveVideoFile: mockSave
            }
        }

        const blob = new Blob(['dummy-mp4-data'], { type: 'video/mp4' })
        const savedPath = await saveMediaFile('video.mp4', blob)

        expect(mockSave).toHaveBeenCalledTimes(1)
        expect(savedPath).toBeNull()
        expect(mockCreateObjectURL).toHaveBeenCalled()
    })

    it('langsung menggunakan unduhan browser untuk format non-mp4 (PNG / GIF)', async () => {
        const mockSave = vi.fn()
        ;(globalThis as any).window = {
            api: {
                saveVideoFile: mockSave
            }
        }

        const blob = new Blob(['dummy-png-data'], { type: 'image/png' })
        const savedPath = await saveMediaFile('card.png', blob)

        expect(mockSave).not.toHaveBeenCalled()
        expect(savedPath).toBeNull()
        expect(mockCreateObjectURL).toHaveBeenCalled()
    })
})

describe('MediaExportService - exportCardMedia', () => {
    const originalWindow = globalThis.window
    const originalUrl = globalThis.URL
    const originalDocument = globalThis.document

    const baseSpec: CardRenderSpec = {
        variant: 'pnl-single',
        data: {
            symbol: 'BTCUSDT',
            direction: 'long',
            entryPrice: 60000,
            exitPrice: 66000,
            realizedPnl: 1200,
        },
        theme: {
            id: 'cyberpunk',
            accentProfit: '#00FF66',
            accentLoss: '#FF0055',
            textSub: '#AAAAAA',
            border: '#222222',
        },
        branding: {
            brandTitle: 'NITIREKSO',
            brandSubtitle: 'PRO',
            traderHandle: '@alex'
        }
    }

    beforeEach(() => {
        vi.restoreAllMocks()
        globalThis.document = mockDocument as any
        globalThis.URL.createObjectURL = mockCreateObjectURL
        globalThis.URL.revokeObjectURL = mockRevokeObjectURL
    })

    afterEach(() => {
        globalThis.window = originalWindow
        globalThis.URL = originalUrl
        globalThis.document = originalDocument
    })

    describe('Ekspor Gambar PNG (format: png)', () => {
        it('merender kanvas kartu dan mengekspor sebagai blob PNG dengan progress callback berurutan', async () => {
            const renderSpy = vi.spyOn(CardCanvasEngine, 'render').mockImplementation(mockLayoutResult)
            const progressUpdates: number[] = []

            const result = await exportCardMedia({
                spec: baseSpec,
                format: 'png',
                aspect: 'original',
                onProgress: (pct) => progressUpdates.push(pct)
            })

            expect(renderSpy).toHaveBeenCalled()
            expect(result.extension).toBe('png')
            expect(result.filename).toContain('BTCUSDT')
            expect(result.filename.endsWith('.png')).toBe(true)
            expect(result.blob).toBeDefined()
            expect(result.savedFilePath).toBeNull()
            expect(progressUpdates).toEqual([10, 50, 80, 100])
        })

        it('mengomposisikan rasio vertikal 9:16 menggunakan composeAspectFrame pada ekspor PNG', async () => {
            vi.spyOn(CardCanvasEngine, 'render').mockImplementation(mockLayoutResult)
            const composeSpy = vi.spyOn(shareFrame, 'composeAspectFrame').mockImplementation((_, target) => target)

            const result = await exportCardMedia({
                spec: baseSpec,
                format: 'png',
                aspect: '9:16',
                frameBgSource: 'card-blur',
                frameBlur: 30,
                frameDim: 50
            })

            expect(composeSpy).toHaveBeenCalledTimes(1)
            expect(composeSpy).toHaveBeenCalledWith(
                expect.any(Object),
                expect.any(Object),
                expect.objectContaining({
                    aspect: '9:16',
                    bgSource: 'card-blur',
                    blurPx: 30,
                    dimPercent: 50
                })
            )
            expect(result.filename).toContain('-9x16.png')
        })
    })

    describe('Ekspor Animasi GIF (format: gif)', () => {
        it('mendelegasikan siklus render ke captureAndExportGif dan mengembalikan blob GIF', async () => {
            const mockGifBlob = new Blob(['dummy-gif-bytes'], { type: 'image/gif' })
            const captureGifSpy = vi.spyOn(gifExportModule, 'captureAndExportGif').mockResolvedValue(mockGifBlob)
            vi.spyOn(CardCanvasEngine, 'render').mockImplementation(mockLayoutResult)

            const progressUpdates: number[] = []
            const result = await exportCardMedia({
                spec: baseSpec,
                format: 'gif',
                durationMs: 3000,
                fps: 10,
                onProgress: (pct) => progressUpdates.push(pct)
            })

            expect(captureGifSpy).toHaveBeenCalledTimes(1)
            expect(captureGifSpy).toHaveBeenCalledWith(
                expect.any(Function),
                expect.objectContaining({
                    durationMs: 3000,
                    fps: 10,
                    frameCount: 30
                })
            )
            expect(result.extension).toBe('gif')
            expect(result.blob).toBe(mockGifBlob)
            expect(progressUpdates).toContain(100)
        })
    })

    describe('Ekspor Video MP4 (format: mp4)', () => {
        it('mengorkestrasikan WebCodecs captureAndExportVideo dengan parameter durasi dan bitrate yang sesuai', async () => {
            const mockVideoBlob = new Blob(['dummy-mp4-data'], { type: 'video/mp4' })
            const captureVideoSpy = vi.spyOn(videoExportModule, 'captureAndExportVideo').mockResolvedValue({
                blob: mockVideoBlob,
                extension: 'mp4',
                mimeType: 'video/mp4',
                codecName: 'MP4'
            })
            vi.spyOn(CardCanvasEngine, 'render').mockImplementation(mockLayoutResult)

            const progressUpdates: number[] = []
            const result = await exportCardMedia({
                spec: baseSpec,
                format: 'mp4',
                durationMs: 10000,
                fps: 60,
                videoBitsPerSecond: 12_000_000,
                onProgress: (pct) => progressUpdates.push(pct)
            })

            expect(captureVideoSpy).toHaveBeenCalledTimes(1)
            expect(captureVideoSpy).toHaveBeenCalledWith(
                expect.any(Function),
                expect.objectContaining({
                    durationMs: 10000,
                    fps: 60,
                    videoBitsPerSecond: 12_000_000
                })
            )
            expect(result.extension).toBe('mp4')
            expect(result.filename.endsWith('.mp4')).toBe(true)
            expect(progressUpdates).toContain(100)
        })

        it('menyinkronkan waktu video latar belakang deterministik dan memulihkan status play pada blok finally', async () => {
            const mockVideoElement = {
                duration: 15,
                currentTime: 0,
                paused: false,
                pause: vi.fn(function(this: any) { this.paused = true }),
                play: vi.fn(function(this: any) { this.paused = false; return Promise.resolve() }),
                addEventListener: vi.fn((event, cb) => {
                    if (event === 'seeked') cb()
                }),
                removeEventListener: vi.fn()
            } as unknown as HTMLVideoElement

            vi.spyOn(videoExportModule, 'captureAndExportVideo').mockImplementation(async (cb: any) => {
                // Simulasikan pemanggilan 2 frame deterministik
                await cb(document.createElement('canvas'), { frameIndex: 0, totalFrames: 2, currentTimeSec: 0, fps: 30 })
                await cb(document.createElement('canvas'), { frameIndex: 1, totalFrames: 2, currentTimeSec: 0.5, fps: 30 })
                return {
                    blob: new Blob(['video-bytes'], { type: 'video/mp4' }),
                    extension: 'mp4',
                    mimeType: 'video/mp4',
                    codecName: 'MP4'
                }
            })
            vi.spyOn(CardCanvasEngine, 'render').mockImplementation(mockLayoutResult)

            const result = await exportCardMedia({
                spec: baseSpec,
                format: 'mp4',
                wallpaperMediaElement: mockVideoElement
            })

            expect(mockVideoElement.pause).toHaveBeenCalled()
            expect(mockVideoElement.play).toHaveBeenCalled()
            expect(result.extension).toBe('mp4')
        })

        it('mengirim byte video dan audio wallpaper ke backend Tauri remuxVideoMp4 saat tersedia', async () => {
            const initialMp4Blob = new Blob(['unmuxed-data'], { type: 'video/mp4' })
            vi.spyOn(videoExportModule, 'captureAndExportVideo').mockResolvedValue({
                blob: initialMp4Blob,
                extension: 'mp4',
                mimeType: 'video/mp4',
                codecName: 'MP4'
            })
            vi.spyOn(CardCanvasEngine, 'render').mockImplementation(mockLayoutResult)

            const remuxedBytes = new Uint8Array([1, 2, 3, 4, 5])
            const mockRemux = vi.fn().mockResolvedValue({
                ok: true,
                data: remuxedBytes
            })

            const mockSave = vi.fn().mockResolvedValue({
                ok: true,
                data: '/saved/path/remuxed.mp4'
            })

            ;(globalThis as any).window = {
                api: {
                    remuxVideoMp4: mockRemux,
                    saveVideoFile: mockSave
                }
            }

            const dummyAudioData = new Uint8Array([9, 8, 7])
            const result = await exportCardMedia({
                spec: baseSpec,
                format: 'mp4',
                wallpaperAudioData: dummyAudioData
            })

            expect(mockRemux).toHaveBeenCalledTimes(1)
            expect(mockRemux).toHaveBeenCalledWith(expect.any(Uint8Array), dummyAudioData)
            expect(result.savedFilePath).toBe('/saved/path/remuxed.mp4')

            const resultBytes = new Uint8Array(await result.blob.arrayBuffer())
            expect(resultBytes).toEqual(remuxedBytes)
        })

        it('beralih menggunakan blob asli secara defensif jika backend remuxing mengembalikan kegagalan', async () => {
            const initialMp4Blob = new Blob(['unmuxed-fallback-data'], { type: 'video/mp4' })
            vi.spyOn(videoExportModule, 'captureAndExportVideo').mockResolvedValue({
                blob: initialMp4Blob,
                extension: 'mp4',
                mimeType: 'video/mp4',
                codecName: 'MP4'
            })
            vi.spyOn(CardCanvasEngine, 'render').mockImplementation(mockLayoutResult)

            const mockRemux = vi.fn().mockResolvedValue({
                ok: false,
                error: 'FFmpeg missing aac codec'
            })

            ;(globalThis as any).window = {
                api: {
                    remuxVideoMp4: mockRemux
                }
            }

            const result = await exportCardMedia({
                spec: baseSpec,
                format: 'mp4'
            })

            expect(mockRemux).toHaveBeenCalledTimes(1)
            expect(result.blob).toBe(initialMp4Blob)
        })
    })

    describe('MediaExportService Class Wrapper', () => {
        it('menyediakan metode statis yang mendelegasikan ke fungsi inti', async () => {
            vi.spyOn(CardCanvasEngine, 'render').mockImplementation(mockLayoutResult)
            const result = await MediaExportService.export({
                spec: baseSpec,
                format: 'png'
            })
            expect(result.extension).toBe('png')

            const fn = MediaExportService.resolveFilename({
                spec: baseSpec,
                format: 'gif'
            })
            expect(fn.endsWith('.gif')).toBe(true)
        })
    })
})
