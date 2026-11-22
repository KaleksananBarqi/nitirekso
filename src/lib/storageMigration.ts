/**
 * Migrasi satu kali dari penyimpanan web lama (localStorage & IndexedDB)
 * ke Local Cache (SQLite `settings`) dan `media_assets` agar seluruh tema,
 * template, logo, serta wallpaper ikut tersinkron lewat Sync Vault.
 */

import type { MediaAssetKind } from '@shared/ipc-contract'
import { LEGACY_ACTIVE_SCHEME_KEY, LEGACY_CUSTOM_SCHEMES_KEY, type CustomColorScheme } from './customThemes'
import {
    SHARE_STORAGE_KEYS,
    dataUrlToBlob,
    resolveMediaType,
    type BgDimmingDirection,
    type BgTemplate,
    type CustomBgItem,
    type ExportAspect,
    type FrameBgSource,
    type ShareCardTemplate,
    type StoredCustomBgMeta,
    type VideoDurationMode,
} from './shareSettings'

const LEGACY_IDB_NAME = 'nitirekso_media_v1'
const LEGACY_IDB_STORE = 'custom_bg'
const MAX_MEDIA_BYTES = 15 * 1024 * 1024

function extFromMime(mime: string, fallback = 'png'): string {
    const lower = mime.toLowerCase()
    if (lower.includes('jpeg') || lower.includes('jpg')) return 'jpg'
    if (lower.includes('webp')) return 'webp'
    if (lower.includes('gif')) return 'gif'
    if (lower.includes('svg')) return 'svg'
    if (lower.includes('webm')) return 'webm'
    if (lower.includes('mp4')) return 'mp4'
    if (lower.includes('png')) return 'png'
    return fallback
}

function openLegacyIdb(): Promise<IDBDatabase | null> {
    if (typeof window === 'undefined' || !window.indexedDB) return Promise.resolve(null)
    return new Promise((resolve) => {
        try {
            const req = window.indexedDB.open(LEGACY_IDB_NAME, 1)
            req.onupgradeneeded = () => {
                // Jangan membuat object store baru apabila DB belum ada
            }
            req.onsuccess = () => resolve(req.result)
            req.onerror = () => resolve(null)
        } catch {
            resolve(null)
        }
    })
}

async function readLegacyIdbRecords(): Promise<CustomBgItem[]> {
    const db = await openLegacyIdb()
    if (!db) return []
    try {
        if (!db.objectStoreNames.contains(LEGACY_IDB_STORE)) {
            db.close()
            return []
        }
        const records = await new Promise<CustomBgItem[]>((resolve) => {
            try {
                const tx = db.transaction(LEGACY_IDB_STORE, 'readonly')
                const req = tx.objectStore(LEGACY_IDB_STORE).getAll()
                req.onsuccess = () =>
                    resolve(Array.isArray(req.result) ? (req.result as CustomBgItem[]) : [])
                req.onerror = () => resolve([])
            } catch {
                resolve([])
            }
        })
        db.close()
        return records
    } catch {
        db.close()
        return []
    }
}

async function uploadMediaData(
    kind: MediaAssetKind,
    baseName: string,
    fallbackExt: string,
    blob?: Blob,
    dataUrl?: string
): Promise<{ sha256: string; ext: string; mime: string } | null> {
    if (typeof window === 'undefined' || !window.api?.saveMediaAsset) return null
    try {
        let targetBlob = blob
        if (!(targetBlob instanceof Blob) && dataUrl && dataUrl.startsWith('data:')) {
            targetBlob = dataUrlToBlob(dataUrl)
        }
        if (!(targetBlob instanceof Blob) || targetBlob.size === 0 || targetBlob.size > MAX_MEDIA_BYTES) {
            return null
        }
        const ext = extFromMime(targetBlob.type || '', fallbackExt)
        const bytes = new Uint8Array(await targetBlob.arrayBuffer())
        const res = await window.api.saveMediaAsset({
            kind,
            fileName: `${baseName}.${ext}`,
            data: bytes,
        })
        if (res.ok && res.data) {
            return { sha256: res.data.sha256, ext: res.data.ext, mime: res.data.mime }
        }
    } catch {
        // Kembalikan null agar caller tahu upload gagal dan tidak menghapus data sumber
    }
    return null
}

function readJsonLocalStorage<T>(key: string): T | null {
    try {
        const raw = window.localStorage.getItem(key)
        if (!raw) return null
        return JSON.parse(raw) as T
    } catch {
        return null
    }
}

export async function migrateLegacyWebStorageIfNeeded(
    currentSettings: Record<string, unknown>
): Promise<Record<string, unknown>> {
    if (currentSettings.legacyWebStorageMigrated === true) {
        return currentSettings
    }
    if (typeof window === 'undefined' || !window.api?.setSettings) {
        return currentSettings
    }

    const patch: Record<string, unknown> = {}
    let hasMediaUploadFailure = false

    try {
        const ls = window.localStorage

        // 1. Tema & Colorblind
        const lsTheme = ls.getItem('trading-journal-theme')
        if (!currentSettings.theme && (lsTheme === 'dark' || lsTheme === 'light' || lsTheme === 'system')) {
            patch.theme = lsTheme
        }
        const lsCb = ls.getItem('trading-journal-colorblind')
        if (typeof currentSettings.colorblindSafe !== 'boolean' && (lsCb === 'true' || lsCb === 'false')) {
            patch.colorblindSafe = lsCb === 'true'
        }

        // 2. Custom Color Schemes aplikasi
        const legacySchemes = readJsonLocalStorage<CustomColorScheme[]>(LEGACY_CUSTOM_SCHEMES_KEY)
        if (Array.isArray(legacySchemes) && legacySchemes.length > 0 && !currentSettings.customColorSchemes) {
            patch.customColorSchemes = legacySchemes.filter((s) => s && !s.isBuiltin)
        }
        const legacyActiveSchemeId = ls.getItem(LEGACY_ACTIVE_SCHEME_KEY)
        if (legacyActiveSchemeId && currentSettings.activeCustomColorSchemeId === undefined) {
            patch.activeCustomColorSchemeId = legacyActiveSchemeId
        }

        // 3. Share Color Schemes, Templates, Active Template, & Caption Custom Templates
        const legacyShareColors = readJsonLocalStorage<BgTemplate[]>(SHARE_STORAGE_KEYS.CUSTOM_COLOR_SCHEMES)
        if (Array.isArray(legacyShareColors) && legacyShareColors.length > 0 && !currentSettings.shareCustomColorSchemes) {
            patch.shareCustomColorSchemes = legacyShareColors
        }
        const legacyShareTemplates = readJsonLocalStorage<ShareCardTemplate[]>(SHARE_STORAGE_KEYS.CUSTOM_TEMPLATES)
        if (Array.isArray(legacyShareTemplates) && legacyShareTemplates.length > 0 && !currentSettings.shareCustomTemplates) {
            patch.shareCustomTemplates = legacyShareTemplates
        }
        const legacyActiveTpl = ls.getItem(SHARE_STORAGE_KEYS.ACTIVE_TEMPLATE_ID)
        if (legacyActiveTpl && !currentSettings.shareActiveTemplateId) {
            patch.shareActiveTemplateId = legacyActiveTpl
        }
        const legacyCaptionTemplates = readJsonLocalStorage<unknown[]>(SHARE_STORAGE_KEYS.CAPTION_CUSTOM_TEMPLATES)
        if (Array.isArray(legacyCaptionTemplates) && legacyCaptionTemplates.length > 0 && !currentSettings.shareCaptionCustomTemplates) {
            patch.shareCaptionCustomTemplates = legacyCaptionTemplates
        }

        // 4. ShareSettings (ringan + upload avatar/logo ke media_assets sesuai MIME asli)
        if (!currentSettings.shareSettings) {
            const mediaShaByField: Record<string, string> = {}
            const mediaFields: Array<[string, string, MediaAssetKind]> = [
                ['avatarUrl', SHARE_STORAGE_KEYS.AVATAR, 'share_media'],
                ['mexcLogoUrl', SHARE_STORAGE_KEYS.MEXC_LOGO, 'exchange_logo'],
                ['bitunixLogoUrl', SHARE_STORAGE_KEYS.BITUNIX_LOGO, 'exchange_logo'],
                ['bybitLogoUrl', SHARE_STORAGE_KEYS.BYBIT_LOGO, 'exchange_logo'],
                ['binanceLogoUrl', SHARE_STORAGE_KEYS.BINANCE_LOGO, 'exchange_logo'],
                ['bingxLogoUrl', SHARE_STORAGE_KEYS.BINGX_LOGO, 'exchange_logo'],
            ]
            for (const [field, key, kind] of mediaFields) {
                const rawVal = ls.getItem(key)
                if (rawVal && rawVal.startsWith('data:')) {
                    const uploaded = await uploadMediaData(kind, field, 'png', undefined, rawVal)
                    if (uploaded) {
                        mediaShaByField[field] = uploaded.sha256
                    } else {
                        hasMediaUploadFailure = true
                    }
                }
            }

            const hasAnyLegacyShareKey = Object.values(SHARE_STORAGE_KEYS).some((k) => ls.getItem(k) !== null)
            if (hasAnyLegacyShareKey || Object.keys(mediaShaByField).length > 0) {
                patch.shareSettings = {
                    traderHandle: ls.getItem(SHARE_STORAGE_KEYS.HANDLE) || '@trader',
                    brandTitle: (() => {
                        const b = ls.getItem(SHARE_STORAGE_KEYS.BRAND_TITLE)
                        return !b || b === 'SHARENYA' ? 'nitirekso' : b
                    })(),
                    brandSubtitle: ls.getItem(SHARE_STORAGE_KEYS.BRAND_SUBTITLE) || 'JOURNAL',
                    mexcReferralCode: ls.getItem(SHARE_STORAGE_KEYS.MEXC_REF) || '',
                    bitunixReferralCode: ls.getItem(SHARE_STORAGE_KEYS.BITUNIX_REF) || '',
                    bybitReferralCode: ls.getItem(SHARE_STORAGE_KEYS.BYBIT_REF) || '',
                    binanceReferralCode: ls.getItem(SHARE_STORAGE_KEYS.BINANCE_REF) || '',
                    bingxReferralCode: ls.getItem(SHARE_STORAGE_KEYS.BINGX_REF) || '',
                    showReferral: ls.getItem(SHARE_STORAGE_KEYS.SHOW_REF) !== 'false',
                    bgPresetId: ls.getItem(SHARE_STORAGE_KEYS.BG_PRESET_ID) || 'dark-navy',
                    customBgId: ls.getItem(SHARE_STORAGE_KEYS.CUSTOM_BG_ID) || null,
                    isCustomBg: ls.getItem(SHARE_STORAGE_KEYS.IS_CUSTOM_BG) === 'true',
                    bgDimming: Number(ls.getItem(SHARE_STORAGE_KEYS.BG_DIMMING) ?? 75) || 75,
                    bgDimmingDirection:
                        (ls.getItem(SHARE_STORAGE_KEYS.BG_DIMMING_DIRECTION) as BgDimmingDirection) ||
                        'uniform',
                    customBgMediaType:
                        (ls.getItem(SHARE_STORAGE_KEYS.CUSTOM_BG_MEDIA_TYPE) as 'image' | 'video') ||
                        'image',
                    bgPosX: Number(ls.getItem(SHARE_STORAGE_KEYS.BG_POS_X) ?? 50),
                    bgPosY: Number(ls.getItem(SHARE_STORAGE_KEYS.BG_POS_Y) ?? 50),
                    showFullText: ls.getItem(SHARE_STORAGE_KEYS.FULL_TEXT) !== 'false',
                    showTradeTimes: ls.getItem(SHARE_STORAGE_KEYS.SHOW_TRADE_TIMES) !== 'false',
                    exportAspect:
                        (ls.getItem(SHARE_STORAGE_KEYS.EXPORT_ASPECT) as ExportAspect) || '9:16',
                    frameBgSource:
                        (ls.getItem(SHARE_STORAGE_KEYS.FRAME_BG_SOURCE) as FrameBgSource) ||
                        'card-blur',
                    frameBlur: Number(ls.getItem(SHARE_STORAGE_KEYS.FRAME_BLUR) ?? 25),
                    frameDim: Number(ls.getItem(SHARE_STORAGE_KEYS.FRAME_DIM) ?? 40),
                    captionPresetId:
                        ls.getItem(SHARE_STORAGE_KEYS.CAPTION_PRESET_ID) || 'tiktok-jurnal',
                    videoDurationMode:
                        (ls.getItem(SHARE_STORAGE_KEYS.VIDEO_DURATION_MODE) as VideoDurationMode) ||
                        'source',
                    mediaShaByField,
                }
            }
        }

        // 5. Wallpaper & Video Custom dari IndexedDB + localStorage
        if (!currentSettings.shareCustomBgList) {
            const idbRecords = await readLegacyIdbRecords()
            const lsBgList = readJsonLocalStorage<CustomBgItem[]>(SHARE_STORAGE_KEYS.CUSTOM_BG_LIST) || []
            const mergedMap = new Map<string, CustomBgItem>()

            for (const rec of idbRecords) {
                mergedMap.set(rec.id, rec)
            }
            for (const item of lsBgList) {
                const prev = mergedMap.get(item.id)
                if (prev) {
                    mergedMap.set(item.id, {
                        ...prev,
                        name: item.name || prev.name,
                        posX: item.posX ?? prev.posX,
                        posY: item.posY ?? prev.posY,
                        bgPosX: item.bgPosX ?? prev.bgPosX,
                        bgPosY: item.bgPosY ?? prev.bgPosY,
                    })
                } else {
                    mergedMap.set(item.id, item)
                }
            }

            const legacySingleBg = ls.getItem(SHARE_STORAGE_KEYS.CUSTOM_BG)
            if (legacySingleBg && mergedMap.size === 0 && !legacySingleBg.startsWith('blob:')) {
                const id = ls.getItem(SHARE_STORAGE_KEYS.CUSTOM_BG_ID) || `bg_${Date.now()}_legacy`
                mergedMap.set(id, {
                    id,
                    name: 'Wallpaper Kustom 1',
                    dataUrl: legacySingleBg,
                    createdAt: Date.now(),
                    mediaType: resolveMediaType(undefined, legacySingleBg, 'image'),
                })
            }

            const migratedList: StoredCustomBgMeta[] = []
            for (const item of mergedMap.values()) {
                const mType = resolveMediaType(item.mediaType, item.dataUrl, 'image')
                const defaultExt = mType === 'video' ? 'mp4' : 'png'
                if (item.blob instanceof Blob || (item.dataUrl && item.dataUrl.startsWith('data:'))) {
                    const uploaded = await uploadMediaData(
                        'share_media',
                        item.name || item.id,
                        defaultExt,
                        item.blob,
                        item.dataUrl
                    )
                    if (uploaded) {
                        migratedList.push({
                            id: item.id,
                            name: item.name,
                            mediaSha256: uploaded.sha256,
                            ext: uploaded.ext,
                            mime: uploaded.mime,
                            createdAt: item.createdAt,
                            mediaType: mType,
                            posX: item.posX,
                            posY: item.posY,
                            bgPosX: item.bgPosX,
                            bgPosY: item.bgPosY,
                        })
                    } else {
                        hasMediaUploadFailure = true
                    }
                } else if (
                    item.dataUrl &&
                    (item.dataUrl.startsWith('http://') || item.dataUrl.startsWith('https://'))
                ) {
                    migratedList.push({
                        id: item.id,
                        name: item.name,
                        directUrl: item.dataUrl,
                        createdAt: item.createdAt,
                        mediaType: mType,
                        posX: item.posX,
                        posY: item.posY,
                        bgPosX: item.bgPosX,
                        bgPosY: item.bgPosY,
                    })
                }
            }

            if (migratedList.length > 0) {
                migratedList.sort((a, b) => b.createdAt - a.createdAt)
                patch.shareCustomBgList = migratedList
            }
        }

        if (!hasMediaUploadFailure) {
            patch.legacyWebStorageMigrated = true
        }

        await window.api.setSettings(patch)

        // Hanya hapus sumber legacy jika seluruh media berhasil termigrasi
        if (!hasMediaUploadFailure) {
            ls.removeItem(LEGACY_CUSTOM_SCHEMES_KEY)
            ls.removeItem(LEGACY_ACTIVE_SCHEME_KEY)
            for (const k of Object.values(SHARE_STORAGE_KEYS)) {
                ls.removeItem(k)
            }

            if (window.indexedDB) {
                try {
                    window.indexedDB.deleteDatabase(LEGACY_IDB_NAME)
                } catch {
                    // Abaikan
                }
            }
        }
    } catch {
        // Jangan hapus data legacy bila gagal
    }

    return {
        ...currentSettings,
        ...patch,
    }
}
