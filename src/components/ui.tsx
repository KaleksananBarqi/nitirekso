import { useEffect, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import {
    badgeClass,
    buttonClass,
    cardClass,
    inputClass,
    labelClass,
    selectClass,
    textareaClass,
    type ButtonSize,
    type ButtonVariant
} from '../lib/ui'
import { cn } from '../lib/utils'

/**
 * Primitif UI.
 *
 * Gaya visual ditulis eksplisit di `src/lib/ui.ts`, bukan memakai default
 * komponen library — brief §7 melarang tampilan template admin-dashboard generik.
 */

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: ButtonVariant
    size?: ButtonSize
}

export function Button({
    variant = 'secondary',
    size = 'md',
    className,
    ...props
}: ButtonProps): React.JSX.Element {
    return <button className={buttonClass(variant, size, className)} {...props} />
}

interface FieldProps {
    label: string
    htmlFor?: string
    hint?: string
    error?: string
    children: ReactNode
    className?: string
}

/** Pembungkus field form: label + kontrol + hint/error. */
export function Field({
    label,
    htmlFor,
    hint,
    error,
    children,
    className
}: FieldProps): React.JSX.Element {
    return (
        <div className={cn('flex flex-col gap-1', className)}>
            <label className={labelClass()} htmlFor={htmlFor}>
                {label}
            </label>
            {children}
            {hint && !error && <p className="text-[11px] text-muted-foreground">{hint}</p>}
            {error && <p className="text-[11px] text-loss">{error}</p>}
        </div>
    )
}

interface NumberInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> {
    value: number | null
    onValueChange: (value: number | null) => void
    /** Jumlah desimal saat menampilkan ulang. Presisi bebas saat user mengetik. */
    decimals?: number
}

/**
 * Input angka.
 *
 * Menyimpan nilai sebagai number|null, bukan string. `null` berarti kosong —
 * penting agar field opsional (mis. stop loss) benar-benar bisa kosong dan
 * menghasilkan R = NULL, bukan 0 (brief §5.2).
 *
 * Mendukung input koma (,) dan titik (.) secara transparan untuk pengguna lokal & internasional.
 * Menggunakan state teks lokal selama fokus agar pengetikan titik desimal (mis. '14.') tidak langsung
 * terpotong oleh konversi Number.
 */
export function NumberInput({
    value,
    onValueChange,
    decimals,
    className,
    ...props
}: NumberInputProps): React.JSX.Element {
    const [text, setText] = useState<string>(() => (value === null || Number.isNaN(value) ? '' : String(value)))
    const isFocusedRef = useRef(false)

    // Sinkronisasi dari luar hanya saat input sedang tidak difokuskan user
    useEffect(() => {
        if (!isFocusedRef.current) {
            setText(value === null || Number.isNaN(value) ? '' : String(value))
        }
    }, [value])

    return (
        <input
            type="text"
            inputMode="decimal"
            value={text}
            onFocus={() => {
                isFocusedRef.current = true
            }}
            onChange={(event) => {
                // Ganti koma dengan titik agar fleksibel untuk keyboard format Indo/Eropa
                const raw = event.target.value.replace(/,/g, '.')
                // Hanya izinkan angka, minus, dan satu titik desimal
                if (!/^-?\d*\.?\d*$/.test(raw)) return

                setText(raw)

                if (raw === '' || raw === '-' || raw === '.') {
                    onValueChange(null)
                    return
                }
                const parsed = Number(raw)
                if (!Number.isNaN(parsed)) {
                    onValueChange(parsed)
                }
            }}
            onBlur={() => {
                isFocusedRef.current = false
                if (value !== null && decimals !== undefined) {
                    const rounded = Number(value.toFixed(decimals))
                    onValueChange(rounded)
                    setText(String(rounded))
                } else if (text === '' || text === '-' || text === '.') {
                    setText('')
                    onValueChange(null)
                } else {
                    const parsed = Number(text)
                    if (!Number.isNaN(parsed)) {
                        setText(String(parsed))
                    }
                }
            }}
            className={inputClass(className, true)}
            {...props}
        />
    )
}

interface TextInputProps extends InputHTMLAttributes<HTMLInputElement> {
    numeric?: boolean
}

export function TextInput({ numeric, className, ...props }: TextInputProps): React.JSX.Element {
    return <input className={inputClass(className, numeric)} {...props} />
}

export function TextArea({
    className,
    ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>): React.JSX.Element {
    return <textarea className={textareaClass(className)} {...props} />
}

export function Select({
    className,
    children,
    ...props
}: SelectHTMLAttributes<HTMLSelectElement>): React.JSX.Element {
    return (
        <select className={selectClass(className)} {...props}>
            {children}
        </select>
    )
}

export function Card({
    className,
    children
}: {
    className?: string
    children: ReactNode
}): React.JSX.Element {
    return <div className={cardClass(className)}>{children}</div>
}

export function CardHeader({
    title,
    description,
    action
}: {
    title: string
    description?: string
    action?: ReactNode
}): React.JSX.Element {
    return (
        <div className="flex items-start justify-between gap-4 border-b border-border/45 px-4 py-3.5">
            <div className="min-w-0">
                <h2 className="text-sm font-semibold tracking-tight text-foreground">{title}</h2>
                {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
            </div>
            {action}
        </div>
    )
}

/**
 * Modern Toggle Switch (Neo-Quant Bento Shell).
 * Menggantikan checkbox/tombol kotak jadul dengan kontrol sakelar aksesibel ramah sentuh.
 */
export function ToggleSwitch({
    checked,
    onChange,
    label,
    description,
    disabled = false,
    id
}: {
    checked: boolean
    onChange: (next: boolean) => void
    label?: string
    description?: string
    disabled?: boolean
    id?: string
}): React.JSX.Element {
    return (
        <button
            id={id}
            type="button"
            role="switch"
            aria-checked={checked}
            disabled={disabled}
            onClick={() => !disabled && onChange(!checked)}
            className={cn(
                'group flex min-h-11 w-full items-center justify-between gap-3 rounded-lg bg-muted/60 px-3.5 py-2 text-left transition-colors',
                !disabled && 'hover:bg-muted',
                disabled && 'opacity-50 cursor-not-allowed'
            )}
        >
            {(label || description) && (
                <div className="min-w-0">
                    {label && <span className="block text-xs font-semibold text-foreground">{label}</span>}
                    {description && (
                        <span className="block text-[11px] text-muted-foreground leading-snug">
                            {description}
                        </span>
                    )}
                </div>
            )}
            <span
                aria-hidden="true"
                className={cn(
                    'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors',
                    checked ? 'bg-primary' : 'bg-border'
                )}
            >
                <span
                    className={cn(
                        'inline-block h-4 w-4 rounded-full bg-primary-foreground shadow-xs transition-transform',
                        checked ? 'translate-x-6' : 'translate-x-1'
                    )}
                />
            </span>
        </button>
    )
}

export function Badge({
    tone = 'default',
    children,
    className
}: {
    tone?: 'default' | 'profit' | 'loss' | 'muted' | 'warning'
    children: ReactNode
    className?: string
}): React.JSX.Element {
    return <span className={badgeClass(tone, className)}>{children}</span>
}

/** Keadaan kosong. Brief §7 tidak menyebut ini, tapi UI trading tanpa empty
 * state akan tampak rusak saat pertama kali dibuka. */
export function EmptyState({
    title,
    description,
    action
}: {
    title: string
    description: string
    action?: ReactNode
}): React.JSX.Element {
    return (
        <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
            <p className="text-sm font-medium">{title}</p>
            <p className="max-w-md text-xs text-muted-foreground">{description}</p>
            {action}
        </div>
    )
}

/** Pesan error inline — dipakai untuk menampilkan error dari main process. */
export function ErrorNote({ message }: { message: string }): React.JSX.Element {
    return (
        <div className="rounded-md border border-loss/40 bg-loss/10 px-3 py-2 text-xs text-loss">
            {message}
        </div>
    )
}

/** Komponen Modal / Dialog overlay modern */
export function Modal({
    isOpen,
    onClose,
    title,
    description,
    children,
    footer,
    size = 'md'
}: {
    isOpen: boolean
    onClose: () => void
    title: string
    description?: string
    children: ReactNode
    footer?: ReactNode
    size?: 'sm' | 'md' | 'lg' | 'xl'
}): React.JSX.Element | null {
    useEffect(() => {
        if (!isOpen) return
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onClose()
            }
        }
        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [isOpen, onClose])

    if (!isOpen) return null

    const maxWidthClass = {
        sm: 'max-w-md',
        md: 'max-w-xl',
        lg: 'max-w-3xl',
        xl: 'max-w-5xl'
    }[size]

    return (
        <div
            className="fixed inset-0 z-50 flex items-stretch justify-center p-0 sm:items-center sm:p-4"
            role="dialog"
            aria-modal="true"
            aria-label={title}
        >
            {/* Backdrop */}
            <div
                className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
                onClick={onClose}
                aria-hidden="true"
            />

            {/* Modal Dialog Box (full-screen sheet di mobile, dialog terpusat di tablet/desktop) */}
            <div
                className={cn(
                    'relative z-50 flex h-[100dvh] max-h-[100dvh] w-full flex-col overflow-hidden bg-card shadow-2xl animate-in fade-in-0 zoom-in-95',
                    'pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] sm:pt-0 sm:pb-0',
                    'sm:h-auto sm:max-h-[90vh] sm:rounded-xl sm:border sm:border-border',
                    maxWidthClass
                )}
            >
                {/* Modal Header */}
                <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-6 sm:py-4">
                    <div className="min-w-0">
                        <h2 className="text-base font-semibold text-foreground truncate">{title}</h2>
                        {description && <p className="text-xs text-muted-foreground">{description}</p>}
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Tutup dialog"
                        className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md p-2 text-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground shrink-0 sm:min-h-8 sm:min-w-8 sm:p-1.5"
                    >
                        <span aria-hidden="true">×</span>
                    </button>
                </div>

                {/* Modal Body */}
                <div className="flex-1 overflow-y-auto p-4 sm:p-6">{children}</div>

                {/* Modal Footer */}
                {footer && (
                    <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border bg-muted/30 px-4 py-3 sm:px-6">
                        {footer}
                    </div>
                )}
            </div>
        </div>
    )
}
