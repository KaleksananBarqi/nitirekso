/**
 * Konfigurasi dan Penyimpanan Terpusat untuk Kartu Share PnL.
 *
 * Mengelola preferensi avatar, handle, branding title/subtitle,
 * logo exchange, kode referral masing-masing exchange (MEXC & Bitunix),
 * template background, custom wallpaper, dan opsi teks adaptif.
 */

import { SharePnlErrorCode, logSharePnlError } from './shareErrorCodes'

export const EXCHANGES = ['mexc', 'bitunix', 'bybit', 'binance', 'bingx'] as const
export type ExchangeName = typeof EXCHANGES[number]

export interface BgTemplate {
    id: string
    label: string
    /** CSS value untuk background card */
    bg: string
    /** Warna aksen saat profit */
    accentProfit: string
    /** Warna aksen saat loss */
    accentLoss: string
    /** Warna teks sekunder / subteks */
    textSub: string
    /** Warna border card */
    border: string
    /** Mode transparan murni untuk export PNG tanpa backdrop solid */
    isTransparent: boolean
    /** Menandakan apakah skema ini kustom buatan pengguna */
    isCustom?: boolean
    /** Warna awal latar belakang (Hex) */
    bgStart?: string
    /** Warna akhir latar belakang (Hex) */
    bgEnd?: string
    /** Timestamp pembuatan */
    createdAt?: number
}

export const BG_TEMPLATES: BgTemplate[] = [
    {
        id: 'dark-navy',
        label: 'Dark Navy',
        bg: 'linear-gradient(145deg, #0d1117 0%, #0a0e1a 50%, #060912 100%)',
        accentProfit: '#38bdf8',
        accentLoss: '#f43f5e',
        textSub: 'rgba(255, 255, 255, 0.55)',
        border: 'rgba(255, 255, 255, 0.08)',
        isTransparent: false
    },
    {
        id: 'glass-transparent',
        label: 'Glass Transparan',
        bg: 'linear-gradient(135deg, rgba(15, 23, 42, 0.85) 0%, rgba(10, 15, 30, 0.9) 100%)',
        accentProfit: '#00f2fe',
        accentLoss: '#ff4b72',
        textSub: 'rgba(255, 255, 255, 0.65)',
        border: 'rgba(255, 255, 255, 0.18)',
        isTransparent: true
    },
    {
        id: 'cyberpunk',
        label: 'Cyberpunk',
        bg: 'radial-gradient(ellipse at 30% 20%, #1e0836 0%, #0a0014 60%, #000000 100%)',
        accentProfit: '#c084fc',
        accentLoss: '#fb7185',
        textSub: 'rgba(216, 180, 254, 0.6)',
        border: 'rgba(192, 132, 252, 0.25)',
        isTransparent: false
    },
    {
        id: 'emerald',
        label: 'Emerald Alpha',
        bg: 'linear-gradient(145deg, #064e3b 0%, #022c22 60%, #020617 100%)',
        accentProfit: '#34d399',
        accentLoss: '#f87171',
        textSub: 'rgba(167, 243, 208, 0.55)',
        border: 'rgba(52, 211, 153, 0.25)',
        isTransparent: false
    },
    {
        id: 'sunset',
        label: 'Sunset Horizon',
        bg: 'linear-gradient(145deg, #2e1065 0%, #1e0a30 40%, #0f172a 100%)',
        accentProfit: '#fbbf24',
        accentLoss: '#f43f5e',
        textSub: 'rgba(253, 224, 137, 0.55)',
        border: 'rgba(251, 191, 36, 0.25)',
        isTransparent: false
    },
    {
        id: 'obsidian',
        label: 'Obsidian Sleek',
        bg: 'linear-gradient(180deg, #18181b 0%, #09090b 60%, #000000 100%)',
        accentProfit: '#4ade80',
        accentLoss: '#f87171',
        textSub: 'rgba(255, 255, 255, 0.45)',
        border: 'rgba(255, 255, 255, 0.08)',
        isTransparent: false
    }
]

export type BgDimmingDirection = 'uniform' | 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left' | 'left' | 'right'

export const DIMMING_DIRECTION_OPTIONS: Array<{ value: BgDimmingDirection; label: string }> = [
    { value: 'uniform', label: 'Merata (Uniform)' },
    { value: 'top-right', label: 'Terang Kanan Atas (Gaya Exchange ⚡)' },
    { value: 'top-left', label: 'Terang Kiri Atas' },
    { value: 'bottom-right', label: 'Terang Kanan Bawah' },
    { value: 'bottom-left', label: 'Terang Kiri Bawah' },
    { value: 'left', label: 'Terang Sisi Kiri' },
    { value: 'right', label: 'Terang Sisi Kanan' }
]

export type ExportAspect = 'original' | '9:16'
export type FrameBgSource = 'card-blur' | 'wallpaper-blur' | 'solid'

export const ASPECT_PRESETS: Record<ExportAspect, { w: number; h: number; label: string; desc: string }> = {
    'original': { w: 1080, h: 0, label: 'Asli', desc: 'Rasio asli kartu dinamis' },
    '9:16': { w: 1080, h: 1920, label: 'TikTok 9:16', desc: 'Portrait 1080×1920 dengan overlay blur' }
}

export type VideoDurationMode = 'source' | '15' | '30' | '60'

export const VIDEO_DURATION_OPTIONS: Array<{ value: VideoDurationMode; label: string; desc: string }> = [
    { value: 'source', label: 'Sesuai Video Sumber', desc: 'Durasi penuh sesuai file video latar belakang' },
    { value: '15', label: '15 Detik', desc: 'Cocok untuk Story / video singkat' },
    { value: '30', label: '30 Detik', desc: 'Standar Reels & TikTok' },
    { value: '60', label: '60 Detik (1 Menit)', desc: 'Format video panjang' }
]

export const SHARE_STORAGE_KEYS = {
    AVATAR: 'trading_journal_share_avatar',
    HANDLE: 'trading_journal_share_handle',
    BRAND_TITLE: 'trading_journal_share_brand_title',
    BRAND_SUBTITLE: 'trading_journal_share_brand_subtitle',
    MEXC_LOGO: 'trading_journal_share_mexc_logo',
    MEXC_REF: 'trading_journal_share_mexc_referral',
    BITUNIX_LOGO: 'trading_journal_share_bitunix_logo',
    BITUNIX_REF: 'trading_journal_share_bitunix_referral',
    BYBIT_LOGO: 'trading_journal_share_bybit_logo',
    BYBIT_REF: 'trading_journal_share_bybit_referral',
    BINANCE_LOGO: 'trading_journal_share_binance_logo',
    BINANCE_REF: 'trading_journal_share_binance_referral',
    BINGX_LOGO: 'trading_journal_share_bingx_logo',
    BINGX_REF: 'trading_journal_share_bingx_referral',
    SHOW_REF: 'trading_journal_share_show_referral',
    BG_PRESET_ID: 'trading_journal_share_bg_preset_id',
    CUSTOM_BG: 'trading_journal_share_custom_bg',
    CUSTOM_BG_ID: 'trading_journal_share_custom_bg_id',
    CUSTOM_BG_LIST: 'trading_journal_share_custom_bg_list',
    IS_CUSTOM_BG: 'trading_journal_share_is_custom_bg',
    BG_DIMMING: 'trading_journal_share_bg_dimming',
    BG_DIMMING_DIRECTION: 'trading_journal_share_bg_dimming_direction',
    CUSTOM_BG_MEDIA_TYPE: 'trading_journal_share_custom_bg_media_type',
    FULL_TEXT: 'trading_journal_share_full_text',
    CUSTOM_TEMPLATES: 'trading_journal_share_custom_templates',
    CUSTOM_COLOR_SCHEMES: 'trading_journal_share_custom_color_schemes',
    ACTIVE_TEMPLATE_ID: 'trading_journal_share_active_template_id',
    SHOW_TRADE_TIMES: 'trading_journal_share_show_trade_times',
    BG_POS_X: 'trading_journal_share_bg_pos_x',
    BG_POS_Y: 'trading_journal_share_bg_pos_y',
    EXPORT_ASPECT: 'trading_journal_share_export_aspect',
    FRAME_BG_SOURCE: 'trading_journal_share_frame_bg_source',
    FRAME_BLUR: 'trading_journal_share_frame_blur',
    FRAME_DIM: 'trading_journal_share_frame_dim',
    CAPTION_PRESET_ID: 'trading_journal_share_caption_preset_id',
    CAPTION_CUSTOM_TEMPLATES: 'trading_journal_share_caption_custom_templates',
    VIDEO_DURATION_MODE: 'trading_journal_share_video_duration_mode'
} as const

export interface ShareSettings {
    avatarUrl: string | null
    traderHandle: string
    brandTitle: string
    brandSubtitle: string
    mexcLogoUrl: string | null
    mexcReferralCode: string
    bitunixLogoUrl: string | null
    bitunixReferralCode: string
    bybitLogoUrl: string | null
    bybitReferralCode: string
    binanceLogoUrl: string | null
    binanceReferralCode: string
    bingxLogoUrl: string | null
    bingxReferralCode: string
    showReferral: boolean
    bgPresetId: string
    customBgId: string | null
    customBgUrl: string | null
    isCustomBg: boolean
    bgDimming: number
    bgDimmingDirection: BgDimmingDirection
    customBgMediaType: 'image' | 'video'
    bgPosX: number // 0 - 100% (default 50)
    bgPosY: number // 0 - 100% (default 50)
    showFullText: boolean
    showTradeTimes: boolean
    exportAspect: ExportAspect
    frameBgSource: FrameBgSource
    frameBlur: number
    frameDim: number
    captionPresetId: string
    videoDurationMode: VideoDurationMode
}

/** Item Gambar/Video Wallpaper Kustom di Galeri Pengguna */
export interface CustomBgItem {
    id: string
    name: string
    dataUrl: string
    blob?: Blob
    blobUrl?: string
    createdAt: number
    mediaType?: 'image' | 'video'
    posX?: number // Posisi default X (%)
    posY?: number // Posisi default Y (%)
    bgPosX?: number // Posisi default X (%)
    bgPosY?: number // Posisi default Y (%)
}

/** Struktur Template Desain Kartu Share PnL */
export interface ShareCardTemplate {
    id: string
    name: string
    isBuiltin?: boolean
    // Background & Wallpaper
    bgPresetId: string
    customBgId?: string | null // ID background kustom yang ditautkan ke template ini
    isCustomBg: boolean
    bgDimming: number
    bgDimmingDirection?: BgDimmingDirection
    bgPosX?: number
    bgPosY?: number
    // Aspect Frame Video & Caption
    exportAspect?: ExportAspect
    frameBgSource?: FrameBgSource
    frameBlur?: number
    frameDim?: number
    captionPresetId?: string
    videoDurationMode?: VideoDurationMode
    // Visibility Toggles
    showSide: boolean
    showPnl: boolean          // Toggle profit USD
    showRoi: boolean
    showTradeTimes: boolean   // Toggle waktu entry & exit
    showDuration: boolean
    showProfile: boolean
    showWatermark: boolean
    showPlan: boolean
    showSetup: boolean
    showGrade: boolean
    showEmotion: boolean
    showReferral: boolean
    showThesis: boolean
    showReview: boolean
    showFullText: boolean
    createdAt?: number
    updatedAt?: number
}

/** Template Bawaan (Built-in Presets) */
export const BUILTIN_TEMPLATES: ShareCardTemplate[] = [
    {
        id: 'default-pro',
        name: 'Standar Pro',
        isBuiltin: true,
        bgPresetId: 'dark-navy',
        isCustomBg: false,
        bgDimming: 75,
        showSide: true,
        showPnl: true,
        showRoi: true,
        showTradeTimes: true,
        showDuration: true,
        showProfile: true,
        showWatermark: true,
        showPlan: true,
        showSetup: true,
        showGrade: true,
        showEmotion: true,
        showReferral: true,
        showThesis: true,
        showReview: true,
        showFullText: true
    },
    {
        id: 'privacy-no-usd',
        name: 'Privasi (Tanpa USD)',
        isBuiltin: true,
        bgPresetId: 'emerald',
        isCustomBg: false,
        bgDimming: 75,
        showSide: true,
        showPnl: false, // Sembunyikan profit USD untuk privasi
        showRoi: true,
        showTradeTimes: true,
        showDuration: true,
        showProfile: true,
        showWatermark: true,
        showPlan: true,
        showSetup: true,
        showGrade: true,
        showEmotion: true,
        showReferral: true,
        showThesis: false,
        showReview: false,
        showFullText: false
    },
    {
        id: 'thesis-review',
        name: 'Edukasi & Thesis',
        isBuiltin: true,
        bgPresetId: 'sunset',
        isCustomBg: false,
        bgDimming: 75,
        showSide: true,
        showPnl: true,
        showRoi: true,
        showTradeTimes: true,
        showDuration: true,
        showProfile: true,
        showWatermark: true,
        showPlan: true,
        showSetup: true,
        showGrade: true,
        showEmotion: true,
        showReferral: true,
        showThesis: true,
        showReview: true,
        showFullText: true
    },
    {
        id: 'glass-sticker',
        name: 'Transparan Sticker',
        isBuiltin: true,
        bgPresetId: 'glass-transparent',
        isCustomBg: false,
        bgDimming: 75,
        showSide: true,
        showPnl: true,
        showRoi: true,
        showTradeTimes: true,
        showDuration: true,
        showProfile: true,
        showWatermark: true,
        showPlan: false,
        showSetup: true,
        showGrade: true,
        showEmotion: false,
        showReferral: true,
        showThesis: false,
        showReview: false,
        showFullText: false
    }
]

/** Membaca seluruh skema warna kartu share kustom yang disimpan oleh pengguna */
export function loadCustomShareColorSchemes(): BgTemplate[] {
    try {
        const raw = localStorage.getItem(SHARE_STORAGE_KEYS.CUSTOM_COLOR_SCHEMES)
        if (!raw) return []
        const parsed = JSON.parse(raw)
        return Array.isArray(parsed) ? parsed : []
    } catch {
        return []
    }
}

/** Menggabungkan template bawaan dengan skema warna kustom pengguna */
export function getAllBgTemplates(): BgTemplate[] {
    const custom = loadCustomShareColorSchemes()
    return [...BG_TEMPLATES, ...custom]
}

/** Menyimpan atau memperbarui skema warna kartu share kustom */
export function saveCustomShareColorScheme(scheme: {
    id?: string
    label: string
    bgStart: string
    bgEnd: string
    accentProfit: string
    accentLoss: string
    border?: string
    textSub?: string
    isTransparent?: boolean
}): BgTemplate {
    const list = loadCustomShareColorSchemes()
    const now = Date.now()
    const id = scheme.id || `custom_color_${now}_${Math.random().toString(36).slice(2, 6)}`
    const isTransparent = !!scheme.isTransparent

    const bgCss = isTransparent
        ? `linear-gradient(135deg, ${scheme.bgStart} 0%, ${scheme.bgEnd} 100%)`
        : `linear-gradient(145deg, ${scheme.bgStart} 0%, ${scheme.bgEnd} 100%)`

    const newScheme: BgTemplate = {
        id,
        label: scheme.label.trim() || 'Skema Kustom',
        bg: bgCss,
        accentProfit: scheme.accentProfit,
        accentLoss: scheme.accentLoss,
        border: scheme.border || `${scheme.accentProfit}44`,
        textSub: scheme.textSub || 'rgba(255, 255, 255, 0.65)',
        isTransparent,
        isCustom: true,
        bgStart: scheme.bgStart,
        bgEnd: scheme.bgEnd,
        createdAt: now
    }

    const existingIdx = list.findIndex((s) => s.id === id)
    let updated: BgTemplate[]
    if (existingIdx >= 0) {
        updated = [...list]
        updated[existingIdx] = newScheme
    } else {
        updated = [...list, newScheme]
    }

    localStorage.setItem(SHARE_STORAGE_KEYS.CUSTOM_COLOR_SCHEMES, JSON.stringify(updated))
    return newScheme
}

/** Memperbarui skema warna kartu share kustom */
export function updateCustomShareColorScheme(
    id: string,
    updates: Partial<Omit<BgTemplate, 'id' | 'isBuiltin'>>
): BgTemplate | null {
    const list = loadCustomShareColorSchemes()
    const target = list.find((s) => s.id === id)
    if (!target) return null

    if (updates.label !== undefined) target.label = updates.label.trim() || target.label
    if (updates.bgStart !== undefined) target.bgStart = updates.bgStart
    if (updates.bgEnd !== undefined) target.bgEnd = updates.bgEnd
    if (updates.accentProfit !== undefined) target.accentProfit = updates.accentProfit
    if (updates.accentLoss !== undefined) target.accentLoss = updates.accentLoss
    if (updates.border !== undefined) target.border = updates.border
    if (updates.textSub !== undefined) target.textSub = updates.textSub
    if (updates.isTransparent !== undefined) target.isTransparent = updates.isTransparent

    if (target.bgStart && target.bgEnd) {
        target.bg = `linear-gradient(145deg, ${target.bgStart} 0%, ${target.bgEnd} 100%)`
    }

    localStorage.setItem(SHARE_STORAGE_KEYS.CUSTOM_COLOR_SCHEMES, JSON.stringify(list))
    return target
}

/** Memperbarui wallpaper kustom (nama, posX, posY) */
export function updateCustomBgItem(
    id: string,
    updates: Partial<Omit<CustomBgItem, 'id' | 'dataUrl' | 'createdAt'>>
): CustomBgItem | null {
    const list = loadCustomBgList()
    const target = list.find((b) => b.id === id)
    if (!target) return null

    if (updates.name !== undefined) target.name = updates.name.trim() || target.name
    if (updates.mediaType !== undefined) target.mediaType = updates.mediaType
    if (updates.posX !== undefined || updates.bgPosX !== undefined) {
        const val = updates.bgPosX ?? updates.posX
        target.posX = val
        target.bgPosX = val
    }
    if (updates.posY !== undefined || updates.bgPosY !== undefined) {
        const val = updates.bgPosY ?? updates.posY
        target.posY = val
        target.bgPosY = val
    }

    saveCustomBgList(list)
    return target
}

/** Memperbarui template kustom */
export function updateCustomShareTemplate(
    id: string,
    updates: Partial<Omit<ShareCardTemplate, 'id' | 'isBuiltin'>>
): ShareCardTemplate | null {
    const list = loadCustomShareTemplates()
    const target = list.find((t) => t.id === id)
    if (!target) return null

    Object.assign(target, updates)
    target.updatedAt = Date.now()

    localStorage.setItem(SHARE_STORAGE_KEYS.CUSTOM_TEMPLATES, JSON.stringify(list))
    return target
}

/** Menghapus skema warna kartu share kustom berdasarkan ID */
export function deleteCustomShareColorScheme(id: string): boolean {
    const list = loadCustomShareColorSchemes()
    const filtered = list.filter((s) => s.id !== id)
    if (filtered.length === list.length) return false
    localStorage.setItem(SHARE_STORAGE_KEYS.CUSTOM_COLOR_SCHEMES, JSON.stringify(filtered))
    return true
}

/** Membaca seluruh template kustom yang disimpan oleh pengguna */
export function loadCustomShareTemplates(): ShareCardTemplate[] {
    try {
        const raw = localStorage.getItem(SHARE_STORAGE_KEYS.CUSTOM_TEMPLATES)
        if (!raw) return []
        const parsed = JSON.parse(raw)
        return Array.isArray(parsed) ? parsed : []
    } catch {
        return []
    }
}

/** Menggabungkan template bawaan dengan template kustom pengguna */
export function getAllShareTemplates(): ShareCardTemplate[] {
    const custom = loadCustomShareTemplates()
    return [...BUILTIN_TEMPLATES, ...custom]
}

/** Mencari template berdasarkan ID */
export function getShareTemplateById(id: string): ShareCardTemplate | null {
    const all = getAllShareTemplates()
    return all.find((t) => t.id === id) || null
}

/** Menyimpan atau memperbarui template kustom */
export function saveCustomShareTemplate(template: Omit<ShareCardTemplate, 'id'> & { id?: string }): ShareCardTemplate {
    const custom = loadCustomShareTemplates()
    const now = Date.now()
    const templateId = template.id || `custom_${now}_${Math.random().toString(36).slice(2, 7)}`

    const existingIndex = custom.findIndex((t) => t.id === templateId)
    const newTemplate: ShareCardTemplate = {
        ...template,
        id: templateId,
        isBuiltin: false,
        updatedAt: now,
        createdAt: existingIndex >= 0 ? (custom[existingIndex]?.createdAt || now) : now
    }

    let updatedList: ShareCardTemplate[]
    if (existingIndex >= 0) {
        updatedList = [...custom]
        updatedList[existingIndex] = newTemplate
    } else {
        updatedList = [...custom, newTemplate]
    }

    localStorage.setItem(SHARE_STORAGE_KEYS.CUSTOM_TEMPLATES, JSON.stringify(updatedList))
    return newTemplate
}

/** Menghapus template kustom berdasarkan ID */
export function deleteCustomShareTemplate(id: string): boolean {
    const custom = loadCustomShareTemplates()
    const filtered = custom.filter((t) => t.id !== id)
    if (filtered.length === custom.length) return false
    localStorage.setItem(SHARE_STORAGE_KEYS.CUSTOM_TEMPLATES, JSON.stringify(filtered))
    if (getActiveTemplateId() === id) {
        setActiveTemplateId(BUILTIN_TEMPLATES[0]!.id)
    }
    return true
}

/** Membaca ID template aktif yang terpilih */
export function getActiveTemplateId(): string {
    return localStorage.getItem(SHARE_STORAGE_KEYS.ACTIVE_TEMPLATE_ID) || BUILTIN_TEMPLATES[0]!.id
}

/** Menyimpan ID template aktif */
export function setActiveTemplateId(id: string): void {
    localStorage.setItem(SHARE_STORAGE_KEYS.ACTIVE_TEMPLATE_ID, id)
}

/**
 * Mendeteksi secara andal apakah sebuah item media adalah 'image' atau 'video'
 * berdasarkan mediaType eksplisit atau pola URL/DataURL.
 */
export function resolveMediaType(
    mediaType?: 'image' | 'video',
    dataUrl?: string | null,
    fallback: 'image' | 'video' = 'image'
): 'image' | 'video' {
    if (dataUrl) {
        if (dataUrl.startsWith('data:video/') || /\.(mp4|webm|mov|ogg)(\?.*)?$/i.test(dataUrl)) {
            return 'video'
        }
        if (dataUrl.startsWith('data:image/') || /\.(png|jpe?g|webp|svg|gif|avif)(\?.*)?$/i.test(dataUrl)) {
            return 'image'
        }
    }
    if (mediaType === 'video' || mediaType === 'image') {
        return mediaType
    }
    return fallback
}

/**
 * Mengonversi string Base64 Data URL menjadi objek Blob biner.
 */
export function dataUrlToBlob(dataUrl: string): Blob {
    const commaIdx = dataUrl.indexOf(',')
    const meta = commaIdx >= 0 ? dataUrl.slice(5, commaIdx) : ''
    const b64 = commaIdx >= 0 ? dataUrl.slice(commaIdx + 1) : dataUrl
    const mimeMatch = meta.match(/^(.*?)(;base64)?$/)
    const mime = (mimeMatch && mimeMatch[1]) ? mimeMatch[1] : 'video/mp4'
    const binary = atob(b64.replace(/\s/g, ''))
    const len = binary.length
    const bytes = new Uint8Array(len)
    for (let i = 0; i < len; i++) {
        bytes[i] = binary.charCodeAt(i)
    }
    return new Blob([bytes], { type: mime })
}

const playableBlobUrlCache = new Map<string, string>()

/**
 * Mengembalikan URL media yang dijamin dapat diputar oleh elemen <video> di Chromium/WebView2/Tauri.
 * Jika URL adalah data:video/..., URL otomatis dikonversi menjadi Blob URL agar browser dapat
 * melakukan byte-range streaming dan seeking secara mulus tanpa freezing/black screen.
 */
export function getPlayableMediaUrl(rawUrl: string | null | undefined, mediaType?: 'image' | 'video'): string | null {
    if (!rawUrl) return null
    if (mediaType !== 'video' && !rawUrl.startsWith('data:video/')) {
        return rawUrl
    }
    // Jika sudah berupa blob: atau http: atau https:, gunakan langsung
    if (rawUrl.startsWith('blob:') || rawUrl.startsWith('http://') || rawUrl.startsWith('https://')) {
        return rawUrl
    }
    // Jika berupa data: URL, konversi menjadi Blob URL
    if (rawUrl.startsWith('data:')) {
        const cached = playableBlobUrlCache.get(rawUrl)
        if (cached) return cached
        try {
            const blob = dataUrlToBlob(rawUrl)
            const objUrl = URL.createObjectURL(blob)
            playableBlobUrlCache.set(rawUrl, objUrl)
            return objUrl
        } catch (e) {
            console.warn('[shareSettings] Gagal konversi video data URL ke Blob URL:', e)
            return rawUrl
        }
    }
    return rawUrl
}

// ---------------------------------------------------------------------------
// Penyimpanan Media Kustom Berkapasitas Besar (Memory Cache + IndexedDB + LocalStorage)
// ---------------------------------------------------------------------------

let memoryBgList: CustomBgItem[] | null = null
const IDB_NAME = 'nitirekso_media_v1'
const IDB_STORE = 'custom_bg'

function openMediaDb(): Promise<IDBDatabase | null> {
    if (typeof window === 'undefined' || !window.indexedDB) return Promise.resolve(null)
    return new Promise((resolve) => {
        try {
            const req = window.indexedDB.open(IDB_NAME, 1)
            req.onupgradeneeded = () => {
                const db = req.result
                if (!db.objectStoreNames.contains(IDB_STORE)) {
                    db.createObjectStore(IDB_STORE, { keyPath: 'id' })
                }
            }
            req.onsuccess = () => resolve(req.result)
            req.onerror = () => resolve(null)
        } catch {
            resolve(null)
        }
    })
}

/** Inisialisasi dan baca wallpaper kustom berukuran besar dari IndexedDB */
export async function initIndexedDbCustomBg(): Promise<CustomBgItem[]> {
    const db = await openMediaDb()
    if (!db) return loadCustomBgList()
    return new Promise((resolve) => {
        try {
            const tx = db.transaction(IDB_STORE, 'readonly')
            const store = tx.objectStore(IDB_STORE)
            const req = store.getAll()
            req.onsuccess = () => {
                const idbList = req.result as CustomBgItem[]
                if (Array.isArray(idbList) && idbList.length > 0) {
                    const localList = loadCustomBgList()
                    // Gabungkan item dari IndexedDB dan localStorage tanpa duplikasi
                    const mergedMap = new Map<string, CustomBgItem>()
                    for (const item of localList) {
                        mergedMap.set(item.id, item)
                    }
                    for (const item of idbList) {
                        const mType = resolveMediaType(item.mediaType, item.dataUrl, 'image')
                        let activeUrl = item.dataUrl
                        if (mType === 'video') {
                            if (item.blob) {
                                activeUrl = URL.createObjectURL(item.blob)
                            } else if (item.dataUrl && item.dataUrl.startsWith('data:')) {
                                activeUrl = getPlayableMediaUrl(item.dataUrl, 'video') || item.dataUrl
                            }
                        }
                        mergedMap.set(item.id, {
                            ...item,
                            mediaType: mType,
                            dataUrl: activeUrl,
                            blobUrl: mType === 'video' ? activeUrl : undefined
                        })
                    }
                    memoryBgList = Array.from(mergedMap.values())
                    resolve(memoryBgList)
                } else {
                    resolve(loadCustomBgList())
                }
            }
            req.onerror = () => resolve(loadCustomBgList())
        } catch {
            resolve(loadCustomBgList())
        }
    })
}

async function persistToIndexedDb(item: CustomBgItem): Promise<void> {
    const db = await openMediaDb()
    if (!db) return
    try {
        const tx = db.transaction(IDB_STORE, 'readwrite')
        tx.objectStore(IDB_STORE).put(item)
    } catch (e) {
        logSharePnlError(
            SharePnlErrorCode.STORAGE_PERSIST_FAILED,
            `Gagal menyimpan wallpaper "${item.name}" ke IndexedDB`,
            e,
            'WARN'
        )
    }
}

async function removeFromIndexedDb(id: string): Promise<void> {
    const db = await openMediaDb()
    if (!db) return
    try {
        const tx = db.transaction(IDB_STORE, 'readwrite')
        tx.objectStore(IDB_STORE).delete(id)
    } catch (e) {
        logSharePnlError(
            SharePnlErrorCode.STORAGE_PERSIST_FAILED,
            `Gagal menghapus wallpaper ID "${id}" dari IndexedDB`,
            e,
            'WARN'
        )
    }
}

/** Membaca seluruh gambar/video background kustom dari cache memori & localStorage */
export function loadCustomBgList(): CustomBgItem[] {
    if (memoryBgList !== null && memoryBgList.length > 0) {
        return memoryBgList
    }

    try {
        const raw = localStorage.getItem(SHARE_STORAGE_KEYS.CUSTOM_BG_LIST)
        let list: CustomBgItem[] = raw ? JSON.parse(raw) : []
        if (!Array.isArray(list)) list = []

        // Normalisasi setiap item agar selalu memiliki mediaType dan URL yang dapat diputar
        list = list.map((item) => {
            const mType = resolveMediaType(item.mediaType, item.dataUrl, 'image')
            const playableUrl = (mType === 'video' && item.dataUrl && item.dataUrl.startsWith('data:'))
                ? (getPlayableMediaUrl(item.dataUrl, 'video') || item.dataUrl)
                : item.dataUrl
            return {
                ...item,
                mediaType: mType,
                dataUrl: playableUrl,
                blobUrl: mType === 'video' ? playableUrl : undefined
            }
        })

        // Migrasi data lama jika CUSTOM_BG ada tapi list belum terisi
        const legacyBg = localStorage.getItem(SHARE_STORAGE_KEYS.CUSTOM_BG)
        if (legacyBg && list.length === 0) {
            const legacyType = resolveMediaType(undefined, legacyBg, 'image')
            const playableLegacy = (legacyType === 'video' && legacyBg.startsWith('data:'))
                ? (getPlayableMediaUrl(legacyBg, 'video') || legacyBg)
                : legacyBg
            const legacyItem: CustomBgItem = {
                id: `bg_${Date.now()}_default`,
                name: 'Wallpaper Kustom 1',
                dataUrl: playableLegacy,
                createdAt: Date.now(),
                mediaType: legacyType,
                blobUrl: legacyType === 'video' ? playableLegacy : undefined
            }
            list = [legacyItem]
            try {
                localStorage.setItem(SHARE_STORAGE_KEYS.CUSTOM_BG_LIST, JSON.stringify(list))
                localStorage.setItem(SHARE_STORAGE_KEYS.CUSTOM_BG_ID, legacyItem.id)
            } catch {
                // Abaikan jika quota storage terlampaui
            }
        }

        memoryBgList = list
        return list
    } catch {
        return []
    }
}

/** Menyimpan seluruh daftar background kustom ke memory, localStorage, dan IndexedDB */
export function saveCustomBgList(list: CustomBgItem[]): void {
    memoryBgList = list
    try {
        // Jangan sertakan dataUrl raksasa base64 di localStorage untuk video
        const cleanForLocal = list.map((item) => {
            if (item.mediaType === 'video' && item.dataUrl && item.dataUrl.length > 500) {
                return { ...item, dataUrl: '' }
            }
            return item
        })
        localStorage.setItem(SHARE_STORAGE_KEYS.CUSTOM_BG_LIST, JSON.stringify(cleanForLocal))
    } catch (err) {
        logSharePnlError(
            SharePnlErrorCode.STORAGE_PERSIST_FAILED,
            'Ukuran daftar wallpaper melebihi kuota 5MB localStorage, persistensi diamankan via IndexedDB',
            err,
            'WARN'
        )
    }
}

/** Menambahkan background kustom baru ke galeri */
export function addCustomBgItem(item: {
    name: string
    dataUrl: string
    mediaType?: 'image' | 'video'
    blob?: Blob
    blobUrl?: string
}): CustomBgItem {
    const list = loadCustomBgList()
    const now = Date.now()
    const resolvedType = resolveMediaType(item.mediaType, item.dataUrl, 'image')
    const effectiveBlobUrl = item.blobUrl || (item.blob ? URL.createObjectURL(item.blob) : (resolvedType === 'video' ? getPlayableMediaUrl(item.dataUrl, 'video') || item.dataUrl : item.dataUrl))

    const newItem: CustomBgItem = {
        id: `bg_${now}_${Math.random().toString(36).slice(2, 7)}`,
        name: item.name.trim() || `${resolvedType === 'video' ? 'Video' : 'Wallpaper'} ${list.length + 1}`,
        dataUrl: effectiveBlobUrl,
        blob: item.blob,
        blobUrl: resolvedType === 'video' ? effectiveBlobUrl : undefined,
        createdAt: now,
        mediaType: resolvedType
    }
    const updated = [newItem, ...list]
    memoryBgList = updated
    saveCustomBgList(updated)
    void persistToIndexedDb(newItem)

    try {
        // Jangan simpan string base64 raksasa ke localStorage jika video
        if (resolvedType !== 'video') {
            localStorage.setItem(SHARE_STORAGE_KEYS.CUSTOM_BG, newItem.dataUrl)
        }
        localStorage.setItem(SHARE_STORAGE_KEYS.CUSTOM_BG_ID, newItem.id)
        localStorage.setItem(SHARE_STORAGE_KEYS.CUSTOM_BG_MEDIA_TYPE, newItem.mediaType || 'image')
    } catch {
        // Abaikan jika quota storage terlampaui oleh file video
    }
    return newItem
}

/** Mengubah nama label background kustom */
export function updateCustomBgItemName(id: string, name: string): boolean {
    const list = loadCustomBgList()
    const target = list.find((b) => b.id === id)
    if (!target) return false
    target.name = name.trim() || target.name
    saveCustomBgList(list)
    void persistToIndexedDb(target)
    return true
}

/** Menghapus background kustom dari galeri */
export function deleteCustomBgItem(id: string): boolean {
    const list = loadCustomBgList()
    const filtered = list.filter((b) => b.id !== id)
    if (filtered.length === list.length) return false
    memoryBgList = filtered
    saveCustomBgList(filtered)
    void removeFromIndexedDb(id)

    // Jika background yang dihapus adalah yang aktif, sesuaikan
    const currentActiveBgId = localStorage.getItem(SHARE_STORAGE_KEYS.CUSTOM_BG_ID)
    if (currentActiveBgId === id) {
        if (filtered.length > 0) {
            localStorage.setItem(SHARE_STORAGE_KEYS.CUSTOM_BG_ID, filtered[0]!.id)
            try {
                localStorage.setItem(SHARE_STORAGE_KEYS.CUSTOM_BG, filtered[0]!.dataUrl)
            } catch {}
        } else {
            localStorage.removeItem(SHARE_STORAGE_KEYS.CUSTOM_BG_ID)
            localStorage.removeItem(SHARE_STORAGE_KEYS.CUSTOM_BG)
            localStorage.setItem(SHARE_STORAGE_KEYS.IS_CUSTOM_BG, 'false')
        }
    }
    return true
}

/** Mengambil background kustom berdasarkan ID */
export function getCustomBgById(id: string): CustomBgItem | undefined {
    const list = loadCustomBgList()
    return list.find((b) => b.id === id)
}

/** Membaca seluruh pengaturan share dari localStorage dengan fallback default */
export function loadShareSettings(): ShareSettings {
    const bgList = loadCustomBgList()
    const storedBgId = localStorage.getItem(SHARE_STORAGE_KEYS.CUSTOM_BG_ID)
    const activeBgItem = (storedBgId && bgList.find((b) => b.id === storedBgId)) || bgList[0] || null

    return {
        avatarUrl: localStorage.getItem(SHARE_STORAGE_KEYS.AVATAR) || null,
        traderHandle: localStorage.getItem(SHARE_STORAGE_KEYS.HANDLE) || '@trader',
        brandTitle: (() => {
            const b = localStorage.getItem(SHARE_STORAGE_KEYS.BRAND_TITLE)
            return (!b || b === 'SHARENYA') ? 'NITIREKSO' : b
        })(),
        brandSubtitle: localStorage.getItem(SHARE_STORAGE_KEYS.BRAND_SUBTITLE) || 'JOURNAL',
        mexcLogoUrl: localStorage.getItem(SHARE_STORAGE_KEYS.MEXC_LOGO) || null,
        mexcReferralCode: localStorage.getItem(SHARE_STORAGE_KEYS.MEXC_REF) || '',
        bitunixLogoUrl: localStorage.getItem(SHARE_STORAGE_KEYS.BITUNIX_LOGO) || null,
        bitunixReferralCode: localStorage.getItem(SHARE_STORAGE_KEYS.BITUNIX_REF) || '',
        bybitLogoUrl: localStorage.getItem(SHARE_STORAGE_KEYS.BYBIT_LOGO) || null,
        bybitReferralCode: localStorage.getItem(SHARE_STORAGE_KEYS.BYBIT_REF) || '',
        binanceLogoUrl: localStorage.getItem(SHARE_STORAGE_KEYS.BINANCE_LOGO) || null,
        binanceReferralCode: localStorage.getItem(SHARE_STORAGE_KEYS.BINANCE_REF) || '',
        bingxLogoUrl: localStorage.getItem(SHARE_STORAGE_KEYS.BINGX_LOGO) || null,
        bingxReferralCode: localStorage.getItem(SHARE_STORAGE_KEYS.BINGX_REF) || '',
        showReferral: localStorage.getItem(SHARE_STORAGE_KEYS.SHOW_REF) !== 'false', // default true
        bgPresetId: localStorage.getItem(SHARE_STORAGE_KEYS.BG_PRESET_ID) || 'dark-navy',
        customBgId: activeBgItem ? activeBgItem.id : null,
        customBgUrl: activeBgItem ? activeBgItem.dataUrl : (localStorage.getItem(SHARE_STORAGE_KEYS.CUSTOM_BG) || null),
        isCustomBg: localStorage.getItem(SHARE_STORAGE_KEYS.IS_CUSTOM_BG) === 'true',
        bgDimming: (() => {
            const raw = localStorage.getItem(SHARE_STORAGE_KEYS.BG_DIMMING)
            return raw !== null && !isNaN(Number(raw)) ? Number(raw) : 75
        })(),
        bgDimmingDirection: (localStorage.getItem(SHARE_STORAGE_KEYS.BG_DIMMING_DIRECTION) as BgDimmingDirection) || 'uniform',
        customBgMediaType: activeBgItem
            ? resolveMediaType(activeBgItem.mediaType, activeBgItem.dataUrl, 'image')
            : resolveMediaType(
                (localStorage.getItem(SHARE_STORAGE_KEYS.CUSTOM_BG_MEDIA_TYPE) as 'image' | 'video') || undefined,
                localStorage.getItem(SHARE_STORAGE_KEYS.CUSTOM_BG),
                'image'
            ),
        bgPosX: localStorage.getItem(SHARE_STORAGE_KEYS.BG_POS_X) !== null ? Number(localStorage.getItem(SHARE_STORAGE_KEYS.BG_POS_X)) : (activeBgItem?.posX ?? 50),
        bgPosY: localStorage.getItem(SHARE_STORAGE_KEYS.BG_POS_Y) !== null ? Number(localStorage.getItem(SHARE_STORAGE_KEYS.BG_POS_Y)) : (activeBgItem?.posY ?? 50),
        showFullText: localStorage.getItem(SHARE_STORAGE_KEYS.FULL_TEXT) !== 'false', // default true
        showTradeTimes: localStorage.getItem(SHARE_STORAGE_KEYS.SHOW_TRADE_TIMES) !== 'false', // default true
        exportAspect: (localStorage.getItem(SHARE_STORAGE_KEYS.EXPORT_ASPECT) as ExportAspect) || '9:16',
        frameBgSource: (localStorage.getItem(SHARE_STORAGE_KEYS.FRAME_BG_SOURCE) as FrameBgSource) || 'card-blur',
        frameBlur: localStorage.getItem(SHARE_STORAGE_KEYS.FRAME_BLUR) !== null ? Number(localStorage.getItem(SHARE_STORAGE_KEYS.FRAME_BLUR)) : 25,
        frameDim: localStorage.getItem(SHARE_STORAGE_KEYS.FRAME_DIM) !== null ? Number(localStorage.getItem(SHARE_STORAGE_KEYS.FRAME_DIM)) : 40,
        captionPresetId: localStorage.getItem(SHARE_STORAGE_KEYS.CAPTION_PRESET_ID) || 'tiktok-jurnal',
        videoDurationMode: (localStorage.getItem(SHARE_STORAGE_KEYS.VIDEO_DURATION_MODE) as VideoDurationMode) || 'source'
    }
}

/** Menyimpan seluruh atau sebagian pengaturan share ke localStorage */
export function saveShareSettings(settings: Partial<ShareSettings>): void {
    if (settings.avatarUrl !== undefined) {
        if (settings.avatarUrl) localStorage.setItem(SHARE_STORAGE_KEYS.AVATAR, settings.avatarUrl)
        else localStorage.removeItem(SHARE_STORAGE_KEYS.AVATAR)
    }
    if (settings.traderHandle !== undefined) {
        localStorage.setItem(SHARE_STORAGE_KEYS.HANDLE, settings.traderHandle)
    }
    if (settings.brandTitle !== undefined) {
        localStorage.setItem(SHARE_STORAGE_KEYS.BRAND_TITLE, settings.brandTitle)
    }
    if (settings.brandSubtitle !== undefined) {
        localStorage.setItem(SHARE_STORAGE_KEYS.BRAND_SUBTITLE, settings.brandSubtitle)
    }
    if (settings.mexcLogoUrl !== undefined) {
        if (settings.mexcLogoUrl) localStorage.setItem(SHARE_STORAGE_KEYS.MEXC_LOGO, settings.mexcLogoUrl)
        else localStorage.removeItem(SHARE_STORAGE_KEYS.MEXC_LOGO)
    }
    if (settings.mexcReferralCode !== undefined) {
        localStorage.setItem(SHARE_STORAGE_KEYS.MEXC_REF, settings.mexcReferralCode)
    }
    if (settings.bitunixLogoUrl !== undefined) {
        if (settings.bitunixLogoUrl) localStorage.setItem(SHARE_STORAGE_KEYS.BITUNIX_LOGO, settings.bitunixLogoUrl)
        else localStorage.removeItem(SHARE_STORAGE_KEYS.BITUNIX_LOGO)
    }
    if (settings.bitunixReferralCode !== undefined) {
        localStorage.setItem(SHARE_STORAGE_KEYS.BITUNIX_REF, settings.bitunixReferralCode)
    }
    if (settings.bybitLogoUrl !== undefined) {
        if (settings.bybitLogoUrl) localStorage.setItem(SHARE_STORAGE_KEYS.BYBIT_LOGO, settings.bybitLogoUrl)
        else localStorage.removeItem(SHARE_STORAGE_KEYS.BYBIT_LOGO)
    }
    if (settings.bybitReferralCode !== undefined) {
        localStorage.setItem(SHARE_STORAGE_KEYS.BYBIT_REF, settings.bybitReferralCode)
    }
    if (settings.binanceLogoUrl !== undefined) {
        if (settings.binanceLogoUrl) localStorage.setItem(SHARE_STORAGE_KEYS.BINANCE_LOGO, settings.binanceLogoUrl)
        else localStorage.removeItem(SHARE_STORAGE_KEYS.BINANCE_LOGO)
    }
    if (settings.binanceReferralCode !== undefined) {
        localStorage.setItem(SHARE_STORAGE_KEYS.BINANCE_REF, settings.binanceReferralCode)
    }
    if (settings.bingxLogoUrl !== undefined) {
        if (settings.bingxLogoUrl) localStorage.setItem(SHARE_STORAGE_KEYS.BINGX_LOGO, settings.bingxLogoUrl)
        else localStorage.removeItem(SHARE_STORAGE_KEYS.BINGX_LOGO)
    }
    if (settings.bingxReferralCode !== undefined) {
        localStorage.setItem(SHARE_STORAGE_KEYS.BINGX_REF, settings.bingxReferralCode)
    }
    if (settings.showReferral !== undefined) {
        localStorage.setItem(SHARE_STORAGE_KEYS.SHOW_REF, String(settings.showReferral))
    }
    if (settings.bgPresetId !== undefined) {
        localStorage.setItem(SHARE_STORAGE_KEYS.BG_PRESET_ID, settings.bgPresetId)
    }
    if (settings.customBgId !== undefined) {
        if (settings.customBgId) localStorage.setItem(SHARE_STORAGE_KEYS.CUSTOM_BG_ID, settings.customBgId)
        else localStorage.removeItem(SHARE_STORAGE_KEYS.CUSTOM_BG_ID)
    }
    if (settings.customBgUrl !== undefined) {
        if (settings.customBgUrl) {
            try {
                localStorage.setItem(SHARE_STORAGE_KEYS.CUSTOM_BG, settings.customBgUrl)
            } catch {
                // Abaikan jika video kustom berukuran besar melebihi batas 5MB localStorage
            }
        } else {
            localStorage.removeItem(SHARE_STORAGE_KEYS.CUSTOM_BG)
        }
    }
    if (settings.isCustomBg !== undefined) {
        localStorage.setItem(SHARE_STORAGE_KEYS.IS_CUSTOM_BG, String(settings.isCustomBg))
    }
    if (settings.bgDimming !== undefined) {
        localStorage.setItem(SHARE_STORAGE_KEYS.BG_DIMMING, String(settings.bgDimming))
    }
    if (settings.bgDimmingDirection !== undefined) {
        localStorage.setItem(SHARE_STORAGE_KEYS.BG_DIMMING_DIRECTION, settings.bgDimmingDirection)
    }
    if (settings.customBgMediaType !== undefined) {
        localStorage.setItem(SHARE_STORAGE_KEYS.CUSTOM_BG_MEDIA_TYPE, settings.customBgMediaType)
    }
    if (settings.bgPosX !== undefined) {
        localStorage.setItem(SHARE_STORAGE_KEYS.BG_POS_X, String(settings.bgPosX))
    }
    if (settings.bgPosY !== undefined) {
        localStorage.setItem(SHARE_STORAGE_KEYS.BG_POS_Y, String(settings.bgPosY))
    }
    if (settings.showFullText !== undefined) {
        localStorage.setItem(SHARE_STORAGE_KEYS.FULL_TEXT, String(settings.showFullText))
    }
    if (settings.showTradeTimes !== undefined) {
        localStorage.setItem(SHARE_STORAGE_KEYS.SHOW_TRADE_TIMES, String(settings.showTradeTimes))
    }
    if (settings.exportAspect !== undefined) {
        localStorage.setItem(SHARE_STORAGE_KEYS.EXPORT_ASPECT, settings.exportAspect)
    }
    if (settings.frameBgSource !== undefined) {
        localStorage.setItem(SHARE_STORAGE_KEYS.FRAME_BG_SOURCE, settings.frameBgSource)
    }
    if (settings.frameBlur !== undefined) {
        localStorage.setItem(SHARE_STORAGE_KEYS.FRAME_BLUR, String(settings.frameBlur))
    }
    if (settings.frameDim !== undefined) {
        localStorage.setItem(SHARE_STORAGE_KEYS.FRAME_DIM, String(settings.frameDim))
    }
    if (settings.captionPresetId !== undefined) {
        localStorage.setItem(SHARE_STORAGE_KEYS.CAPTION_PRESET_ID, settings.captionPresetId)
    }
    if (settings.videoDurationMode !== undefined) {
        localStorage.setItem(SHARE_STORAGE_KEYS.VIDEO_DURATION_MODE, settings.videoDurationMode)
    }
}
