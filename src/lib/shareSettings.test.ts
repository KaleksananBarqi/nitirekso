import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { InMemoryMockAdapter } from './ipc/mock-adapter'
import { createTauriApi } from './tauri-api'
import { migrateLegacyWebStorageIfNeeded } from './storageMigration'
import {
    BG_TEMPLATES,
    BUILTIN_TEMPLATES,
    SHARE_STORAGE_KEYS,
    addCustomBgItem,
    deleteCustomBgItem,
    hydrateShareSettingsFromBackend,
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

function createFakeIndexedDb(initialRecords: Array<Record<string, unknown>> = []) {
    const storeMap = new Map<string, Record<string, unknown>>()
    for (const rec of initialRecords) {
        if (typeof rec.id === 'string') {
            storeMap.set(rec.id, rec)
        }
    }

    const fakeDb = {
        objectStoreNames: { contains: () => true },
        close: () => {},
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
            },
            deleteDatabase: () => ({})
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

describe('shareSettings - Persistensi SQLite + Media Assets & Resolusi Template', () => {
    let originalWindow: unknown
    let originalLocalStorage: unknown
    let originalCreateObjectUrl: typeof URL.createObjectURL
    let originalRevokeObjectUrl: typeof URL.revokeObjectURL
    let objectUrlCounter = 0
    let fakeIdb: ReturnType<typeof createFakeIndexedDb>
    let fakeLs: ReturnType<typeof createFakeLocalStorage>
    let mockAdapter: InMemoryMockAdapter

    beforeEach(() => {
        resetCustomBgMemoryCache()
        objectUrlCounter = 0
        mockAdapter = new InMemoryMockAdapter()
        const api = createTauriApi(mockAdapter)
        fakeIdb = createFakeIndexedDb()
        fakeLs = createFakeLocalStorage()

        originalWindow = (globalThis as Record<string, unknown>).window
        originalLocalStorage = (globalThis as Record<string, unknown>).localStorage
        originalCreateObjectUrl = URL.createObjectURL
        originalRevokeObjectUrl = URL.revokeObjectURL

        ;(globalThis as Record<string, unknown>).localStorage = fakeLs.localStorage
        ;(globalThis as Record<string, unknown>).window = {
            api,
            localStorage: fakeLs.localStorage,
            indexedDB: fakeIdb.indexedDB,
            dispatchEvent: () => true
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

    it('menyimpan foto (image Blob) ke media_assets via IPC dan merehidrasi setelah restart', async () => {
        const imageBlob = new Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], {
            type: 'image/png'
        })
        const created = await addCustomBgItem({
            name: 'Chart Wallpaper',
            mediaType: 'image',
            blob: imageBlob
        })
        saveShareSettings({ isCustomBg: true, customBgId: created.id })

        expect(created.dataUrl).toBe('blob:mock-object-url-1')
        expect(created.mediaSha256).toBeDefined()

        // Tunggu write-through async ke mockAdapter selesai
        await new Promise((r) => setTimeout(r, 0))
        const settingsRes = await mockAdapter.settings.getAll()
        expect(settingsRes.ok).toBe(true)
        if (settingsRes.ok) {
            expect(Array.isArray(settingsRes.data.shareCustomBgList)).toBe(true)
            const storedShare = settingsRes.data.shareSettings as Record<string, unknown>
            expect(storedShare.customBgUrl).toBeUndefined()
        }

        // Simulasikan restart aplikasi dengan mengosongkan cache memori
        resetCustomBgMemoryCache()
        expect(loadCustomBgList()).toEqual([])

        // Rehidrasi dari SQLite settings & media_assets
        const rehydrated = await hydrateShareSettingsFromBackend()
        expect(rehydrated).toHaveLength(1)
        expect(rehydrated[0]?.id).toBe(created.id)
        expect(rehydrated[0]?.mediaType).toBe('image')
        expect(rehydrated[0]?.dataUrl).toBe('blob:mock-object-url-2')

        const reloadedSettings = loadShareSettings()
        expect(reloadedSettings.isCustomBg).toBe(true)
        expect(reloadedSettings.customBgId).toBe(created.id)
        expect(reloadedSettings.customBgUrl).toBe('blob:mock-object-url-2')
    })

    it('memigrasikan data lama localStorage dan IndexedDB satu kali ke SQLite dan media_assets', async () => {
        const legacyDataUrl =
            'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='
        fakeIdb = createFakeIndexedDb([
            {
                id: 'bg_legacy_idb',
                name: 'Legacy IDB Bg',
                dataUrl: legacyDataUrl,
                createdAt: 200,
                mediaType: 'image'
            }
        ])
        ;((globalThis as Record<string, unknown>).window as Record<string, unknown>).indexedDB =
            fakeIdb.indexedDB

        fakeLs.store.set(SHARE_STORAGE_KEYS.HANDLE, '@legacy_trader')
        fakeLs.store.set(SHARE_STORAGE_KEYS.IS_CUSTOM_BG, 'true')
        fakeLs.store.set(SHARE_STORAGE_KEYS.CUSTOM_BG_ID, 'bg_legacy_idb')

        const migratedSettings = await migrateLegacyWebStorageIfNeeded({})
        expect(migratedSettings.legacyWebStorageMigrated).toBe(true)
        expect(Array.isArray(migratedSettings.shareCustomBgList)).toBe(true)
        expect((migratedSettings.shareCustomBgList as Array<Record<string, unknown>>).length).toBe(1)

        // Pastikan kunci localStorage share lama dibersihkan setelah migrasi
        expect(fakeLs.store.get(SHARE_STORAGE_KEYS.HANDLE)).toBeUndefined()

        const hydrated = await hydrateShareSettingsFromBackend(migratedSettings)
        expect(hydrated).toHaveLength(1)
        expect(hydrated[0]?.id).toBe('bg_legacy_idb')
        expect(loadShareSettings().traderHandle).toBe('@legacy_trader')
        expect(loadShareSettings().brandTitle).toBe('nitirekso')
    })

    it('mempertahankan ekstensi MIME JPEG/WebP saat migrasi dan tidak menghapus sumber jika ada media ditolak', async () => {
        const jpegBlob = new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], {
            type: 'image/jpeg'
        })
        const saveSpy = vi.spyOn(mockAdapter.media, 'saveMediaAsset')
        fakeIdb = createFakeIndexedDb([
            {
                id: 'bg_jpeg_idb',
                name: 'Foto JPEG',
                blob: jpegBlob,
                dataUrl: '',
                createdAt: 300,
                mediaType: 'image'
            }
        ])
        ;((globalThis as Record<string, unknown>).window as Record<string, unknown>).indexedDB =
            fakeIdb.indexedDB

        const migrated = await migrateLegacyWebStorageIfNeeded({})
        expect(migrated.legacyWebStorageMigrated).toBe(true)
        expect(saveSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                kind: 'share_media',
                fileName: 'Foto JPEG.jpg'
            })
        )
        const list = migrated.shareCustomBgList as Array<Record<string, unknown>>
        expect(list[0]?.ext).toBe('jpg')
    })

    it('menyinkronkan pembaruan posisi pan ke settings dan melepas ObjectURL saat dihapus', async () => {
        const blob = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' })
        const created = await addCustomBgItem({ name: 'Pan Test', mediaType: 'image', blob })

        updateCustomBgItem(created.id, { bgPosX: 25, bgPosY: 80 })
        await new Promise((r) => setTimeout(r, 0))

        const settingsRes = await mockAdapter.settings.getAll()
        expect(settingsRes.ok).toBe(true)
        if (settingsRes.ok) {
            const metaList = settingsRes.data.shareCustomBgList as Array<Record<string, unknown>>
            expect(metaList[0]?.bgPosX).toBe(25)
            expect(metaList[0]?.bgPosY).toBe(80)
        }

        const deleted = deleteCustomBgItem(created.id)
        expect(deleted).toBe(true)
        expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-object-url-1')
        expect(loadCustomBgList()).toHaveLength(0)
        expect(loadShareSettings().isCustomBg).toBe(false)
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
        const defaultTemplate = BUILTIN_TEMPLATES[0]!

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

        const afterPrivacy = resolveTemplateBackgroundSelection({
            template: privacyTpl,
            allBgTemplates: BG_TEMPLATES,
            customBgList: [customItem, customItem2],
            currentState
        })
        expect(afterPrivacy.isCustomBgActive).toBe(true)
        expect(afterPrivacy.selectedCustomBgId).toBe('bg_1')

        const afterGlass = resolveTemplateBackgroundSelection({
            template: glassTpl,
            allBgTemplates: BG_TEMPLATES,
            customBgList: [customItem, customItem2],
            currentState
        })
        expect(afterGlass.isCustomBgActive).toBe(false)

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
