/**
 * Adapter IPC Native Tauri v2 untuk Nitirekso.
 *
 * Mengimplementasikan kontrak IpcClient dengan memanggil perintah backend Tauri
 * melalui `@tauri-apps/api/core` invoke, serta menormalisasi seluruh respon
 * dan galat ke tipe standar AppResult<T, AppError>.
 */

import { invoke } from '@tauri-apps/api/core'
import type {
    AccountBalance,
    AiConfigPayload,
    AiConfigStatus,
    AppHealth,
    AppUpdateInfo,
    BackupRestoreResult,
    BackupRunResult,
    BackupStatusPayload,
    BtcKlinePoint,
    CredentialSavePayload,
    CredentialStatusPayload,
    JournalAnalysisResult,
    LogEntry,
    MutationResult,
    ScreenshotUploadPayload,
    SettingsPayload,
    SyncableExchange,
    SyncProgressPayload,
    SyncRunResult,
    SyncStatePayload,
    TradeDetail,
    TradeFilterPayload,
    TradeMeta,
    TradeSavePayload,
} from '@shared/ipc-contract'
import {
    createAppError,
    err,
    normalizeAppError,
    ok,
    type AiClient,
    type AppResult,
    type BackupClient,
    type IpcClient,
    type MediaClient,
    type SettingsClient,
    type SyncClient,
    type SystemClient,
    type TradesClient,
} from './types'

/**
 * Helper internal untuk mengeksekusi invoke Tauri yang mengembalikan nilai langsung (direct data).
 */
async function invokeDirect<T>(
    cmd: string,
    args?: Record<string, unknown>,
    defaultErrorCode = 'IPC_ERROR'
): Promise<AppResult<T>> {
    try {
        const res = await invoke<T>(cmd, args)
        return ok(res)
    } catch (e) {
        return err(normalizeAppError(e, defaultErrorCode))
    }
}

/**
 * Helper internal untuk mengeksekusi invoke Tauri yang mengembalikan MutationResult<T>.
 */
async function invokeMutation<T>(
    cmd: string,
    args?: Record<string, unknown>,
    defaultErrorCode = 'MUTATION_ERROR'
): Promise<AppResult<T>> {
    try {
        const res = await invoke<MutationResult<T>>(cmd, args)
        if (!res.ok) {
            return err(createAppError(defaultErrorCode, res.error ?? 'Operasi backend gagal'))
        }
        return ok(res.data as T)
    } catch (e) {
        return err(normalizeAppError(e, defaultErrorCode))
    }
}

export class NativeTauriAdapter implements IpcClient {
    // -----------------------------------------------------------------------
    // Domain Trades
    // -----------------------------------------------------------------------

    public readonly trades: TradesClient = {
        list: async (filter?: TradeFilterPayload): Promise<AppResult<TradeDetail[]>> => {
            return await invokeDirect<TradeDetail[]>('list_trades', { filter }, 'TRADE_LIST_ERROR')
        },

        get: async (id: number): Promise<AppResult<TradeDetail | null>> => {
            return await invokeDirect<TradeDetail | null>('get_trade', { id }, 'TRADE_GET_ERROR')
        },

        create: async (payload: TradeSavePayload): Promise<AppResult<number>> => {
            return await invokeMutation<number>('create_trade', { payload }, 'TRADE_CREATE_FAILED')
        },

        update: async (id: number, payload: TradeSavePayload): Promise<AppResult<void>> => {
            return await invokeMutation<void>(
                'update_trade',
                { id, payload },
                'TRADE_UPDATE_FAILED'
            )
        },

        delete: async (id: number): Promise<AppResult<void>> => {
            return await invokeMutation<void>('delete_trade', { id }, 'TRADE_DELETE_FAILED')
        },

        getMeta: async (): Promise<AppResult<TradeMeta>> => {
            return await invokeDirect<TradeMeta>('get_trade_meta', undefined, 'TRADE_META_ERROR')
        },

        exportJournal: async (
            format: 'csv' | 'json' | 'pdf',
            filter?: TradeFilterPayload
        ): Promise<AppResult<string>> => {
            return await invokeMutation<string>(
                'export_journal',
                { format, filter },
                'EXPORT_JOURNAL_FAILED'
            )
        },
    }

    // -----------------------------------------------------------------------
    // Domain Settings
    // -----------------------------------------------------------------------

    public readonly settings: SettingsClient = {
        getAll: async (): Promise<AppResult<SettingsPayload>> => {
            return await invokeDirect<SettingsPayload>(
                'get_settings',
                undefined,
                'SETTINGS_GET_ERROR'
            )
        },

        set: async (payload: SettingsPayload): Promise<AppResult<void>> => {
            return await invokeMutation<void>('set_settings', { payload }, 'SETTINGS_SET_FAILED')
        },
    }

    // -----------------------------------------------------------------------
    // Domain Sync
    // -----------------------------------------------------------------------

    public readonly sync: SyncClient = {
        getStates: async (): Promise<AppResult<SyncStatePayload[]>> => {
            return await invokeMutation<SyncStatePayload[]>(
                'get_sync_states',
                undefined,
                'SYNC_STATES_ERROR'
            )
        },

        run: async (): Promise<AppResult<SyncRunResult>> => {
            return await invokeMutation<SyncRunResult>('run_sync', undefined, 'SYNC_RUN_FAILED')
        },

        onProgress: (callback: (progress: SyncProgressPayload) => void): (() => void) => {
            let unlistenFn: (() => void) | null = null
            import('@tauri-apps/api/event')
                .then(({ listen }) => {
                    listen<SyncProgressPayload>('sync:progress', (event) => {
                        callback(event.payload)
                    }).then((unlisten) => {
                        unlistenFn = unlisten
                    })
                })
                .catch((e) => {
                    console.error('[NativeTauriAdapter] Gagal mendaftarkan listen event sync:progress:', e)
                })

            return () => {
                if (unlistenFn) {
                    unlistenFn()
                }
            }
        },

        getBalances: async (): Promise<AppResult<AccountBalance[]>> => {
            return await invokeDirect<AccountBalance[]>(
                'get_balances',
                undefined,
                'BALANCES_GET_ERROR'
            )
        },

        syncBalances: async (): Promise<AppResult<AccountBalance[]>> => {
            return await invokeMutation<AccountBalance[]>(
                'sync_balances',
                undefined,
                'BALANCES_SYNC_FAILED'
            )
        },

        getCredentialStatuses: async (): Promise<AppResult<CredentialStatusPayload[]>> => {
            return await invokeMutation<CredentialStatusPayload[]>(
                'get_credential_statuses',
                undefined,
                'CREDENTIAL_STATUS_ERROR'
            )
        },

        saveCredentials: async (payload: CredentialSavePayload): Promise<AppResult<void>> => {
            return await invokeMutation<void>(
                'save_credentials',
                { payload },
                'CREDENTIAL_SAVE_FAILED'
            )
        },

        deleteCredentials: async (exchange: SyncableExchange): Promise<AppResult<void>> => {
            return await invokeMutation<void>(
                'delete_credentials',
                { exchange },
                'CREDENTIAL_DELETE_FAILED'
            )
        },
    }

    // -----------------------------------------------------------------------
    // Domain Media
    // -----------------------------------------------------------------------

    public readonly media: MediaClient = {
        uploadScreenshot: async (payload: ScreenshotUploadPayload): Promise<AppResult<string>> => {
            return await invokeMutation<string>(
                'upload_screenshot',
                { payload },
                'SCREENSHOT_UPLOAD_FAILED'
            )
        },

        getScreenshot: async (relPath: string): Promise<AppResult<string>> => {
            return await invokeMutation<string>(
                'get_screenshot',
                { relPath },
                'SCREENSHOT_GET_FAILED'
            )
        },

        remuxVideoMp4: async (
            data: Uint8Array,
            audioData?: Uint8Array
        ): Promise<AppResult<Uint8Array>> => {
            try {
                // Susun payload biner teroptimasi (envelope bebas alokasi JSON):
                // - 4 byte pertama: integer u32 big-endian penanda panjang trek audio (audioLen).
                // - audioLen byte berikutnya: byte data audio sekunder (jika ada).
                // - sisa byte: byte data video mentah fMP4.
                const audioLen = audioData ? audioData.byteLength : 0
                const payload = new Uint8Array(4 + audioLen + data.byteLength)
                const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength)
                view.setUint32(0, audioLen, false) // Format big-endian baku jaringan

                if (audioData && audioLen > 0) {
                    payload.set(audioData, 4)
                }
                payload.set(data, 4 + audioLen)

                // Transmisi biner langsung via invoke Tauri v2 tanpa serialisasi array JSON
                const response = await invoke<ArrayBuffer | Uint8Array>('remux_video_mp4', payload)
                const resultBytes =
                    response instanceof Uint8Array ? response : new Uint8Array(response)
                return ok(resultBytes)
            } catch (e) {
                return err(normalizeAppError(e, 'VIDEO_REMUX_ERROR'))
            }
        },

        saveVideoFile: async (
            defaultName: string,
            data: Uint8Array
        ): Promise<AppResult<string | null>> => {
            try {
                // Kirim buffer biner mentah langsung ke backend tanpa overhead JSON [u8; N].
                // Nama berkas bawaan disisipkan secara aman melalui header IPC (URL-encoded).
                const res = await invoke<MutationResult<string | null>>('save_video_file', data, {
                    headers: {
                        'x-file-name': encodeURIComponent(defaultName),
                    },
                })
                if (res.ok) {
                    return ok(res.data ?? null)
                }
                return err(
                    createAppError(
                        'SAVE_VIDEO_FAILED',
                        res.error ?? 'Gagal menyimpan berkas video'
                    )
                )
            } catch (e) {
                return err(normalizeAppError(e, 'SAVE_VIDEO_ERROR'))
            }
        },
    }

    // -----------------------------------------------------------------------
    // Domain Backup
    // -----------------------------------------------------------------------

    public readonly backup: BackupClient = {
        getStatus: async (): Promise<AppResult<BackupStatusPayload>> => {
            return await invokeDirect<BackupStatusPayload>(
                'get_backup_status',
                undefined,
                'BACKUP_STATUS_ERROR'
            )
        },

        run: async (): Promise<AppResult<BackupRunResult>> => {
            return await invokeMutation<BackupRunResult>(
                'run_backup',
                undefined,
                'BACKUP_RUN_FAILED'
            )
        },

        restore: async (folderPath?: string): Promise<AppResult<BackupRestoreResult>> => {
            return await invokeMutation<BackupRestoreResult>(
                'restore_backup',
                { folderPath },
                'BACKUP_RESTORE_FAILED'
            )
        },

        disconnect: async (): Promise<AppResult<void>> => {
            return await invokeMutation<void>(
                'disconnect_backup',
                undefined,
                'BACKUP_DISCONNECT_FAILED'
            )
        },

        startOAuth: async (clientId?: string): Promise<AppResult<void>> => {
            return await invokeMutation<void>(
                'start_backup_oauth',
                { clientId },
                'BACKUP_OAUTH_FAILED'
            )
        },

        selectFolder: async (): Promise<AppResult<string | null>> => {
            return await invokeMutation<string | null>(
                'select_backup_folder',
                undefined,
                'BACKUP_SELECT_FOLDER_FAILED'
            )
        },
    }

    // -----------------------------------------------------------------------
    // Domain AI
    // -----------------------------------------------------------------------

    public readonly ai: AiClient = {
        getConfig: async (): Promise<AppResult<AiConfigStatus>> => {
            return await invokeDirect<AiConfigStatus>(
                'get_ai_config',
                undefined,
                'AI_CONFIG_GET_ERROR'
            )
        },

        saveConfig: async (payload: AiConfigPayload): Promise<AppResult<void>> => {
            return await invokeMutation<void>('save_ai_config', { payload }, 'AI_CONFIG_SAVE_FAILED')
        },

        deleteConfig: async (): Promise<AppResult<void>> => {
            return await invokeMutation<void>(
                'delete_ai_config',
                undefined,
                'AI_CONFIG_DELETE_FAILED'
            )
        },

        analyzeJournal: async (
            filter?: TradeFilterPayload
        ): Promise<AppResult<JournalAnalysisResult>> => {
            return await invokeMutation<JournalAnalysisResult>(
                'analyze_journal',
                { filter },
                'AI_ANALYZE_JOURNAL_FAILED'
            )
        },
    }

    // -----------------------------------------------------------------------
    // Domain System
    // -----------------------------------------------------------------------

    public readonly system: SystemClient = {
        getAppHealth: async (): Promise<AppResult<AppHealth>> => {
            return await invokeDirect<AppHealth>(
                'get_app_health',
                undefined,
                'APP_HEALTH_ERROR'
            )
        },

        getAppVersion: async (): Promise<AppResult<string>> => {
            return await invokeDirect<string>(
                'get_app_version',
                undefined,
                'APP_VERSION_ERROR'
            )
        },

        checkForUpdates: async (): Promise<AppResult<AppUpdateInfo>> => {
            return await invokeMutation<AppUpdateInfo>(
                'check_for_updates',
                undefined,
                'CHECK_UPDATES_FAILED'
            )
        },

        openExternalUrl: async (url: string): Promise<AppResult<void>> => {
            return await invokeMutation<void>(
                'open_external_url',
                { url },
                'OPEN_URL_FAILED'
            )
        },

        getBtcKlines: async (payload: {
            startTime: number
            endTime: number
        }): Promise<AppResult<BtcKlinePoint[]>> => {
            return await invokeMutation<BtcKlinePoint[]>(
                'get_btc_klines',
                { payload },
                'BTC_KLINES_FAILED'
            )
        },

        getLogs: async (limit?: number): Promise<AppResult<LogEntry[]>> => {
            return await invokeMutation<LogEntry[]>('get_logs', { limit }, 'GET_LOGS_FAILED')
        },

        clearLogs: async (): Promise<AppResult<void>> => {
            return await invokeMutation<void>('clear_logs', undefined, 'CLEAR_LOGS_FAILED')
        },

        openLogFolder: async (): Promise<AppResult<void>> => {
            return await invokeMutation<void>(
                'open_log_folder',
                undefined,
                'OPEN_LOG_FOLDER_FAILED'
            )
        },

        log: async (
            level: 'INFO' | 'WARN' | 'ERROR',
            message: string,
            details?: unknown
        ): Promise<void> => {
            try {
                await invoke('write_log', {
                    level,
                    message: String(message),
                    details: details
                        ? typeof details === 'string'
                            ? details
                            : JSON.stringify(details)
                        : null,
                })
            } catch (e) {
                console.error('[NativeTauriAdapter] Gagal menulis log backend:', e)
            }
        },

        logInfo: async (message: string, details?: unknown): Promise<void> => {
            await this.system.log('INFO', message, details)
        },

        logWarn: async (message: string, details?: unknown): Promise<void> => {
            await this.system.log('WARN', message, details)
        },

        logError: async (message: string, details?: unknown): Promise<void> => {
            await this.system.log('ERROR', message, details)
        },
    }
}
