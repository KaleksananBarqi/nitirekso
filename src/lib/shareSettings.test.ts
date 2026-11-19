import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
    BG_TEMPLATES,
    BUILTIN_TEMPLATES,
    SHARE_STORAGE_KEYS,
    addCustomBgItem,
    deleteCustomBgItem,
    initIndexedDbCustomBg,
    loadCustomBgList,
    loadShareSettings,
    resetCustomBgMemoryCache,
    resolveInitialShareBgState,
    resolveTemplateBackgroundSelection,
    saveShareSettings,
    updateCustomBgItem,
    type CustomBgItem,
    type ShareCardTemplate
} from './shareSettings'

/** Mock IndexedDB in-memory minimal untuk memverifikasi alur persistensi Blob & rehidrasi. */
function createFakeIndexedDb(initialRecords: Array<Record<string, unknown>> = []) {
    const storeMap = new Map<string, Record<string, unknown>>()
    for (const rec of initialRecords) {
        if (typeof rec.id === 'string') {
            storeMap.set(rec.id, rec)
        }
    }

    const fakeDb = {
        objectStoreNames: { contains: () => true },
        createObjectStore: () => ({}),
        transaction: (_name: string, _mode: string) => {
            const tx: Record<string, unknown> = {
                oncomplete: null,
                onerror: null,
                onabort: null,
                objectStore: () => ({
                    getAll: () => {
                        const req: Record<string, unknown> = { onsuccess: null, onerror: null, result: null }
                        queueMicrotask(() => {
                            req.result = Array.from(storeMap.values())
                            if (typeof req.onsuccess === 'function') (req.onsuccess as () => void)()
                        })
                        return req
                    },
                    put: (val: Record<string, unknown>) => {
                        if (typeof val.id === 'string') {
                            storeMap.set(val.id, val)
                        }
                        queueMicrotask(() => {
                            if (typeof tx.oncomplete === 'function') (tx.oncomplete as () => void)()
                        })
                    },
                    delete: (id: string) => {
                        storeMap.delete(id)
                        queueMicrotask(() => {
                            if (typeof tx.oncomplete === 'function') (tx.oncomplete as () => void)()
                        })
                    }
                })
            }
            return tx
        }
    }

    return {
        storeMap,
        indexedDB: {
            open: () => {
                const req: Record<string, unknown> = {
                    result: fakeDb,
                    onupgradeneeded: null,
                    onsuccess: null,
                    onerror: null
                }
                queueMicrotask(() => {
                    if (typeof req.onsuccess === 'function') (req.onsuccess as () => void)()
                })
                return req
            }
        }
    }
}

function createFakeLocalStorage() {
    const storage = new Map<string, string>()
    return {
        store: storage,
        localStorage: {
            getItem: (key: string) => storage.get(key) ?? null,
            setItem: (key: string, value: string) => {
                storage.set(key, value)
            },
            removeItem: (key: string) => {
                storage.delete(key)
            },
            clear: () => {
                storage.clear()
            }
        }
    }
}

describe('shareSettings - Persistensi Background PnL & Resolusi Template', () => {
    let originalWindow: unknown
    let originalLocalStorage: unknown
    let originalCreateObjectUrl: typeof URL.createObjectURL
    let originalRevokeObjectUrl: typeof URL.revokeObjectURL
    let objectUrlCounter = 0
    let fakeIdb: ReturnType<typeof createFakeIndexedDb>
    let fakeLs: ReturnType<typeof createFakeLocalStorage>

    beforeEach(() => {
        resetCustomBgMemoryCache()
        objectUrlCounter = 0
        fakeIdb = createFakeIndexedDb()
        fakeLs = createFakeLocalStorage()

        originalWindow = (globalThis as Record<string, unknown>).window
        originalLocalStorage = (globalThis as Record<string, unknown>).localStorage
        originalCreateObjectUrl = URL.createObjectURL
        originalRevokeObjectUrl = URL.revokeObjectURL

        ;(globalThis as Record<string, unknown>).localStorage = fakeLs.localStorage
        ;(globalThis as Record<string, unknown>).window = {
            indexedDB: fakeIdb.indexedDB
        }

        URL.createObjectURL = vi.fn(() => `blob:mock-object-url-${++objectUrlCounter}`)
        URL.revokeObjectURL = vi.fn()
    })

    afterEach(() => {
        resetCustomBgMemoryCache()
        ;(globalThis as Record<string, unknown>).window = originalWindow
        ;(globalThis as Record<string, unknown>).localStorage = originalLocalStorage
        URL.createObjectURL = originalCreateObjectUrl
        URL.revokeObjectURL = originalRevokeObjectUrl
        vi.restoreAllMocks()
    })

    it('menyimpan foto (image Blob) ke IndexedDB dan merehidrasi ObjectURL baru setelah restart', async () => {
        const imageBlob = new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' })
        const created = await addCustomBgItem({
            name: 'Chart Wallpaper',
            mediaType: 'image',
            blob: imageBlob
        })
        saveShareSettings({ isCustomBg: true, customBgId: created.id })

        expect(created.dataUrl).toBe('blob:mock-object-url-1')
        expect(fakeIdb.storeMap.has(created.id)).toBe(true)

        // Pastikan localStorage hanya menyimpan metadata ringan, bukan string base64 atau blob URL sementara
        const rawListJson = fakeLs.store.get(SHARE_STORAGE_KEYS.CUSTOM_BG_LIST)
        expect(rawListJson).toBeDefined()
        const parsedMeta = JSON.parse(rawListJson!) as CustomBgItem[]
        expect(parsedMeta).toHaveLength(1)
        expect(parsedMeta[0]?.dataUrl).toBe('')
        expect(fakeLs.store.get(SHARE_STORAGE_KEYS.CUSTOM_BG)).toBeUndefined()

        // Simulasikan restart aplikasi dengan mengosongkan cache memori
        resetCustomBgMemoryCache()
        expect(loadCustomBgList()).toEqual([])

        // Rehidrasi dari IndexedDB saat startup / modal dibuka kembali
        const rehydrated = await initIndexedDbCustomBg()
        expect(rehydrated).toHaveLength(1)
        expect(rehydrated[0]?.id).toBe(created.id)
        expect(rehydrated[0]?.mediaType).toBe('image')
        expect(rehydrated[0]?.dataUrl).toBe('blob:mock-object-url-2')

        const reloadedSettings = loadShareSettings()
        expect(reloadedSettings.isCustomBg).toBe(true)
        expect(reloadedSettings.customBgId).toBe(created.id)
        expect(reloadedSettings.customBgUrl).toBe('blob:mock-object-url-2')
    })

    it('memigrasikan base64 image lama di localStorage ke IndexedDB dan membuang entri blob mati', async () => {
        // 1x1 transparent PNG base64 valid
        const legacyDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='
        fakeLs.store.set(
            SHARE_STORAGE_KEYS.CUSTOM_BG_LIST,
            JSON.stringify([
                {
                    id: 'bg_legacy_base64',
                    name: 'Legacy Photo',
                    dataUrl: legacyDataUrl,
                    createdAt: 200,
                    mediaType: 'image'
                },
                {
                    id: 'bg_dead_orphan',
                    name: 'Dead Blob',
                    dataUrl: 'blob:http://localhost:5173/dead-uuid',
                    createdAt: 100,
                    mediaType: 'image'
                }
            ])
        )
        fakeLs.store.set(SHARE_STORAGE_KEYS.CUSTOM_BG_ID, 'bg_dead_orphan')
        fakeLs.store.set(SHARE_STORAGE_KEYS.IS_CUSTOM_BG, 'true')

        const migrated = await initIndexedDbCustomBg()

        expect(migrated).toHaveLength(1)
        expect(migrated[0]?.id).toBe('bg_legacy_base64')
        expect(migrated[0]?.dataUrl).toBe('blob:mock-object-url-1')
        expect(fakeIdb.storeMap.has('bg_legacy_base64')).toBe(true)
        // ID aktif otomatis dipindahkan dari blob yatim mati ke item valid pertama
        expect(fakeLs.store.get(SHARE_STORAGE_KEYS.CUSTOM_BG_ID)).toBe('bg_legacy_base64')
    })

    it('menyinkronkan pembaruan posisi pan ke IndexedDB dan melepas ObjectURL saat dihapus', async () => {
        const blob = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' })
        const created = await addCustomBgItem({ name: 'Pan Test', mediaType: 'image', blob })

        updateCustomBgItem(created.id, { bgPosX: 25, bgPosY: 80 })
        await new Promise((r) => setTimeout(r, 0))

        const idbRecord = fakeIdb.storeMap.get(created.id)
        expect(idbRecord?.bgPosX).toBe(25)
        expect(idbRecord?.bgPosY).toBe(80)

        const deleted = deleteCustomBgItem(created.id)
        expect(deleted).toBe(true)
        expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-object-url-1')
        expect(loadCustomBgList()).toHaveLength(0)
        expect(fakeLs.store.get(SHARE_STORAGE_KEYS.IS_CUSTOM_BG)).toBe('false')
    })

    it('memprioritaskan pilihan wallpaper terakhir pengguna di atas preset bawaan saat modal dibuka ulang', async () => {
        const blob = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' })
        const created = await addCustomBgItem({ name: 'Foto Trading', mediaType: 'image', blob })
        saveShareSettings({
            isCustomBg: true,
            customBgId: created.id,
            bgPresetId: 'cyberpunk',
            bgPosX: 30,
            bgPosY: 70
        })

        const savedSettings = loadShareSettings()
        const defaultTemplate = BUILTIN_TEMPLATES[0]! // Standar Pro (isCustomBg: false)

        const resolved = resolveInitialShareBgState({
            savedSettings,
            activeTemplate: defaultTemplate,
            allBgTemplates: BG_TEMPLATES,
            customBgList: loadCustomBgList()
        })

        expect(resolved.isCustomBgActive).toBe(true)
        expect(resolved.selectedCustomBgId).toBe(created.id)
        expect(resolved.bgPosX).toBe(30)
        expect(resolved.bgPosY).toBe(70)
        expect(BG_TEMPLATES[resolved.selectedBgIdx]?.id).toBe('cyberpunk')
    })

    it('mempertahankan wallpaper aktif saat klik template bawaan non-transparan dan menonaktifkan saat Transparan Sticker', () => {
        const customItem: CustomBgItem = {
            id: 'bg_1',
            name: 'Bg 1',
            dataUrl: 'blob:mock-1',
            createdAt: 1,
            mediaType: 'image'
        }
        const customItem2: CustomBgItem = {
            id: 'bg_2',
            name: 'Bg 2',
            dataUrl: 'blob:mock-2',
            createdAt: 2,
            mediaType: 'image'
        }
        const privacyTpl = BUILTIN_TEMPLATES.find((t) => t.id === 'privacy-no-usd')!
        const glassTpl = BUILTIN_TEMPLATES.find((t) => t.id === 'glass-sticker')!
        const userTpl: ShareCardTemplate = {
            ...BUILTIN_TEMPLATES[0]!,
            id: 'custom_user_1',
            name: 'VIP Custom',
            isBuiltin: false,
            isCustomBg: true,
            customBgId: 'bg_2',
            bgPosX: 15,
            bgPosY: 85
        }

        const currentState = {
            isCustomBgActive: true,
            selectedCustomBgId: 'bg_1',
            bgPosX: 40,
            bgPosY: 60,
            bgDimming: 70,
            bgDimmingDirection: 'top-right' as const
        }

        // Klik preset Privasi -> foto custom tetap menempel
        const afterPrivacy = resolveTemplateBackgroundSelection({
            template: privacyTpl,
            allBgTemplates: BG_TEMPLATES,
            customBgList: [customItem, customItem2],
            currentState
        })
        expect(afterPrivacy.isCustomBgActive).toBe(true)
        expect(afterPrivacy.selectedCustomBgId).toBe('bg_1')

        // Klik Transparan Sticker -> matikan custom bg agar mode transparan tampil
        const afterGlass = resolveTemplateBackgroundSelection({
            template: glassTpl,
            allBgTemplates: BG_TEMPLATES,
            customBgList: [customItem, customItem2],
            currentState
        })
        expect(afterGlass.isCustomBgActive).toBe(false)

        // Klik template kustom pengguna -> terapkan wallpaper tertaut milik template
        const afterUserTpl = resolveTemplateBackgroundSelection({
            template: userTpl,
            allBgTemplates: BG_TEMPLATES,
            customBgList: [customItem, customItem2],
            currentState
        })
        expect(afterUserTpl.isCustomBgActive).toBe(true)
        expect(afterUserTpl.selectedCustomBgId).toBe('bg_2')
        expect(afterUserTpl.bgPosX).toBe(15)
        expect(afterUserTpl.bgPosY).toBe(85)
    })
})
