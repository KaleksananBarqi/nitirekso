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
    DeviceSyncConnectPayload,
    DeviceSyncRunResult,
    DeviceSyncStatusPayload,
    InstallEnvironment,
    InstallKind,
    JournalAnalysisResult,
    LinuxDownloadVerificationResult,
    LinuxInstallResult,
    LogEntry,
    MediaAssetInfo,
    MediaUploadPayload,
    MutationResult,
    ReleaseMetadataResult,
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
    UpdateDownloadProgress,
} from '@shared/ipc-contract'
import {
    createAppError,
    err,
    normalizeAppError,
    ok,
    type AiClient,
    type AppResult,
    type BackupClient,
    type DeviceSyncClient,
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

/**
 * Helper internal untuk mengeksekusi invoke biner mentah (`InvokeBody::Raw`)
 * dengan header ter-encode URL dan normalisasi ke `AppResult<T>`.
 */
async function invokeRawMedia<T>(
    cmd: string,
    data: Uint8Array,
    headers: Record<string, string>,
    failedCode: string,
    errorCode: string,
    fallbackMsg: string
): Promise<AppResult<T>> {
    try {
        const encodedHeaders: Record<string, string> = {}
        for (const [k, v] of Object.entries(headers)) {
            encodedHeaders[k] = encodeURIComponent(v)
        }
        const res = await invoke<MutationResult<T>>(cmd, data, { headers: encodedHeaders })
        if (res.ok) {
            return ok((res.data ?? undefined) as T)
        }
        return err(createAppError(failedCode, res.error ?? fallbackMsg))
    } catch (e) {
        return err(normalizeAppError(e, errorCode))
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
            // Konversi Uint8Array ke array angka standar agar tidak terserialisasi sebagai objek {"0":...} di JSON
            const serializablePayload = {
                ...payload,
                data: Array.from(payload.data),
            }
            return await invokeMutation<string>(
                'upload_screenshot',
                { payload: serializablePayload },
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

        saveMediaAsset: async (payload: MediaUploadPayload): Promise<AppResult<MediaAssetInfo>> => {
            return await invokeRawMedia<MediaAssetInfo>(
                'save_media_asset',
                payload.data,
                { 'x-media-kind': payload.kind, 'x-file-name': payload.fileName },
                'MEDIA_SAVE_FAILED',
                'MEDIA_SAVE_FAILED',
                'Gagal menyimpan berkas media ke backend'
            )
        },

        getMediaAsset: async (sha256: string): Promise<AppResult<string>> => {
            return await invokeMutation<string>(
                'get_media_asset',
                { sha256 },
                'MEDIA_GET_FAILED'
            )
        },

        deleteMediaAsset: async (sha256: string): Promise<AppResult<void>> => {
            return await invokeMutation<void>(
                'delete_media_asset',
                { sha256 },
                'MEDIA_DELETE_FAILED'
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
            const res = await invokeRawMedia<string | null>(
                'save_video_file',
                data,
                { 'x-file-name': defaultName },
                'SAVE_VIDEO_FAILED',
                'SAVE_VIDEO_ERROR',
                'Gagal menyimpan berkas video'
            )
            return res.ok ? ok(res.data ?? null) : res
        },

        saveMediaExport: async (
            fileName: string,
            mimeType: string,
            data: Uint8Array
        ): Promise<AppResult<string | null>> => {
            const res = await invokeRawMedia<string | null>(
                'save_media_export',
                data,
                { 'x-file-name': fileName, 'x-mime-type': mimeType },
                'SAVE_MEDIA_EXPORT_FAILED',
                'SAVE_MEDIA_EXPORT_ERROR',
                'Gagal menyimpan berkas media'
            )
            return res.ok ? ok(res.data ?? null) : res
        },

        shareMediaExport: async (
            fileName: string,
            mimeType: string,
            title: string,
            data: Uint8Array
        ): Promise<AppResult<void>> => {
            return await invokeRawMedia<void>(
                'share_media_export',
                data,
                { 'x-file-name': fileName, 'x-mime-type': mimeType, 'x-title': title },
                'SHARE_MEDIA_EXPORT_FAILED',
                'SHARE_MEDIA_EXPORT_ERROR',
                'Gagal membagikan berkas media'
            )
        },

        copyMediaImage: async (
            fileName: string,
            mimeType: string,
            data: Uint8Array
        ): Promise<AppResult<void>> => {
            return await invokeRawMedia<void>(
                'copy_media_image',
                data,
                { 'x-file-name': fileName, 'x-mime-type': mimeType },
                'COPY_MEDIA_IMAGE_FAILED',
                'COPY_MEDIA_IMAGE_ERROR',
                'Gagal menyalin gambar ke clipboard'
            )
        },
    }

    // -----------------------------------------------------------------------
    // Domain Backup (Local Snapshot)
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

        selectFolder: async (): Promise<AppResult<string | null>> => {
            return await invokeMutation<string | null>(
                'select_backup_folder',
                undefined,
                'BACKUP_SELECT_FOLDER_FAILED'
            )
        },
    }

    // -----------------------------------------------------------------------
    // Domain DeviceSync (Sync Vault)
    // -----------------------------------------------------------------------

    public readonly deviceSync: DeviceSyncClient = {
        getStatus: async (): Promise<AppResult<DeviceSyncStatusPayload>> => {
            return await invokeDirect<DeviceSyncStatusPayload>(
                'get_device_sync_status',
                undefined,
                'DEVICE_SYNC_STATUS_ERROR'
            )
        },

        selectFolder: async (): Promise<AppResult<string | null>> => {
            return await invokeMutation<string | null>(
                'select_sync_vault_folder',
                undefined,
                'DEVICE_SYNC_SELECT_FOLDER_FAILED'
            )
        },

        connect: async (payload: DeviceSyncConnectPayload): Promise<AppResult<DeviceSyncRunResult>> => {
            return await invokeMutation<DeviceSyncRunResult>(
                'connect_sync_vault',
                { payload },
                'DEVICE_SYNC_CONNECT_FAILED'
            )
        },

        disconnect: async (): Promise<AppResult<void>> => {
            return await invokeMutation<void>(
                'disconnect_sync_vault',
                undefined,
                'DEVICE_SYNC_DISCONNECT_FAILED'
            )
        },

        run: async (): Promise<AppResult<DeviceSyncRunResult>> => {
            return await invokeMutation<DeviceSyncRunResult>(
                'run_device_sync',
                undefined,
                'DEVICE_SYNC_RUN_FAILED'
            )
        },

        onUpdated: (callback: () => void): (() => void) => {
            let unlistenFn: (() => void) | null = null
            let cancelled = false
            import('@tauri-apps/api/event')
                .then(({ listen }) => {
                    listen('device-sync:updated', () => {
                        callback()
                    }).then((unlisten) => {
                        if (cancelled) {
                            unlisten()
                        } else {
                            unlistenFn = unlisten
                        }
                    })
                })
                .catch((e) => {
                    console.error('[NativeTauriAdapter] Gagal listen device-sync:updated:', e)
                })

            return () => {
                cancelled = true
                if (unlistenFn) {
                    unlistenFn()
                    unlistenFn = null
                }
            }
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

        detectInstallEnvironment: async (): Promise<AppResult<InstallEnvironment>> => {
            return await invokeDirect<InstallEnvironment>(
                'detect_install_environment',
                undefined,
                'DETECT_INSTALL_ENV_ERROR'
            )
        },

        fetchReleaseMetadata: async (
            etag?: string | null
        ): Promise<AppResult<ReleaseMetadataResult>> => {
            return await invokeMutation<ReleaseMetadataResult>(
                'fetch_release_update_metadata',
                { etag: etag ?? null },
                'FETCH_RELEASE_METADATA_FAILED'
            )
        },

        downloadLinuxPackage: async (
            assetUrl: string,
            assetName: string,
            expectedVersion: string
        ): Promise<AppResult<LinuxDownloadVerificationResult>> => {
            return await invokeMutation<LinuxDownloadVerificationResult>(
                'download_and_verify_linux_package',
                { assetUrl, assetName, expectedVersion },
                'LINUX_DOWNLOAD_FAILED'
            )
        },

        installLinuxPackageAndRelaunch: async (
            localPath: string,
            installKind: InstallKind
        ): Promise<AppResult<LinuxInstallResult>> => {
            return await invokeMutation<LinuxInstallResult>(
                'install_linux_package_and_relaunch',
                { localPath, installKind },
                'LINUX_INSTALL_FAILED'
            )
        },

        openLocalInstallerFallback: async (
            localPath: string
        ): Promise<AppResult<LinuxInstallResult>> => {
            return await invokeMutation<LinuxInstallResult>(
                'open_local_installer_fallback',
                { localPath },
                'LINUX_FALLBACK_OPEN_FAILED'
            )
        },

        onUpdateDownloadProgress: (
            callback: (progress: UpdateDownloadProgress) => void
        ): (() => void) => {
            let unlistenFn: (() => void) | null = null
            let cancelled = false
            import('@tauri-apps/api/event')
                .then(({ listen }) => {
                    listen<UpdateDownloadProgress>('updater:download-progress', (event) => {
                        callback(event.payload)
                    }).then((unlisten) => {
                        if (cancelled) {
                            unlisten()
                        } else {
                            unlistenFn = unlisten
                        }
                    })
                })
                .catch((e) => {
                    console.error(
                        '[NativeTauriAdapter] Gagal mendaftarkan listen event updater:download-progress:',
                        e
                    )
                })

            return () => {
                cancelled = true
                if (unlistenFn) {
                    unlistenFn()
                    unlistenFn = null
                }
            }
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
