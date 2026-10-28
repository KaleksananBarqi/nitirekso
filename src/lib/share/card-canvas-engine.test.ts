/**
 * Unit Test Kanvas Headless untuk CardCanvasEngine (Ticket 1 #23).
 *
 * Menguji antarmuka publik CardCanvasEngine (measureLayout, render, wrapCanvasText,
 * scaleTextToFit, applyCanvasDimming) menggunakan kanvas virtual deterministik
 * tanpa me-mount komponen UI React.
 */

import { describe, it, expect, vi } from 'vitest'
import {
    CardCanvasEngine,
    wrapCanvasText,
    scaleTextToFit,
    applyCanvasDimming
} from './card-canvas-engine'
import type {
    CardRenderSpec,
    CardThemeConfig,
    SingleTradeData,
    PortfolioSummaryData
} from './types'

// ---------------------------------------------------------------------------
// Mock Headless Canvas & 2D Context
// ---------------------------------------------------------------------------

export interface MockCanvasContextRecord {
    calls: Array<{ method: string; args: unknown[] }>
    textDrawn: string[]
    colorsUsed: Set<string>
}

export function createMockCanvas(width = 1080, height = 1080) {
    const record: MockCanvasContextRecord = {
        calls: [],
        textDrawn: [],
        colorsUsed: new Set<string>()
    }

    const state = {
        font: '10px sans-serif',
        fillStyle: '#000000' as unknown,
        strokeStyle: '#000000' as unknown,
        lineWidth: 1,
        textAlign: 'left' as CanvasTextAlign,
        textBaseline: 'alphabetic' as CanvasTextBaseline,
        globalAlpha: 1.0
    }

    const ctx = {
        get font() { return state.font },
        set font(val: string) { state.font = val },
        get fillStyle() { return state.fillStyle },
        set fillStyle(val: unknown) {
            state.fillStyle = val
            if (typeof val === 'string') record.colorsUsed.add(val)
        },
        get strokeStyle() { return state.strokeStyle },
        set strokeStyle(val: unknown) {
            state.strokeStyle = val
            if (typeof val === 'string') record.colorsUsed.add(val)
        },
        get lineWidth() { return state.lineWidth },
        set lineWidth(val: number) { state.lineWidth = val },
        get textAlign() { return state.textAlign },
        set textAlign(val: CanvasTextAlign) { state.textAlign = val },
        get textBaseline() { return state.textBaseline },
        set textBaseline(val: CanvasTextBaseline) { state.textBaseline = val },
        get globalAlpha() { return state.globalAlpha },
        set globalAlpha(val: number) { state.globalAlpha = val },

        fillRect: vi.fn((x, y, w, h) => {
            record.calls.push({ method: 'fillRect', args: [x, y, w, h] })
        }),
        strokeRect: vi.fn((x, y, w, h) => {
            record.calls.push({ method: 'strokeRect', args: [x, y, w, h] })
        }),
        clearRect: vi.fn((x, y, w, h) => {
            record.calls.push({ method: 'clearRect', args: [x, y, w, h] })
        }),
        fillText: vi.fn((text: string, x: number, y: number) => {
            record.calls.push({ method: 'fillText', args: [text, x, y] })
            record.textDrawn.push(String(text))
        }),
        strokeText: vi.fn((text: string, x: number, y: number) => {
            record.calls.push({ method: 'strokeText', args: [text, x, y] })
        }),
        measureText: vi.fn((text: string) => {
            // Estimasi lebar: parse ukuran font atau fallback 12px per karakter
            const match = state.font.match(/(\d+)px/)
            const fontSize = match && match[1] ? parseInt(match[1], 10) : 20
            const charWidth = fontSize * 0.55
            return {
                width: text.length * charWidth,
                actualBoundingBoxAscent: fontSize * 0.8,
                actualBoundingBoxDescent: fontSize * 0.2
            } as TextMetrics
        }),
        beginPath: vi.fn(() => {
            record.calls.push({ method: 'beginPath', args: [] })
        }),
        closePath: vi.fn(() => {
            record.calls.push({ method: 'closePath', args: [] })
        }),
        moveTo: vi.fn((x, y) => {
            record.calls.push({ method: 'moveTo', args: [x, y] })
        }),
        lineTo: vi.fn((x, y) => {
            record.calls.push({ method: 'lineTo', args: [x, y] })
        }),
        arc: vi.fn((x, y, r, sa, ea) => {
            record.calls.push({ method: 'arc', args: [x, y, r, sa, ea] })
        }),
        roundRect: vi.fn((x, y, w, h, r) => {
            record.calls.push({ method: 'roundRect', args: [x, y, w, h, r] })
        }),
        fill: vi.fn(() => {
            record.calls.push({ method: 'fill', args: [] })
        }),
        stroke: vi.fn(() => {
            record.calls.push({ method: 'stroke', args: [] })
        }),
        save: vi.fn(() => {
            record.calls.push({ method: 'save', args: [] })
        }),
        restore: vi.fn(() => {
            record.calls.push({ method: 'restore', args: [] })
        }),
        clip: vi.fn(() => {
            record.calls.push({ method: 'clip', args: [] })
        }),
        drawImage: vi.fn((...args: unknown[]) => {
            record.calls.push({ method: 'drawImage', args })
        }),
        createLinearGradient: vi.fn((x0, y0, x1, y1) => {
            const grad = {
                addColorStop: vi.fn()
            }
            record.calls.push({ method: 'createLinearGradient', args: [x0, y0, x1, y1] })
            return grad as unknown as CanvasGradient
        }),
        createRadialGradient: vi.fn((x0, y0, r0, x1, y1, r1) => {
            const grad = {
                addColorStop: vi.fn()
            }
            record.calls.push({ method: 'createRadialGradient', args: [x0, y0, r0, x1, y1, r1] })
            return grad as unknown as CanvasGradient
        })
    }

    const canvas = {
        width,
        height,
        getContext: vi.fn((contextId: string) => {
            if (contextId === '2d') return ctx as unknown as CanvasRenderingContext2D
            return null
        })
    }

    return {
        canvas: canvas as unknown as HTMLCanvasElement,
        ctx: ctx as unknown as CanvasRenderingContext2D,
        record
    }
}

// ---------------------------------------------------------------------------
// Dataset Fixture untuk Pengujian Visual Deterministik
// ---------------------------------------------------------------------------

const defaultTheme: CardThemeConfig = {
    id: 'dark-navy',
    label: 'Dark Navy',
    accentProfit: '#38bdf8',
    accentLoss: '#f43f5e',
    textSub: 'rgba(255, 255, 255, 0.55)',
    border: 'rgba(255, 255, 255, 0.08)'
}

const winningTradeFixture: SingleTradeData = {
    symbol: 'BTCUSDT',
    direction: 'long',
    leverage: 20,
    entryPrice: 65420.5,
    exitPrice: 68100.0,
    entryTime: 1761600000000,
    exitTime: 1761614400000,
    realizedPnl: 1450.8,
    roiPercent: 81.92,
    rMultiple: 3.25,
    plannedStop: 64800,
    plannedTarget: 68100,
    plannedRr: 3.25,
    setupTag: 'Breakout Daily',
    executionGrade: 'A',
    emotionTag: 'calm',
    thesis: 'Konfirmasi breakout resistance kuat pada timeframe 4H dengan volume tinggi.',
    review: 'Eksekusi presisi sesuai rencana, take profit bertahap di target utama.',
    showRoi: true,
    showPnl: true,
    showSide: true,
    showTradeTimes: true,
    showDuration: true,
    showPlan: true,
    showSetup: true,
    showGrade: true,
    showEmotion: true,
    showThesis: true,
    showReview: true,
    showFullText: true
}

const losingTradeFixture: SingleTradeData = {
    symbol: 'ETHUSDT',
    direction: 'short',
    leverage: 10,
    entryPrice: 3450.0,
    exitPrice: 3550.0,
    entryTime: 1761600000000,
    exitTime: 1761607200000,
    realizedPnl: -420.5,
    roiPercent: -28.98,
    rMultiple: -1.0,
    setupTag: 'Mean Reversion',
    executionGrade: 'C',
    emotionTag: 'fomo',
    thesis: 'Mencoba shorting di pucuk tanpa konfirmasi bearish engulfing.',
    review: 'Stop loss tersentuh karena tergesa-gesa entry. Disiplin cut loss dipatuhi.',
    showRoi: true,
    showPnl: true,
    showSide: true,
    showTradeTimes: true
}

const breakevenTradeFixture: SingleTradeData = {
    symbol: 'SOLUSDT',
    direction: 'long',
    leverage: 15,
    entryPrice: 180.0,
    exitPrice: 180.0,
    entryTime: 1761600000000,
    exitTime: 1761603600000,
    realizedPnl: 0,
    roiPercent: 0,
    rMultiple: 0,
    showRoi: true,
    showPnl: true
}

const portfolioSummaryFixture: PortfolioSummaryData = {
    periodLabel: 'Oktober 2026',
    netPnlTotal: 4850.25,
    winRate: 68.5,
    totalTrades: 42,
    winCount: 29,
    lossCount: 13,
    profitFactor: 2.45,
    maxDrawdownPercent: 6.2,
    traderNote: 'Bulan yang sangat konsisten dengan fokus pada setup breakout beresiko rendah.'
}

// ---------------------------------------------------------------------------
// Test Suite: Pembantu Kanvas Murni
// ---------------------------------------------------------------------------

describe('Canvas Helpers', () => {
    describe('wrapCanvasText', () => {
        it('mengembalikan array berisi 1 baris jika teks muat dalam lebar', () => {
            const { ctx } = createMockCanvas()
            ctx.font = '20px sans-serif'
            const result = wrapCanvasText(ctx, 'Teks singkat', 500)
            expect(result).toEqual(['Teks singkat'])
        })

        it('memecah teks panjang menjadi beberapa baris sesuai batas lebar', () => {
            const { ctx } = createMockCanvas()
            ctx.font = '24px sans-serif'
            const longText = 'Ini adalah sebuah teks tesis trading yang sangat panjang dan harus dibungkus dengan rapi tanpa memotong kata secara sembarangan.'
            const result = wrapCanvasText(ctx, longText, 250)
            expect(result.length).toBeGreaterThan(1)
            // Semua baris yang dihasilkan tidak boleh kosong
            result.forEach(line => expect(line.trim().length).toBeGreaterThan(0))
        })

        it('menangani string kosong dan whitespace', () => {
            const { ctx } = createMockCanvas()
            expect(wrapCanvasText(ctx, '', 300)).toEqual([])
            expect(wrapCanvasText(ctx, '   ', 300)).toEqual([])
        })
    })

    describe('scaleTextToFit', () => {
        it('mempertahankan ukuran awal jika teks sudah pas di bawah lebar maksimum', () => {
            const { ctx } = createMockCanvas()
            const size = scaleTextToFit(ctx, '+81.92%', 500, 96, 32)
            expect(size).toBe(96)
        })

        it('mengecilkan ukuran font jika teks melebihi lebar maksimum', () => {
            const { ctx } = createMockCanvas()
            // Teks sangat panjang dengan lebar batas sempit
            const size = scaleTextToFit(ctx, '+999,999,999.00% SUPER LONG ROI', 120, 96, 24)
            expect(size).toBeLessThan(96)
            expect(size).toBeGreaterThanOrEqual(24)
        })
    })

    describe('applyCanvasDimming', () => {
        it('menerapkan gradien pencahayaan sesuai arah dan persentase dimming', () => {
            const { ctx, record } = createMockCanvas(1080, 1920)
            applyCanvasDimming(ctx, 1080, 1920, 50, 'top-right')

            expect(ctx.createLinearGradient).toHaveBeenCalledWith(0, 1920, 1080, 0)
            expect(ctx.fillRect).toHaveBeenCalledWith(0, 0, 1080, 1920)
            expect(record.calls.some(c => c.method === 'createLinearGradient')).toBe(true)
        })

        it('menerapkan dimming seragam (uniform) secara default', () => {
            const { ctx } = createMockCanvas(1080, 1080)
            applyCanvasDimming(ctx, 1080, 1080, 40)
            expect(ctx.fillRect).toHaveBeenCalledWith(0, 0, 1080, 1080)
        })
    })
})

// ---------------------------------------------------------------------------
// Test Suite: CardCanvasEngine Layout & Render
// ---------------------------------------------------------------------------

describe('CardCanvasEngine', () => {
    describe('measureLayout', () => {
        it('menghitung dimensi tata letak secara dinamis untuk kartu PnL single', () => {
            const engine = new CardCanvasEngine()
            const spec: CardRenderSpec = {
                variant: 'pnl-single',
                data: winningTradeFixture,
                theme: defaultTheme,
                aspect: 'original'
            }

            const layout = engine.measureLayout(spec)
            expect(layout.width).toBe(1080)
            expect(layout.height).toBeGreaterThan(600)
            expect(layout.contentWidth).toBe(880)
            expect(layout.thesisLines.length).toBeGreaterThan(0)
            expect(layout.reviewLines.length).toBeGreaterThan(0)
            expect(layout.isProfit).toBe(true)
        })

        it('menyesuaikan dimensi untuk rasio aspek tetap (1:1, 4:5, 16:9, 9:16)', () => {
            const engine = new CardCanvasEngine()
            const baseSpec: CardRenderSpec = {
                variant: 'pnl-single',
                data: winningTradeFixture,
                theme: defaultTheme
            }

            const layout1x1 = engine.measureLayout({ ...baseSpec, aspect: '1:1' })
            expect(layout1x1.width).toBe(1080)
            expect(layout1x1.height).toBe(1080)

            const layout4x5 = engine.measureLayout({ ...baseSpec, aspect: '4:5' })
            expect(layout4x5.width).toBe(1080)
            expect(layout4x5.height).toBe(1350)

            const layout16x9 = engine.measureLayout({ ...baseSpec, aspect: '16:9' })
            expect(layout16x9.width).toBe(1280)
            expect(layout16x9.height).toBe(720)

            const layout9x16 = engine.measureLayout({ ...baseSpec, aspect: '9:16' })
            expect(layout9x16.width).toBe(1080)
            expect(layout9x16.height).toBe(1920)
        })
    })

    describe('render - Skenario Trade', () => {
        it('merender trade menang (win) dengan aksen profit dan metrik ROI positif', () => {
            const engine = new CardCanvasEngine()
            const { canvas, record } = createMockCanvas(1080, 1200)

            const spec: CardRenderSpec = {
                variant: 'pnl-single',
                data: winningTradeFixture,
                theme: defaultTheme,
                branding: {
                    brandTitle: 'NITIREKSO',
                    brandSubtitle: 'PRO JOURNAL',
                    traderHandle: '@pro_trader',
                    exchange: 'binance',
                    referralCode: 'VIP888',
                    showWatermark: true,
                    showProfile: true,
                    showReferral: true
                }
            }

            const result = engine.render(canvas, spec)
            expect(result.isProfit).toBe(true)

            // Memverifikasi teks simbol, ROI, arah, dan branding digambar
            expect(record.textDrawn).toContain('BTCUSDT')
            expect(record.textDrawn).toContain('LONG')
            expect(record.textDrawn).toContain('NITIREKSO')
            expect(record.textDrawn).toContain('BINANCE')
            expect(record.textDrawn).toContain('Ref: VIP888')
            expect(record.textDrawn).toContain('@pro_trader')
            expect(record.textDrawn.some(t => t.includes('81.92%'))).toBe(true)

            // Memverifikasi lencana meta jurnal
            expect(record.textDrawn.some(t => t.includes('Breakout Daily'))).toBe(true)
            expect(record.textDrawn.some(t => t.includes('Grade A'))).toBe(true)
            expect(record.textDrawn.some(t => t.includes('Calm'))).toBe(true)
        })

        it('merender trade kalah (loss) dengan aksen loss dan metrik ROI negatif', () => {
            const engine = new CardCanvasEngine()
            const { canvas, record } = createMockCanvas(1080, 1000)

            const spec: CardRenderSpec = {
                variant: 'pnl-single',
                data: losingTradeFixture,
                theme: defaultTheme,
                branding: {
                    brandTitle: 'NITIREKSO',
                    brandSubtitle: 'JOURNAL',
                    traderHandle: '@risk_manager',
                    exchange: 'mexc'
                }
            }

            const result = engine.render(canvas, spec)
            expect(result.isProfit).toBe(false)

            expect(record.textDrawn).toContain('ETHUSDT')
            expect(record.textDrawn).toContain('SHORT')
            expect(record.textDrawn).toContain('MEXC')
            expect(record.textDrawn.some(t => t.includes('-28.98%'))).toBe(true)
        })

        it('merender trade impas (breakeven) dengan determinisme visual', () => {
            const engine = new CardCanvasEngine()
            const { canvas, record } = createMockCanvas(1080, 900)

            const spec: CardRenderSpec = {
                variant: 'pnl-single',
                data: breakevenTradeFixture,
                theme: defaultTheme
            }

            const result = engine.render(canvas, spec)
            expect(result.isProfit).toBe(true) // >= 0 dianggap non-negatif
            expect(record.textDrawn).toContain('SOLUSDT')
            expect(record.textDrawn.some(t => t.includes('0.00%'))).toBe(true)
        })

        it('mematuhi mode privasi (privacy.hideNominal = true) dengan menyamarkan nominal uang', () => {
            const engine = new CardCanvasEngine()
            const { canvas, record } = createMockCanvas(1080, 1000)

            const spec: CardRenderSpec = {
                variant: 'pnl-single',
                data: winningTradeFixture,
                theme: defaultTheme,
                privacy: { hideNominal: true }
            }

            engine.render(canvas, spec)
            // Nominal asli 1,450.80 tidak boleh muncul di teks kanvas
            expect(record.textDrawn.some(t => t.includes('1,450.80'))).toBe(false)
            // Masking berupa '••••' harus muncul
            expect(record.textDrawn.some(t => t.includes('••••'))).toBe(true)
        })

        it('memotong teks ulasan/tesis dengan elipsis jika showFullText bernilai false', () => {
            const engine = new CardCanvasEngine()
            const { canvas, record } = createMockCanvas(1080, 1200)

            const spec: CardRenderSpec = {
                variant: 'pnl-single',
                data: {
                    ...winningTradeFixture,
                    showFullText: false,
                    thesis: 'Baris satu tesis panjang sekali yang menjelaskan analisa teknikal secara mendalam. Baris dua tesis lanjutan mengenai level support dan resistance kunci di pasar. Baris tiga penjelasan lebih rinci mengenai konfirmasi price action dan volume trading. Baris empat faktor katalis pasar makro ekonomi dan rilis data inflasi terkini. Baris lima yang seharusnya terpotong karena batas tampilan ringkas. Baris enam kesimpulan akhir trading plan.'
                },
                theme: defaultTheme
            }

            engine.render(canvas, spec)
            // Harus ada teks dengan elipsis (…) di akhir baris ringkasan
            expect(record.textDrawn.some(t => t.includes('…'))).toBe(true)
        })
    })

    describe('render - Skenario Ringkasan Portofolio (portfolio-summary)', () => {
        it('merender kartu ringkasan analitik portofolio dengan win rate dan total trades', () => {
            const engine = new CardCanvasEngine()
            const { canvas, record } = createMockCanvas(1280, 720)

            const spec: CardRenderSpec = {
                variant: 'portfolio-summary',
                data: portfolioSummaryFixture,
                theme: defaultTheme,
                aspect: '16:9',
                branding: {
                    brandTitle: 'NITIREKSO',
                    brandSubtitle: 'PORTFOLIO ANALYTICS',
                    traderHandle: '@top_performer',
                    showWatermark: true
                }
            }

            const result = engine.render(canvas, spec)
            expect(result.isProfit).toBe(true)

            expect(record.textDrawn).toContain('NITIREKSO')
            expect(record.textDrawn).toContain('PORTFOLIO ANALYTICS')
            expect(record.textDrawn).toContain('Oktober 2026')
            expect(record.textDrawn.some(t => t.includes('68.5%') || t.includes('WIN RATE'))).toBe(true)
            expect(record.textDrawn.some(t => t.includes('42') || t.includes('TOTAL TRADES'))).toBe(true)
            expect(record.textDrawn.some(t => t.includes('2.45') || t.includes('PROFIT FACTOR'))).toBe(true)
            expect(record.textDrawn.some(t => t.includes('setup breakout'))).toBe(true)
        })

        it('menyamarkan total nominal PnL pada ringkasan portofolio jika mode privasi aktif', () => {
            const engine = new CardCanvasEngine()
            const { canvas, record } = createMockCanvas(1280, 720)

            const spec: CardRenderSpec = {
                variant: 'portfolio-summary',
                data: portfolioSummaryFixture,
                theme: defaultTheme,
                privacy: { hideNominal: true }
            }

            engine.render(canvas, spec)
            expect(record.textDrawn.some(t => t.includes('4,850.25'))).toBe(false)
            expect(record.textDrawn.some(t => t.includes('★★★★★') || t.includes('••••'))).toBe(true)
        })
    })

    describe('render - Static & Overload Signature', () => {
        it('mendukung panggilan statis CardCanvasEngine.render(spec, canvas)', () => {
            const { canvas, record } = createMockCanvas(1080, 1080)
            const spec: CardRenderSpec = {
                variant: 'pnl-single',
                data: winningTradeFixture,
                theme: defaultTheme
            }

            const result = CardCanvasEngine.render(spec, canvas)
            expect(result.width).toBe(1080)
            expect(result.isProfit).toBe(true)
            expect(record.textDrawn).toContain('BTCUSDT')
        })

        it('mendukung panggilan statis CardCanvasEngine.render(canvas, spec)', () => {
            const { canvas, record } = createMockCanvas(1080, 1080)
            const spec: CardRenderSpec = {
                variant: 'pnl-single',
                data: winningTradeFixture,
                theme: defaultTheme
            }

            const result = CardCanvasEngine.render(canvas, spec)
            expect(result.width).toBe(1080)
            expect(result.isProfit).toBe(true)
            expect(record.textDrawn).toContain('BTCUSDT')
        })
    })
})
