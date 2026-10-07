import { invoke } from '@tauri-apps/api/core';
import type {
    CredentialStatusPayload,
    MutationResult,
    PreloadApi,
    SyncProgressPayload,
    SyncStatePayload,
} from '@shared/ipc-contract';

/**
 * Helper untuk membuka MutationResult<T> menjadi nilai T murni,
 * melempar Error jika operasi mengembalikan ok: false,
 * sehingga konsisten dengan kontrak PreloadApi Electron.
 */
function unwrap<T>(result: MutationResult<T>): T {
    if (!result.ok) {
        throw new Error(result.error ?? 'Operasi gagal tanpa pesan error');
    }
    return result.data as T;
}

export function createTauriApi(): PreloadApi {
    return {
        getAppHealth: async () => await invoke('get_app_health'),
        listTrades: async (filter) => await invoke('list_trades', { filter }),
        getTrade: async (id) => await invoke('get_trade', { id }),
        createTrade: async (payload) => await invoke('create_trade', { payload }),
        updateTrade: async (id, payload) => await invoke('update_trade', { id, payload }),
        deleteTrade: async (id) => await invoke('delete_trade', { id }),
        getTradeMeta: async () => await invoke('get_trade_meta'),
        getSettings: async () => await invoke('get_settings'),
        setSettings: async (payload) => await invoke('set_settings', { payload }),
        getBalances: async () => await invoke('get_balances'),
        syncBalances: async () => await invoke('sync_balances'),
        exportJournal: async (format, filter) => await invoke('export_journal', { format, filter }),
        getBackupStatus: async () => await invoke('get_backup_status'),
        runBackup: async () => await invoke('run_backup'),
        restoreBackup: async (folderPath) => await invoke('restore_backup', { folderPath }),
        disconnectBackup: async () => await invoke('disconnect_backup'),
        startBackupOAuth: async (clientId) => await invoke('start_backup_oauth', { clientId }),
        selectBackupFolder: async () => await invoke('select_backup_folder'),
        uploadScreenshot: async (payload) => await invoke('upload_screenshot', { payload }),
        getScreenshot: async (relPath) => await invoke('get_screenshot', { relPath }),
        getAiConfig: async () => await invoke('get_ai_config'),
        saveAiConfig: async (payload) => await invoke('save_ai_config', { payload }),
        deleteAiConfig: async () => await invoke('delete_ai_config'),
        analyzeJournal: async (filter) => await invoke('analyze_journal', { filter }),
        getCredentialStatuses: async () =>
            unwrap(await invoke<MutationResult<CredentialStatusPayload[]>>('get_credential_statuses')),
        saveCredentials: async (payload) => await invoke('save_credentials', { payload }),
        deleteCredentials: async (exchange) => await invoke('delete_credentials', { exchange }),
        getSyncStates: async () =>
            unwrap(await invoke<MutationResult<SyncStatePayload[]>>('get_sync_states')),
        runSync: async () => await invoke('run_sync'),
        onSyncProgress: (callback) => {
            let unlistenFn: (() => void) | null = null;
            import('@tauri-apps/api/event').then(({ listen }) => {
                listen<SyncProgressPayload>('sync:progress', (event) => {
                    callback(event.payload);
                }).then((unlisten) => {
                    unlistenFn = unlisten;
                });
            });
            return () => {
                if (unlistenFn) {
                    unlistenFn();
                }
            };
        },
        getLogs: async (limit) => await invoke('get_logs', { limit }),
        clearLogs: async () => await invoke('clear_logs'),
        openLogFolder: async () => await invoke('open_log_folder'),
        logError: async (message, details) => {
            console.error(message, details);
            try {
                await invoke('write_log', {
                    level: 'ERROR',
                    message: String(message),
                    details: details ? (typeof details === 'string' ? details : JSON.stringify(details)) : null
                });
            } catch {}
        },
        logWarn: async (message, details) => {
            console.warn(message, details);
            try {
                await invoke('write_log', {
                    level: 'WARN',
                    message: String(message),
                    details: details ? (typeof details === 'string' ? details : JSON.stringify(details)) : null
                });
            } catch {}
        },
        logInfo: async (message, details) => {
            console.info(message, details);
            try {
                await invoke('write_log', {
                    level: 'INFO',
                    message: String(message),
                    details: details ? (typeof details === 'string' ? details : JSON.stringify(details)) : null
                });
            } catch {}
        },
        openExternalUrl: async (url) => await invoke('open_external_url', { url }),
        getAppVersion: async () => await invoke<string>('get_app_version'),
        checkForUpdates: async () => await invoke('check_for_updates'),
        getBtcKlines: async (payload) => await invoke('get_btc_klines', { payload }),
        remuxVideoMp4: async (data: Uint8Array, audioData?: Uint8Array) => {
            const res = await invoke<MutationResult<number[]>>('remux_video_mp4', {
                data: Array.from(data),
                audioData: audioData ? Array.from(audioData) : null,
            });
            if (res.ok && res.data) {
                return {
                    ok: true,
                    data: new Uint8Array(res.data),
                };
            }
            return {
                ok: res.ok,
                error: res.error,
                data: data,
            };
        },
        saveVideoFile: async (defaultName: string, data: Uint8Array) => {
            return await invoke<MutationResult<string | null>>('save_video_file', {
                defaultName,
                data: Array.from(data),
            });
        }
    };
}
