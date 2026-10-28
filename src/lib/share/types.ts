/**
 * Kontrak Tipe Data Mesin Kartu Visual (Card Media Engine) Nitirekso.
 *
 * Mendefinisikan spesifikasi perenderan independen (CardRenderSpec) yang memisahkan
 * logika visual kanvas murni dari siklus hidup komponen React.
 */

import type { BgDimmingDirection } from '../shareSettings'

export type CardVariant = 'pnl-single' | 'portfolio-summary'

export type CardAspect = 'original' | '16:9' | '1:1' | '4:5' | '9:16'

export interface CardPrivacyConfig {
    hideNominal: boolean
}

export interface CardBrandingConfig {
    brandTitle: string
    brandSubtitle: string
    traderHandle: string
    exchange?: string
    exchangeLogo?: CanvasImageSource | null
    referralCode?: string | null
    avatarImage?: CanvasImageSource | null
    watermarkLogo?: CanvasImageSource | null
    showProfile?: boolean
    showWatermark?: boolean
    showReferral?: boolean
}

export interface CardThemeConfig {
    id: string
    label?: string
    bg?: string
    accentProfit: string
    accentLoss: string
    textSub: string
    border: string
    isTransparent?: boolean
    isCustom?: boolean
    bgStart?: string
    bgEnd?: string
    dimming?: number // 0-100 persen
    dimmingDirection?: BgDimmingDirection
    customMedia?: CanvasImageSource | null
    mediaPosX?: number // 0-100 persen
    mediaPosY?: number // 0-100 persen
}

export interface SingleTradeData {
    symbol: string
    direction: 'long' | 'short' | string
    leverage?: number
    entryPrice: number
    exitPrice: number
    entryTime?: number | string | Date | null
    exitTime?: number | string | Date | null
    realizedPnl: number
    roiPercent?: number
    size?: number
    rMultiple?: number | null
    duration?: string | null
    plannedStop?: number | null
    plannedTarget?: number | null
    plannedRr?: number | null
    setupTag?: string | null
    executionGrade?: string | null
    emotionTag?: string | null
    thesis?: string | null
    review?: string | null
    // Opsi tampilan per elemen
    showRoi?: boolean
    showPnl?: boolean
    showSide?: boolean
    showTradeTimes?: boolean
    showDuration?: boolean
    showPlan?: boolean
    showSetup?: boolean
    showGrade?: boolean
    showEmotion?: boolean
    showThesis?: boolean
    showReview?: boolean
    showFullText?: boolean
}

export interface PortfolioSummaryData {
    periodLabel?: string
    netPnlTotal: number
    winRate: number
    totalTrades: number
    winCount?: number
    lossCount?: number
    profitFactor?: number
    maxDrawdownPercent?: number
    traderNote?: string
    showTradesCount?: boolean
    showWinLoss?: boolean
    showProfitFactor?: boolean
    showMaxDrawdown?: boolean
    showTraderNote?: boolean
}

export type CardDataPayload = SingleTradeData | PortfolioSummaryData

export interface CardRenderSpec {
    variant: CardVariant
    data: CardDataPayload
    theme: CardThemeConfig
    aspect?: CardAspect
    privacy?: CardPrivacyConfig
    branding?: Partial<CardBrandingConfig>
}

export interface CardLayoutResult {
    width: number
    height: number
    contentWidth: number
    contentHeight: number
    cardX: number
    cardY: number
    cardWidth: number
    cardHeight: number
    thesisLines: string[]
    thesisBoxH: number
    reviewLines: string[]
    reviewBoxH: number
    roiFontSize: number
    isProfit: boolean
}
