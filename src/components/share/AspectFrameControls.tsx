import React from 'react'
import {
    type ExportAspect,
    type FrameBgSource
} from '../../lib/shareSettings'

export interface AspectFrameControlsProps {
    exportAspect: ExportAspect
    onAspectChange: (aspect: ExportAspect) => void
    frameBgSource: FrameBgSource
    onBgSourceChange: (source: FrameBgSource) => void
    frameBlur: number
    onBlurChange: (blur: number) => void
    frameDim: number
    onDimChange: (dim: number) => void
    hasCustomWallpaper: boolean
}

export function AspectFrameControls({
    exportAspect,
    onAspectChange,
    frameBgSource,
    onBgSourceChange,
    frameBlur,
    onBlurChange,
    frameDim,
    onDimChange,
    hasCustomWallpaper
}: AspectFrameControlsProps): React.JSX.Element {
    const isTikTok = exportAspect === '9:16'

    return (
        <div className="flex flex-col gap-2 p-2.5 rounded-xl bg-card/40 border border-border/50 text-xs">
            <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                    <span className="text-[11px] font-bold text-foreground flex items-center gap-1">
                        <span>📱</span>
                        <span>Format Rasio Video:</span>
                    </span>

                    {/* Segmented Button: Asli vs TikTok 9:16 */}
                    <div className="inline-flex rounded-lg border border-border/80 p-0.5 bg-background">
                        <button
                            type="button"
                            onClick={() => onAspectChange('original')}
                            className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all ${
                                !isTikTok
                                    ? 'bg-primary text-primary-foreground shadow-xs'
                                    : 'text-muted-foreground hover:text-foreground'
                            }`}
                        >
                            Asli (Dinamis)
                        </button>
                        <button
                            type="button"
                            onClick={() => onAspectChange('9:16')}
                            className={`px-2.5 py-1 rounded-md text-[11px] font-semibold flex items-center gap-1 transition-all ${
                                isTikTok
                                    ? 'bg-primary text-primary-foreground shadow-xs'
                                    : 'text-muted-foreground hover:text-foreground'
                            }`}
                        >
                            <span>TikTok 9:16</span>
                            <span className="text-[9px] px-1 py-0.2 rounded bg-black/30 font-mono">1080×1920</span>
                        </button>
                    </div>
                </div>

                <span className="text-[10px] text-muted-foreground">
                    {isTikTok
                        ? '✨ Video di-wrap background blur 9:16 (aman crop TikTok/Reels)'
                        : 'Video mengikuti tinggi asli kartu share'}
                </span>
            </div>

            {/* Opsi Tambahan saat mode 9:16 aktif */}
            {isTikTok && (
                <div className="pt-2 border-t border-border/30 grid grid-cols-1 sm:grid-cols-3 gap-2.5 items-center">
                    {/* Sumber Background Blur */}
                    <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-semibold text-muted-foreground whitespace-nowrap">
                            Latar Blur:
                        </span>
                        <select
                            value={frameBgSource}
                            onChange={(e) => onBgSourceChange(e.target.value as FrameBgSource)}
                            className="h-7 text-[11px] rounded bg-background border border-border px-2 text-foreground focus:border-primary focus:outline-none flex-1"
                        >
                            <option value="card-blur">Kartu PnL (Blur)</option>
                            <option value="wallpaper-blur" disabled={!hasCustomWallpaper}>
                                Wallpaper Aktif (Blur) {!hasCustomWallpaper ? '(Kosong)' : ''}
                            </option>
                            <option value="solid">Warna Gelap Solid</option>
                        </select>
                    </div>

                    {/* Slider Kekuatan Blur */}
                    {frameBgSource !== 'solid' && (
                        <div className="flex items-center gap-1.5">
                            <span className="text-[10px] font-semibold text-muted-foreground min-w-[55px]">
                                Blur: <span className="font-mono text-foreground font-bold">{frameBlur}px</span>
                            </span>
                            <input
                                type="range"
                                min="8"
                                max="50"
                                value={frameBlur}
                                onChange={(e) => onBlurChange(Number(e.target.value))}
                                className="flex-1 accent-primary h-1.5 cursor-pointer"
                                title="Kekuatan efek frosted glass blur"
                            />
                        </div>
                    )}

                    {/* Slider Dimming Frame */}
                    <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-semibold text-muted-foreground min-w-[55px]">
                            Dim: <span className="font-mono text-foreground font-bold">{frameDim}%</span>
                        </span>
                        <input
                            type="range"
                            min="10"
                            max="80"
                            value={frameDim}
                            onChange={(e) => onDimChange(Number(e.target.value))}
                            className="flex-1 accent-primary h-1.5 cursor-pointer"
                            title="Peredupan latar belakang bingkai agar kartu PnL menonjol"
                        />
                    </div>
                </div>
            )}
        </div>
    )
}
