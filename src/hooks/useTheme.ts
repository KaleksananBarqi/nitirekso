import { useCallback, useEffect, useState } from 'react'
import { applyColorSchemeToDom, getActiveCustomSchemeId, loadAllColorSchemes } from '../lib/customThemes'

/**
 * Tema aplikasi: `dark` (default), `light`, atau `system`.
 *
 * Brief §7: dark mode adalah default karena preferensi umum trader dan kontras
 * tinggi untuk sesi panjang. Brief §7 juga meminta opsi colorblind-safe.
 *
 * Kelas diterapkan ke `<html>`:
 * - `.dark`            -> mengganti variabel CSS ke palet gelap
 * - `.colorblind-safe` -> menukar hijau/merah jadi biru/oranye
 *
 * Kelas di `<html>` (bukan di root React) supaya tidak ada kedipan tema saat
 * render pertama — lihat skrip inline di index.html.
 */

export type Theme = 'dark' | 'light' | 'system'

const THEME_KEY = 'trading-journal-theme'
const COLORBLIND_KEY = 'trading-journal-colorblind'

function prefersDark(): boolean {
    return window.matchMedia('(prefers-color-scheme: dark)').matches
}

export function resolveIsDark(theme: Theme): boolean {
    return theme === 'dark' || (theme === 'system' && prefersDark())
}

function applyTheme(theme: Theme, colorblindSafe: boolean): void {
    const root = document.documentElement
    root.classList.toggle('dark', resolveIsDark(theme))
    root.classList.toggle('colorblind-safe', colorblindSafe)
}

export function useTheme(): {
    theme: Theme
    colorblindSafe: boolean
    isDark: boolean
    setTheme: (theme: Theme) => void
    setColorblindSafe: (value: boolean) => void
} {
    const [theme, setThemeState] = useState<Theme>(() => {
        try {
            const stored = typeof window !== 'undefined' ? window.localStorage.getItem(THEME_KEY) : null
            return stored === 'dark' || stored === 'light' || stored === 'system' ? stored : 'dark'
        } catch {
            return 'dark'
        }
    })

    const [colorblindSafe, setColorblindState] = useState<boolean>(() => {
        try {
            return typeof window !== 'undefined' && window.localStorage.getItem(COLORBLIND_KEY) === 'true'
        } catch {
            return false
        }
    })

    const [isDark, setIsDark] = useState<boolean>(() => resolveIsDark(theme))

    // Sinkronisasi pengaturan tema dari SQLite via IPC
    useEffect(() => {
        if (typeof window !== 'undefined' && window.api?.getSettings) {
            window.api
                .getSettings()
                .then((settings) => {
                    const storedTheme = (settings.theme ?? settings[THEME_KEY]) as Theme | undefined
                    if (storedTheme === 'dark' || storedTheme === 'light' || storedTheme === 'system') {
                        setThemeState(storedTheme)
                        try {
                            window.localStorage.setItem(THEME_KEY, storedTheme)
                        } catch {
                            // Abaikan galat localStorage
                        }
                    }

                    const storedCb = (settings.colorblindSafe ?? settings[COLORBLIND_KEY]) as boolean | undefined
                    if (typeof storedCb === 'boolean') {
                        setColorblindState(storedCb)
                        try {
                            window.localStorage.setItem(COLORBLIND_KEY, String(storedCb))
                        } catch {
                            // Abaikan galat localStorage
                        }
                    }
                })
                .catch(() => {
                    // Abaikan galat jika API belum siap
                })
        }
    }, [])

    useEffect(() => {
        applyTheme(theme, colorblindSafe)
        setIsDark(resolveIsDark(theme))
        const activeSchemeId = getActiveCustomSchemeId()
        if (activeSchemeId) {
            const scheme = loadAllColorSchemes().find((s) => s.id === activeSchemeId) || null
            applyColorSchemeToDom(scheme)
        }
    }, [theme, colorblindSafe])

    // Ikuti perubahan tema OS saat mode `system` aktif.
    useEffect(() => {
        if (theme !== 'system') return
        const query = window.matchMedia('(prefers-color-scheme: dark)')
        const listener = (): void => {
            applyTheme('system', colorblindSafe)
            setIsDark(prefersDark())
        }
        query.addEventListener('change', listener)
        return () => query.removeEventListener('change', listener)
    }, [theme, colorblindSafe])

    const setTheme = useCallback((next: Theme) => {
        try {
            window.localStorage.setItem(THEME_KEY, next)
        } catch {
            // Abaikan galat localStorage
        }
        setThemeState(next)
        if (typeof window !== 'undefined' && window.api?.setSettings) {
            window.api.setSettings({ theme: next }).catch(() => {
                // Abaikan galat IPC
            })
        }
    }, [])

    const setColorblindSafe = useCallback((value: boolean) => {
        try {
            window.localStorage.setItem(COLORBLIND_KEY, String(value))
        } catch {
            // Abaikan galat localStorage
        }
        setColorblindState(value)
        if (typeof window !== 'undefined' && window.api?.setSettings) {
            window.api.setSettings({ colorblindSafe: value }).catch(() => {
                // Abaikan galat IPC
            })
        }
    }, [])

    return { theme, colorblindSafe, isDark, setTheme, setColorblindSafe }
}
