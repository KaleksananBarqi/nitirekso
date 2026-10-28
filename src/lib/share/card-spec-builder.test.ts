import { describe, expect, it } from 'vitest'
import type { TradeDetail } from '@shared/domain'
import { CardCanvasEngine } from './card-canvas-engine'
import { buildPnlCardSpec } from './card-spec-builder'
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
            }),
        } as unknown as HTMLCanvasElement

        const layout = CardCanvasEngine.render(spec, canvas)
        expect(layout.width).toBe(1080)
        expect(layout.height).toBe(1080)
        expect(layout.isProfit).toBe(true)
    })
})
