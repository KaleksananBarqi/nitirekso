/**
 * Jembatan Kompatibilitas Mundur PreloadApi / window.api Nitirekso.
 *
 * Mengarahkan pemanggilan window.api dan PreloadApi lama ke adapter IpcClient baru
 * (Typed IPC Client Adapter) di bawah src/lib/ipc/, sehingga seluruh kode antarmuka
 * dan komponen pemanggil tetap beroperasi 100% tanpa perubahan mendadak.
 */

import type {
    MutationResult,
    PreloadApi,
} from '@shared/ipc-contract'
import {
    createApiClient,
    type AppResult,
    type IpcClient,
} from './ipc'

/**
 * Membuka AppResult<T> menjadi nilai T murni, melempar Error jika ok: false.
 */
function unwrapAppResult<T>(res: AppResult<T>): T {
    if (!res.ok) {
        throw new Error(res.error.message)
    }
    return res.data
}

/**
 * Mengonversi AppResult<T> menjadi struktur MutationResult<T> lama.
 */
function toMutation<T>(res: AppResult<T>, fallbackData?: T): MutationResult<T> {
    if (res.ok) {
        return { ok: true, data: res.data }
    }
    return { ok: false, error: res.error.message, data: fallbackData }
}

/**
 * Membuat instance PreloadApi yang mendelegasikan seluruh panggilan ke IpcClient.
 *
 * @param customClient Instance IpcClient kustom (opsional, berguna untuk unit testing).
 */
export function createTauriApi(customClient?: IpcClient): PreloadApi {
    const client = customClient ?? createApiClient()

    return {
        // --- Domain System / Health ---
        getAppHealth: async () => unwrapAppResult(await client.system.getAppHealth()),
        getAppVersion: async () => unwrapAppResult(await client.system.getAppVersion()),
        checkForUpdates: async () => toMutation(await client.system.checkForUpdates()),
        openExternalUrl: async (url) => toMutation(await client.system.openExternalUrl(url)),
        getBtcKlines: async (payload) => toMutation(await client.system.getBtcKlines(payload)),

        // --- Domain Trades ---
        listTrades: async (filter) => unwrapAppResult(await client.trades.list(filter)),
        getTrade: async (id) => unwrapAppResult(await client.trades.get(id)),
        createTrade: async (payload) => toMutation(await client.trades.create(payload)),
        updateTrade: async (id, payload) => toMutation(await client.trades.update(id, payload)),
        deleteTrade: async (id) => toMutation(await client.trades.delete(id)),
        getTradeMeta: async () => unwrapAppResult(await client.trades.getMeta()),
        exportJournal: async (format, filter) =>
            toMutation(await client.trades.exportJournal(format, filter)),

        // --- Domain Settings ---
        getSettings: async () => unwrapAppResult(await client.settings.getAll()),
        setSettings: async (payload) => toMutation(await client.settings.set(payload)),

        // --- Domain Sync & Credentials ---
        getBalances: async () => unwrapAppResult(await client.sync.getBalances()),
        syncBalances: async () => toMutation(await client.sync.syncBalances()),
        getCredentialStatuses: async () => unwrapAppResult(await client.sync.getCredentialStatuses()),
        saveCredentials: async (payload) => toMutation(await client.sync.saveCredentials(payload)),
        deleteCredentials: async (exchange) =>
            toMutation(await client.sync.deleteCredentials(exchange)),
        getSyncStates: async () => unwrapAppResult(await client.sync.getStates()),
        runSync: async () => toMutation(await client.sync.run()),
        onSyncProgress: (callback) => client.sync.onProgress(callback),

        // --- Domain Media (Screenshot & Video) ---
        uploadScreenshot: async (payload) => toMutation(await client.media.uploadScreenshot(payload)),
        getScreenshot: async (relPath) => toMutation(await client.media.getScreenshot(relPath)),
        remuxVideoMp4: async (data: Uint8Array, audioData?: Uint8Array) => {
            const res = await client.media.remuxVideoMp4(data, audioData)
            return toMutation(res, data)
        },
        saveVideoFile: async (defaultName: string, data: Uint8Array) =>
            toMutation(await client.media.saveVideoFile(defaultName, data)),

        // --- Domain Backup ---
        getBackupStatus: async () => unwrapAppResult(await client.backup.getStatus()),
        runBackup: async () => toMutation(await client.backup.run()),
        restoreBackup: async (folderPath) => toMutation(await client.backup.restore(folderPath)),
        disconnectBackup: async () => toMutation(await client.backup.disconnect()),
        startBackupOAuth: async (clientId) => toMutation(await client.backup.startOAuth(clientId)),
        selectBackupFolder: async () => toMutation(await client.backup.selectFolder()),

        // --- Domain AI ---
        getAiConfig: async () => unwrapAppResult(await client.ai.getConfig()),
        saveAiConfig: async (payload) => toMutation(await client.ai.saveConfig(payload)),
        deleteAiConfig: async () => toMutation(await client.ai.deleteConfig()),
        analyzeJournal: async (filter) => toMutation(await client.ai.analyzeJournal(filter)),

        // --- Domain Logs / Debugging ---
        getLogs: async (limit) => toMutation(await client.system.getLogs(limit)),
        clearLogs: async () => toMutation(await client.system.clearLogs()),
        openLogFolder: async () => toMutation(await client.system.openLogFolder()),
        logError: async (message, details) => {
            console.error(message, details)
            await client.system.logError(message, details)
        },
        logWarn: async (message, details) => {
            console.warn(message, details)
            await client.system.logWarn(message, details)
        },
        logInfo: async (message, details) => {
            console.info(message, details)
            await client.system.logInfo(message, details)
        },
    }
}
