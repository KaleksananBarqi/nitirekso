/**
 * Kontrak Tipe IPC Berorientasi Domain Nitirekso.
 *
 * Mendefinisikan antarmuka terpadu untuk komunikasi antar-proses (IPC),
 * standarisasi struktur AppResult/AppError, serta pengelompokan domain:
 * trades, settings, sync, media, backup, ai, dan system.
 */

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

// Re-export tipe domain agar konsumen IpcClient dapat mengakses seluruh tipe yang dibutuhkan
export type {
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
}

/**
 * Format representasi galat terstruktur pada seluruh seam IPC.
 */
export interface AppError {
    /** Kode unik penanda error, misal 'NOT_FOUND', 'VALIDATION_ERROR', 'IPC_ERROR'. */
    code: string
    /** Pesan error yang ramah pengguna atau deskriptif. */
    message: string
    /** Detail teknis tambahan atau objek error asli (opsional). */
    details?: unknown
}

/**
 * Kontrak hasil terpadu untuk seluruh operasi asynchronous IPC.
 */
export type AppResult<T, E = AppError> =
    | { ok: true; data: T }
    | { ok: false; error: E }

/**
 * Helper pembuat AppResult sukses.
 */
export function ok<T>(data: T): AppResult<T> {
    return { ok: true, data }
}

/**
 * Helper pembuat AppResult gagal.
 */
export function err<E = AppError>(error: E): AppResult<never, E> {
    return { ok: false, error }
}

/**
 * Helper pembentuk objek AppError.
 */
export function createAppError(code: string, message: string, details?: unknown): AppError {
    return { code, message, details }
}

/**
 * Normalisasi error acak (Error instance, string, atau objek) menjadi AppError standar.
 */
export function normalizeAppError(error: unknown, defaultCode = 'INTERNAL_ERROR'): AppError {
    if (error && typeof error === 'object' && 'code' in error && 'message' in error) {
        return {
            code: String((error as { code: unknown }).code),
            message: String((error as { message: unknown }).message),
            details: (error as { details?: unknown }).details,
        }
    }
    if (error instanceof Error) {
        return {
            code: defaultCode,
            message: error.message,
            details: error.stack,
        }
    }
    if (typeof error === 'string') {
        return {
            code: defaultCode,
            message: error,
        }
    }
    return {
        code: defaultCode,
        message: 'Terjadi kesalahan sistem yang tidak diketahui',
        details: error,
    }
}

// ---------------------------------------------------------------------------
// Domain Sub-Interfaces
// ---------------------------------------------------------------------------

/**
 * Domain Trades: Manajemen transaksi, jurnal trading, dan metadata filter.
 */
export interface TradesClient {
    /** Mengambil daftar trade dengan filter opsional. */
    list(filter?: TradeFilterPayload): Promise<AppResult<TradeDetail[]>>
    /** Mengambil satu trade berdasarkan ID. Mengembalikan null jika tidak ditemukan. */
    get(id: number): Promise<AppResult<TradeDetail | null>>
    /** Membuat trade baru beserta jurnal dan planned risk terkait. Mengembalikan ID trade baru. */
    create(payload: TradeSavePayload): Promise<AppResult<number>>
    /** Memperbarui trade yang sudah ada. */
    update(id: number, payload: TradeSavePayload): Promise<AppResult<void>>
    /** Menghapus trade berdasarkan ID. */
    delete(id: number): Promise<AppResult<void>>
    /** Mengambil ringkasan metadata trade (simbol, tag setup, checklist template). */
    getMeta(): Promise<AppResult<TradeMeta>>
    /** Ekspor data jurnal ke format CSV, JSON, atau PDF. Mengembalikan path berkas atau data ekspor. */
    exportJournal(format: 'csv' | 'json' | 'pdf', filter?: TradeFilterPayload): Promise<AppResult<string>>
}

/**
 * Domain Settings: Preferensi pengguna dan konfigurasi aplikasi persisten.
 */
export interface SettingsClient {
    /** Mengambil seluruh pasangan konfigurasi dan preferensi aplikasi. */
    getAll(): Promise<AppResult<Record<string, unknown>>>
    /** Menyimpan preferensi aplikasi. */
    set(payload: SettingsPayload): Promise<AppResult<void>>
}

/**
 * Domain Sync: Sinkronisasi exchange pihak ketiga, kredensial API, dan saldo akun.
 */
export interface SyncClient {
    /** Mengambil status sinkronisasi tiap exchange. */
    getStates(): Promise<AppResult<SyncStatePayload[]>>
    /** Menjalankan proses sinkronisasi transaksi & riwayat exchange. */
    run(): Promise<AppResult<SyncRunResult>>
    /** Mendaftarkan pendengar pembaruan progres sinkronisasi. Mengembalikan fungsi unlisten. */
    onProgress(callback: (progress: SyncProgressPayload) => void): () => void
    /** Mengambil saldo akun tersimpan untuk semua exchange terkonfigurasi. */
    getBalances(): Promise<AppResult<AccountBalance[]>>
    /** Menjalankan sinkronisasi saldo langsung ke exchange. */
    syncBalances(): Promise<AppResult<AccountBalance[]>>
    /** Mengambil status konfigurasi kredensial (tanpa mengekspos API secret). */
    getCredentialStatuses(): Promise<AppResult<CredentialStatusPayload[]>>
    /** Menyimpan kredensial API exchange baru atau pembaruan. */
    saveCredentials(payload: CredentialSavePayload): Promise<AppResult<void>>
    /** Menghapus kredensial API suatu exchange. */
    deleteCredentials(exchange: SyncableExchange): Promise<AppResult<void>>
}

/**
 * Domain Media: Penanganan tangkapan layar, pemrosesan video kanvas, dan berkas biner.
 */
export interface MediaClient {
    /** Mengunggah tangkapan layar biner dan mengembalikan path penyimpanan relatif. */
    uploadScreenshot(payload: ScreenshotUploadPayload): Promise<AppResult<string>>
    /** Mengambil tangkapan layar sebagai Data URL / Blob URL berdasarkan path relatif. */
    getScreenshot(relPath: string): Promise<AppResult<string>>
    /** Remuxing fragmen MP4 menjadi format MP4 linier standar dengan faststart. */
    remuxVideoMp4(data: Uint8Array, audioData?: Uint8Array): Promise<AppResult<Uint8Array>>
    /** Menampilkan dialog penyimpanan berkas native untuk menyimpan file video ke disk pengguna. */
    saveVideoFile(defaultName: string, data: Uint8Array): Promise<AppResult<string | null>>
}

/**
 * Domain Backup: Pencadangan otomatis dan pemulihan data ke folder lokal / Google Drive.
 */
export interface BackupClient {
    /** Mengambil status koneksi cadangan dan jadwal sinkronisasi. */
    getStatus(): Promise<AppResult<BackupStatusPayload>>
    /** Menjalankan pencadangan data ke penyimpanan cadangan aktif. */
    run(): Promise<AppResult<BackupRunResult>>
    /** Memulihkan data dari folder cadangan lokal. */
    restore(folderPath?: string): Promise<AppResult<BackupRestoreResult>>
    /** Memutus integrasi cadangan cloud. */
    disconnect(): Promise<AppResult<void>>
    /** Memulai alur autentikasi OAuth Google Drive. */
    startOAuth(clientId?: string): Promise<AppResult<void>>
    /** Menampilkan dialog pemilih folder direktori cadangan lokal. */
    selectFolder(): Promise<AppResult<string | null>>
}

/**
 * Domain AI: Konfigurasi model AI OpenAI-compatible dan analisis jurnal trading cerdas.
 */
export interface AiClient {
    /** Mengambil status konfigurasi API AI. */
    getConfig(): Promise<AppResult<AiConfigStatus>>
    /** Menyimpan kunci API dan model AI. */
    saveConfig(payload: AiConfigPayload): Promise<AppResult<void>>
    /** Menghapus konfigurasi AI. */
    deleteConfig(): Promise<AppResult<void>>
    /** Menganalisis jurnal trading yang memenuhi kriteria filter. */
    analyzeJournal(filter?: TradeFilterPayload): Promise<AppResult<JournalAnalysisResult>>
}

/**
 * Domain System: Utilitas sistem operasi, kesehatan database, pembaruan, log, dan diagnostik.
 */
export interface SystemClient {
    /** Memeriksa kesehatan integritas database dan runtime native. */
    getAppHealth(): Promise<AppResult<AppHealth>>
    /** Mengambil versi aplikasi saat ini. */
    getAppVersion(): Promise<AppResult<string>>
    /** Memeriksa ketersediaan rilis pembaruan baru di GitHub. */
    checkForUpdates(): Promise<AppResult<AppUpdateInfo>>
    /** Membuka URL eksternal pada browser bawaan OS secara aman. */
    openExternalUrl(url: string): Promise<AppResult<void>>
    /** Mengambil data harga lilin Bitcoin (BTC) historis untuk komparasi analitik ROI. */
    getBtcKlines(payload: { startTime: number; endTime: number }): Promise<AppResult<BtcKlinePoint[]>>
    /** Membaca riwayat catatan log aplikasi. */
    getLogs(limit?: number): Promise<AppResult<LogEntry[]>>
    /** Mengosongkan file log aplikasi. */
    clearLogs(): Promise<AppResult<void>>
    /** Membuka folder log native di pengelola berkas OS (File Explorer / Finder). */
    openLogFolder(): Promise<AppResult<void>>
    /** Menulis pesan log terstruktur ke file log native. */
    log(level: 'INFO' | 'WARN' | 'ERROR', message: string, details?: unknown): Promise<void>
    /** Helper pencatatan log level INFO. */
    logInfo(message: string, details?: unknown): Promise<void>
    /** Helper pencatatan log level WARN. */
    logWarn(message: string, details?: unknown): Promise<void>
    /** Helper pencatatan log level ERROR. */
    logError(message: string, details?: unknown): Promise<void>
}

/**
 * Antarmuka Utama Typed IPC Client Adapter Nitirekso.
 */
export interface IpcClient {
    readonly trades: TradesClient
    readonly settings: SettingsClient
    readonly sync: SyncClient
    readonly media: MediaClient
    readonly backup: BackupClient
    readonly ai: AiClient
    readonly system: SystemClient
}
