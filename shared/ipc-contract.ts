import type {
    AccountBalance,
    ChecklistItem,
    ExecutionGrade,
    ExchangeId,
    TradeDetail,
    TradeDirection,
    MarginMode,
    PnlSource
} from './domain'

/**
 * Kontrak IPC bersama untuk main process, preload, dan renderer.
 *
 * File ini HARUS bebas dari API Node/Electron — ikut ter-bundle ke renderer.
 * Renderer tidak pernah meng-import apapun dari `electron/`
 * (batas keras di plans/01-ARCHITECTURE.md §2).
 */

/** Channel IPC yang tersedia. Satu tempat, supaya surface-nya mudah diaudit. */
export const IPC_CHANNELS = {
    appHealth: 'app:health',
    tradeList: 'trade:list',
    tradeGet: 'trade:get',
    tradeCreate: 'trade:create',
    tradeUpdate: 'trade:update',
    tradeDelete: 'trade:delete',
    tradeMeta: 'trade:meta',
    settingsGetAll: 'settings:getAll',
    settingsSet: 'settings:set',
    credentialStatus: 'credential:status',
    credentialSave: 'credential:save',
    credentialDelete: 'credential:delete',
    syncRun: 'sync:run',
    syncState: 'sync:state',
    syncProgress: 'sync:progress',
    logsGet: 'logs:get',
    logsClear: 'logs:clear',
    logsOpenFolder: 'logs:openFolder',
    logWrite: 'log:write',

    // --- Ekspor (fitur 4) ---
    exportJournal: 'journal:export',

    // --- Local Snapshot (Cadangan Folder Lokal) ---
    backupStatus: 'backup:status',
    backupRun: 'backup:run',
    backupDisconnect: 'backup:disconnect',
    backupSelectFolder: 'backup:selectFolder',

    // --- Device Sync (Sync Vault) ---
    deviceSyncStatus: 'deviceSync:status',
    deviceSyncSelectFolder: 'deviceSync:selectFolder',
    deviceSyncConnect: 'deviceSync:connect',
    deviceSyncDisconnect: 'deviceSync:disconnect',
    deviceSyncRun: 'deviceSync:run',

    // --- Media Content-Addressed ---
    mediaSaveAsset: 'media:saveAsset',
    mediaGetAsset: 'media:getAsset',
    mediaDeleteAsset: 'media:deleteAsset',

    // --- Saldo Exchange ---
    balanceGet: 'balance:get',
    balanceSync: 'balance:sync',

    // --- AI (fitur 6) ---
    analyzeJournal: 'journal:analyze',
    aiConfigStatus: 'ai:configStatus',
    aiConfigSave: 'ai:configSave',
    aiConfigDelete: 'ai:configDelete',

    // --- Screenshot (fitur 1) ---
    uploadScreenshot: 'screenshot:upload',
    getScreenshot: 'screenshot:get',

    // --- Utilitas Aplikasi & Pembaruan ---
    openExternalUrl: 'app:openExternalUrl',
    getAppVersion: 'app:getVersion',
    checkForUpdates: 'app:checkForUpdates',

    // --- BTC Market Data (Analytics ROI) ---
    btcKlines: 'btc:klines',

    // --- Utilitas Video (Remux fMP4 ke Standard MP4 +faststart) ---
    videoRemuxMp4: 'video:remuxMp4'
} as const

/** Exchange yang bisa disinkronkan. */
export type SyncableExchange = 'mexc' | 'bitunix' | 'bybit' | 'binance' | 'bingx'

// --- Local Snapshot (Cadangan Folder Lokal) ---

export interface BackupStatusPayload {
    connected: boolean
    lastBackupAt: number | null
    /** Lokasi folder Local Snapshot lokal (jika ada). */
    localFolder: string | null
}

// --- Device Sync (Sync Vault) ---

export interface DeviceSyncStatusPayload {
    connected: boolean
    vaultPath: string | null
    deviceId: string
    hasPassphrase: boolean
    lastSyncAt: number | null
    lastRemoteSyncAt: number | null
    pendingOpsCount: number
    lastError: string | null
}

export interface DeviceSyncConnectPayload {
    folderPath: string
    passphrase: string
}

export interface DeviceSyncRunResult {
    status: 'ok' | 'skipped' | 'error'
    appliedOps: number
    emittedOps: number
    mediaSynced: number
    credentialsSynced: number
    durationMs: number
    error?: string
}

export type MediaAssetKind = 'screenshot' | 'share_media' | 'exchange_logo'

export interface MediaUploadPayload {
    kind: MediaAssetKind
    fileName: string
    data: Uint8Array
}

export interface MediaAssetInfo {
    sha256: string
    kind: MediaAssetKind
    ext: string
    mime: string
    sizeBytes: number
}

export interface BackupRunResult {
    status: 'ok' | 'partial' | 'error'
    filesUploaded: number
    bytesUploaded: number
    durationMs: number
    error?: string
}

export interface BackupRestoreResult {
    success: boolean
    sourcePath: string
    tradesCount: number
    screenshotsRestored: number
    message: string
}

/** Status kredensial satu exchange. TIDAK memuat kredensialnya sendiri. */
export interface CredentialStatusPayload {
    exchange: SyncableExchange
    configured: boolean
    /** Petunjuk kunci, mis. "a1b2…f9". Bukan kredensial penuh. */
    keyHint: string | null
    updatedAt: number | null
}

/**
 * Payload simpan kredensial.
 *
 * CATATAN KEAMANAN: kredensial hanya melewati IPC SATU ARAH dari renderer ke
 * main, saat user mengetiknya. Tidak ada jalur untuk membacanya kembali ke
 * renderer — yang dibaca kembali hanya `CredentialStatusPayload` (tanpa nilai).
 */
export interface CredentialSavePayload {
    exchange: SyncableExchange
    apiKey: string
    apiSecret: string
}

export interface SyncStatePayload {
    exchange: SyncableExchange
    lastSyncAt: number | null
    lastStatus: 'ok' | 'partial' | 'error' | null
    lastError: string | null
    positionsSynced: number
    fillsSynced: number
    fundingSynced: number
}

export interface SyncRunResult {
    status: 'ok' | 'partial' | 'error'
    exchanges: {
        exchange: SyncableExchange
        status: 'ok' | 'partial' | 'error'
        inserted: number
        updated: number
        wasFullBackfill: boolean
        error?: string
    }[]
    durationMs: number
}

export interface SyncProgressPayload {
    exchange: SyncableExchange
    stage: 'positions' | 'fills' | 'funding' | 'reconcile' | 'done'
    message: string
}

export interface AppHealth {
    ok: boolean
    details: string[]
    dbPath: string
}

/** Entri log yang telah di-parse dari file log lokal. */
export interface LogEntry {
    timestamp: string
    level: 'INFO' | 'WARN' | 'ERROR'
    message: string
    details?: string
    raw: string
}

/** Hasil operasi tulis. `ok: false` disertai pesan yang bisa ditampilkan ke user. */
export interface MutationResult<T = void> {
    ok: boolean
    error?: string
    data?: T
}

// --- Trade ------------------------------------------------------------------

export interface TradeFilterPayload {
    exchange?: ExchangeId
    symbol?: string
    from?: number
    to?: number
    setupTag?: string
    limit?: number
    offset?: number
}

/** Payload trade dari formulir. Bentuknya cermin dari `TradeInput` di domain. */
export interface TradeFormPayload {
    exchange: ExchangeId
    externalId?: string | null
    symbol: string
    direction: TradeDirection
    entryPrice: number
    exitPrice: number
    entryTime: number
    exitTime: number
    size: number
    leverage: number
    marginMode: MarginMode | null
    realizedPnl: number
    feeOpen: number
    feeClose: number
    fundingFee: number
}

export interface JournalFormPayload {
    setupTag?: string | null
    preTradeThesis?: string | null
    postTradeReview?: string | null
    emotionTag?: string | null
    executionGrade?: ExecutionGrade | null
    screenshotPath?: string | null
    /** Tag kustom banyak nilai (fitur 3). */
    tags?: string[]
    checklist?: { label: string; checked: boolean }[]
}

export interface PlannedRiskFormPayload {
    plannedStop?: number | null
    plannedTarget?: number | null
    riskAmount?: number | null
    plannedRr?: number | null
}

export interface TradeSavePayload {
    trade: TradeFormPayload
    journal?: JournalFormPayload | null
    plannedRisk?: PlannedRiskFormPayload | null
}

/** Metadata untuk mengisi dropdown/autocomplete di UI. */
export interface TradeMeta {
    symbols: string[]
    setupTags: string[]
    emotionTags: string[]
    /** Tag kustom banyak nilai (fitur 3). */
    tags: string[]
    checklistTemplate: string[]
    totalTrades: number
}

// --- Settings ---------------------------------------------------------------

export interface SettingsPayload {
    theme?: 'dark' | 'light' | 'system'
    colorblindSafe?: boolean
    autoSyncEnabled?: boolean
    autoSyncIntervalMin?: number
    checklistTemplate?: string[]
    hidePnl?: boolean
    /** Nama model OpenAI untuk AI Insights (fitur 6). */
    aiModel?: string
    /** Base URL provider OpenAI-compatible (fitur 6). */
    aiBaseUrl?: string
    /** Versi rilis pembaruan yang diabaikan pengguna (disimpan di SQLite). */
    dismissedUpdateVersion?: string | null
    [key: string]: unknown
}

/** Payload upload screenshot (fitur 1). */
export interface ScreenshotUploadPayload {
    /** Nama file asli (hanya untuk validasi ekstensi). */
    fileName: string
    /** Bytes gambar (ArrayBuffer dari renderer). */
    data: Uint8Array
}

// --- AI Insights (fitur 6) ---

/** Hasil analisa journal oleh AI (fitur 6). */
export interface JournalAnalysisResult {
    /** Ringkasan satu paragraf. */
    summary: string
    /** Pola kelemahan yang teridentifikasi. */
    weaknesses: string[]
    /** Saran perbaikan konkret. */
    suggestions: string[]
    /** Metrik utama yang disebut AI (opsional). */
    metrics?: { label: string; value: string }[]
}

export interface AiConfigPayload {
    apiKey: string
    model: string
    baseUrl?: string
}

export interface AiConfigStatus {
    configured: boolean
    model: string | null
    baseUrl: string | null
    keyHint: string | null
}

export interface AppUpdateInfo {
    hasUpdate: boolean
    currentVersion: string
    latestVersion: string
    releaseUrl: string
    releaseNotes?: string
    publishedAt?: string
}

export type InstallKind =
    | 'flatpak'
    | 'app-image'
    | 'rpm'
    | 'deb'
    | 'windows-nsis'
    | 'windows-msi'
    | 'mac-os'
    | 'android-apk'
    | 'dev'
    | 'unknown'

export type PackageManagerKind = 'dnf' | 'zypper' | 'rpm' | 'apt-get' | 'none'

export type InstallResultStatus = 'installed-relaunching' | 'opened-fallback' | 'cancelled'

export interface InstallEnvironment {
    os: string
    arch: string
    installKind: InstallKind
    packageManager: PackageManagerKind
    canSelfUpdate: boolean
    storeManaged: boolean
    isDev: boolean
    executablePath?: string | null
}

export interface ReleaseAssetInfo {
    name: string
    downloadUrl: string
    size: number
}

export interface ReleaseMetadataResult {
    notModified: boolean
    etag?: string | null
    source: string
    latestVersion: string
    releaseUrl: string
    releaseNotes?: string | null
    publishedAt?: string | null
    assets: ReleaseAssetInfo[]
    rateLimitResetAt?: number | null
}

export interface UpdateDownloadProgress {
    downloadedBytes: number
    totalBytes?: number | null
    percent: number
    assetName: string
}

export interface LinuxDownloadVerificationResult {
    localPath: string
    sha256: string
    size: number
}

export interface LinuxInstallResult {
    status: InstallResultStatus
    message: string
}

/** Bentuk `window.api` yang diekspos preload ke renderer. */
export interface PreloadApi {
    getAppHealth(): Promise<AppHealth>
    listTrades(filter?: TradeFilterPayload): Promise<TradeDetail[]>
    getTrade(id: number): Promise<TradeDetail | null>
    createTrade(payload: TradeSavePayload): Promise<MutationResult<number>>
    updateTrade(id: number, payload: TradeSavePayload): Promise<MutationResult<void>>
    deleteTrade(id: number): Promise<MutationResult<void>>
    getTradeMeta(): Promise<TradeMeta>
    getSettings(): Promise<SettingsPayload>
    setSettings(payload: SettingsPayload): Promise<MutationResult<void>>

    // --- Saldo Exchange ---
    getBalances(): Promise<AccountBalance[]>
    syncBalances(): Promise<MutationResult<AccountBalance[]>>

    // --- Ekspor (fitur 4) ---
    exportJournal(format: 'csv' | 'json' | 'pdf', filter?: TradeFilterPayload): Promise<MutationResult<string>>

    // --- Local Snapshot (Cadangan Folder Lokal) ---
    getBackupStatus(): Promise<BackupStatusPayload>
    runBackup(): Promise<MutationResult<BackupRunResult>>
    restoreBackup(folderPath?: string): Promise<MutationResult<BackupRestoreResult>>
    disconnectBackup(): Promise<MutationResult<void>>
    selectBackupFolder(): Promise<MutationResult<string | null>>

    // --- Device Sync (Sync Vault) ---
    getDeviceSyncStatus(): Promise<DeviceSyncStatusPayload>
    selectSyncVaultFolder(): Promise<MutationResult<string | null>>
    connectSyncVault(payload: DeviceSyncConnectPayload): Promise<MutationResult<DeviceSyncRunResult>>
    disconnectSyncVault(): Promise<MutationResult<void>>
    runDeviceSync(): Promise<MutationResult<DeviceSyncRunResult>>
    onDeviceSyncUpdated(callback: () => void): () => void

    // --- Screenshot & Media Content-Addressed ---
    uploadScreenshot(payload: ScreenshotUploadPayload): Promise<MutationResult<string>>
    getScreenshot(relPath: string): Promise<MutationResult<string>>
    saveMediaAsset(payload: MediaUploadPayload): Promise<MutationResult<MediaAssetInfo>>
    getMediaAsset(sha256: string): Promise<MutationResult<string>>
    deleteMediaAsset(sha256: string): Promise<MutationResult<void>>

    // --- AI Insights (fitur 6) ---
    getAiConfig(): Promise<AiConfigStatus>
    saveAiConfig(payload: AiConfigPayload): Promise<MutationResult<void>>
    deleteAiConfig(): Promise<MutationResult<void>>
    analyzeJournal(filter?: TradeFilterPayload): Promise<MutationResult<JournalAnalysisResult>>

    // --- Kredensial (Fase 2) ---
    getCredentialStatuses(): Promise<CredentialStatusPayload[]>
    saveCredentials(payload: CredentialSavePayload): Promise<MutationResult<void>>
    deleteCredentials(exchange: SyncableExchange): Promise<MutationResult<void>>

    // --- Sync (Fase 2) ---
    getSyncStates(): Promise<SyncStatePayload[]>
    runSync(): Promise<MutationResult<SyncRunResult>>
    /** Daftarkan listener progres sync. Kembalikan fungsi untuk melepas listener. */
    onSyncProgress(callback: (progress: SyncProgressPayload) => void): () => void

    // --- Logs / Debugging ---
    getLogs(limit?: number): Promise<MutationResult<LogEntry[]>>
    clearLogs(): Promise<MutationResult<void>>
    openLogFolder(): Promise<MutationResult<void>>
    logError(message: string, details?: unknown): Promise<void>
    logWarn(message: string, details?: unknown): Promise<void>
    logInfo(message: string, details?: unknown): Promise<void>

    // --- Utilitas Aplikasi & Pembaruan ---
    openExternalUrl(url: string): Promise<MutationResult<void>>
    getAppVersion(): Promise<string>
    checkForUpdates(): Promise<MutationResult<AppUpdateInfo>>
    detectInstallEnvironment(): Promise<InstallEnvironment>
    fetchReleaseMetadata(etag?: string | null): Promise<MutationResult<ReleaseMetadataResult>>
    downloadLinuxPackage(
        assetUrl: string,
        assetName: string,
        expectedVersion: string
    ): Promise<MutationResult<LinuxDownloadVerificationResult>>
    installLinuxPackageAndRelaunch(
        localPath: string,
        installKind: InstallKind
    ): Promise<MutationResult<LinuxInstallResult>>
    openLocalInstallerFallback(localPath: string): Promise<MutationResult<LinuxInstallResult>>
    onUpdateDownloadProgress(callback: (progress: UpdateDownloadProgress) => void): () => void

    // --- BTC Market Data (Analytics ROI) ---
    getBtcKlines(payload: { startTime: number; endTime: number }): Promise<MutationResult<{ time: number; close: number }[]>>

    // --- Utilitas Video (Remux fMP4 & Simpan/Bagikan Media Native) ---
    remuxVideoMp4?: (data: Uint8Array, audioData?: Uint8Array) => Promise<MutationResult<Uint8Array>>
    saveVideoFile?: (defaultName: string, data: Uint8Array) => Promise<MutationResult<string | null>>
    saveMediaExport?: (fileName: string, mimeType: string, data: Uint8Array) => Promise<MutationResult<string | null>>
    shareMediaExport?: (fileName: string, mimeType: string, title: string, data: Uint8Array) => Promise<MutationResult<void>>
    copyMediaImage?: (fileName: string, mimeType: string, data: Uint8Array) => Promise<MutationResult<void>>
}

export interface BtcKlinePoint {
    time: number
    close: number
}

// Re-export tipe domain yang dipakai renderer, supaya renderer cukup
// meng-import dari satu tempat.
export type { AccountBalance, ChecklistItem, ExecutionGrade, ExchangeId, TradeDetail, PnlSource }

