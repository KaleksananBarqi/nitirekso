import type { PreloadApi } from '../../shared/ipc-contract'

/**
 * Deklarasi tipe untuk `window.api` yang disuntikkan ke runtime window.
 * Pada runtime desktop Tauri v2, jembatan ini disediakan oleh `src/lib/tauri-api.ts`.
 */
declare global {
    interface Window {
        api: PreloadApi
    }
}

export { }
