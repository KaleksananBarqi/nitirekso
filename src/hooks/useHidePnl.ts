import { useCallback, useEffect, useState } from 'react'
import type { PreloadApi } from '../../shared/ipc-contract'

/**
 * State global terbagi untuk hidePnl di seluruh instans hook useHidePnl.
 * Menjamin konsistensi UI seketika tanpa jeda re-render atau split-brain antar komponen.
 */
let cachedHidePnl = false
let isInitialized = false
const subscribers = new Set<(val: boolean) => void>()

/**
 * Menyiarkan perubahan state hidePnl ke seluruh listener / komponen yang sedang aktif.
 */
function broadcast(val: boolean): void {
    cachedHidePnl = val
    subscribers.forEach((callback) => {
        try {
            callback(val)
        } catch {
            // Lindungi loop siaran dari kegagalan callback individu
        }
    })
}

/**
 * Fungsi helper khusus pengujian untuk mereset status memori hidePnl.
 */
export function _resetHidePnlStateForTesting(): void {
    cachedHidePnl = false
    isInitialized = false
    subscribers.clear()
}

/**
 * Mengambil nilai hidePnl saat ini di cache memori.
 */
export function getCachedHidePnl(): boolean {
    return cachedHidePnl
}

/**
 * Memperbarui nilai hidePnl secara langsung, menyiarkan ke seluruh subscriber,
 * dan menyimpan konfigurasi ke backend SQLite melalui IPC.
 */
export function setCachedHidePnl(
    value: boolean,
    api?: Pick<PreloadApi, 'setSettings'>
): void {
    broadcast(value)
    const targetApi = api ?? (typeof window !== 'undefined' ? window.api : undefined)
    if (targetApi?.setSettings) {
        targetApi.setSettings({ hidePnl: value }).catch(() => {
            // Abaikan penolakan promise agar UX antarmuka tetap responsif
        })
    }
}

/**
 * Mengambil dan menyelaraskan pengaturan hidePnl dari repositori SQLite via IPC.
 */
export async function syncHidePnlFromSettings(
    api?: Pick<PreloadApi, 'getSettings'>
): Promise<boolean> {
    const targetApi = api ?? (typeof window !== 'undefined' ? window.api : undefined)
    if (!targetApi?.getSettings) {
        isInitialized = true
        return cachedHidePnl
    }

    try {
        const settings = await targetApi.getSettings()
        const storedVal = settings.hidePnl ?? settings.hide_pnl
        if (typeof storedVal === 'boolean') {
            broadcast(storedVal)
            isInitialized = true
            return storedVal
        }
    } catch {
        // Abaikan galat jaringan/IPC dan tandai sudah diinisialisasi
    }

    isInitialized = true
    return cachedHidePnl
}

/**
 * Preferensi untuk menyembunyikan/menampilkan semua angka PnL finansial.
 *
 * Menggunakan repositori pengaturan SQLite via IPC (key: 'hidePnl') sebagai
 * satu-satunya sumber kebenaran (single source of truth).
 * Default false (angka PnL terlihat).
 */
export function useHidePnl(): {
    hidePnl: boolean
    setHidePnl: (value: boolean) => void
} {
    const [hidePnl, setHidePnlState] = useState<boolean>(cachedHidePnl)

    useEffect(() => {
        const listener = (val: boolean): void => {
            setHidePnlState(val)
        }
        subscribers.add(listener)

        // Muat preferensi dari SQLite via IPC jika belum diinisialisasi
        if (!isInitialized) {
            void syncHidePnlFromSettings()
        }

        return () => {
            subscribers.delete(listener)
        }
    }, [])

    // Persistensi perubahan ke settings SQLite dan perbarui seluruh UI seketika
    const setHidePnl = useCallback((value: boolean) => {
        setCachedHidePnl(value)
    }, [])

    return { hidePnl, setHidePnl }
}
