import type { ReactNode } from 'react'
import { cn } from '../lib/utils'

/**
 * Kartu metrik tonal (Neo-Quant Bento Shell).
 * Semua nilai memakai font monospace (`tabular`) supaya digit sejajar antar kartu.
 */

interface MetricCardProps {
    label: string
    value: ReactNode
    hint?: string
    valueClassName?: string
    badge?: ReactNode
    /** Varian kompak untuk sel di dalam panel Bento. */
    variant?: 'card' | 'tile'
}

export function MetricCard({
    label,
    value,
    hint,
    valueClassName,
    badge,
    variant = 'card'
}: MetricCardProps): React.JSX.Element {
    return (
        <div
            className={cn(
                variant === 'tile'
                    ? 'rounded-lg bg-muted/55 px-3.5 py-2.5'
                    : 'rounded-xl bg-card px-4 py-3.5 ring-1 ring-border/45'
            )}
        >
            <div className="flex items-start justify-between gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {label}
                </p>
                {badge}
            </div>
            <p className={cn('tabular mt-1.5 text-lg sm:text-xl font-bold leading-none text-foreground', valueClassName)}>
                {value}
            </p>
            {hint && <p className="mt-1.5 text-[11px] text-muted-foreground leading-snug">{hint}</p>}
        </div>
    )
}
