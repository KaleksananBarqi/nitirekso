import { app, BrowserWindow, dialog } from 'electron'
import { join } from 'node:path'
import { closeDb, getDbPath, initializeDb } from './db/index'
import { registerIpcHandlers } from './ipc/handlers'
import { registerSyncHandlers } from './ipc/sync-handlers'
import { logger } from './utils/logger'

/**
 * Entry point main process.
 *
 * Fase 1: aplikasi membuka DB, menjalankan migrasi, lalu menampilkan UI jurnal.
 */

const APP_NAME = 'nitirekso'

/**
 * WAJIB dipanggil SEBELUM memanggil getPath('userData') atau app.whenReady().
 *
 * Tanpa ini, Electron memakai nama default "Electron", sehingga `userData` jatuh ke
 * `%APPDATA%\Electron`. Akibatnya SEMUA aplikasi Electron lain di mesin ini berbagi
 * folder data yang sama — berbahaya untuk data jurnal finansial.
 */
app.setName(APP_NAME)
if (process.platform === 'win32') {
    app.setAppUserModelId('com.nitirekso.app')
}

logger.initGlobalErrorHandlers()
logger.info(`Memulai ${APP_NAME}... File Log: ${logger.getLogPath()}`)

/** Path icon resmi Nitirekso untuk window titlebar dan taskbar. */
function getAppIconPath(): string {
    const iconFile = process.platform === 'win32' ? 'icon.ico' : 'icon.png'
    return app.isPackaged
        ? join(process.resourcesPath, iconFile)
        : join(__dirname, '../../build', iconFile)
}

/** Referensi jendela aktif, dipakai handler sync untuk mengirim progres. */
let mainWindow: BrowserWindow | null = null

function createWindow(): void {
    const window = new BrowserWindow({
        width: 1440,
        height: 900,
        minWidth: 1024,
        minHeight: 640,
        title: APP_NAME,
        icon: getAppIconPath(),
        // Latar gelap deep obsidian sejak awal supaya tidak ada kedipan putih saat load
        backgroundColor: '#0c0b14',
        show: false,
        webPreferences: {
            preload: join(__dirname, '../preload/index.js'),
            // Renderer tidak punya akses Node sama sekali.
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true
        }
    })

    // Tampilkan hanya setelah render siap — mencegah layar putih berkedip.
    window.once('ready-to-show', () => window.show())

    window.on('closed', () => {
        if (mainWindow === window) mainWindow = null
    })

    mainWindow = window

    if (process.env.ELECTRON_RENDERER_URL) {
        void window.loadURL(process.env.ELECTRON_RENDERER_URL)
    } else {
        void window.loadFile(join(__dirname, '../renderer/index.html'))
    }
}

/**
 * Menangani kegagalan fatal saat startup secara transparan dan ramah pengguna.
 *
 * Mencegah "silent crash / ghost click" di Windows: menampilkan kotak dialog
 * OS native dengan penjelasan masalah, jaminan keamanan data lokal, dan lokasi log.
 */
function handleStartupFatalError(error: unknown): void {
    const message = error instanceof Error ? error.message : String(error)
    logger.error('[startup] GAGAL memulai aplikasi:', error)

    try {
        dialog.showErrorBox(
            'nitirekso — Gagal Membuka Aplikasi',
            `Terjadi kesalahan saat menginisialisasi database atau dependensi aplikasi:\n\n${message}\n\n` +
            `Catatan Penting:\n` +
            `• Data riwayat transaksi dan jurnal trading Anda tetap aman.\n` +
            `• File log lengkap tersimpan di:\n  ${logger.getLogPath()}\n\n` +
            `Silakan laporkan masalah ini ke repositori pengembang.`
        )
    } catch {
        // Fallback jika dialog OS tidak dapat ditampilkan
    }

    closeDb()
    app.exit(1)
}

/**
 * Kunci single-instance.
 *
 * Dua instance yang menulis ke file SQLite yang sama berisiko korupsi data.
 * Instance kedua langsung keluar dan memfokuskan jendela yang sudah ada.
 */
const gotLock = app.requestSingleInstanceLock()

if (!gotLock) {
    app.quit()
} else {
    app.on('second-instance', () => {
        const [existing] = BrowserWindow.getAllWindows()
        if (existing) {
            if (existing.isMinimized()) existing.restore()
            existing.focus()
        }
    })

    app.whenReady().then(() => {
        try {
            // Buka DB + jalankan migrasi.
            const result = initializeDb()
            logger.info(`[db] koneksi terbuka: ${getDbPath()}`)
            if (result.applied.length > 0) {
                logger.info(`[db] migrasi diterapkan: ${result.applied.join(', ')}`)
            }
            logger.info(`[db] schema version: ${result.currentVersion}`)

            registerIpcHandlers()
            registerSyncHandlers(() => mainWindow)
            createWindow()
        } catch (error) {
            handleStartupFatalError(error)
            return
        }

        app.on('activate', () => {
            if (BrowserWindow.getAllWindows().length === 0) {
                createWindow()
            }
        })
    })

    app.on('window-all-closed', () => {
        if (process.platform !== 'darwin') {
            app.quit()
        }
    })

    app.on('before-quit', () => {
        closeDb()
    })
}
