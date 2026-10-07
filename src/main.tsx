import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles/globals.css'

import { createTauriApi } from './lib/tauri-api'

// Inject Tauri API jika berjalan di environment Tauri
if ('__TAURI_INTERNALS__' in window) {
    (window as any).api = createTauriApi() as any
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
