import { describe, expect, it } from 'vitest'
import type { TradeDetail } from '@shared/domain'
import { CardCanvasEngine } from './card-canvas-engine'
import { buildPnlCardSpec, buildPortfolioSummaryCardSpec } from './card-spec-builder'
import type { BgTemplate } from '../shareSettings'

describe('buildPnlCardSpec', () => {
    const mockTradeDetail: TradeDetail = {
        trade: {
            id: 1,
            externalId: null,
            symbol: 'BTCUSDT',
            direction: 'long',
            entryPrice: 60000,
            exitPrice: 66000,
            entryTime: 1729850400000,
            exitTime: 1729866600000,
            realizedPnl: 1200,
            pnlSource: 'exchange_reported',
            size: 0.2,
            leverage: 10,
            marginMode: null,
            exchange: 'binance',
            feeOpen: 2,
            feeClose: 3,
            feeOpenMaker: null,
            feeCloseMaker: null,
            fundingFee: 0,
            createdAt: 1729850400000,
            updatedAt: 1729866600000,
        },
        checklist: [],
        tags: [],
        rMultiple: 2.5,
        plannedRisk: {
            tradeId: 1,
            riskAmount: 100,
            plannedStop: 58000,
            plannedTarget: 66000,
            plannedRr: 3.0,
        },
        journal: {
            tradeId: 1,
            setupTag: 'Bull Flag Breakout',
            executionGrade: 'A',
            emotionTag: 'Confident',
            preTradeThesis: 'Strong 4H support bounce with volume',
            postTradeReview: 'Clean continuation following BTC dominance surge',
            screenshotPath: null,
            updatedAt: 1729866600000,
        },
    }

    const mockBg: BgTemplate = {
        id: 'dark-navy',
        label: 'Dark Navy',
        accentProfit: '#10b981',
        accentLoss: '#ef4444',
        textSub: '#94a3b8',
        border: 'rgba(255, 255, 255, 0.1)',
        bg: '#0d1117',
        isTransparent: false,
    }

    it('memetakan data TradeDetail dan opsi modal ke dalam CardRenderSpec lengkap', () => {
        const spec = buildPnlCardSpec({
            trade: mockTradeDetail,
            bg: mockBg,
            brandTitle: 'NITIREKSO',
            brandSubtitle: 'PRO JOURNAL',
            traderHandle: '@pro_trader',
            selectedExchange: 'binance',
            activeReferral: 'REFBTC',
            showRoi: true,
            showPnl: true,
            showSide: true,
            showTradeTimes: true,
            showPlan: true,
            showSetup: true,
            showGrade: true,
            showEmotion: true,
            showThesis: true,
            showReview: true,
            showFullText: true,
            aspect: '16:9',
            hideNominal: false,
        })

        expect(spec.variant).toBe('pnl-single')
        expect(spec.aspect).toBe('16:9')
        expect(spec.privacy?.hideNominal).toBe(false)
        expect(spec.branding?.brandTitle).toBe('NITIREKSO')
        expect(spec.branding?.exchange).toBe('BINANCE')
        expect(spec.branding?.referralCode).toBe('REFBTC')

        const singleData = spec.data as any
        expect(singleData.symbol).toBe('BTCUSDT')
        expect(singleData.direction).toBe('long')
        expect(singleData.realizedPnl).toBe(1200)
        expect(singleData.leverage).toBe(10)
        expect(singleData.plannedStop).toBe(58000)
        expect(singleData.plannedTarget).toBe(66000)
        expect(singleData.setupTag).toBe('Bull Flag Breakout')
        expect(singleData.executionGrade).toBe('A')
        expect(singleData.thesis).toBe('Strong 4H support bounce with volume')
        expect(singleData.review).toBe('Clean continuation following BTC dominance surge')
    })

    it('menghormati mode privasi sembunyikan nominal', () => {
        const spec = buildPnlCardSpec({
            trade: mockTradeDetail,
            bg: mockBg,
            hideNominal: true,
        })

        expect(spec.privacy?.hideNominal).toBe(true)
    })

    it('mendukung kustomisasi media latar belakang, dimming, dan posisi', () => {
        const spec = buildPnlCardSpec({
            trade: mockTradeDetail,
            bg: mockBg,
            isCustomBgActive: true,
            bgDimming: 65,
            bgDimmingDirection: 'top-left',
            bgPosX: 70,
            bgPosY: 30,
        })

        expect(spec.theme.dimming).toBe(65)
        expect(spec.theme.dimmingDirection).toBe('top-left')
        expect(spec.theme.mediaPosX).toBe(70)
        expect(spec.theme.mediaPosY).toBe(30)
    })

    it('dapat langsung dirender oleh CardCanvasEngine.render(spec, canvas) secara headless', () => {
        const spec = buildPnlCardSpec({
            trade: mockTradeDetail,
            bg: mockBg,
            aspect: '1:1',
        })

        const canvas = {
            width: 0,
            height: 0,
            getContext: () => ({
                createLinearGradient: () => ({ addColorStop: () => {} }),
                createRadialGradient: () => ({ addColorStop: () => {} }),
                fillRect: () => {},
                clearRect: () => {},
                beginPath: () => {},
                roundRect: () => {},
                fill: () => {},
                stroke: () => {},
                save: () => {},
                restore: () => {},
                fillText: () => {},
                measureText: (text: string) => ({ width: text.length * 10 }),
                moveTo: () => {},
                lineTo: () => {},
                arc: () => {},
                closePath: () => {},
                clip: () => {},
                drawImage: () => {},
                setLineDash: () => {},
                scale: () => {},
                translate: () => {},
            }),
        } as unknown as HTMLCanvasElement

        const layout = CardCanvasEngine.render(spec, canvas)
        expect(layout.width).toBe(1080)
        expect(layout.height).toBe(1080)
        expect(layout.isProfit).toBe(true)
    })
})

describe('buildPortfolioSummaryCardSpec', () => {
    const mockBg: BgTemplate = {
        id: 'emerald',
        label: 'Emerald City',
        accentProfit: '#10b981',
        accentLoss: '#f43f5e',
        textSub: '#94a3b8',
        border: 'rgba(16, 185, 129, 0.3)',
        bg: '#022c22',
        isTransparent: false,
    }

    const mockSummary = {
        netPnlTotal: 3450.8,
        winRate: 0.68,
        totalTrades: 50,
        wins: 34,
        losses: 16,
        profitFactor: 2.35,
        totalR: 18.5,
        expectancy: 69.01,
        expectancyR: 0.37,
        recoveryFactor: 3.8,
        maxConsecutiveWins: 6,
        maxConsecutiveLosses: 3,
        avgWin: 160.2,
        avgLoss: -85.4,
    }

    const mockCurve = [
        { equity: 0 },
        { equity: 500 },
        { equity: 300 },
        { equity: 1800 },
        { equity: 3450.8 },
    ]

    const mockDrawdown = {
        maxDrawdown: 450,
        maxDrawdownPercent: 8.5,
    }

    it('memetakan metrik analitik portofolio ke dalam CardRenderSpec varian portfolio-summary', () => {
        const spec = buildPortfolioSummaryCardSpec({
            summary: mockSummary,
            curve: mockCurve,
            drawdown: mockDrawdown,
            bg: mockBg,
            brandTitle: 'NITIREKSO',
            brandSubtitle: 'ANALYTICS',
            traderHandle: '@pro_quant',
            activeReferral: 'TOPTRADER',
            periodLabel: 'Q3 2026 Performance',
            customTraderNote: 'Konsistensi eksekusi sesuai trading plan.',
            aspect: '16:9',
            hideNominal: false,
            showChart: true,
            showProfile: true,
            showWatermark: true,
            showReferral: true,
        })

        expect(spec.variant).toBe('portfolio-summary')
        expect(spec.aspect).toBe('16:9')
        expect(spec.privacy?.hideNominal).toBe(false)
        expect(spec.branding?.brandTitle).toBe('NITIREKSO')
        expect(spec.branding?.brandSubtitle).toBe('ANALYTICS')
        expect(spec.branding?.traderHandle).toBe('@pro_quant')
        expect(spec.branding?.referralCode).toBe('TOPTRADER')

        const data = spec.data as any
        expect(data.periodLabel).toBe('Q3 2026 Performance')
        expect(data.netPnlTotal).toBe(3450.8)
        expect(data.winRate).toBe(68) // Normalisasi 0.68 -> 68%
        expect(data.totalTrades).toBe(50)
        expect(data.winCount).toBe(34)
        expect(data.lossCount).toBe(16)
        expect(data.profitFactor).toBe(2.35)
        expect(data.totalR).toBe(18.5)
        expect(data.expectancyR).toBe(0.37)
        expect(data.recoveryFactor).toBe(3.8)
        expect(data.maxConsecutiveWins).toBe(6)
        expect(data.maxConsecutiveLosses).toBe(3)
        expect(data.maxDrawdown).toBe(450)
        expect(data.maxDrawdownPercent).toBe(8.5)
        expect(data.traderNote).toBe('Konsistensi eksekusi sesuai trading plan.')
        expect(data.equityCurve?.length).toBe(5)
    })

    it('menghormati mode privasi sembunyikan nominal pada ringkasan portofolio', () => {
        const spec = buildPortfolioSummaryCardSpec({
            summary: mockSummary,
            bg: mockBg,
            hideNominal: true,
        })

        expect(spec.privacy?.hideNominal).toBe(true)
    })

    it('mendukung kustomisasi media latar belakang kustom dan rasio aspek 1:1 serta 4:5', () => {
        const specSquare = buildPortfolioSummaryCardSpec({
            summary: mockSummary,
            bg: mockBg,
            aspect: '1:1',
            isCustomBgActive: true,
            bgDimming: 50,
            bgDimmingDirection: 'top-right',
            bgPosX: 60,
            bgPosY: 40,
        })

        expect(specSquare.aspect).toBe('1:1')
        expect(specSquare.theme.dimming).toBe(50)
        expect(specSquare.theme.dimmingDirection).toBe('top-right')
        expect(specSquare.theme.mediaPosX).toBe(60)
        expect(specSquare.theme.mediaPosY).toBe(40)

        const specVertical = buildPortfolioSummaryCardSpec({
            summary: mockSummary,
            bg: mockBg,
            aspect: '4:5',
        })
        expect(specVertical.aspect).toBe('4:5')
    })

    it('dapat langsung dirender oleh CardCanvasEngine.render(spec, canvas) secara headless', () => {
        const spec = buildPortfolioSummaryCardSpec({
            summary: mockSummary,
            curve: mockCurve,
            drawdown: mockDrawdown,
            bg: mockBg,
            aspect: '16:9',
        })

        const canvas = {
            width: 0,
            height: 0,
            getContext: () => ({
                createLinearGradient: () => ({ addColorStop: () => {} }),
                createRadialGradient: () => ({ addColorStop: () => {} }),
                fillRect: () => {},
                clearRect: () => {},
                beginPath: () => {},
                roundRect: () => {},
                fill: () => {},
                stroke: () => {},
                save: () => {},
                restore: () => {},
                fillText: () => {},
                measureText: (text: string) => ({ width: text.length * 10 }),
                moveTo: () => {},
                lineTo: () => {},
                arc: () => {},
                closePath: () => {},
                clip: () => {},
                drawImage: () => {},
                setLineDash: () => {},
                scale: () => {},
                translate: () => {},
            }),
        } as unknown as HTMLCanvasElement

        const layout = CardCanvasEngine.render(spec, canvas)
        expect(layout.width).toBe(1280)
        expect(layout.height).toBe(720)
        expect(layout.isProfit).toBe(true)
    })
})
