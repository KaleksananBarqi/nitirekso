import { app } from 'electron'
import { isSecureStorageAvailable } from '../../credentials/keystore'
import { safeStorage } from 'electron'

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
    results.push('=== Verifikasi isSecureStorageAvailable ===')

    // Test 1: safeStorage tersedia
    safeStorage.isEncryptionAvailable = () => true
    check('Mengembalikan true jika safeStorage tersedia', isSecureStorageAvailable() === true)

    // Test 2: safeStorage throw error
    safeStorage.isEncryptionAvailable = () => { throw new Error('Mock error') }
    check('Mengembalikan false jika safeStorage throw error', isSecureStorageAvailable() === false)

    console.log('\n===== HASIL VERIFIKASI =====')
    for (const line of results) console.log(line)

    app.exit(failures === 0 ? 0 : 1)
}

app.whenReady().then(main)
