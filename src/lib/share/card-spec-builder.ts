/**
 * Helper pembangun CardRenderSpec untuk modal dan utilitas ekspor media.
 *
 * Mengonsolidasikan pemetaan state reaktif UI dan TradeDetail ke dalam
 * kontrak spesifikasi murni CardRenderSpec untuk CardCanvasEngine.
 */

import { type ExecutionGrade, type TradeDetail, computePlannedRR } from '@shared/domain'
import { formatDuration } from '../format'
import type { BgDimmingDirection, BgTemplate } from '../shareSettings'
import type {
    CardAspect,
    CardBrandingConfig,
    CardRenderSpec,
    CardThemeConfig,
    SingleTradeData
} from './types'

export interface BuildPnlCardSpecParams {
    trade: TradeDetail
    bg: BgTemplate
    accent?: string
    isCustomBgActive?: boolean
    customMedia?: CanvasImageSource | null
    bgDimming?: number
    bgDimmingDirection?: BgDimmingDirection
    bgPosX?: number
    bgPosY?: number
    brandTitle?: string
    brandSubtitle?: string
    traderHandle?: string
    selectedExchange?: string
    activeReferral?: string | null
    exchangeLogo?: CanvasImageSource | null
    avatarImage?: CanvasImageSource | null
    watermarkLogo?: CanvasImageSource | null
    showProfile?: boolean
    showWatermark?: boolean
    showReferral?: boolean
    showSide?: boolean
    showPnl?: boolean
    showRoi?: boolean
    showTradeTimes?: boolean
    showDuration?: boolean
    showPlan?: boolean
    plannedStop?: number | null
    plannedTarget?: number | null
    plannedRr?: number | null
    showSetup?: boolean
    setupTag?: string | null
    showGrade?: boolean
    executionGrade?: ExecutionGrade | string | null
    showEmotion?: boolean
    emotionTag?: string | null
    showThesis?: boolean
    customThesis?: string | null
    showReview?: boolean
    customReview?: string | null
    showFullText?: boolean
    roiPercent?: number
    duration?: string | null
    leverage?: number
    hideNominal?: boolean
    aspect?: CardAspect
}

/**
 * Memetakan state modal Share PnL dan data TradeDetail menjadi CardRenderSpec murni.
 */
export function buildPnlCardSpec(params: BuildPnlCardSpecParams): CardRenderSpec {
    const { trade } = params
    const t = trade.trade

    const leverage = params.leverage ?? t.leverage ?? 1
    const margin = t.entryPrice > 0 ? (t.size * t.entryPrice) / leverage : 0
    const roiPercent = params.roiPercent !== undefined
        ? params.roiPercent
        : (margin > 0 ? (t.realizedPnl / margin) * 100 : 0)

    const duration = params.duration !== undefined
        ? params.duration
        : formatDuration(t.entryTime, t.exitTime)

    const plannedStop = params.plannedStop !== undefined
        ? params.plannedStop
        : (trade.plannedRisk?.plannedStop ?? null)

    const plannedTarget = params.plannedTarget !== undefined
        ? params.plannedTarget
        : (trade.plannedRisk?.plannedTarget ?? null)

    const plannedRr = params.plannedRr !== undefined
        ? params.plannedRr
        : (trade.plannedRisk?.plannedRr ?? (t.direction === 'long' || t.direction === 'short'
            ? computePlannedRR(t.direction, t.entryPrice, plannedStop, plannedTarget)
            : null))

    const setupTag = params.setupTag !== undefined
        ? params.setupTag
        : (trade.journal?.setupTag ?? null)

    const executionGrade = params.executionGrade !== undefined
        ? params.executionGrade
        : (trade.journal?.executionGrade ?? null)

    const emotionTag = params.emotionTag !== undefined
        ? params.emotionTag
        : (trade.journal?.emotionTag ?? null)

    const thesis = params.customThesis !== undefined
        ? params.customThesis
        : (trade.journal?.preTradeThesis ?? null)

    const review = params.customReview !== undefined
        ? params.customReview
        : (trade.journal?.postTradeReview ?? null)

    const theme: CardThemeConfig = {
        id: params.bg.id,
        label: params.bg.label,
        accentProfit: params.bg.accentProfit,
        accentLoss: params.bg.accentLoss,
        textSub: params.bg.textSub,
        border: params.bg.border,
        isTransparent: !params.isCustomBgActive && Boolean(params.bg.isTransparent),
        isCustom: Boolean(params.bg.isCustom),
        bgStart: params.bg.bgStart,
        bgEnd: params.bg.bgEnd,
        dimming: params.isCustomBgActive ? (params.bgDimming ?? 0) : undefined,
        dimmingDirection: params.bgDimmingDirection,
        customMedia: params.isCustomBgActive ? (params.customMedia ?? null) : null,
        mediaPosX: params.bgPosX ?? 50,
        mediaPosY: params.bgPosY ?? 50,
    }

    const branding: CardBrandingConfig = {
        brandTitle: params.brandTitle?.trim() || 'NITIREKSO',
        brandSubtitle: params.brandSubtitle?.trim() || 'Trading Journal',
        traderHandle: params.traderHandle?.trim() || '@trader',
        exchange: (params.selectedExchange || 'MEXC').toUpperCase(),
        exchangeLogo: params.exchangeLogo ?? null,
        referralCode: params.activeReferral?.trim() || null,
        avatarImage: params.avatarImage ?? null,
        watermarkLogo: params.watermarkLogo ?? null,
        showProfile: params.showProfile ?? true,
        showWatermark: params.showWatermark ?? true,
        showReferral: params.showReferral ?? true,
    }

    const data: SingleTradeData = {
        symbol: t.symbol,
        direction: t.direction,
        leverage,
        entryPrice: t.entryPrice,
        exitPrice: t.exitPrice,
        entryTime: t.entryTime,
        exitTime: t.exitTime,
        realizedPnl: t.realizedPnl,
        roiPercent,
        size: t.size,
        rMultiple: trade.rMultiple,
        duration,
        plannedStop,
        plannedTarget,
        plannedRr,
        setupTag,
        executionGrade,
        emotionTag,
        thesis,
        review,
        showRoi: params.showRoi,
        showPnl: params.showPnl,
        showSide: params.showSide,
        showTradeTimes: params.showTradeTimes,
        showDuration: params.showDuration,
        showPlan: params.showPlan,
        showSetup: params.showSetup,
        showGrade: params.showGrade,
        showEmotion: params.showEmotion,
        showThesis: params.showThesis,
        showReview: params.showReview,
        showFullText: params.showFullText,
    }

    return {
        variant: 'pnl-single',
        data,
        theme,
        aspect: params.aspect || 'original',
        privacy: {
            hideNominal: Boolean(params.hideNominal),
        },
        branding,
    }
}
