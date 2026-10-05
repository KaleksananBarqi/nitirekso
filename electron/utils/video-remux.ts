import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { logger } from './logger'

const execFileAsync = promisify(execFile)

/**
 * Melakukan remuxing lossless fMP4 menjadi Standard Linear MP4 dengan +faststart.
 *
 * Mengapa ini krusial:
 * MediaRecorder di browser menghasilkan Fragmented MP4 (fMP4) dengan header durasi kosong (0 detik)
 * dan pecahan sampel per ~3 detik (moof). Uploader TikTok dan medsos lain hanya membaca
 * moof pertama sehingga video 45s+ terbaca seolah hanya 3 detik.
 *
 * Dengan stream-copy remuxing (tanpa re-encode):
 * 1. Seluruh fragmen moof disatukan menjadi blok linear mdat.
 * 2. Kotak indeks moov diletakkan di depan (+faststart) dengan durasi penuh.
 * 3. Proses hanya memakan waktu ~50ms dan 100% lossless (tanpa penurunan kualitas / 0 frame drop).
 */
export async function remuxMp4WithFaststart(inputData: Uint8Array): Promise<Uint8Array> {
    const tempDir = join(app.getPath('temp'), 'nitirekso-video')
    if (!existsSync(tempDir)) {
        mkdirSync(tempDir, { recursive: true })
    }

    const timestamp = Date.now()
    const randomSuffix = Math.random().toString(36).slice(2, 8)
    const inPath = join(tempDir, `raw-${timestamp}-${randomSuffix}.mp4`)
    const outPath = join(tempDir, `faststart-${timestamp}-${randomSuffix}.mp4`)

    try {
        writeFileSync(inPath, inputData)

        // Eksekusi ffmpeg -c copy -movflags +faststart
        await execFileAsync('ffmpeg', [
            '-y',
            '-i', inPath,
            '-c', 'copy',
            '-movflags', '+faststart',
            outPath
        ], { timeout: 30000 })

        if (existsSync(outPath)) {
            const remuxed = readFileSync(outPath)
            logger.info(`[video-remux] Sukses remuxing MP4 +faststart (${remuxed.length} bytes).`)
            return new Uint8Array(remuxed)
        } else {
            throw new Error('Berkas output hasil remuxing tidak ditemukan.')
        }
    } catch (err) {
        logger.warn('[video-remux] Gagal melakukan remuxing dengan ffmpeg, mengembalikan buffer asli:', err)
        return inputData
    } finally {
        // Defensive cleanup berkas sementara
        try {
            if (existsSync(inPath)) unlinkSync(inPath)
        } catch {}
        try {
            if (existsSync(outPath)) unlinkSync(outPath)
        } catch {}
    }
}
