import { ipcMain, type BrowserWindow } from 'electron'
import {
    IPC_CHANNELS,
    type CredentialSavePayload,
    type CredentialStatusPayload,
    type MutationResult,
    type SyncProgressPayload,
    type SyncRunResult,
    type SyncStatePayload,
    type SyncableExchange
} from '../../shared/ipc-contract'
import { getDb } from '../db/index'
import { getSyncState } from '../db/repositories/sync'
import { getAllBalances, upsertBalances } from '../db/repositories/balance'
import type { AccountBalance } from '../../shared/domain'

import {
    deleteCredentials,
    getAllStatuses,
    isSecureStorageAvailable,
    loadCredentials,
    saveCredentials
} from '../credentials/keystore'
import { MexcAdapter } from '../exchanges/mexc/index'
import { BitunixAdapter } from '../exchanges/bitunix/index'
import { BybitAdapter } from '../exchanges/bybit/index'
import { BinanceAdapter } from '../exchanges/binance/index'
import { BingxAdapter } from '../exchanges/bingx/index'
import { syncAll } from '../sync/engine'
import type { ExchangeAdapter, SupportedExchange } from '../exchanges/types'
import { logger } from '../utils/logger'

/**
 * Handler IPC untuk kredensial dan sync (Fase 2).
 *
 * ===========================================================================
 * ATURAN KEAMANAN YANG DITEGAKKAN DI FILE INI
 * ===========================================================================
 *
 * 1. Kredensial hanya mengalir SATU ARAH: renderer -> main. Tidak ada handler
 *    yang mengembalikan apiKey/apiSecret ke renderer. Yang dikembalikan hanya
 *    `CredentialStatusPayload` (status + petunjuk kunci, tanpa nilai).
 *
 * 2. Pemuatan kredensial (`loadCredentials`) HANYA terjadi di dalam handler
 *    sync, di main process. Hasilnya tidak pernah keluar dari blok ini.
 *
 * 3. Kalau safeStorage tidak tersedia, simpan kredensial DITOLAK. Tidak ada
 *    fallback ke file plaintext — itu akan melanggar brief §8 & §11.
 */

/**
 * Buat adapter untuk exchange yang punya kredensial.
 *
 * Exchange tanpa kredensial DILEWATI, bukan digagalkan — user mungkin hanya
 * memakai sebagian exchange.
 */
function buildAdapters(): { adapters: ExchangeAdapter[]; skipped: SupportedExchange[] } {
    const adapters: ExchangeAdapter[] = []
    const skipped: SupportedExchange[] = []

    // --- MEXC ---
    const mexcCreds = loadCredentials('mexc')
    if (mexcCreds) {
        adapters.push(new MexcAdapter(mexcCreds))
    } else {
        skipped.push('mexc')
    }

    // --- Bitunix ---
    const bitunixCreds = loadCredentials('bitunix')
    if (bitunixCreds) {
        adapters.push(
            new BitunixAdapter(bitunixCreds, {
                onDebug: (message) => logger.info(`[Bitunix] ${message}`)
            })
        )
    } else {
        skipped.push('bitunix')
    }

    // --- Bybit ---
    const bybitCreds = loadCredentials('bybit')
    if (bybitCreds) {
        adapters.push(new BybitAdapter(bybitCreds))
    } else {
        skipped.push('bybit')
    }

    // --- Binance ---
    const binanceCreds = loadCredentials('binance')
    if (binanceCreds) {
        adapters.push(new BinanceAdapter(binanceCreds))
    } else {
        skipped.push('binance')
    }

    // --- BingX ---
    const bingxCreds = loadCredentials('bingx')
    if (bingxCreds) {
        adapters.push(new BingxAdapter(bingxCreds))
    } else {
        skipped.push('bingx')
    }

    return { adapters, skipped }
}

export function registerSyncHandlers(getWindow: () => BrowserWindow | null): void {
    // --- Kredensial ---------------------------------------------------------

    ipcMain.handle(
        IPC_CHANNELS.credentialStatus,
        (): MutationResult<CredentialStatusPayload[]> => {
            const statuses = getAllStatuses()
            const secureAvailable = isSecureStorageAvailable()

            if (!secureAvailable) {
                logger.warn('[ipc:sync] safeStorage tidak tersedia di sistem ini')
            }

            return {
                ok: true,
                data: statuses.map((s) => ({
                    exchange: s.exchange,
                    configured: s.configured,
                    keyHint: s.keyHint,
                    updatedAt: s.updatedAt
                }))
            }
        }
    )

    ipcMain.handle(
        IPC_CHANNELS.credentialSave,
        (_event, payload: CredentialSavePayload): MutationResult<void> => {
            try {
                // Validasi bentuk payload sebelum menyentuh safeStorage.
                const validExchanges: SyncableExchange[] = ['mexc', 'bitunix', 'bybit', 'binance', 'bingx']
                if (!validExchanges.includes(payload.exchange)) {
                    throw new Error(`Exchange tidak dikenal: ${String(payload.exchange)}`)
                }
                if (typeof payload.apiKey !== 'string' || typeof payload.apiSecret !== 'string') {
                    throw new Error('API key dan secret harus berupa teks.')
                }

                saveCredentials(payload.exchange, {
                    apiKey: payload.apiKey,
                    apiSecret: payload.apiSecret
                })

                // PENTING: jangan pernah mencatat payload di log. Log yang mencatat
                // kredensial adalah kebocoran yang sama buruknya dengan plaintext.
                logger.info(`[ipc:sync] kredensial ${payload.exchange} tersimpan (nilai aman tidak dicatat)`)

                return { ok: true }
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error)
                logger.error('[ipc:sync] gagal menyimpan kredensial:', message)
                return { ok: false, error: message }
            }
        }
    )

    ipcMain.handle(
        IPC_CHANNELS.credentialDelete,
        (_event, exchange: SyncableExchange): MutationResult<void> => {
            try {
                if (exchange !== 'mexc' && exchange !== 'bitunix') {
                    throw new Error(`Exchange tidak valid: ${String(exchange)}`)
                }
                deleteCredentials(exchange)
                logger.info(`[ipc:sync] kredensial ${exchange} dihapus`)
                return { ok: true }
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error)
                logger.error(`[ipc:sync] gagal menghapus kredensial ${exchange}:`, message)
                return { ok: false, error: message }
            }
        }
    )

    // --- Sync ---------------------------------------------------------------

    ipcMain.handle(IPC_CHANNELS.syncState, (): MutationResult<SyncStatePayload[]> => {
        const db = getDb()
        const exchanges: SupportedExchange[] = ['mexc', 'bitunix']

        return {
            ok: true,
            data: exchanges.map((exchange) => {
                const state = getSyncState(db, exchange)
                return {
                    exchange,
                    lastSyncAt: state.lastSyncAt,
                    lastStatus: state.lastStatus,
                    lastError: state.lastError,
                    positionsSynced: state.positionsSynced,
                    fillsSynced: state.fillsSynced,
                    fundingSynced: state.fundingSynced
                }
            })
        }
    })

    ipcMain.handle(IPC_CHANNELS.syncRun, async (): Promise<MutationResult<SyncRunResult>> => {
        const startedAt = Date.now()

        try {
            const { adapters, skipped } = buildAdapters()

            if (adapters.length === 0) {
                return {
                    ok: false,
                    error: skipped.length > 0
                        ? `Belum ada kredensial exchange yang tersimpan (${skipped.join(', ')}). ` +
                        'Isi API key read-only di halaman Settings terlebih dahulu.'
                        : 'Tidak ada exchange yang bisa disinkronkan.'
                }
            }

            const window = getWindow()

            // Progress dikirim ke renderer lewat channel terpisah, supaya UI bisa
            // menampilkan tahap yang sedang berjalan saat sync lama (backfill pertama).
            const onProgress = (progress: { stage: SyncProgressPayload['stage']; message: string }): void => {
                window?.webContents.send(IPC_CHANNELS.syncProgress, {
                    exchange: adapters[0]?.id ?? 'mexc',
                    stage: progress.stage,
                    message: progress.message
                } satisfies SyncProgressPayload)
            }

            const { results, status } = await syncAll(getDb(), adapters, { onProgress })

            for (const res of results) {
                if (res.status === 'error') {
                    logger.error(`[ipc:sync] ${res.exchange} sync gagal: ${res.error ?? 'Error tidak diketahui'}`)
                } else if (res.status === 'partial') {
                    logger.warn(`[ipc:sync] ${res.exchange} sync selesai sebagian: ${res.error ?? 'Peringatan'}`)
                } else {
                    logger.info(`[ipc:sync] ${res.exchange} sync sukses: +${res.positions.inserted} posisi, +${res.fills.inserted} fills (${(res.durationMs / 1000).toFixed(1)}s)`)
                }
            }

            const payload: SyncRunResult = {
                status,
                exchanges: results.map((result) => ({
                    exchange: result.exchange as SyncableExchange,
                    status: result.status,
                    inserted: result.positions.inserted,
                    updated: result.positions.updated,
                    wasFullBackfill: result.wasFullBackfill,
                    error: result.error
                })),
                durationMs: Date.now() - startedAt
            }

            return { ok: true, data: payload }
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            logger.error('[ipc:sync] sync gagal:', error)
            return { ok: false, error: message }
        }
    })

    // --- Saldo Akun Exchange ------------------------------------------------
    ipcMain.handle(IPC_CHANNELS.balanceGet, (): MutationResult<AccountBalance[]> => {
        try {
            const db = getDb()
            const balances = getAllBalances(db)
            return { ok: true, data: balances }
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            return { ok: false, error: message }
        }
    })

    ipcMain.handle(IPC_CHANNELS.balanceSync, async (): Promise<MutationResult<AccountBalance[]>> => {
        try {
            const { adapters, skipped } = buildAdapters()
            if (adapters.length === 0) {
                return {
                    ok: false,
                    error: skipped.length > 0
                        ? `Belum ada kredensial exchange (${skipped.join(', ')}). Simpan API key terlebih dahulu.`
                        : 'Tidak ada exchange terhubung.'
                }
            }

            const db = getDb()
            const allFetched: AccountBalance[] = []
            const errors: string[] = []

            const fetchPromises = adapters
                .filter(adapter => typeof adapter.fetchBalances === 'function')
                .map(async (adapter) => {
                    try {
                        const balances = await adapter.fetchBalances!()
                        return { status: 'fulfilled' as const, adapter, balances }
                    } catch (err) {
                        return { status: 'rejected' as const, adapter, err }
                    }
                })

            const results = await Promise.all(fetchPromises)

            for (const result of results) {
                if (result.status === 'fulfilled') {
                    upsertBalances(db, result.balances)
                    allFetched.push(...result.balances)
                } else {
                    const err = result.err
                    const msg = err instanceof Error ? err.message : String(err)
                    logger.error(`[ipc:sync] Gagal ambil saldo ${result.adapter.id}:`, err)
                    errors.push(`${result.adapter.displayName}: ${msg}`)
                }
            }

            if (allFetched.length === 0 && errors.length > 0) {
                return {
                    ok: false,
                    error: `Gagal mengambil saldo: ${errors.join(' | ')}`
                }
            }

            const current = getAllBalances(db)
            return { ok: true, data: current }
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            return { ok: false, error: message }
        }
    })
}

