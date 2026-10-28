import { useEffect, useMemo, useRef } from 'react'
import type { ExecutionGrade, TradeDetail } from '@shared/domain'
import { formatDate, formatDateTime, formatPercent, formatPnl, formatPrice, formatR } from '../../lib/format'
import {
    getPlayableMediaUrl,
    type BgDimmingDirection,
    type BgTemplate,
    type ExchangeName
} from '../../lib/shareSettings'
import { nitireksoLogo } from '../../lib/exchangeAssets'
import { useHidePnl } from '../../hooks/useHidePnl'
import { getGradientDimmingStyle, type CardRenderSpec, type SingleTradeData } from '../../lib/share'

export interface PnlCardProps {
    /**
     * Spesifikasi render kanvas independen (opsional).
     * Jika disediakan, properti visual kartu diekstrak langsung dari spec ini
     * untuk mencegah terjadinya data clumping.
     */
    spec?: CardRenderSpec

    // Props granular / backwards-compatible
    trade?: TradeDetail
    bg?: BgTemplate
    accent?: string
    roiPercent?: number
    duration?: string
    leverage?: number
    selectedExchange?: ExchangeName
    traderHandle?: string
    brandTitle?: string
    brandSubtitle?: string
    activeLogoUrl?: string | null
    activeReferral?: string
    avatarUrl?: string | null
    isCustomBgActive?: boolean
    customBgUrl?: string | null
    customBgMediaType?: 'image' | 'video'
    bgDimming?: number
    bgDimmingDirection?: BgDimmingDirection
    bgPosX?: number
    bgPosY?: number
    videoRef?: React.RefObject<HTMLVideoElement | null>
    showSide?: boolean
    showPnl?: boolean
    showRoi?: boolean
    showTradeTimes?: boolean
    showProfile?: boolean
    showWatermark?: boolean
    showDuration?: boolean
    showPlan?: boolean
    plannedStop?: number | null
    plannedTarget?: number | null
    plannedRr?: number | null
    setupTag?: string | null
    executionGrade?: ExecutionGrade | null
    emotionTag?: string | null
    showSetup?: boolean
    showGrade?: boolean
    showEmotion?: boolean
    showReferral?: boolean
    showThesis?: boolean
    customThesis?: string
    showReview?: boolean
    customReview?: string
    showFullText?: boolean
}

export function PnlCard(props: PnlCardProps) {
    const { spec } = props
    const singleData = spec && spec.variant === 'pnl-single' ? (spec.data as SingleTradeData) : null
    const theme = spec?.theme
    const branding = spec?.branding
    const privacy = spec?.privacy

    const tradeSymbol = props.trade?.trade?.symbol ?? singleData?.symbol ?? 'UNKNOWN'
    const tradeDirection = (props.trade?.trade?.direction ?? singleData?.direction ?? 'LONG').toUpperCase()
    const tradeLeverage = props.leverage ?? singleData?.leverage ?? props.trade?.trade?.leverage ?? 1
    const tradeRealizedPnl = props.trade?.trade?.realizedPnl ?? singleData?.realizedPnl ?? 0
    const tradeEntryPrice = props.trade?.trade?.entryPrice ?? singleData?.entryPrice ?? 0
    const tradeExitPrice = props.trade?.trade?.exitPrice ?? singleData?.exitPrice ?? 0
    const tradeEntryTime = props.trade?.trade?.entryTime ?? singleData?.entryTime ?? null
    const tradeExitTime = props.trade?.trade?.exitTime ?? singleData?.exitTime ?? null
    const tradeRMultiple = props.trade?.rMultiple !== undefined ? props.trade.rMultiple : (singleData?.rMultiple ?? null)

    const brandTitle = props.brandTitle ?? branding?.brandTitle ?? 'NITIREKSO'
    const brandSubtitle = props.brandSubtitle ?? branding?.brandSubtitle ?? 'Trading Journal'
    const traderHandle = props.traderHandle ?? branding?.traderHandle ?? '@trader'
    const selectedExchange = props.selectedExchange ?? (branding?.exchange as ExchangeName) ?? 'MEXC'
    const activeReferral = props.activeReferral ?? branding?.referralCode ?? ''
    const activeLogoUrl = props.activeLogoUrl ?? null
    const avatarUrl = props.avatarUrl ?? null

    const isProfit = tradeRealizedPnl >= 0
    const accent = props.accent ?? (isProfit ? (theme?.accentProfit || '#38bdf8') : (theme?.accentLoss || '#f43f5e'))
    const roiPercent = props.roiPercent ?? singleData?.roiPercent ?? 0
    const duration = props.duration ?? singleData?.duration ?? '—'

    const isCustomBgActive = props.isCustomBgActive ?? Boolean(theme?.isCustom || theme?.customMedia)
    const customBgUrl = props.customBgUrl ?? null
    const customBgMediaType = props.customBgMediaType ?? 'image'
    const bgDimming = props.bgDimming ?? theme?.dimming ?? 0
    const bgDimmingDirection = props.bgDimmingDirection ?? theme?.dimmingDirection ?? 'uniform'
    const bgPosX = props.bgPosX ?? theme?.mediaPosX ?? 50
    const bgPosY = props.bgPosY ?? theme?.mediaPosY ?? 50
    const videoRef = props.videoRef

    const showSide = props.showSide ?? singleData?.showSide ?? true
    const showPnl = props.showPnl ?? singleData?.showPnl ?? true
    const showRoi = props.showRoi ?? singleData?.showRoi ?? true
    const showTradeTimes = props.showTradeTimes ?? singleData?.showTradeTimes ?? true
    const showProfile = props.showProfile ?? branding?.showProfile ?? true
    const showWatermark = props.showWatermark ?? branding?.showWatermark ?? true
    const showDuration = props.showDuration ?? singleData?.showDuration ?? true
    const showPlan = props.showPlan ?? singleData?.showPlan ?? false
    const plannedStop = props.plannedStop !== undefined ? props.plannedStop : (singleData?.plannedStop ?? null)
    const plannedTarget = props.plannedTarget !== undefined ? props.plannedTarget : (singleData?.plannedTarget ?? null)
    const plannedRr = props.plannedRr !== undefined ? props.plannedRr : (singleData?.plannedRr ?? null)
    const setupTag = props.setupTag !== undefined ? props.setupTag : (singleData?.setupTag ?? null)
    const executionGrade = props.executionGrade !== undefined ? props.executionGrade : ((singleData?.executionGrade as ExecutionGrade) ?? null)
    const emotionTag = props.emotionTag !== undefined ? props.emotionTag : (singleData?.emotionTag ?? null)
    const showSetup = props.showSetup ?? singleData?.showSetup ?? true
    const showGrade = props.showGrade ?? singleData?.showGrade ?? true
    const showEmotion = props.showEmotion ?? singleData?.showEmotion ?? true
    const showReferral = props.showReferral ?? branding?.showReferral ?? true
    const showThesis = props.showThesis ?? singleData?.showThesis ?? true
    const customThesis = props.customThesis ?? singleData?.thesis ?? ''
    const showReview = props.showReview ?? singleData?.showReview ?? true
    const customReview = props.customReview ?? singleData?.review ?? ''
    const showFullText = props.showFullText ?? singleData?.showFullText ?? false

    const toMs = (val: unknown): number => {
        if (typeof val === 'number') return val
        if (val instanceof Date) return val.getTime()
        if (typeof val === 'string') {
            const parsed = Date.parse(val)
            if (!isNaN(parsed)) return parsed
        }
        return 0
    }

    const entryTimeMs = toMs(tradeEntryTime)
    const exitTimeMs = toMs(tradeExitTime)

    const bg: BgTemplate = props.bg ?? {
        id: theme?.id || 'dark',
        label: theme?.label || 'Dark',
        bg: theme?.bg || 'linear-gradient(135deg, #0d1117 0%, #0a0e1a 50%, #060912 100%)',
        border: theme?.border || 'rgba(255, 255, 255, 0.08)',
        accentProfit: theme?.accentProfit || '#38bdf8',
        accentLoss: theme?.accentLoss || '#f43f5e',
        textSub: theme?.textSub || 'rgba(255, 255, 255, 0.55)',
        isTransparent: Boolean(theme?.isTransparent),
        isCustom: theme?.isCustom,
    }

    const { hidePnl: hookHidePnl } = useHidePnl()
    const hidePnl = privacy?.hideNominal ?? hookHidePnl
    const isTransparentMode = !isCustomBgActive && bg.isTransparent
    const hasReferralDisplay = showReferral && !!activeReferral.trim()

    const playableBgUrl = useMemo(() => {
        return getPlayableMediaUrl(customBgUrl, customBgMediaType) || customBgUrl
    }, [customBgUrl, customBgMediaType])

    // Jaga pemutaran video DOM agar selalu berputar secara looping dan muted
    const localVideoRef = useRef<HTMLVideoElement | null>(null)
    useEffect(() => {
        const vid = localVideoRef.current
        if (!vid || customBgMediaType !== 'video') return
        vid.muted = true
        vid.defaultMuted = true
        vid.playsInline = true
        vid.loop = true

        const tryPlay = () => {
            if (vid.paused) {
                void vid.play().catch((err) => {
                    console.log('[PnlCard] Autoplay dicegah browser, menunggu interaksi pengguna:', err)
                })
            }
        }

        vid.addEventListener('canplay', tryPlay)
        vid.addEventListener('loadeddata', tryPlay)
        vid.addEventListener('loadedmetadata', tryPlay)
        tryPlay()

        return () => {
            vid.removeEventListener('canplay', tryPlay)
            vid.removeEventListener('loadeddata', tryPlay)
            vid.removeEventListener('loadedmetadata', tryPlay)
        }
    }, [playableBgUrl, customBgMediaType])

    return (
        <div
            className="relative overflow-hidden transition-all duration-200 select-none"
            style={{
                borderRadius: 24,
                padding: '24px 28px 20px',
                background: isCustomBgActive
                    ? 'transparent'
                    : isTransparentMode
                        ? 'linear-gradient(135deg, rgba(15, 23, 42, 0.88) 0%, rgba(10, 15, 30, 0.92) 100%)'
                        : bg.bg,
                border: isTransparentMode ? `1.5px solid ${accent}66` : `1px solid ${bg.border}`,
                boxShadow: isTransparentMode ? `0 8px 32px rgba(0, 0, 0, 0.5), 0 0 24px ${accent}22` : '0 12px 36px rgba(0, 0, 0, 0.35)',
            }}
        >
            {/* Custom Image or Video Background */}
            {isCustomBgActive && customBgUrl && (
                <>
                    {customBgMediaType === 'video' ? (
                        <video
                            ref={(el) => {
                                localVideoRef.current = el
                                if (videoRef && 'current' in videoRef) {
                                    ;(videoRef as React.MutableRefObject<HTMLVideoElement | null>).current = el
                                }
                            }}
                            src={playableBgUrl || ''}
                            className="pointer-events-none absolute inset-0 w-full h-full object-cover"
                            muted
                            loop
                            autoPlay
                            playsInline
                            style={{
                                objectPosition: `${bgPosX}% ${bgPosY}%`,
                            }}
                        />
                    ) : (
                        <img
                            src={playableBgUrl || ''}
                            alt="Custom Background"
                            className="pointer-events-none absolute inset-0 w-full h-full object-cover"
                            style={{
                                objectPosition: `${bgPosX}% ${bgPosY}%`,
                            }}
                        />
                    )}
                    {/* Lapisan Dimming Fleksibel Menggunakan CSS Gradient Modern */}
                    <div
                        className="pointer-events-none absolute inset-0 transition-all duration-150"
                        style={getGradientDimmingStyle(bgDimming, bgDimmingDirection)}
                    />
                </>
            )}

            {/* Grid Texture & Ambient Glow Overlay */}
            <div
                className="pointer-events-none absolute inset-0 opacity-[0.03]"
                style={{
                    backgroundImage: 'radial-gradient(circle, #fff 1px, transparent 1px)',
                    backgroundSize: '16px 16px',
                }}
            />
            <div
                className="pointer-events-none absolute -top-20 -left-20 w-60 h-60 rounded-full blur-3xl opacity-15"
                style={{ backgroundColor: accent }}
            />

            <div className="relative z-10 flex flex-col gap-4">
                {/* Header: Logo Brand + Badge Exchange & Referral */}
                <div className="flex items-start justify-between">
                    <div>
                        <div className="text-xl font-black tracking-wider text-white">
                            {brandTitle}
                        </div>
                        <div
                            className="text-[10px] font-bold tracking-widest uppercase px-2 py-0.5 rounded-full inline-block mt-0.5"
                            style={{
                                backgroundColor: `${accent}20`,
                                color: accent,
                                border: `1px solid ${accent}40`,
                            }}
                        >
                            {brandSubtitle}
                        </div>
                    </div>
                    {/* Sisi Kanan: Logo Exchange / Badge + Referral Pill */}
                    <div className="flex flex-col items-end gap-1.5">
                        {activeLogoUrl ? (
                            <img
                                src={activeLogoUrl}
                                alt={selectedExchange}
                                className="h-6 max-w-[100px] object-contain drop-shadow-xs"
                            />
                        ) : (
                            <div
                                className="text-xs font-black tracking-wider uppercase px-2.5 py-1 rounded-md"
                                style={{
                                    backgroundColor: 'rgba(255, 255, 255, 0.08)',
                                    color: '#cbd5e1',
                                    border: '1px solid rgba(255, 255, 255, 0.15)',
                                }}
                            >
                                {selectedExchange}
                            </div>
                        )}
                        {hasReferralDisplay && (
                            <div
                                className="text-[10px] font-extrabold tracking-wider px-2 py-0.5 rounded-md flex items-center gap-1 shadow-xs"
                                style={{
                                    backgroundColor: 'rgba(56, 189, 248, 0.15)',
                                    color: '#38bdf8',
                                    border: '1px solid rgba(56, 189, 248, 0.35)',
                                }}
                            >
                                <span className="opacity-70 font-semibold">Ref:</span>
                                <span>{activeReferral}</span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Info Trade: Pair + Direction + Leverage */}
                <div className="flex items-center gap-3">
                    <span className="text-2xl font-black text-white tracking-wide">
                        {tradeSymbol}
                    </span>
                    {showSide && (
                        <>
                            <span className="text-white/30 text-lg font-light">|</span>
                            <span
                                className="text-sm font-black px-2.5 py-0.5 rounded-md tracking-wider uppercase shadow-xs"
                                style={{ backgroundColor: `${accent}25`, color: accent }}
                            >
                                {tradeDirection}
                            </span>
                            <span className="text-sm font-bold text-white/90 bg-white/10 px-2 py-0.5 rounded-md">
                                {tradeLeverage}X
                            </span>
                        </>
                    )}
                </div>

                {/* Journal Meta Badges: Setup, Grade, Emosi */}
                {((showSetup && setupTag) || (showGrade && executionGrade) || (showEmotion && emotionTag)) && (
                    <div className="flex flex-wrap items-center gap-1.5 -mt-1">
                        {showSetup && setupTag && (
                            <span
                                className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border shadow-2xs"
                                style={{
                                    backgroundColor: 'rgba(255, 255, 255, 0.06)',
                                    borderColor: 'rgba(255, 255, 255, 0.14)',
                                    color: '#e2e8f0',
                                }}
                            >
                                <span>🎯</span>
                                <span>{setupTag}</span>
                            </span>
                        )}
                        {showGrade && executionGrade && (
                            <span
                                className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full border shadow-2xs"
                                style={{
                                    backgroundColor: executionGrade === 'A' ? 'rgba(16, 185, 129, 0.15)' : executionGrade === 'B' ? 'rgba(56, 189, 248, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                                    borderColor: executionGrade === 'A' ? 'rgba(16, 185, 129, 0.35)' : executionGrade === 'B' ? 'rgba(56, 189, 248, 0.35)' : 'rgba(245, 158, 11, 0.35)',
                                    color: executionGrade === 'A' ? '#10b981' : executionGrade === 'B' ? '#38bdf8' : '#f59e0b',
                                }}
                            >
                                Grade {executionGrade}
                            </span>
                        )}
                        {showEmotion && emotionTag && (
                            <span
                                className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full border shadow-2xs"
                                style={{
                                    backgroundColor: 'rgba(255, 255, 255, 0.04)',
                                    borderColor: 'rgba(255, 255, 255, 0.10)',
                                    color: '#94a3b8',
                                }}
                            >
                                <span>💭</span>
                                <span>{emotionTag}</span>
                            </span>
                        )}
                    </div>
                )}

                {/* Hero Stat: ROI % (Teks Berskala Otomatis) */}
                {showRoi && (
                    <div className="my-1">
                        <div
                            className="text-5xl font-black tracking-tight leading-none overflow-hidden text-ellipsis whitespace-nowrap"
                            style={{ color: accent }}
                        >
                            {formatPercent(roiPercent)}
                        </div>
                    </div>
                )}

                {/* Nominal PnL (USDT) + R-Multiple Inline */}
                {showPnl && (
                    <div className="-mt-1 flex items-baseline gap-2.5">
                        <span className="text-xl font-bold tracking-tight text-white/95">
                            {hidePnl ? '••••' : `${formatPnl(tradeRealizedPnl)} USDT`}
                        </span>
                        {tradeRMultiple !== null && tradeRMultiple !== undefined && (
                            <span
                                className="text-base font-extrabold tracking-wide"
                                style={{
                                    color: tradeRMultiple > 0
                                        ? bg.accentProfit
                                        : tradeRMultiple < 0
                                            ? bg.accentLoss
                                            : '#94a3b8'
                                }}
                            >
                                · {formatR(tradeRMultiple)}
                            </span>
                        )}
                    </div>
                )}

                {/* Data Grid: 4 Kolom */}
                <div
                    className="grid grid-cols-4 gap-2 pt-2 pb-1 border-t border-b"
                    style={{ borderColor: 'rgba(255, 255, 255, 0.08)' }}
                >
                    <div>
                        <div className="text-[10px] font-medium tracking-wider uppercase mb-0.5" style={{ color: bg.textSub }}>
                            Entry Price
                        </div>
                        <div className="text-xs font-bold text-white truncate">
                            {formatPrice(tradeEntryPrice)}
                        </div>
                        {showTradeTimes && entryTimeMs > 0 && (
                            <div className="text-[9px] mt-0.5 leading-tight truncate" style={{ color: bg.textSub }}>
                                {formatDateTime(entryTimeMs)}
                            </div>
                        )}
                    </div>
                    <div>
                        <div className="text-[10px] font-medium tracking-wider uppercase mb-0.5" style={{ color: bg.textSub }}>
                            Exit Price
                        </div>
                        <div className="text-xs font-bold text-white truncate">
                            {formatPrice(tradeExitPrice)}
                        </div>
                        {showTradeTimes && (
                            <div className="text-[9px] mt-0.5 leading-tight truncate" style={{ color: bg.textSub }}>
                                {exitTimeMs > 0 ? formatDateTime(exitTimeMs) : 'Posisi Terbuka'}
                            </div>
                        )}
                    </div>
                    <div>
                        <div className="text-[10px] font-medium tracking-wider uppercase mb-0.5" style={{ color: bg.textSub }}>
                            Duration
                        </div>
                        <div className="text-xs font-bold text-white truncate">{showDuration ? duration : '—'}</div>
                    </div>
                    <div>
                        <div className="text-[10px] font-medium tracking-wider uppercase mb-0.5" style={{ color: bg.textSub }}>
                            R-Multiple
                        </div>
                        <div
                            className="text-xs font-bold truncate"
                            style={{
                                color: tradeRMultiple !== null && tradeRMultiple !== undefined
                                    ? (tradeRMultiple > 0 ? bg.accentProfit : tradeRMultiple < 0 ? bg.accentLoss : '#ffffff')
                                    : '#ffffff',
                            }}
                        >
                            {tradeRMultiple !== null && tradeRMultiple !== undefined ? formatR(tradeRMultiple) : '—'}
                        </div>
                    </div>
                </div>

                {/* Planned Risk Grid: Planned SL, Planned TP, Planned R:R */}
                {showPlan && (
                    <div
                        className="grid grid-cols-3 gap-2 px-3 py-2 rounded-xl border -mt-1 shadow-2xs"
                        style={{
                            backgroundColor: 'rgba(255, 255, 255, 0.02)',
                            borderColor: 'rgba(255, 255, 255, 0.08)',
                        }}
                    >
                        <div>
                            <div className="text-[9px] font-bold tracking-wider uppercase mb-0.5" style={{ color: bg.textSub }}>
                                Plan SL
                            </div>
                            <div className="text-xs font-black text-rose-400 truncate">
                                {plannedStop !== null ? formatPrice(plannedStop) : '—'}
                            </div>
                        </div>
                        <div>
                            <div className="text-[9px] font-bold tracking-wider uppercase mb-0.5" style={{ color: bg.textSub }}>
                                Plan TP
                            </div>
                            <div className="text-xs font-black text-emerald-400 truncate">
                                {plannedTarget !== null ? formatPrice(plannedTarget) : '—'}
                            </div>
                        </div>
                        <div>
                            <div className="text-[9px] font-bold tracking-wider uppercase mb-0.5" style={{ color: bg.textSub }}>
                                Plan R:R
                            </div>
                            <div className="text-xs font-black text-sky-400 truncate">
                                {plannedRr !== null ? `1 : ${plannedRr.toFixed(2)}` : '—'}
                            </div>
                        </div>
                    </div>
                )}

                {/* Trade Thesis Box */}
                {showThesis && customThesis.trim() && (
                    <div
                        className="rounded-xl p-3 border -mt-1 transition-all"
                        style={{
                            backgroundColor: 'rgba(15, 23, 42, 0.65)',
                            borderColor: `${accent}33`,
                        }}
                    >
                        <div
                            className="text-[10px] font-bold tracking-wider uppercase flex items-center gap-1.5 mb-1"
                            style={{ color: accent }}
                        >
                            <span>💡</span>
                            <span>Trade Thesis</span>
                        </div>
                        <p
                            className={
                                !showFullText
                                    ? "text-xs italic text-white/90 leading-relaxed font-normal line-clamp-4"
                                    : "text-xs italic text-white/90 leading-relaxed font-normal whitespace-pre-wrap"
                            }
                        >
                            "{customThesis.trim()}"
                        </p>
                    </div>
                )}

                {/* Post-Trade Review Box */}
                {showReview && customReview.trim() && (
                    <div
                        className="rounded-xl p-3 border -mt-1 transition-all"
                        style={{
                            backgroundColor: 'rgba(15, 23, 42, 0.55)',
                            borderColor: 'rgba(148, 163, 184, 0.2)',
                        }}
                    >
                        <div className="text-[10px] font-bold tracking-wider uppercase flex items-center gap-1.5 mb-1 text-sky-400">
                            <span>📝</span>
                            <span>Post-Trade Review</span>
                        </div>
                        <p
                            className={
                                !showFullText
                                    ? "text-xs text-white/80 leading-relaxed line-clamp-3"
                                    : "text-xs text-white/80 leading-relaxed whitespace-pre-wrap"
                            }
                        >
                            {customReview.trim()}
                        </p>
                    </div>
                )}

                {/* Footer: Trader Profile & Watermark */}
                {(showProfile || showWatermark) && (
                    <div
                        className="flex items-center justify-between pt-2 border-t mt-1"
                        style={{ borderColor: 'rgba(255, 255, 255, 0.08)' }}
                    >
                        {showProfile && (
                            <div className="flex items-center gap-2">
                                {avatarUrl ? (
                                    <img
                                        src={avatarUrl}
                                        alt="Avatar"
                                        className="w-7 h-7 rounded-full object-cover border"
                                        style={{ borderColor: accent }}
                                    />
                                ) : (
                                    <div
                                        className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white border"
                                        style={{ backgroundColor: `${accent}33`, borderColor: accent }}
                                    >
                                        {traderHandle.replace('@', '').slice(0, 2).toUpperCase() || 'TR'}
                                    </div>
                                )}
                                <div>
                                    <div className="text-xs font-bold text-white leading-tight">
                                        {traderHandle}
                                    </div>
                                    <div className="text-[10px]" style={{ color: bg.textSub }}>
                                        {formatDate(exitTimeMs || Date.now())}
                                    </div>
                                </div>
                            </div>
                        )}

                        {showWatermark && (
                            <div className="flex items-center gap-2.5 ml-auto">
                                <img
                                    src={nitireksoLogo}
                                    alt="nitirekso logo"
                                    className="w-8 h-8 rounded-lg object-contain shadow-xs bg-black/20 p-0.5 border border-white/10"
                                />
                                <div className="text-[11px] text-left leading-tight" style={{ color: bg.textSub }}>
                                    <div className="font-bold text-white/90">nitirekso</div>
                                    <div>Trading Journal</div>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    )
}
