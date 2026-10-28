/**
 * Modul Utama Jembatan IPC Nitirekso.
 *
 * Menyediakan factory createApiClient dengan Two Adapters Principle:
 * 1. NativeTauriAdapter untuk runtime desktop Tauri v2 produksi.
 * 2. InMemoryMockAdapter untuk pengujian otomatis, vitest headless, dan preview browser.
 */

import { InMemoryMockAdapter, type InMemoryMockState } from './mock-adapter'
import { NativeTauriAdapter } from './native-adapter'
import type { IpcClient } from './types'

export interface CreateApiClientOptions {
    /** Paksa penggunaan adapter InMemoryMockAdapter meskipun berada di lingkungan Tauri. */
    forceMock?: boolean
    /** Data awal opsional untuk InMemoryMockAdapter saat mode mock aktif. */
    initialMockState?: InMemoryMockState
}

/**
 * Mendeteksi apakah aplikasi saat ini berjalan di dalam runtime desktop native Tauri.
 */
export function isTauriEnvironment(): boolean {
    return (
        typeof window !== 'undefined' &&
        ('__TAURI_INTERNALS__' in window || '__TAURI__' in window)
    )
}

/**
 * Factory untuk membuat instance IpcClient sesuai lingkungan eksekusi aplikasi.
 */
export function createApiClient(options?: CreateApiClientOptions): IpcClient {
    if (options?.forceMock) {
        return new InMemoryMockAdapter(options.initialMockState)
    }

    if (isTauriEnvironment()) {
        return new NativeTauriAdapter()
    }

    // Fallback otomatis ke mock adapter jika berjalan di browser biasa atau lingkungan pengujian
    return new InMemoryMockAdapter(options?.initialMockState)
}

// Re-export seluruh kontrak tipe dan adapter
export * from './types'
export { InMemoryMockAdapter } from './mock-adapter'
export { NativeTauriAdapter } from './native-adapter'
