/**
 * Katalog Kode Error Terstandar dan Logger untuk Fitur Share PnL.
 *
 * Digunakan untuk pelacakan, pencatatan log rapi ke `app.log` (via Tauri write_log),
 * dan mempermudah proses debugging serta investigasi masalah pengguna.
 */

export const SharePnlErrorCode = {
    // 1. Kategori Upload & Validasi Berkas Media (001 - 003)
    UPLOAD_UNSUPPORTED_FORMAT: 'SHARE_PNL_ERR_001',
    UPLOAD_FILE_SIZE_EXCEEDED: 'SHARE_PNL_ERR_002',
    UPLOAD_READ_FAILED: 'SHARE_PNL_ERR_003',

    // 2. Kategori Storage & Cache (004)
    STORAGE_PERSIST_FAILED: 'SHARE_PNL_ERR_004',

    // 3. Kategori Media Playback & Preview (005)
    PLAYBACK_LOAD_FAILED: 'SHARE_PNL_ERR_005',

    // 4. Kategori Canvas 2D & Aspect Framing (006)
    CANVAS_RENDER_FAILED: 'SHARE_PNL_ERR_006',

    // 5. Kategori Deterministic Video Encoding (007 - 010)
    VIDEO_ENCODER_INIT_FAILED: 'SHARE_PNL_ERR_007',
    VIDEO_ENCODE_FRAME_FAILED: 'SHARE_PNL_ERR_008',
    AUDIO_PROCESS_FAILED: 'SHARE_PNL_ERR_009',
    RECORDER_FALLBACK_FAILED: 'SHARE_PNL_ERR_010',

    // 6. Kategori Tauri FFmpeg Backend Remuxing (011)
    BACKEND_REMUX_FAILED: 'SHARE_PNL_ERR_011',

    // 7. Kategori File I/O & Native Save Dialog (012)
    FILE_SAVE_FAILED: 'SHARE_PNL_ERR_012',

    // 8. Kategori Clipboard (013)
    CLIPBOARD_COPY_FAILED: 'SHARE_PNL_ERR_013'
} as const

export type SharePnlErrorCode = typeof SharePnlErrorCode[keyof typeof SharePnlErrorCode]

export type SharePnlErrorCategory =
    | 'UPLOAD'
    | 'STORAGE'
    | 'PLAYBACK'
    | 'CANVAS'
    | 'VIDEO_ENCODE'
    | 'AUDIO'
    | 'BACKEND_REMUX'
    | 'FILE_IO'
    | 'CLIPBOARD'

export interface SharePnlErrorDetail {
    code: SharePnlErrorCode
    title: string
    category: SharePnlErrorCategory
    description: string
    possibleSolution: string
}

/**
 * Katalog definisi metadata kode error Share PnL
 */
export const SHARE_PNL_ERROR_CATALOG: Record<SharePnlErrorCode, SharePnlErrorDetail> = {
    [SharePnlErrorCode.UPLOAD_UNSUPPORTED_FORMAT]: {
        code: SharePnlErrorCode.UPLOAD_UNSUPPORTED_FORMAT,
        title: 'Format Media Tidak Didukung',
        category: 'UPLOAD',
        description: 'Berkas media yang diunggah bukan merupakan tipe gambar (PNG, JPG, SVG, WebP) atau video (MP4, WebM) yang valid.',
        possibleSolution: 'Gunakan berkas gambar berformat PNG/JPG/WebP atau video berformat MP4/WebM.'
    },
    [SharePnlErrorCode.UPLOAD_FILE_SIZE_EXCEEDED]: {
        code: SharePnlErrorCode.UPLOAD_FILE_SIZE_EXCEEDED,
        title: 'Ukuran Berkas Melebihi Batas Maksimal',
        category: 'UPLOAD',
        description: 'Ukuran berkas latar belakang melebihi kapasitas maksimum yang diizinkan (25MB).',
        possibleSolution: 'Kompres berkas video/gambar terlebih dahulu atau pilih berkas di bawah 25MB.'
    },
    [SharePnlErrorCode.UPLOAD_READ_FAILED]: {
        code: SharePnlErrorCode.UPLOAD_READ_FAILED,
        title: 'Gagal Membaca Data Berkas',
        category: 'UPLOAD',
        description: 'FileReader atau konversi Blob URL gagal memproses berkas lokal yang dipilih.',
        possibleSolution: 'Pastikan berkas tidak terkunci oleh aplikasi lain dan dapat diakses sistem.'
    },
    [SharePnlErrorCode.STORAGE_PERSIST_FAILED]: {
        code: SharePnlErrorCode.STORAGE_PERSIST_FAILED,
        title: 'Gagal Menyimpan ke IndexedDB / LocalStorage',
        category: 'STORAGE',
        description: 'Operasi persistensi media wallpaper ke IndexedDB atau penyimpanan pengaturan ke localStorage mengalami error (misal QuotaExceededError).',
        possibleSolution: 'Bersihkan galeri wallpaper kustom lama atau periksa kapasitas penyimpanan disk lokal.'
    },
    [SharePnlErrorCode.PLAYBACK_LOAD_FAILED]: {
        code: SharePnlErrorCode.PLAYBACK_LOAD_FAILED,
        title: 'Gagal Memuat / Memutar Video Background',
        category: 'PLAYBACK',
        description: 'Elemen <video> gagal melakukan decode atau pemutaran autoplay ditolak oleh sistem keamanan browser.',
        possibleSolution: 'Pastikan video memiliki codec H.264/AAC standar atau aktifkan interaksi pengguna di layar.'
    },
    [SharePnlErrorCode.CANVAS_RENDER_FAILED]: {
        code: SharePnlErrorCode.CANVAS_RENDER_FAILED,
        title: 'Gagal Render Kartu ke Canvas 2D',
        category: 'CANVAS',
        description: 'Proses penggambaran elemen kartu PnL, teks, logo, atau efek blur 9:16 mengalami error pada konteks 2D kanvas.',
        possibleSolution: 'Periksa ketersediaan aset gambar logo exchange atau render ulang preview kartu.'
    },
    [SharePnlErrorCode.VIDEO_ENCODER_INIT_FAILED]: {
        code: SharePnlErrorCode.VIDEO_ENCODER_INIT_FAILED,
        title: 'Inisialisasi WebCodecs VideoEncoder Gagal',
        category: 'VIDEO_ENCODE',
        description: 'Browser atau akselerasi hardware menolak profil konfigurasi AVC/H.264 (avc1) atau API WebCodecs tidak tersedia.',
        possibleSolution: 'Aplikasi akan otomatis beralih ke fallback MediaRecorder.'
    },
    [SharePnlErrorCode.VIDEO_ENCODE_FRAME_FAILED]: {
        code: SharePnlErrorCode.VIDEO_ENCODE_FRAME_FAILED,
        title: 'Gagal Memproses Frame Rekaman Video',
        category: 'VIDEO_ENCODE',
        description: 'Terjadi kegagalan saat membuat VideoFrame, sinkronisasi seek frame video background, atau muxing video chunk ke MP4.',
        possibleSolution: 'Coba gunakan resolusi atau durasi ekspor yang lebih pendek, atau periksa stabilitas GPU.'
    },
    [SharePnlErrorCode.AUDIO_PROCESS_FAILED]: {
        code: SharePnlErrorCode.AUDIO_PROCESS_FAILED,
        title: 'Gagal Memproses Audio Latar Belakang',
        category: 'AUDIO',
        description: 'Offline AudioContext gagal membaca trek audio atau konfigurasi AudioEncoder AAC tidak didukung.',
        possibleSolution: 'Video tetap diekspor tanpa suara (mute) atau periksa apakah sumber video memiliki trek audio valid.'
    },
    [SharePnlErrorCode.RECORDER_FALLBACK_FAILED]: {
        code: SharePnlErrorCode.RECORDER_FALLBACK_FAILED,
        title: 'Perekaman MediaRecorder Fallback Gagal',
        category: 'VIDEO_ENCODE',
        description: 'Mesin perekam cadangan MediaRecorder mengalami error atau captureStream kanvas tidak tersedia.',
        possibleSolution: 'Pastikan lingkungan WebView mendukung streaming kanvas.'
    },
    [SharePnlErrorCode.BACKEND_REMUX_FAILED]: {
        code: SharePnlErrorCode.BACKEND_REMUX_FAILED,
        title: 'Remuxing Video FFmpeg di Backend Gagal',
        category: 'BACKEND_REMUX',
        description: 'Perintah backend Tauri `remux_video_mp4` gagal memproses remuxing MP4 linier atau penggabungan trek audio.',
        possibleSolution: 'Hasil rekaman asli tetap dipertahankan sebagai berkas cadangan.'
    },
    [SharePnlErrorCode.FILE_SAVE_FAILED]: {
        code: SharePnlErrorCode.FILE_SAVE_FAILED,
        title: 'Gagal Menyimpan Berkas ke Disk',
        category: 'FILE_IO',
        description: 'Dialog native simpan berkas atau penulisan byte media ke sistem berkas lokal gagal atau dibatalkan.',
        possibleSolution: 'Periksa izin akses folder penyimpanan atau ruang kosong pada drive.'
    },
    [SharePnlErrorCode.CLIPBOARD_COPY_FAILED]: {
        code: SharePnlErrorCode.CLIPBOARD_COPY_FAILED,
        title: 'Gagal Menyalin Gambar ke Clipboard',
        category: 'CLIPBOARD',
        description: 'Akses API Clipboard sistem ditolak atau pembuatan Blob PNG kanvas mengembalikan null.',
        possibleSolution: 'Gunakan tombol "Unduh PNG" jika izin akses clipboard dibatasi oleh sistem operasi.'
    }
}

/**
 * Mencatat log error terstruktur untuk fitur Share PnL ke `app.log` melalui Tauri API
 * serta mencetak ke browser console dengan format rapi.
 *
 * @param code Kode error standar dari SharePnlErrorCode
 * @param contextMessage Pesan konteks tambahan atau lokasi terjadinya kegagalan
 * @param rawError Objek error mentah atau detail teknis
 * @param level Tingkat keparahan log ('ERROR' | 'WARN' | 'INFO')
 */
export function logSharePnlError(
    code: SharePnlErrorCode,
    contextMessage: string,
    rawError?: unknown,
    level: 'ERROR' | 'WARN' | 'INFO' = 'ERROR'
): void {
    const meta = SHARE_PNL_ERROR_CATALOG[code]
    const title = meta?.title ?? 'Unknown Error'
    const category = meta?.category ?? 'GENERAL'

    const errorStr = rawError instanceof Error
        ? `${rawError.name}: ${rawError.message}${rawError.stack ? `\nStack: ${rawError.stack}` : ''}`
        : (rawError ? (typeof rawError === 'string' ? rawError : JSON.stringify(rawError)) : 'No error details provided')

    const logHeadline = `[SharePnL] [${code}] [${category}] ${title} - ${contextMessage}`
    const fullDetails = `Deskripsi: ${meta?.description ?? '-'}\nSolusi: ${meta?.possibleSolution ?? '-'}\nDetail Teknis: ${errorStr}`

    // 1. Tulis ke log native Tauri (akan tersimpan di app.log)
    if (typeof window !== 'undefined' && window.api) {
        if (level === 'ERROR' && window.api.logError) {
            void window.api.logError(logHeadline, fullDetails)
        } else if (level === 'WARN' && window.api.logWarn) {
            void window.api.logWarn(logHeadline, fullDetails)
        } else if (window.api.logInfo) {
            void window.api.logInfo(logHeadline, fullDetails)
        }
    }

    // 2. Tampilkan di browser console
    if (level === 'ERROR') {
        console.error(logHeadline, { meta, rawError })
    } else if (level === 'WARN') {
        console.warn(logHeadline, { meta, rawError })
    } else {
        console.info(logHeadline, { meta, rawError })
    }
}

/**
 * Menghasilkan pesan kesalahan ramah pengguna yang menyertakan kode error untuk mempermudah pelaporan.
 */
export function getSharePnlUserMessage(code: SharePnlErrorCode, overrideMessage?: string): string {
    const meta = SHARE_PNL_ERROR_CATALOG[code]
    if (!meta) return `[${code}] Terjadi kesalahan pada fitur Share PnL.`
    if (overrideMessage) {
        return `[${code}] ${overrideMessage}`
    }
    return `[${code}] ${meta.title}: ${meta.description}`
}
