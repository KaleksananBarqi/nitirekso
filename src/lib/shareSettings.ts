/**
 * Konfigurasi dan Penyimpanan Terpusat untuk Kartu Share PnL.
 *
 * Seluruh metadata & preferensi disimpan di Local Cache (SQLite `settings`)
 * dan aset biner (avatar, logo exchange, wallpaper gambar/video) disimpan
 * content-addressed via backend `media_assets` agar tersinkron penuh lewat Sync Vault.
 */

import type { MediaAssetKind } from '@shared/ipc-contract'
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

/** Kunci legacy WebStorage — hanya dipertahankan sebagai referensi migrasi satu kali. */
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
    bgPosX: number
    bgPosY: number
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
    mediaSha256?: string
    ext?: string
    mime?: string
    createdAt: number
    mediaType?: 'image' | 'video'
    posX?: number
    posY?: number
    bgPosX?: number
    bgPosY?: number
}

/** Metadata ringan wallpaper yang disimpan di SQLite `settings.shareCustomBgList` */
export interface StoredCustomBgMeta {
    id: string
    name: string
    mediaSha256?: string
    ext?: string
    mime?: string
    directUrl?: string
    createdAt: number
    mediaType?: 'image' | 'video'
    posX?: number
    posY?: number
    bgPosX?: number
    bgPosY?: number
}

/** Struktur Template Desain Kartu Share PnL */
export interface ShareCardTemplate {
    id: string
    name: string
    isBuiltin?: boolean
    bgPresetId: string
    customBgId?: string | null
    isCustomBg: boolean
    bgDimming: number
    bgDimmingDirection?: BgDimmingDirection
    bgPosX?: number
    bgPosY?: number
    exportAspect?: ExportAspect
    frameBgSource?: FrameBgSource
    frameBlur?: number
    frameDim?: number
    captionPresetId?: string
    videoDurationMode?: VideoDurationMode
    showSide: boolean
    showPnl: boolean
    showRoi: boolean
    showTradeTimes: boolean
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
        showPnl: false,
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

const MEDIA_URL_FIELDS = [
    'avatarUrl',
    'mexcLogoUrl',
    'bitunixLogoUrl',
    'bybitLogoUrl',
    'binanceLogoUrl',
    'bingxLogoUrl'
] as const

type MediaUrlField = typeof MEDIA_URL_FIELDS[number]

function createDefaultShareSettings(): ShareSettings {
    return {
        avatarUrl: null,
        traderHandle: '@trader',
        brandTitle: 'nitirekso',
        brandSubtitle: 'JOURNAL',
        mexcLogoUrl: null,
        mexcReferralCode: '',
        bitunixLogoUrl: null,
        bitunixReferralCode: '',
        bybitLogoUrl: null,
        bybitReferralCode: '',
        binanceLogoUrl: null,
        binanceReferralCode: '',
        bingxLogoUrl: null,
        bingxReferralCode: '',
        showReferral: true,
        bgPresetId: 'dark-navy',
        customBgId: null,
        customBgUrl: null,
        isCustomBg: false,
        bgDimming: 75,
        bgDimmingDirection: 'uniform',
        customBgMediaType: 'image',
        bgPosX: 50,
        bgPosY: 50,
        showFullText: true,
        showTradeTimes: true,
        exportAspect: '9:16',
        frameBgSource: 'card-blur',
        frameBlur: 25,
        frameDim: 40,
        captionPresetId: 'tiktok-jurnal',
        videoDurationMode: 'source'
    }
}

let memoryShareSettings: ShareSettings = createDefaultShareSettings()
let memoryMediaShaMap: Partial<Record<MediaUrlField, string>> = {}
let memoryCustomColorSchemes: BgTemplate[] = []
let memoryCustomTemplates: ShareCardTemplate[] = []
let memoryActiveTemplateId: string = BUILTIN_TEMPLATES[0]!.id
let memoryBgList: CustomBgItem[] | null = null
let inFlightHydration: Promise<CustomBgItem[]> | null = null
const objectUrlRegistry = new Map<string, string>()
const playableBlobUrlCache = new Map<string, string>()

function isEphemeralBlobUrl(url: string | null | undefined): boolean {
    return typeof url === 'string' && url.startsWith('blob:')
}

function isPersistentDirectUrl(url: string | null | undefined): boolean {
    return (
        typeof url === 'string' &&
        (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('/'))
    )
}

function getOrCreateObjectUrl(id: string, blob: Blob): string {
    const existing = objectUrlRegistry.get(id)
    if (existing) return existing
    const nextUrl = URL.createObjectURL(blob)
    objectUrlRegistry.set(id, nextUrl)
    return nextUrl
}

function revokeRegisteredObjectUrl(id: string): void {
    const existing = objectUrlRegistry.get(id)
    if (existing) {
        try {
            URL.revokeObjectURL(existing)
        } catch {
            // Abaikan
        }
        objectUrlRegistry.delete(id)
    }
}

function notifyShareUpdated(): void {
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
        try {
            window.dispatchEvent(new CustomEvent('share-settings:updated'))
        } catch {
            // Abaikan di non-DOM
        }
    }
}

function persistSettingsPatch(patch: Record<string, unknown>): void {
    if (typeof window !== 'undefined' && window.api?.setSettings) {
        void window.api.setSettings(patch).catch((err) => {
            logSharePnlError(
                SharePnlErrorCode.STORAGE_PERSIST_FAILED,
                'Gagal menyimpan pengaturan share ke Local Cache SQLite',
                err,
                'WARN'
            )
        })
    }
}

function buildSerializableShareSettingsPayload(): Record<string, unknown> {
    const copy: Record<string, unknown> = { ...memoryShareSettings }
    // Jangan pernah menulis URL blob:/data: raksasa ke JSON settings SQLite
    delete copy.customBgUrl
    for (const field of MEDIA_URL_FIELDS) {
        const val = memoryShareSettings[field]
        if (val && (val.startsWith('data:') || val.startsWith('blob:'))) {
            delete copy[field]
        }
    }
    copy.mediaShaByField = { ...memoryMediaShaMap }
    return copy
}

function buildStoredBgMetaList(list: CustomBgItem[]): StoredCustomBgMeta[] {
    return list.map((item) => ({
        id: item.id,
        name: item.name,
        mediaSha256: item.mediaSha256,
        ext: item.ext,
        mime: item.mime,
        directUrl: isPersistentDirectUrl(item.dataUrl) ? item.dataUrl : undefined,
        createdAt: item.createdAt,
        mediaType: item.mediaType,
        posX: item.posX,
        posY: item.posY,
        bgPosX: item.bgPosX,
        bgPosY: item.bgPosY
    }))
}

function extFromMime(mime: string, fallback = 'png'): string {
    const lower = mime.toLowerCase()
    if (lower.includes('png')) return 'png'
    if (lower.includes('jpeg') || lower.includes('jpg')) return 'jpg'
    if (lower.includes('webp')) return 'webp'
    if (lower.includes('gif')) return 'gif'
    if (lower.includes('svg')) return 'svg'
    if (lower.includes('mp4')) return 'mp4'
    if (lower.includes('webm')) return 'webm'
    return fallback
}

async function blobOrDataUrlToBytes(input: {
    blob?: Blob
    dataUrl?: string
    mediaType?: 'image' | 'video'
}): Promise<{ bytes: Uint8Array; ext: string; mime: string } | null> {
    if (input.blob instanceof Blob) {
        const buf = await input.blob.arrayBuffer()
        const mime = input.blob.type || (input.mediaType === 'video' ? 'video/mp4' : 'image/png')
        const fallbackExt = input.mediaType === 'video' ? 'mp4' : 'png'
        return {
            bytes: new Uint8Array(buf),
            ext: extFromMime(mime, fallbackExt),
            mime
        }
    }
    if (input.dataUrl && input.dataUrl.startsWith('data:')) {
        const blob = dataUrlToBlob(input.dataUrl)
        const buf = await blob.arrayBuffer()
        const mime = blob.type || 'image/png'
        return {
            bytes: new Uint8Array(buf),
            ext: extFromMime(mime),
            mime
        }
    }
    return null
}

/**
 * Mengunggah field media kecil (avatar / logo exchange) ke `media_assets` secara async
 * sehingga data biner ikut tersinkron melalui Sync Vault tanpa membebani tabel `settings`.
 */
async function uploadMediaUrlFieldToBackend(field: MediaUrlField, dataUrl: string): Promise<void> {
    if (typeof window === 'undefined' || !window.api?.saveMediaAsset) return
    try {
        const parsed = await blobOrDataUrlToBytes({ dataUrl, mediaType: 'image' })
        if (!parsed) return
        const kind: MediaAssetKind = field === 'avatarUrl' ? 'share_media' : 'exchange_logo'
        const res = await window.api.saveMediaAsset({
            kind,
            fileName: `${field}.${parsed.ext}`,
            data: parsed.bytes
        })
        if (res.ok && res.data) {
            memoryMediaShaMap[field] = res.data.sha256
            persistSettingsPatch({ shareSettings: buildSerializableShareSettingsPayload() })
        }
    } catch {
        // Non-fatal
    }
}

/** Mereset seluruh cache memori (digunakan saat pengujian unit / simulasi restart). */
export function resetCustomBgMemoryCache(): void {
    for (const id of Array.from(objectUrlRegistry.keys())) {
        revokeRegisteredObjectUrl(id)
    }
    memoryBgList = null
    inFlightHydration = null
    memoryShareSettings = createDefaultShareSettings()
    memoryMediaShaMap = {}
    memoryCustomColorSchemes = []
    memoryCustomTemplates = []
    memoryActiveTemplateId = BUILTIN_TEMPLATES[0]!.id
}

export function loadCustomShareColorSchemes(): BgTemplate[] {
    return [...memoryCustomColorSchemes]
}

export function getAllBgTemplates(): BgTemplate[] {
    return [...BG_TEMPLATES, ...memoryCustomColorSchemes]
}

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
    const updated = [...list]
    if (existingIdx >= 0) {
        updated[existingIdx] = newScheme
    } else {
        updated.push(newScheme)
    }

    memoryCustomColorSchemes = updated
    persistSettingsPatch({ shareCustomColorSchemes: updated })
    notifyShareUpdated()
    return newScheme
}

export function updateCustomShareColorScheme(
    id: string,
    updates: Partial<Omit<BgTemplate, 'id' | 'isBuiltin'>>
): BgTemplate | null {
    const list = memoryCustomColorSchemes.map((s) => ({ ...s }))
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

    memoryCustomColorSchemes = list
    persistSettingsPatch({ shareCustomColorSchemes: list })
    notifyShareUpdated()
    return target
}

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
    notifyShareUpdated()
    return target
}

export function updateCustomShareTemplate(
    id: string,
    updates: Partial<Omit<ShareCardTemplate, 'id' | 'isBuiltin'>>
): ShareCardTemplate | null {
    const list = memoryCustomTemplates.map((t) => ({ ...t }))
    const target = list.find((t) => t.id === id)
    if (!target) return null

    Object.assign(target, updates)
    target.updatedAt = Date.now()

    memoryCustomTemplates = list
    persistSettingsPatch({ shareCustomTemplates: list })
    notifyShareUpdated()
    return target
}

export function deleteCustomShareColorScheme(id: string): boolean {
    const filtered = memoryCustomColorSchemes.filter((s) => s.id !== id)
    if (filtered.length === memoryCustomColorSchemes.length) return false
    memoryCustomColorSchemes = filtered
    persistSettingsPatch({ shareCustomColorSchemes: filtered })
    notifyShareUpdated()
    return true
}

export function loadCustomShareTemplates(): ShareCardTemplate[] {
    return [...memoryCustomTemplates]
}

export function getAllShareTemplates(): ShareCardTemplate[] {
    return [...BUILTIN_TEMPLATES, ...memoryCustomTemplates]
}

export function getShareTemplateById(id: string): ShareCardTemplate | null {
    return getAllShareTemplates().find((t) => t.id === id) || null
}

export function saveCustomShareTemplate(
    template: Omit<ShareCardTemplate, 'id'> & { id?: string }
): ShareCardTemplate {
    const custom = [...memoryCustomTemplates]
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

    if (existingIndex >= 0) {
        custom[existingIndex] = newTemplate
    } else {
        custom.push(newTemplate)
    }

    memoryCustomTemplates = custom
    persistSettingsPatch({ shareCustomTemplates: custom })
    notifyShareUpdated()
    return newTemplate
}

export function deleteCustomShareTemplate(id: string): boolean {
    const filtered = memoryCustomTemplates.filter((t) => t.id !== id)
    if (filtered.length === memoryCustomTemplates.length) return false
    memoryCustomTemplates = filtered
    persistSettingsPatch({ shareCustomTemplates: filtered })
    if (getActiveTemplateId() === id) {
        setActiveTemplateId(BUILTIN_TEMPLATES[0]!.id)
    }
    notifyShareUpdated()
    return true
}

export function getActiveTemplateId(): string {
    return memoryActiveTemplateId || BUILTIN_TEMPLATES[0]!.id
}

export function setActiveTemplateId(id: string): void {
    memoryActiveTemplateId = id
    persistSettingsPatch({ shareActiveTemplateId: id })
    notifyShareUpdated()
}

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

export function getPlayableMediaUrl(
    rawUrl: string | null | undefined,
    mediaType?: 'image' | 'video'
): string | null {
    if (!rawUrl) return null
    if (mediaType !== 'video' && !rawUrl.startsWith('data:video/')) {
        return rawUrl
    }
    if (rawUrl.startsWith('blob:') || rawUrl.startsWith('http://') || rawUrl.startsWith('https://')) {
        return rawUrl
    }
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

/**
 * Menghidrasi seluruh konfigurasi Share Card dan media biner dari Local Cache SQLite (`settings`)
 * serta backend `media_assets` via IPC.
 */
export async function hydrateShareSettingsFromBackend(
    settingsOverride?: Record<string, unknown>
): Promise<CustomBgItem[]> {
    if (inFlightHydration) return inFlightHydration

    inFlightHydration = (async () => {
        try {
            let settings: Record<string, unknown> = settingsOverride ?? {}
            if (!settingsOverride && typeof window !== 'undefined' && window.api?.getSettings) {
                settings = (await window.api.getSettings()) as Record<string, unknown>
            }

            if (Array.isArray(settings.shareCustomColorSchemes)) {
                memoryCustomColorSchemes = settings.shareCustomColorSchemes as BgTemplate[]
            }
            if (Array.isArray(settings.shareCustomTemplates)) {
                memoryCustomTemplates = settings.shareCustomTemplates as ShareCardTemplate[]
            }
            if (typeof settings.shareActiveTemplateId === 'string' && settings.shareActiveTemplateId) {
                memoryActiveTemplateId = settings.shareActiveTemplateId
            }

            if (settings.shareSettings && typeof settings.shareSettings === 'object') {
                const raw = settings.shareSettings as Record<string, unknown>
                const defaults = createDefaultShareSettings()
                const shaMap =
                    raw.mediaShaByField && typeof raw.mediaShaByField === 'object'
                        ? (raw.mediaShaByField as Partial<Record<MediaUrlField, string>>)
                        : {}
                memoryMediaShaMap = { ...shaMap }

                const merged: ShareSettings = {
                    ...defaults,
                    ...(raw as Partial<ShareSettings>),
                    brandTitle:
                        !raw.brandTitle || raw.brandTitle === 'SHARENYA'
                            ? 'nitirekso'
                            : String(raw.brandTitle)
                }

                // Hidrasi aset logo/avatar dari media_assets via sha256
                if (typeof window !== 'undefined' && window.api?.getMediaAsset) {
                    for (const field of MEDIA_URL_FIELDS) {
                        const sha = memoryMediaShaMap[field]
                        if (sha) {
                            const res = await window.api.getMediaAsset(sha)
                            if (res.ok && res.data) {
                                merged[field] = res.data
                            }
                        }
                    }
                }
                memoryShareSettings = merged
            }

            // Hidrasi daftar wallpaper kustom dari metadata + media_assets
            const rawBgMeta = Array.isArray(settings.shareCustomBgList)
                ? (settings.shareCustomBgList as StoredCustomBgMeta[])
                : []
            const existingMemoryMap = new Map<string, CustomBgItem>()
            if (memoryBgList) {
                for (const item of memoryBgList) {
                    existingMemoryMap.set(item.id, item)
                }
            }

            const hydratedItems: CustomBgItem[] = []
            for (const meta of rawBgMeta) {
                const prev = existingMemoryMap.get(meta.id)
                const mType = resolveMediaType(meta.mediaType, prev?.dataUrl || meta.directUrl, 'image')

                if (prev && prev.dataUrl && !isEphemeralBlobUrl(prev.dataUrl)) {
                    hydratedItems.push({ ...prev, ...meta, mediaType: mType })
                    continue
                }
                if (prev && prev.blob instanceof Blob) {
                    const activeUrl = getOrCreateObjectUrl(meta.id, prev.blob)
                    hydratedItems.push({
                        ...prev,
                        ...meta,
                        mediaType: mType,
                        dataUrl: activeUrl,
                        blobUrl: mType === 'video' ? activeUrl : undefined
                    })
                    continue
                }

                if (meta.mediaSha256 && typeof window !== 'undefined' && window.api?.getMediaAsset) {
                    const res = await window.api.getMediaAsset(meta.mediaSha256)
                    if (res.ok && res.data) {
                        try {
                            const blob = dataUrlToBlob(res.data)
                            const objUrl = getOrCreateObjectUrl(meta.id, blob)
                            hydratedItems.push({
                                id: meta.id,
                                name: meta.name,
                                mediaSha256: meta.mediaSha256,
                                ext: meta.ext,
                                mime: meta.mime,
                                createdAt: meta.createdAt,
                                mediaType: mType,
                                posX: meta.posX,
                                posY: meta.posY,
                                bgPosX: meta.bgPosX,
                                bgPosY: meta.bgPosY,
                                blob,
                                dataUrl: objUrl,
                                blobUrl: mType === 'video' ? objUrl : undefined
                            })
                            continue
                        } catch {
                            hydratedItems.push({
                                id: meta.id,
                                name: meta.name,
                                mediaSha256: meta.mediaSha256,
                                ext: meta.ext,
                                mime: meta.mime,
                                createdAt: meta.createdAt,
                                mediaType: mType,
                                posX: meta.posX,
                                posY: meta.posY,
                                bgPosX: meta.bgPosX,
                                bgPosY: meta.bgPosY,
                                dataUrl: res.data
                            })
                            continue
                        }
                    }
                }

                if (meta.directUrl && isPersistentDirectUrl(meta.directUrl)) {
                    hydratedItems.push({
                        id: meta.id,
                        name: meta.name,
                        createdAt: meta.createdAt,
                        mediaType: mType,
                        posX: meta.posX,
                        posY: meta.posY,
                        bgPosX: meta.bgPosX,
                        bgPosY: meta.bgPosY,
                        dataUrl: meta.directUrl,
                        blobUrl: mType === 'video' ? meta.directUrl : undefined
                    })
                }
            }

            if (rawBgMeta.length > 0 || memoryBgList === null) {
                memoryBgList = hydratedItems
            }

            // Sinkronkan customBgUrl pada memoryShareSettings dengan wallpaper aktif
            const activeId = memoryShareSettings.customBgId
            const activeItem =
                (activeId && (memoryBgList || []).find((b) => b.id === activeId)) ||
                (memoryBgList || [])[0] ||
                null
            if (activeItem) {
                memoryShareSettings.customBgId = activeItem.id
                memoryShareSettings.customBgUrl = activeItem.dataUrl
                memoryShareSettings.customBgMediaType = resolveMediaType(
                    activeItem.mediaType,
                    activeItem.dataUrl,
                    'image'
                )
            }

            notifyShareUpdated()
            return memoryBgList || []
        } finally {
            inFlightHydration = null
        }
    })()

    return inFlightHydration
}

/** Alias kompatibilitas mundur — kini membaca dari Local Cache SQLite & backend media. */
export function initIndexedDbCustomBg(): Promise<CustomBgItem[]> {
    return hydrateShareSettingsFromBackend()
}

export function loadCustomBgList(): CustomBgItem[] {
    return memoryBgList ?? []
}

export function saveCustomBgList(list: CustomBgItem[]): void {
    memoryBgList = list
    persistSettingsPatch({ shareCustomBgList: buildStoredBgMetaList(list) })
}

export async function addCustomBgItem(item: {
    name: string
    dataUrl?: string
    mediaType?: 'image' | 'video'
    blob?: Blob
    blobUrl?: string
}): Promise<CustomBgItem> {
    const list = loadCustomBgList()
    const now = Date.now()
    const id = `bg_${now}_${Math.random().toString(36).slice(2, 7)}`
    const resolvedType = resolveMediaType(item.mediaType, item.dataUrl, 'image')

    let resolvedBlob = item.blob
    if (!(resolvedBlob instanceof Blob) && item.dataUrl && item.dataUrl.startsWith('data:')) {
        try {
            resolvedBlob = dataUrlToBlob(item.dataUrl)
        } catch {
            resolvedBlob = undefined
        }
    }

    let mediaSha256: string | undefined
    let ext: string | undefined
    let mime: string | undefined

    if (typeof window !== 'undefined' && window.api?.saveMediaAsset) {
        const binary = await blobOrDataUrlToBytes({
            blob: resolvedBlob,
            dataUrl: item.dataUrl,
            mediaType: resolvedType
        })
        if (binary) {
            const uploadRes = await window.api.saveMediaAsset({
                kind: 'share_media',
                fileName: `${item.name || 'wallpaper'}.${binary.ext}`,
                data: binary.bytes
            })
            if (!uploadRes.ok || !uploadRes.data) {
                throw new Error(uploadRes.error ?? 'Gagal menyimpan berkas media ke backend.')
            }
            mediaSha256 = uploadRes.data.sha256
            ext = uploadRes.data.ext
            mime = uploadRes.data.mime
        }
    }

    let effectiveUrl = item.dataUrl || ''
    if (resolvedBlob instanceof Blob) {
        effectiveUrl = getOrCreateObjectUrl(id, resolvedBlob)
    } else if (item.blobUrl) {
        effectiveUrl = item.blobUrl
    } else if (resolvedType === 'video' && effectiveUrl.startsWith('data:')) {
        effectiveUrl = getPlayableMediaUrl(effectiveUrl, 'video') || effectiveUrl
    }

    const newItem: CustomBgItem = {
        id,
        name:
            item.name.trim() ||
            `${resolvedType === 'video' ? 'Video' : 'Wallpaper'} ${list.length + 1}`,
        dataUrl: effectiveUrl,
        blob: resolvedBlob,
        blobUrl: resolvedType === 'video' ? effectiveUrl : undefined,
        mediaSha256,
        ext,
        mime,
        createdAt: now,
        mediaType: resolvedType
    }

    const updated = [newItem, ...list]
    saveCustomBgList(updated)

    saveShareSettings({
        customBgId: newItem.id,
        customBgMediaType: newItem.mediaType || 'image',
        customBgUrl: newItem.dataUrl
    })
    return newItem
}

export function updateCustomBgItemName(id: string, name: string): boolean {
    const list = loadCustomBgList()
    const target = list.find((b) => b.id === id)
    if (!target) return false
    target.name = name.trim() || target.name
    saveCustomBgList(list)
    notifyShareUpdated()
    return true
}

export function deleteCustomBgItem(id: string): boolean {
    const list = loadCustomBgList()
    const target = list.find((b) => b.id === id)
    if (!target) return false
    const filtered = list.filter((b) => b.id !== id)

    revokeRegisteredObjectUrl(id)
    saveCustomBgList(filtered)

    // Hapus berkas media di backend jika tidak lagi direferensikan item lain
    if (
        target.mediaSha256 &&
        !filtered.some((b) => b.mediaSha256 === target.mediaSha256) &&
        typeof window !== 'undefined' &&
        window.api?.deleteMediaAsset
    ) {
        void window.api.deleteMediaAsset(target.mediaSha256).catch(() => {
            // Abaikan
        })
    }

    if (memoryShareSettings.customBgId === id) {
        if (filtered.length > 0) {
            saveShareSettings({
                customBgId: filtered[0]!.id,
                customBgUrl: filtered[0]!.dataUrl,
                customBgMediaType: resolveMediaType(
                    filtered[0]!.mediaType,
                    filtered[0]!.dataUrl,
                    'image'
                )
            })
        } else {
            saveShareSettings({
                customBgId: null,
                customBgUrl: null,
                isCustomBg: false
            })
        }
    }
    notifyShareUpdated()
    return true
}

export function getCustomBgById(id: string): CustomBgItem | undefined {
    return loadCustomBgList().find((b) => b.id === id)
}

export function loadShareSettings(): ShareSettings {
    const bgList = loadCustomBgList()
    const activeBgItem =
        (memoryShareSettings.customBgId &&
            bgList.find((b) => b.id === memoryShareSettings.customBgId)) ||
        bgList[0] ||
        null

    return {
        ...memoryShareSettings,
        customBgId: activeBgItem ? activeBgItem.id : memoryShareSettings.customBgId,
        customBgUrl: activeBgItem ? activeBgItem.dataUrl : memoryShareSettings.customBgUrl,
        customBgMediaType: activeBgItem
            ? resolveMediaType(activeBgItem.mediaType, activeBgItem.dataUrl, 'image')
            : memoryShareSettings.customBgMediaType
    }
}

export function saveShareSettings(settings: Partial<ShareSettings>): void {
    memoryShareSettings = {
        ...memoryShareSettings,
        ...settings
    }

    for (const field of MEDIA_URL_FIELDS) {
        const val = settings[field]
        if (val === undefined) continue
        if (val === null || val === '') {
            delete memoryMediaShaMap[field]
        } else if (val.startsWith('data:')) {
            void uploadMediaUrlFieldToBackend(field, val)
        }
    }

    persistSettingsPatch({ shareSettings: buildSerializableShareSettingsPayload() })
}

// ---------------------------------------------------------------------------
// Resolver Prioritas State Background Modal & Template
// ---------------------------------------------------------------------------

export interface ResolvedShareBgState {
    selectedBgIdx: number
    selectedCustomBgId: string | null
    isCustomBgActive: boolean
    bgPosX: number
    bgPosY: number
    bgDimming: number
    bgDimmingDirection: BgDimmingDirection
}

export function resolveInitialShareBgState(params: {
    savedSettings: ShareSettings
    activeTemplate: ShareCardTemplate | null | undefined
    allBgTemplates: BgTemplate[]
    customBgList: CustomBgItem[]
}): ResolvedShareBgState {
    const { savedSettings, activeTemplate, allBgTemplates, customBgList } = params

    const preferredPresetId = savedSettings.bgPresetId || activeTemplate?.bgPresetId || 'dark-navy'
    const selectedBgIdx = Math.max(
        0,
        allBgTemplates.findIndex((t) => t.id === preferredPresetId)
    )

    const matchedSavedBg = savedSettings.customBgId
        ? customBgList.find((b) => b.id === savedSettings.customBgId)
        : undefined
    const matchedTemplateBg = activeTemplate?.customBgId
        ? customBgList.find((b) => b.id === activeTemplate.customBgId)
        : undefined

    const selectedCustomBgId =
        matchedSavedBg?.id ??
        savedSettings.customBgId ??
        matchedTemplateBg?.id ??
        activeTemplate?.customBgId ??
        (customBgList[0]?.id ?? null)

    const activeItem =
        customBgList.find((b) => b.id === selectedCustomBgId) || customBgList[0] || null

    const hasCustomCandidate = Boolean(
        selectedCustomBgId || customBgList.length > 0 || savedSettings.customBgUrl
    )
    const isCustomBgActive = savedSettings.isCustomBg && hasCustomCandidate

    return {
        selectedBgIdx,
        selectedCustomBgId,
        isCustomBgActive,
        bgPosX:
            savedSettings.bgPosX ??
            activeItem?.bgPosX ??
            activeItem?.posX ??
            activeTemplate?.bgPosX ??
            50,
        bgPosY:
            savedSettings.bgPosY ??
            activeItem?.bgPosY ??
            activeItem?.posY ??
            activeTemplate?.bgPosY ??
            50,
        bgDimming: savedSettings.bgDimming ?? activeTemplate?.bgDimming ?? 75,
        bgDimmingDirection:
            savedSettings.bgDimmingDirection ?? activeTemplate?.bgDimmingDirection ?? 'uniform'
    }
}

export function resolveTemplateBackgroundSelection(params: {
    template: ShareCardTemplate
    allBgTemplates: BgTemplate[]
    customBgList: CustomBgItem[]
    currentState: {
        isCustomBgActive: boolean
        selectedCustomBgId: string | null
        bgPosX: number
        bgPosY: number
        bgDimming: number
        bgDimmingDirection: BgDimmingDirection
    }
}): ResolvedShareBgState {
    const { template, allBgTemplates, customBgList, currentState } = params
    const bgIdx = Math.max(0, allBgTemplates.findIndex((b) => b.id === template.bgPresetId))
    const targetPreset = allBgTemplates[bgIdx]

    if (template.isBuiltin) {
        if (targetPreset?.isTransparent) {
            return {
                selectedBgIdx: bgIdx,
                selectedCustomBgId: currentState.selectedCustomBgId,
                isCustomBgActive: false,
                bgPosX: currentState.bgPosX,
                bgPosY: currentState.bgPosY,
                bgDimming: template.bgDimming ?? currentState.bgDimming,
                bgDimmingDirection:
                    template.bgDimmingDirection ?? currentState.bgDimmingDirection
            }
        }
        return {
            selectedBgIdx: bgIdx,
            selectedCustomBgId: currentState.selectedCustomBgId,
            isCustomBgActive: currentState.isCustomBgActive,
            bgPosX: currentState.bgPosX,
            bgPosY: currentState.bgPosY,
            bgDimming: currentState.isCustomBgActive
                ? currentState.bgDimming
                : (template.bgDimming ?? currentState.bgDimming),
            bgDimmingDirection: currentState.isCustomBgActive
                ? currentState.bgDimmingDirection
                : (template.bgDimmingDirection ?? currentState.bgDimmingDirection)
        }
    }

    const nextCustomBgId = template.isCustomBg
        ? (template.customBgId && customBgList.some((b) => b.id === template.customBgId)
            ? template.customBgId
            : (customBgList[0]?.id ?? null))
        : currentState.selectedCustomBgId

    return {
        selectedBgIdx: bgIdx,
        selectedCustomBgId: nextCustomBgId,
        isCustomBgActive: Boolean(template.isCustomBg && nextCustomBgId),
        bgPosX: template.bgPosX ?? 50,
        bgPosY: template.bgPosY ?? 50,
        bgDimming: template.bgDimming ?? currentState.bgDimming,
        bgDimmingDirection: template.bgDimmingDirection ?? currentState.bgDimmingDirection
    }
}
