/**
 * Pengelola Skema Warna Kustom (Personalized Color Scheme).
 *
 * Mengizinkan pengguna membuat, menamai, menyimpan, dan menerapkan skema warna
 * kustom (Primary, Profit, Loss, Background, Card) secara dinamis ke variabel CSS.
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

const STORAGE_KEY = 'nitirekso_custom_color_schemes'
const ACTIVE_SCHEME_KEY = 'nitirekso_active_custom_color_scheme_id'

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

/**
 * Muat semua skema warna (preset bawaan + kustom buatan user).
 */
export function loadAllColorSchemes(): CustomColorScheme[] {
    try {
        const raw = localStorage.getItem(STORAGE_KEY)
        const custom: CustomColorScheme[] = raw ? JSON.parse(raw) : []
        return [...BUILTIN_SCHEMES, ...custom]
    } catch {
        return [...BUILTIN_SCHEMES]
    }
}

/**
 * Simpan daftar skema kustom buatan user.
 */
export function saveCustomSchemes(customSchemes: CustomColorScheme[]): void {
    const onlyCustom = customSchemes.filter((s) => !s.isBuiltin)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(onlyCustom))
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

    const all = loadAllColorSchemes()
    const nextCustom = [...all.filter((s) => !s.isBuiltin), newScheme]
    saveCustomSchemes(nextCustom)
    return newScheme
}

/**
 * Hapus skema kustom buatan user berdasarkan ID.
 */
export function deleteCustomColorScheme(id: string): void {
    const all = loadAllColorSchemes()
    const nextCustom = all.filter((s) => !s.isBuiltin && s.id !== id)
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
    const all = loadAllColorSchemes()
    const target = all.find((s) => !s.isBuiltin && s.id === id)
    if (!target) return null

    if (data.name !== undefined) target.name = data.name.trim() || target.name
    if (data.primary !== undefined) target.primary = data.primary
    if (data.profit !== undefined) target.profit = data.profit
    if (data.loss !== undefined) target.loss = data.loss
    if (data.background !== undefined) target.background = data.background
    if (data.card !== undefined) target.card = data.card

    saveCustomSchemes(all.filter((s) => !s.isBuiltin))

    if (getActiveCustomSchemeId() === id) {
        applyColorSchemeToDom(target)
    }
    return target
}

/**
 * Ambil ID skema kustom yang sedang aktif.
 */
export function getActiveCustomSchemeId(): string | null {
    return localStorage.getItem(ACTIVE_SCHEME_KEY) || null
}

/**
 * Simpan ID skema aktif dan terapkan ke DOM.
 */
export function setActiveCustomSchemeId(id: string | null): void {
    if (id) {
        localStorage.setItem(ACTIVE_SCHEME_KEY, id)
        const scheme = loadAllColorSchemes().find((s) => s.id === id) || null
        applyColorSchemeToDom(scheme)
    } else {
        localStorage.removeItem(ACTIVE_SCHEME_KEY)
        applyColorSchemeToDom(null)
    }
}

/**
 * Injeksi variabel CSS langsung ke root document.
 */
export function applyColorSchemeToDom(scheme: CustomColorScheme | null): void {
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
