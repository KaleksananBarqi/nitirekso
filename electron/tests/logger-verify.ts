import { app } from 'electron'
import { rmSync, readFileSync } from 'node:fs'
import fs from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { logger, setLogFilePath } from '../utils/logger'

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
    const logFile = join(tmpdir(), 'tj-logger-verify.log')
    try {
        setLogFilePath(logFile)

        // Spy on console methods
        const originalConsoleError = console.error
        const originalConsoleWarn = console.warn
        const originalConsoleInfo = console.info
        const originalConsoleLog = console.log

        let consoleErrorCalled = false
        let consoleErrorArgs: any[] = []

        console.error = (...args: any[]) => {
            consoleErrorCalled = true
            consoleErrorArgs.push(args)
        }

        // Test error logging
        const testErrorMessage = 'This is a test error message'
        const testErrorDetail = new Error('Test error detail stack')

        logger.error(testErrorMessage, testErrorDetail)

        check('console.error was called for initial error', consoleErrorCalled)
        check('console.error received the error string', consoleErrorArgs[0][0].includes(testErrorMessage))
        check('console.error received the error stack', consoleErrorArgs[0][0].includes('Test error detail stack'))

        // Check file
        const logContent = readFileSync(logFile, 'utf8')
        check('Log file contains the error message', logContent.includes(testErrorMessage))
        check('Log file contains the ERROR level', logContent.includes('[ERROR]'))
        check('Log file contains the stack', logContent.includes('Test error detail stack'))

        // Test the catch block in writeLog by spying on fs.appendFileSync
        const originalAppendFileSync = fs.appendFileSync
        consoleErrorArgs = [] // Reset
        consoleErrorCalled = false

        fs.appendFileSync = () => {
            throw new Error('Simulated write error')
        }

        logger.error('This will trigger a file write error')

        fs.appendFileSync = originalAppendFileSync

        check('console.error was called inside catch block', consoleErrorCalled || consoleErrorArgs.length > 1)
        check('console.error logged the file writing error', consoleErrorArgs[consoleErrorArgs.length - 1][0] === '[logger] Gagal menulis ke file log:')

        // Restore console
        console.error = originalConsoleError
        console.warn = originalConsoleWarn
        console.info = originalConsoleInfo
        console.log = originalConsoleLog

    } catch (error) {
        failures += 1
        results.push(
            `[GAGAL] Exception: ${error instanceof Error ? error.message : String(error)}`
        )
    } finally {
        try {
            rmSync(logFile, { force: true })
        } catch { }
    }

    console.log('\n===== VERIFIKASI LOGGER =====')
    for (const line of results) console.log(line)
    console.log(
        `\n===== ${failures === 0 ? 'SEMUA LULUS' : `${failures} GAGAL`} (${results.length} pemeriksaan) =====\n`
    )

    app.exit(failures === 0 ? 0 : 1)
}

void app.whenReady().then(main)
