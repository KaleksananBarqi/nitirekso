/**
 * Pengelola Skema Warna Kustom (Personalized Color Scheme).
 *
 * Menyimpan state skema warna ke SQLite `settings` via IPC (key: `customColorSchemes`
 * dan `activeCustomColorSchemeId`) agar ikut tersinkron melalui Sync Vault,
 * dengan cache in-memory untuk akses sinkron dari komponen UI.
 */

export interface CustomColorScheme {
    id: string
    name: string
    primary: string       // Hex, misal '#a855f7'
    profit: string        // Hex, misal '#22c55e'
    loss: string          // Hex, misal '#ef4444'
    background?: string   // Hex opsional, misal '#0b0f19'
    card?: string         // Hex opsional, misal '#111827'
    createdAt: number
    isBuiltin?: boolean
}

export const LEGACY_CUSTOM_SCHEMES_KEY = 'nitirekso_custom_color_schemes'
export const LEGACY_ACTIVE_SCHEME_KEY = 'nitirekso_active_custom_color_scheme_id'

let memoryCustomSchemes: CustomColorScheme[] = []
let memoryActiveSchemeId: string | null = null

export const BUILTIN_SCHEMES: CustomColorScheme[] = [
    {
        id: 'cyberpunk-neon',
        name: 'Cyberpunk Neon',
        primary: '#d946ef',
        profit: '#06b6d4',
        loss: '#f43f5e',
        background: '#090514',
        card: '#130c24',
        createdAt: 1,
        isBuiltin: true
    },
    {
        id: 'emerald-flow',
        name: 'Emerald Alpha',
        primary: '#10b981',
        profit: '#34d399',
        loss: '#f87171',
        background: '#041712',
        card: '#08261e',
        createdAt: 2,
        isBuiltin: true
    },
    {
        id: 'tokyo-night',
        name: 'Tokyo Night',
        primary: '#7aa2f7',
        profit: '#73daca',
        loss: '#f7768e',
        background: '#1a1b26',
        card: '#24283b',
        createdAt: 3,
        isBuiltin: true
    },
    {
        id: 'binance-gold',
        name: 'Binance Gold',
        primary: '#f0b90b',
        profit: '#0ecb81',
        loss: '#f6465d',
        background: '#0b0e11',
        card: '#181a20',
        createdAt: 4,
        isBuiltin: true
    }
]

function persistThemesToBackend(payload: {
    customColorSchemes?: CustomColorScheme[]
    activeCustomColorSchemeId?: string | null
}): void {
    if (typeof window !== 'undefined' && window.api?.setSettings) {
        void window.api.setSettings(payload).catch(() => {
            // Abaikan error IPC sementara agar interaksi UI tetap responsif
        })
    }
}

function notifyThemesUpdated(): void {
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
        try {
            window.dispatchEvent(new CustomEvent('custom-themes:updated'))
        } catch {
            // Abaikan pada environment non-DOM
        }
    }
}

/**
 * Menghidrasi cache skema warna dari objek `settings` SQLite dan menerapkannya ke DOM.
 */
export function hydrateCustomThemesFromSettings(settings: Record<string, unknown>): void {
    if (Array.isArray(settings.customColorSchemes)) {
        memoryCustomSchemes = (settings.customColorSchemes as CustomColorScheme[]).filter(
            (s) => s && !s.isBuiltin && typeof s.id === 'string'
        )
    }

    if (typeof settings.activeCustomColorSchemeId === 'string' && settings.activeCustomColorSchemeId) {
        memoryActiveSchemeId = settings.activeCustomColorSchemeId
    } else if (settings.activeCustomColorSchemeId === null) {
        memoryActiveSchemeId = null
    }

    if (typeof document !== 'undefined') {
        const active = memoryActiveSchemeId
            ? loadAllColorSchemes().find((s) => s.id === memoryActiveSchemeId) || null
            : null
        applyColorSchemeToDom(active)
    }
    notifyThemesUpdated()
}

/** Reset state memori khusus pengujian unit. */
export function _resetCustomThemesForTesting(): void {
    memoryCustomSchemes = []
    memoryActiveSchemeId = null
}

/**
 * Muat semua skema warna (preset bawaan + kustom buatan user).
 */
export function loadAllColorSchemes(): CustomColorScheme[] {
    return [...BUILTIN_SCHEMES, ...memoryCustomSchemes]
}

/**
 * Simpan daftar skema kustom buatan user ke Local Cache SQLite.
 */
export function saveCustomSchemes(customSchemes: CustomColorScheme[]): void {
    const onlyCustom = customSchemes.filter((s) => !s.isBuiltin)
    memoryCustomSchemes = onlyCustom
    persistThemesToBackend({ customColorSchemes: onlyCustom })
    notifyThemesUpdated()
}

/**
 * Tambah skema kustom baru buatan user.
 */
export function addCustomColorScheme(
    data: Omit<CustomColorScheme, 'id' | 'createdAt' | 'isBuiltin'>
): CustomColorScheme {
    const id = `custom-scheme-${Date.now()}`
    const newScheme: CustomColorScheme = {
        ...data,
        id,
        createdAt: Date.now(),
        isBuiltin: false
    }

    const nextCustom = [...memoryCustomSchemes, newScheme]
    saveCustomSchemes(nextCustom)
    return newScheme
}

/**
 * Hapus skema kustom buatan user berdasarkan ID.
 */
export function deleteCustomColorScheme(id: string): void {
    const nextCustom = memoryCustomSchemes.filter((s) => s.id !== id)
    saveCustomSchemes(nextCustom)

    if (getActiveCustomSchemeId() === id) {
        setActiveCustomSchemeId(null)
    }
}

/**
 * Perbarui skema kustom buatan user berdasarkan ID.
 */
export function updateCustomColorScheme(
    id: string,
    data: Partial<Omit<CustomColorScheme, 'id' | 'createdAt' | 'isBuiltin'>>
): CustomColorScheme | null {
    const nextList = memoryCustomSchemes.map((s) => ({ ...s }))
    const target = nextList.find((s) => !s.isBuiltin && s.id === id)
    if (!target) return null

    if (data.name !== undefined) target.name = data.name.trim() || target.name
    if (data.primary !== undefined) target.primary = data.primary
    if (data.profit !== undefined) target.profit = data.profit
    if (data.loss !== undefined) target.loss = data.loss
    if (data.background !== undefined) target.background = data.background
    if (data.card !== undefined) target.card = data.card

    saveCustomSchemes(nextList)

    if (getActiveCustomSchemeId() === id && typeof document !== 'undefined') {
        applyColorSchemeToDom(target)
    }
    return target
}

/**
 * Ambil ID skema kustom yang sedang aktif.
 */
export function getActiveCustomSchemeId(): string | null {
    return memoryActiveSchemeId
}

/**
 * Simpan ID skema aktif dan terapkan ke DOM.
 */
export function setActiveCustomSchemeId(id: string | null): void {
    memoryActiveSchemeId = id || null
    persistThemesToBackend({ activeCustomColorSchemeId: memoryActiveSchemeId })

    if (typeof document !== 'undefined') {
        const scheme = memoryActiveSchemeId
            ? loadAllColorSchemes().find((s) => s.id === memoryActiveSchemeId) || null
            : null
        applyColorSchemeToDom(scheme)
    }
    notifyThemesUpdated()
}

/**
 * Injeksi variabel CSS langsung ke root document.
 */
export function applyColorSchemeToDom(scheme: CustomColorScheme | null): void {
    if (typeof document === 'undefined') return
    const root = document.documentElement

    if (!scheme) {
        root.style.removeProperty('--primary')
        root.style.removeProperty('--ring')
        root.style.removeProperty('--profit')
        root.style.removeProperty('--loss')
        root.style.removeProperty('--background')
        root.style.removeProperty('--card')
        return
    }

    if (scheme.primary) {
        root.style.setProperty('--primary', scheme.primary)
        root.style.setProperty('--ring', scheme.primary)
    }
    if (scheme.profit) {
        root.style.setProperty('--profit', scheme.profit)
    }
    if (scheme.loss) {
        root.style.setProperty('--loss', scheme.loss)
    }
    if (scheme.background) {
        root.style.setProperty('--background', scheme.background)
    }
    if (scheme.card) {
        root.style.setProperty('--card', scheme.card)
    }
}
