import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles/globals.css'

import { createTauriApi } from './lib/tauri-api'

async function bootstrap() {
    // Inject Tauri API jika berjalan di environment Tauri
    if ('__TAURI_INTERNALS__' in window) {
        (window as any).api = createTauriApi() as any
        
        try {
            // Setup persistent settings store
            const { Store } = await import('@tauri-apps/plugin-store')
            // autoSave will save the store on every set() automatically (debounced)
            const store = await Store.load('settings.json', { autoSave: true })
            
            // 1. Initial Load: Populate localStorage from physical Store
            const keys = await store.keys()
            for (const key of keys) {
                const val = await store.get<string>(key)
                // store.get returns exactly what was stored. If we stored string, it returns string.
                if (val !== undefined && val !== null) {
                    window.localStorage.setItem(key, typeof val === 'string' ? val : JSON.stringify(val))
                }
            }

            // 2. Patch localStorage.setItem to also mirror to Tauri Store
            const originalSetItem = window.localStorage.setItem
            window.localStorage.setItem = function(key, value) {
                originalSetItem.apply(this, [key, value])
                // Fire and forget: Mirror to physical store
                store.set(key, value).catch(console.error)
            }
            
            // 3. Patch localStorage.removeItem
            const originalRemoveItem = window.localStorage.removeItem
            window.localStorage.removeItem = function(key) {
                originalRemoveItem.apply(this, [key])
                store.delete(key).catch(console.error)
            }
            
            console.log("[Tauri Store] LocalStorage successfully mirrored to settings.json")
        } catch (err) {
            console.error("[Tauri Store] Failed to initialize Tauri Store:", err)
        }
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
