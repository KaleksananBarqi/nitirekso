import { app } from 'electron'
import { existsSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
import fs from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { logger, setLogFilePath, readLogs } from '../utils/logger'

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

async function main(): Promise<void> {
    const logFilePath = join(tmpdir(), `tj-logger-verify-${Date.now()}.log`)
    setLogFilePath(logFilePath)

    const originalConsoleError = console.error
    const originalConsoleWarn = console.warn
    const originalConsoleInfo = console.info
    const originalConsoleLog = console.log
    const originalAppendFileSync = fs.appendFileSync

    try {
        // --- Bagian 1: Verifikasi readLogs ---
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

        // --- Bagian 2: Verifikasi logger.error & error-handling writeLog ---
        if (existsSync(logFilePath)) {
            rmSync(logFilePath, { force: true })
        }

        let consoleErrorCalled = false
        const consoleErrorArgs: any[] = []

        console.error = (...args: any[]) => {
            consoleErrorCalled = true
            consoleErrorArgs.push(args)
        }

        const testErrorMessage = 'This is a test error message'
        const testErrorDetail = new Error('Test error detail stack')

        logger.error(testErrorMessage, testErrorDetail)

        check('console.error was called for initial error', consoleErrorCalled)
        check('console.error received the error string', consoleErrorArgs[0]?.[0]?.includes(testErrorMessage) ?? false)
        check('console.error received the error stack', consoleErrorArgs[0]?.[0]?.includes('Test error detail stack') ?? false)

        const logContent = readFileSync(logFilePath, 'utf8')
        check('Log file contains the error message', logContent.includes(testErrorMessage))
        check('Log file contains the ERROR level', logContent.includes('[ERROR]'))
        check('Log file contains the stack', logContent.includes('Test error detail stack'))

        // Test the catch block in writeLog by spying on fs.appendFileSync
        consoleErrorArgs.length = 0
        consoleErrorCalled = false

        fs.appendFileSync = () => {
            throw new Error('Simulated write error')
        }

        logger.error('This will trigger a file write error')

        fs.appendFileSync = originalAppendFileSync

        check('console.error was called inside catch block', consoleErrorCalled || consoleErrorArgs.length > 0)
        check('console.error logged the file writing error', consoleErrorArgs[consoleErrorArgs.length - 1]?.[0] === '[logger] Gagal menulis ke file log:')

    } catch (error) {
        failures += 1
        results.push(
            `[GAGAL] Exception: ${error instanceof Error ? error.message : String(error)}`
        )
    } finally {
        // Restore console & fs methods
        console.error = originalConsoleError
        console.warn = originalConsoleWarn
        console.info = originalConsoleInfo
        console.log = originalConsoleLog
        fs.appendFileSync = originalAppendFileSync

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
