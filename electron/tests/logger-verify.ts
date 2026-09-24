import { app } from 'electron'
import { existsSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { setLogFilePath, readLogs } from '../utils/logger'

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

async function main() {
    const logFilePath = join(tmpdir(), `test-log-${Date.now()}.log`)
    setLogFilePath(logFilePath)

    try {
        // Test 1: File doesn't exist
        let logs = readLogs()
        check('readLogs mengembalikan array kosong jika file tidak ada', logs.length === 0)

        // Test 2: File is empty
        writeFileSync(logFilePath, '   \n  ', 'utf8')
        logs = readLogs()
        check('readLogs mengembalikan array kosong jika file kosong', logs.length === 0)

        // Test 3: Normal logs
        const mockLogContent = `[2023-10-01T12:00:00.000Z] [INFO] Memulai aplikasi
[2023-10-01T12:00:01.000Z] [WARN] Peringatan sesuatu
[2023-10-01T12:00:02.000Z] [ERROR] Terjadi kesalahan
  Stack: Error: Boom
    at Object.<anonymous> (test.js:1:1)`

        writeFileSync(logFilePath, mockLogContent, 'utf8')
        logs = readLogs()

        check('readLogs mem-parsing jumlah baris dengan benar', logs.length === 3)
        check('readLogs mengurutkan dari yang terbaru (reverse)', logs[0]?.level === 'ERROR')
        check('readLogs parsing INFO benar', logs[2]?.level === 'INFO' && logs[2]?.message === 'Memulai aplikasi')
        check('readLogs parsing multi-line details benar', logs[0]?.details?.includes('Stack: Error: Boom') || false)

        // Test 4: Limit
        logs = readLogs(2)
        check('readLogs menghormati parameter limit', logs.length === 2)
        check('readLogs mengambil 2 log terbaru', logs[0]?.level === 'ERROR' && logs[1]?.level === 'WARN')

    } catch (error) {
        failures += 1
        results.push(
            `[GAGAL] Exception: ${error instanceof Error ? error.message : String(error)}`
        )
    } finally {
        if (existsSync(logFilePath)) {
            try {
                rmSync(logFilePath, { force: true })
            } catch {}
        }
    }

    console.log('\n===== VERIFIKASI LOGGER =====')
    for (const line of results) console.log(line)
    console.log(
        `\n===== ${failures === 0 ? 'SEMUA LULUS' : `${failures} GAGAL`} (${results.length} pemeriksaan) =====\n`
    )

    app.exit(failures === 0 ? 0 : 1)
}

void app.whenReady().then(main)
