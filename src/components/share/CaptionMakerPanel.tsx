import React, { useEffect, useMemo, useRef, useState } from 'react'
import { type TradeDetail } from '@shared/domain'
import {
    CAPTION_PRESETS,
    buildCaptionContext,
    renderCaption
} from '../../lib/caption-generator'

export interface CaptionMakerPanelProps {
    tradeDetail: TradeDetail
    showPnl: boolean
    traderHandle: string
    brandTitle: string
    selectedExchange: string
    activeReferral: string
    customThesis: string
    customReview: string
    captionPresetId: string
    onPresetChange: (id: string) => void
}

export function CaptionMakerPanel({
    tradeDetail,
    showPnl,
    traderHandle,
    brandTitle,
    selectedExchange,
    activeReferral,
    customThesis,
    customReview,
    captionPresetId,
    onPresetChange
}: CaptionMakerPanelProps): React.JSX.Element {
    const [isOpen, setIsOpen] = useState(false)
    const [hookIndex, setHookIndex] = useState(0)
    const [captionText, setCaptionText] = useState('')
    const [isDirty, setIsDirty] = useState(false)
    const [copySuccess, setCopySuccess] = useState(false)
    const textareaRef = useRef<HTMLTextAreaElement>(null)

    // Buat konteks data trade untuk caption
    const ctx = useMemo(() => {
        return buildCaptionContext(tradeDetail, {
            traderHandle,
            brandTitle,
            selectedExchange,
            activeReferral,
            customThesis,
            customReview
        })
    }, [tradeDetail, traderHandle, brandTitle, selectedExchange, activeReferral, customThesis, customReview])

    // Regenerasi caption saat parameter berubah (kecuali jika user sedang mengetik manual / dirty)
    useEffect(() => {
        if (!isDirty) {
            const generated = renderCaption(captionPresetId, ctx, {
                hidePnl: !showPnl,
                hookIndex
            })
            setCaptionText(generated)
        }
    }, [captionPresetId, ctx, showPnl, hookIndex, isDirty])

    // Handler Ganti Hook pembuka
    const handleNextHook = () => {
        setHookIndex((prev) => prev + 1)
        const nextGen = renderCaption(captionPresetId, ctx, {
            hidePnl: !showPnl,
            hookIndex: hookIndex + 1
        })
        setCaptionText(nextGen)
        setIsDirty(false)
    }

    // Handler Reset ke Template bawaan
    const handleReset = () => {
        const nextGen = renderCaption(captionPresetId, ctx, {
            hidePnl: !showPnl,
            hookIndex
        })
        setCaptionText(nextGen)
        setIsDirty(false)
    }

    // Handler Salin ke Clipboard
    const handleCopy = async () => {
        if (!captionText) return
        try {
            await navigator.clipboard.writeText(captionText)
            setCopySuccess(true)
            setTimeout(() => setCopySuccess(false), 2200)
        } catch (err) {
            console.error('Gagal menyalin caption ke clipboard:', err)
        }
    }

    // Sisipkan token ke kursor textarea
    const handleInsertToken = (token: string) => {
        const textarea = textareaRef.current
        if (!textarea) return

        const start = textarea.selectionStart
        const end = textarea.selectionEnd
        const next = captionText.slice(0, start) + token + captionText.slice(end)
        setCaptionText(next)
        setIsDirty(true)

        setTimeout(() => {
            textarea.focus()
            textarea.setSelectionRange(start + token.length, start + token.length)
        }, 10)
    }

    // Informasi Batas Karakter Platform
    const currentPreset = CAPTION_PRESETS.find((p) => p.id === captionPresetId) || CAPTION_PRESETS[0]!
    const charLimit = currentPreset.platform === 'x' ? 280 : 2200
    const charCount = captionText.length
    const isOverLimit = charCount > charLimit

    // Label & Badge Hasil Trade
    const outcomeBadge = (() => {
        if (ctx.outcome === 'win') {
            return (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                    ✅ Menang (Profit)
                </span>
            )
        }
        if (ctx.outcome === 'be') {
            return (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">
                    ⚖️ Impas (BEP)
                </span>
            )
        }
        return (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30">
                ❌ Kalah (Cut Loss)
            </span>
        )
    })()

    return (
        <div className="border-t border-border/40 bg-card/15">
            {/* Header Collapsible Accordion */}
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className="w-full px-4 py-2.5 flex items-center justify-between hover:bg-muted/30 transition-colors text-left select-none"
            >
                <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                        <span>📝</span>
                        <span>Caption Maker (SEO TikTok & Medsos)</span>
                    </span>
                    {outcomeBadge}
                    {isDirty && (
                        <span className="text-[10px] text-amber-400 bg-amber-500/15 px-1.5 py-0.5 rounded border border-amber-500/30">
                            Diedit Manual
                        </span>
                    )}
                </div>

                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="text-[11px] hidden sm:inline">
                        {isOpen ? 'Tutup Panel' : 'Buat & Salin Caption'}
                    </span>
                    <span className="font-mono text-sm leading-none transition-transform duration-200">
                        {isOpen ? '▲' : '▼'}
                    </span>
                </div>
            </button>

            {/* Isi Panel */}
            {isOpen && (
                <div className="px-4 pb-3 flex flex-col gap-2.5">
                    {/* Baris Kontrol: Selector Preset + Tombol Rotasi Hook & Reset */}
                    <div className="flex items-center justify-between flex-wrap gap-2 pt-1 border-t border-border/20">
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[11px] font-semibold text-muted-foreground whitespace-nowrap">
                                Gaya Caption:
                            </span>
                            <div className="flex items-center gap-1 flex-wrap">
                                {CAPTION_PRESETS.map((p) => (
                                    <button
                                        key={p.id}
                                        type="button"
                                        onClick={() => {
                                            onPresetChange(p.id)
                                            setIsDirty(false)
                                        }}
                                        className={`px-2 py-1 rounded-md text-[11px] font-medium border transition-all ${
                                            captionPresetId === p.id
                                                ? 'border-primary bg-primary/20 text-foreground font-bold shadow-xs'
                                                : 'border-border/60 bg-muted/20 text-muted-foreground hover:text-foreground'
                                        }`}
                                        title={p.description}
                                    >
                                        {p.name}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="flex items-center gap-1.5">
                            <button
                                type="button"
                                onClick={handleNextHook}
                                className="px-2 py-1 rounded-md text-[11px] font-semibold bg-muted/40 border border-border/60 hover:bg-muted text-foreground flex items-center gap-1 transition-colors"
                                title="Ganti kalimat pembuka (hook) secara bergulir"
                            >
                                <span>🔄</span>
                                <span>Ganti Hook</span>
                            </button>
                            {isDirty && (
                                <button
                                    type="button"
                                    onClick={handleReset}
                                    className="px-2 py-1 rounded-md text-[11px] font-semibold text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
                                    title="Kembalikan teks ke template asli"
                                >
                                    ↺ Reset
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Area Textarea Caption yang Editable */}
                    <div className="relative">
                        <textarea
                            ref={textareaRef}
                            value={captionText}
                            onChange={(e) => {
                                setCaptionText(e.target.value)
                                setIsDirty(true)
                            }}
                            rows={currentPreset.platform === 'x' ? 4 : 7}
                            className={`w-full rounded-xl border p-3 text-xs leading-relaxed bg-background resize-y focus:outline-none transition-colors ${
                                isOverLimit
                                    ? 'border-destructive focus:border-destructive text-destructive'
                                    : 'border-border/80 focus:border-primary text-foreground'
                            }`}
                            placeholder="Caption trading otomatis..."
                        />

                        {/* Indikator Karakter & Tombol Copy di pojok kanan bawah */}
                        <div className="flex items-center justify-between text-[11px] mt-1 px-1">
                            <div className="flex items-center gap-1.5 text-muted-foreground">
                                <span className={isOverLimit ? 'text-destructive font-bold' : ''}>
                                    {charCount} / {charLimit} karakter
                                </span>
                                {isOverLimit && (
                                    <span className="text-destructive font-semibold">
                                        (Melebihi batas {currentPreset.platform === 'x' ? 'Twitter/X' : 'TikTok'}!)
                                    </span>
                                )}
                            </div>

                            <button
                                type="button"
                                onClick={() => void handleCopy()}
                                className={`px-3 py-1 rounded-lg text-xs font-bold border flex items-center gap-1.5 transition-all shadow-xs ${
                                    copySuccess
                                        ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                                        : 'bg-primary text-primary-foreground border-primary hover:bg-primary/90'
                                }`}
                            >
                                <span>{copySuccess ? '✓' : '📋'}</span>
                                <span>{copySuccess ? 'Tersalin ke Clipboard!' : 'Salin Caption'}</span>
                            </button>
                        </div>
                    </div>

                    {/* Quick Token Chips untuk Memudahkan Kustomisasi */}
                    <div className="flex items-center gap-1.5 flex-wrap pt-1 text-[10px] text-muted-foreground">
                        <span className="font-semibold text-foreground/80">Sisipkan Token:</span>
                        {[
                            '{symbol}',
                            '{roi}',
                            '{pnl}',
                            '{setup}',
                            '{grade}',
                            '{thesis}',
                            '{review}',
                            '{exchange}',
                            '{duration}'
                        ].map((token) => (
                            <button
                                key={token}
                                type="button"
                                onClick={() => handleInsertToken(token)}
                                className="px-1.5 py-0.5 rounded bg-muted/40 border border-border/50 font-mono hover:bg-primary/10 hover:text-primary hover:border-primary/40 transition-colors"
                            >
                                {token}
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    )
}
