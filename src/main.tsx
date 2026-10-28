import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles/globals.css'

import { createTauriApi } from './lib/tauri-api'

/**
 * Bootstrap inisialisasi aplikasi Nitirekso.
 *
 * Menginisialisasi typed IPC API bridge (window.api) secara bersih tanpa
 * melakukan manipulasi runtime atau monkey-patching pada window.localStorage.
 * Seluruh persistensi pengaturan aplikasi dikonsolidasikan langsung ke backend
 * SQLite via IPC client.
 */
async function bootstrap() {
    // Inisialisasi API bridge (window.api) jika belum terpasang
    if (typeof window !== 'undefined' && !window.api) {
        window.api = createTauriApi()
    }

    const container = document.getElementById('root')
    if (!container) {
        throw new Error('Elemen #root tidak ditemukan di index.html')
    }

    createRoot(container).render(
        <StrictMode>
            <App />
        </StrictMode>
    )
}

bootstrap()
