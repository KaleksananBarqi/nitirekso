import React from 'react'
import {
    type BgDimmingDirection,
    DIMMING_DIRECTION_OPTIONS
} from '../../lib/shareSettings'

export interface BackgroundAdjustBarProps {
    bgDimming: number
    onDimmingChange: (value: number) => void
    bgDimmingDirection: BgDimmingDirection
    onDirectionChange: (dir: BgDimmingDirection) => void
}

export function BackgroundAdjustBar({
    bgDimming,
    onDimmingChange,
    bgDimmingDirection,
    onDirectionChange
}: BackgroundAdjustBarProps): React.JSX.Element {
    return (
        <div className="p-2.5 rounded-xl bg-muted/30 border border-border/50 flex flex-col gap-2 mt-1">
            <div className="flex items-center justify-between flex-wrap gap-2">
                <span className="text-[11px] font-bold text-foreground flex items-center gap-1.5">
                    <span>🌓</span>
                    <span>Pencahayaan & Gradien Dimming:</span>
                </span>
                <span className="text-[10px] text-muted-foreground">
                    Atur transparansi & arah bayangan wallpaper langsung di sini
                </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-0.5">
                {/* Slider Dimming */}
                <div className="flex items-center gap-2">
                    <span className="text-[10px] font-semibold text-muted-foreground min-w-[70px]">
                        Dimming: <span className="font-mono text-foreground font-bold">{bgDimming}%</span>
                    </span>
                    <input
                        type="range"
                        min="0"
                        max="95"
                        value={bgDimming}
                        onChange={(e) => onDimmingChange(Number(e.target.value))}
                        className="flex-1 accent-primary h-1.5 cursor-pointer"
                        title="Tingkat peredupan wallpaper (0% terang, 95% sangat gelap)"
                    />
                </div>

                {/* Dropdown Arah Gradien */}
                <div className="flex items-center gap-2">
                    <span className="text-[10px] font-semibold text-muted-foreground whitespace-nowrap min-w-[65px]">
                        Arah Gradien:
                    </span>
                    <select
                        value={bgDimmingDirection}
                        onChange={(e) => onDirectionChange(e.target.value as BgDimmingDirection)}
                        className="flex-1 h-7 text-xs rounded-md bg-background border border-border px-2 text-foreground focus:border-primary focus:outline-none"
                    >
                        {DIMMING_DIRECTION_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                                {opt.label}
                            </option>
                        ))}
                    </select>
                </div>
            </div>
        </div>
    )
}
