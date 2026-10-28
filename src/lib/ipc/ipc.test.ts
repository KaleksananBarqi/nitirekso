import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@tauri-apps/api/core', () => ({
    invoke: vi.fn(),
}))

vi.mock('@tauri-apps/api/event', () => ({
    listen: vi.fn().mockResolvedValue(vi.fn()),
}))

import {
    createApiClient,
    createAppError,
    err,
    isTauriEnvironment,
    normalizeAppError,
    ok,
    InMemoryMockAdapter,
    NativeTauriAdapter,
    type TradeSavePayload,
} from './index'
import { createTauriApi } from '../tauri-api'

describe('IPC Types & Error Helpers', () => {
    it('membuat AppResult sukses dan gagal dengan tepat', () => {
        const success = ok({ id: 1, name: 'trade' })
        expect(success.ok).toBe(true)
        if (success.ok) {
            expect(success.data.id).toBe(1)
        }

        const failure = err(createAppError('NOT_FOUND', 'Data tidak ditemukan', { id: 1 }))
        expect(failure.ok).toBe(false)
        if (!failure.ok) {
            expect(failure.error.code).toBe('NOT_FOUND')
            expect(failure.error.message).toBe('Data tidak ditemukan')
            expect(failure.error.details).toEqual({ id: 1 })
        }
    })

    it('menormalisasi berbagai format error menjadi AppError standar', () => {
        // Objek error asli bawaan JS
        const jsError = new Error('Koneksi timeout')
        const normJs = normalizeAppError(jsError, 'TIMEOUT')
        expect(normJs.code).toBe('TIMEOUT')
        expect(normJs.message).toBe('Koneksi timeout')
        expect(typeof normJs.details).toBe('string')

        // Error berupa string murni
        const strError = 'Tauri IPC failure'
        const normStr = normalizeAppError(strError, 'IPC_FAILED')
        expect(normStr.code).toBe('IPC_FAILED')
        expect(normStr.message).toBe('Tauri IPC failure')

        // Objek yang sudah memiliki code & message
        const customObj = { code: 'CUSTOM_CODE', message: 'Pesan kustom', details: { foo: 'bar' } }
        const normObj = normalizeAppError(customObj)
        expect(normObj.code).toBe('CUSTOM_CODE')
        expect(normObj.message).toBe('Pesan kustom')
        expect(normObj.details).toEqual({ foo: 'bar' })

        // Nilai primitif tak dikenal atau null
        const normUnknown = normalizeAppError(12345)
        expect(normUnknown.code).toBe('INTERNAL_ERROR')
        expect(normUnknown.message).toBe('Terjadi kesalahan sistem yang tidak diketahui')
    })
})

describe('InMemoryMockAdapter', () => {
    let mock: InMemoryMockAdapter

    beforeEach(() => {
        mock = new InMemoryMockAdapter()
    })

    describe('Domain Trades', () => {
        const samplePayload: TradeSavePayload = {
            trade: {
                exchange: 'mexc',
                symbol: 'BTCUSDT',
                direction: 'long',
                entryPrice: 60000,
                exitPrice: 62000,
                entryTime: 1700000000000,
                exitTime: 1700003600000,
                size: 0.5,
                leverage: 10,
                marginMode: 'cross',
                realizedPnl: 1000,
                feeOpen: 5,
                feeClose: 5,
                fundingFee: 0,
            },
            journal: {
                setupTag: 'Breakout',
                tags: ['trend', 'momentum'],
                checklist: [{ label: 'Konfirmasi volume', checked: true }],
            },
            plannedRisk: {
                plannedStop: 59000,
                plannedTarget: 63000,
                riskAmount: 500,
                plannedRr: 2.0,
            },
        }

        it('menjalankan siklus CRUD trade secara lengkap di memori', async () => {
            // 1. Create
            const createRes = await mock.trades.create(samplePayload)
            expect(createRes.ok).toBe(true)
            if (!createRes.ok) return
            const tradeId = createRes.data
            expect(tradeId).toBe(1)

            // 2. Get
            const getRes = await mock.trades.get(tradeId)
            expect(getRes.ok).toBe(true)
            if (!getRes.ok) return
            expect(getRes.data).not.toBeNull()
            expect(getRes.data?.trade.symbol).toBe('BTCUSDT')
            expect(getRes.data?.journal?.setupTag).toBe('Breakout')
            expect(getRes.data?.plannedRisk?.plannedRr).toBe(2.0)

            // 3. List dengan filter
            const listAll = await mock.trades.list()
            expect(listAll.ok).toBe(true)
            if (listAll.ok) {
                expect(listAll.data.length).toBe(1)
            }

            const listFiltered = await mock.trades.list({ symbol: 'BTC', exchange: 'mexc' })
            expect(listFiltered.ok).toBe(true)
            if (listFiltered.ok) {
                expect(listFiltered.data.length).toBe(1)
            }

            const listNone = await mock.trades.list({ symbol: 'ETH' })
            expect(listNone.ok).toBe(true)
            if (listNone.ok) {
                expect(listNone.data.length).toBe(0)
            }

            // 4. Update
            const updatePayload: TradeSavePayload = {
                ...samplePayload,
                trade: {
                    ...samplePayload.trade,
                    realizedPnl: 1500,
                },
            }
            const updateRes = await mock.trades.update(tradeId, updatePayload)
            expect(updateRes.ok).toBe(true)

            const getAfterUpdate = await mock.trades.get(tradeId)
            expect(getAfterUpdate.ok).toBe(true)
            if (getAfterUpdate.ok) {
                expect(getAfterUpdate.data?.trade.realizedPnl).toBe(1500)
            }

            // 5. Meta
            const metaRes = await mock.trades.getMeta()
            expect(metaRes.ok).toBe(true)
            if (metaRes.ok) {
                expect(metaRes.data.symbols).toContain('BTCUSDT')
                expect(metaRes.data.setupTags).toContain('Breakout')
                expect(metaRes.data.tags).toContain('trend')
                expect(metaRes.data.totalTrades).toBe(1)
            }

            // 6. Export Journal (JSON dan CSV)
            const exportJson = await mock.trades.exportJournal('json')
            expect(exportJson.ok).toBe(true)
            if (exportJson.ok) {
                expect(exportJson.data).toContain('BTCUSDT')
            }

            const exportCsv = await mock.trades.exportJournal('csv')
            expect(exportCsv.ok).toBe(true)
            if (exportCsv.ok) {
                expect(exportCsv.data).toContain('BTCUSDT')
            }

            // 7. Delete
            const deleteRes = await mock.trades.delete(tradeId)
            expect(deleteRes.ok).toBe(true)

            const getAfterDelete = await mock.trades.get(tradeId)
            expect(getAfterDelete.ok).toBe(true)
            if (getAfterDelete.ok) {
                expect(getAfterDelete.data).toBeNull()
            }
        })

        it('mengembalikan error NOT_FOUND saat update atau delete trade yang tidak ada', async () => {
            const updateRes = await mock.trades.update(999, samplePayload)
            expect(updateRes.ok).toBe(false)
            if (!updateRes.ok) {
                expect(updateRes.error.code).toBe('TRADE_NOT_FOUND')
            }

            const deleteRes = await mock.trades.delete(999)
            expect(deleteRes.ok).toBe(false)
            if (!deleteRes.ok) {
                expect(deleteRes.error.code).toBe('TRADE_NOT_FOUND')
            }
        })
    })

    describe('Domain Settings', () => {
        it('menyimpan dan membaca pengaturan secara persisten di memori', async () => {
            const setRes = await mock.settings.set({ theme: 'dark', hidePnl: true })
            expect(setRes.ok).toBe(true)

            const getRes = await mock.settings.getAll()
            expect(getRes.ok).toBe(true)
            if (getRes.ok) {
                expect(getRes.data.theme).toBe('dark')
                expect(getRes.data.hidePnl).toBe(true)
            }
        })
    })

    describe('Domain Sync & Progress Event', () => {
        it('menangani lifecycle kredensial, saldo, dan event progres sync', async () => {
            // Save & Get credentials
            const saveCred = await mock.sync.saveCredentials({
                exchange: 'bybit',
                apiKey: 'apiKeySecretKey123',
                apiSecret: 'secretValue',
            })
            expect(saveCred.ok).toBe(true)

            const statuses = await mock.sync.getCredentialStatuses()
            expect(statuses.ok).toBe(true)
            if (statuses.ok && statuses.data.length > 0) {
                expect(statuses.data[0]?.exchange).toBe('bybit')
                expect(statuses.data[0]?.keyHint).toContain('api...123')
            }

            // Listen progress event
            const progressUpdates: string[] = []
            const unlisten = mock.sync.onProgress((p) => {
                progressUpdates.push(p.stage)
            })

            mock.emitSyncProgress({
                exchange: 'bybit',
                stage: 'positions',
                message: 'Mengambil posisi aktif',
            })
            mock.emitSyncProgress({
                exchange: 'bybit',
                stage: 'done',
                message: 'Selesai sinkronisasi',
            })

            expect(progressUpdates).toEqual(['positions', 'done'])

            // Unlisten
            unlisten()
            mock.emitSyncProgress({
                exchange: 'bybit',
                stage: 'fills',
                message: 'Tidak boleh terpanggil',
            })
            expect(progressUpdates.length).toBe(2)

            // Delete credentials
            const deleteCred = await mock.sync.deleteCredentials('bybit')
            expect(deleteCred.ok).toBe(true)

            const afterDel = await mock.sync.getCredentialStatuses()
            expect(afterDel.ok).toBe(true)
            if (afterDel.ok) {
                expect(afterDel.data.length).toBe(0)
            }
        })
    })

    describe('Domain Media, Backup, AI, & System', () => {
        it('menguji operasi media biner (screenshot & video)', async () => {
            const testBytes = new Uint8Array([1, 2, 3, 4, 5])
            const uploadRes = await mock.media.uploadScreenshot({
                fileName: 'chart.png',
                data: testBytes,
            })
            expect(uploadRes.ok).toBe(true)
            if (uploadRes.ok) {
                expect(uploadRes.data).toContain('chart.png')
            }

            const remuxRes = await mock.media.remuxVideoMp4(testBytes)
            expect(remuxRes.ok).toBe(true)
            if (remuxRes.ok) {
                expect(remuxRes.data).toEqual(testBytes)
            }

            const saveRes = await mock.media.saveVideoFile('export.mp4', testBytes)
            expect(saveRes.ok).toBe(true)
            if (saveRes.ok) {
                expect(saveRes.data).toContain('export.mp4')
            }
        })

        it('menguji alur backup dan pemulihan', async () => {
            const status = await mock.backup.getStatus()
            expect(status.ok).toBe(true)

            const run = await mock.backup.run()
            expect(run.ok).toBe(true)

            const restore = await mock.backup.restore('/path/to/backup')
            expect(restore.ok).toBe(true)
            if (restore.ok) {
                expect(restore.data.success).toBe(true)
            }
        })

        it('menguji konfigurasi AI dan analisis jurnal', async () => {
            const saveConfig = await mock.ai.saveConfig({
                apiKey: 'sk-ai-test-key-long-enough',
                model: 'gpt-4o',
            })
            expect(saveConfig.ok).toBe(true)

            const config = await mock.ai.getConfig()
            expect(config.ok).toBe(true)
            if (config.ok) {
                expect(config.data.configured).toBe(true)
                expect(config.data.model).toBe('gpt-4o')
            }

            const analysis = await mock.ai.analyzeJournal()
            expect(analysis.ok).toBe(true)
            if (analysis.ok) {
                expect(analysis.data.summary).toContain('Analisis mock AI')
            }
        })

        it('menguji utilitas sistem, log, dan health', async () => {
            const health = await mock.system.getAppHealth()
            expect(health.ok).toBe(true)
            if (health.ok) {
                expect(health.data.ok).toBe(true)
            }

            const version = await mock.system.getAppVersion()
            expect(version.ok).toBe(true)
            if (version.ok) {
                expect(version.data).toBe('1.8.3-mock')
            }

            await mock.system.logInfo('Pesan info pengujian')
            await mock.system.logError('Pesan galat pengujian')

            const logs = await mock.system.getLogs()
            expect(logs.ok).toBe(true)
            if (logs.ok && logs.data.length >= 2) {
                expect(logs.data.length).toBe(2)
                expect(logs.data[0]?.level).toBe('INFO')
                expect(logs.data[1]?.level).toBe('ERROR')
            }

            await mock.system.clearLogs()
            const logsAfterClear = await mock.system.getLogs()
            expect(logsAfterClear.ok).toBe(true)
            if (logsAfterClear.ok) {
                expect(logsAfterClear.data.length).toBe(0)
            }
        })
    })
})

describe('createApiClient Factory', () => {
    it('mengembalikan InMemoryMockAdapter saat forceMock: true', () => {
        const client = createApiClient({ forceMock: true })
        expect(client).toBeInstanceOf(InMemoryMockAdapter)
    })

    it('mengembalikan InMemoryMockAdapter saat tidak di lingkungan Tauri desktop', () => {
        const client = createApiClient()
        expect(client).toBeInstanceOf(InMemoryMockAdapter)
    })

    it('mendeteksi lingkungan Tauri dengan akurat', () => {
        expect(isTauriEnvironment()).toBe(false)
    })
})

describe('NativeTauriAdapter & Error Normalization', () => {
    it('mengonversi respon invoke direct dan mutation menjadi AppResult dengan aman', async () => {
        const adapter = new NativeTauriAdapter()

        // Mock module @tauri-apps/api/core invoke
        const { invoke } = await import('@tauri-apps/api/core')
        const invokeMock = vi.mocked(invoke)

        // Skenario 1: invoke sukses pada direct call
        invokeMock.mockResolvedValueOnce({ ok: true, details: [], dbPath: 'db.sqlite' })
        const healthRes = await adapter.system.getAppHealth()
        expect(healthRes.ok).toBe(true)
        if (healthRes.ok) {
            expect(healthRes.data.dbPath).toBe('db.sqlite')
        }

        // Skenario 2: invoke throw exception pada direct call
        invokeMock.mockRejectedValueOnce(new Error('Koneksi IPC terputus'))
        const failHealth = await adapter.system.getAppHealth()
        expect(failHealth.ok).toBe(false)
        if (!failHealth.ok) {
            expect(failHealth.error.code).toBe('APP_HEALTH_ERROR')
            expect(failHealth.error.message).toBe('Koneksi IPC terputus')
        }

        // Skenario 3: invoke mutation call yang mengembalikan MutationResult ok: false
        invokeMock.mockResolvedValueOnce({ ok: false, error: 'Database terkunci' })
        const deleteRes = await adapter.trades.delete(10)
        expect(deleteRes.ok).toBe(false)
        if (!deleteRes.ok) {
            expect(deleteRes.error.code).toBe('TRADE_DELETE_FAILED')
            expect(deleteRes.error.message).toBe('Database terkunci')
        }

        // Skenario 4: invoke mutation call yang berhasil
        invokeMock.mockResolvedValueOnce({ ok: true, data: 42 })
        const createRes = await adapter.trades.create({
            trade: {
                exchange: 'mexc',
                symbol: 'ETHUSDT',
                direction: 'short',
                entryPrice: 3000,
                exitPrice: 2900,
                entryTime: 1,
                exitTime: 2,
                size: 1,
                leverage: 5,
                marginMode: null,
                realizedPnl: 100,
                feeOpen: 1,
                feeClose: 1,
                fundingFee: 0,
            },
        })
        expect(createRes.ok).toBe(true)
        if (createRes.ok) {
            expect(createRes.data).toBe(42)
        }
    })
})

describe('Backwards Compatibility Bridge (createTauriApi)', () => {
    it('menjaga kontrak PreloadApi / window.api 100% kompatibel tanpa merusak pemanggil lama', async () => {
        const mock = new InMemoryMockAdapter()
        const api = createTauriApi(mock)

        // 1. Operasi direct (mis. getAppHealth, getTradeMeta, listTrades)
        const health = await api.getAppHealth()
        expect(health.ok).toBe(true)
        expect(health.dbPath).toBe(':memory:')

        const meta = await api.getTradeMeta()
        expect(meta.totalTrades).toBe(0)

        // 2. Operasi mutasi yang mengembalikan MutationResult (mis. createTrade)
        const createRes = await api.createTrade({
            trade: {
                exchange: 'binance',
                symbol: 'SOLUSDT',
                direction: 'long',
                entryPrice: 150,
                exitPrice: 160,
                entryTime: 1000,
                exitTime: 2000,
                size: 10,
                leverage: 3,
                marginMode: 'isolated',
                realizedPnl: 100,
                feeOpen: 0.5,
                feeClose: 0.5,
                fundingFee: 0,
            },
        })
        expect(createRes.ok).toBe(true)
        expect(createRes.data).toBe(1)

        // 3. Memastikan listTrades mengembalikan daftar trade murni
        const trades = await api.listTrades()
        expect(Array.isArray(trades)).toBe(true)
        expect(trades.length).toBe(1)
        expect(trades[0]?.trade.symbol).toBe('SOLUSDT')

        // 4. Operasi mutasi yang gagal (mis. deleteTrade pada ID fiktif)
        const deleteRes = await api.deleteTrade(9999)
        expect(deleteRes.ok).toBe(false)
        expect(deleteRes.error).toContain('tidak ditemukan')

        // 5. Operasi video remuxing biner
        const dummyData = new Uint8Array([10, 20, 30])
        const remuxRes = await api.remuxVideoMp4!(dummyData)
        expect(remuxRes.ok).toBe(true)
        expect(remuxRes.data).toEqual(dummyData)
    })
})
