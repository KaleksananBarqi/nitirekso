/**
 * Deteksi platform runtime untuk adaptasi perilaku native Android vs Desktop
 * tanpa memengaruhi rendering headless atau unit test Vitest.
 */

export function isAndroidApp(): boolean {
    if (typeof navigator === 'undefined') return false
    return /android/i.test(navigator.userAgent || '')
}

export function isMobilePlatform(): boolean {
    if (typeof navigator === 'undefined') return false
    return /android|iphone|ipad|ipod/i.test(navigator.userAgent || '')
}

export function isContentUri(pathOrUri: string | null | undefined): boolean {
    return typeof pathOrUri === 'string' && pathOrUri.trim().startsWith('content://')
}

/** Memformat URI SAF Android yang panjang menjadi label ringkas yang mudah dibaca di UI. */
export function formatVaultLocationLabel(pathOrUri: string | null | undefined): string {
    if (!pathOrUri) return ''
    const trimmed = pathOrUri.trim()
    if (!isContentUri(trimmed)) return trimmed

    try {
        const decoded = decodeURIComponent(trimmed)
        const treeIdx = decoded.lastIndexOf('/tree/')
        const segment = treeIdx >= 0 ? decoded.slice(treeIdx + 6) : decoded
        const colonIdx = segment.lastIndexOf(':')
        const folderPart = colonIdx >= 0 ? segment.slice(colonIdx + 1) : segment
        return folderPart ? `Penyimpanan Android / ${folderPart}` : 'Folder SAF Android Terpilih'
    } catch {
        return 'Folder SAF Android Terpilih'
    }
}
