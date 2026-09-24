import { app } from 'electron'
import { existsSync, rmSync, mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { saveScreenshot, readScreenshotDataUrl, deleteScreenshot, getScreenshotDir } from '../screenshots/index'

/**
 * Verifikasi Modul Screenshots.
 *
 * Menguji logika validasi ekstensi, magic bytes, ukuran file,
 * serta penyimpanan, pembacaan, dan penghapusan file screenshot.
 */

const results: string[] = []
let failures = 0

function check(label: string, condition: boolean, detail?: string): void {
    if (condition) {
        results.push(`[LULUS] ${label}`)
    } else {
        failures += 1
        results.push(`[GAGAL] ${label}${detail ? ` — ${detail}` : ''}`)
    }
}

// Persiapkan direktori userData palsu
const originalGetPath = app.getPath
let tempUserData: string

async function main() {
    console.log('Memulai verifikasi screenshots...\n')

    tempUserData = mkdtempSync(join(tmpdir(), 'nitirekso-test-'))
    app.getPath = ((name: string) => {
        if (name === 'userData') return tempUserData
        return originalGetPath.call(app, name as any)
    }) as any

    try {
        // --- Test 1: getScreenshotDir ---
        const dir = getScreenshotDir()
        check('getScreenshotDir membuat direktori', existsSync(dir))

        // --- Test 2: Invalid extension ---
        let threw = false
        try {
            saveScreenshot({ fileName: 'test.txt', data: new Uint8Array([1, 2, 3]) })
        } catch (e: any) {
            threw = true
            check('Tolak ekstensi invalid', e.message.includes('berupa gambar'))
        }
        check('Harus melempar error untuk ekstensi invalid', threw)

        // --- Test 3: Terlalu besar ---
        threw = false
        try {
            // MAX_BYTES = 4 MB = 4194304
            const largeData = new Uint8Array(4 * 1024 * 1024 + 1)
            saveScreenshot({ fileName: 'test.png', data: largeData })
        } catch (e: any) {
            threw = true
            check('Tolak file > 4 MB', e.message.includes('maksimal 4 MB'))
        }
        check('Harus melempar error untuk file terlalu besar', threw)

        // --- Test 4: Invalid magic bytes ---
        threw = false
        try {
            // Ekstensi PNG, tapi data kosong
            saveScreenshot({ fileName: 'test.png', data: new Uint8Array([0, 0, 0, 0]) })
        } catch (e: any) {
            threw = true
            check('Tolak gambar palsu (magic bytes salah)', e.message.includes('bukan gambar yang valid'))
        }
        check('Harus melempar error untuk file magic bytes invalid', threw)

        // --- Test 5: Happy path saveScreenshot (PNG) ---
        // Magic bytes PNG: [0x89, 0x50, 0x4e, 0x47]
        const validPngData = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x01, 0x02, 0x03])
        let savedFileName = ''
        try {
            savedFileName = saveScreenshot({ fileName: 'gambar.png', data: validPngData })
            check('Berhasil menyimpan PNG', savedFileName.startsWith('trade-') && savedFileName.endsWith('.png'))
            check('File tersimpan di disk', existsSync(join(dir, savedFileName)))
        } catch (e: any) {
            check('Gagal menyimpan PNG', false, e.message)
        }

        // --- Test 6: readScreenshotDataUrl ---
        if (savedFileName) {
            try {
                const dataUrl = readScreenshotDataUrl(savedFileName)
                check('Berhasil baca Data URL', dataUrl.startsWith('data:image/png;base64,'))
            } catch (e: any) {
                check('Gagal membaca Data URL', false, e.message)
            }

            // --- Test 7: deleteScreenshot ---
            deleteScreenshot(savedFileName)
            check('File berhasil dihapus dari disk', !existsSync(join(dir, savedFileName)))
        }

        // --- Test 8: deleteScreenshot cegah path traversal ---
        try {
            deleteScreenshot('../../../etc/passwd')
            // Harusnya return saja, gak ngapa-ngapain
            check('Path traversal deleteScreenshot aman', true)
        } catch {
            check('Path traversal deleteScreenshot aman', false, 'Melempar error tidak terduga')
        }

        // --- Test 9: readScreenshotDataUrl cegah path traversal ---
        threw = false
        try {
            readScreenshotDataUrl('../../../etc/passwd')
        } catch (e: any) {
            threw = true
            check('Tolak path traversal di readScreenshotDataUrl', e.message.includes('tidak valid'))
        }
        check('Harus melempar error untuk path traversal saat read', threw)


    } catch (err: any) {
        check('Test exception', false, err.message)
    }

    console.log(
        `\n===== ${failures === 0 ? 'SEMUA LULUS' : `${failures} GAGAL`} (${results.length} pemeriksaan) =====\n`
    )
    results.forEach((r) => console.log(r))

    // Bersihkan
    rmSync(tempUserData, { recursive: true, force: true })

    app.exit(failures === 0 ? 0 : 1)
}

void app.whenReady().then(main)
