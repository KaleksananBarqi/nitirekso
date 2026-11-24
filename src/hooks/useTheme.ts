import { useCallback, useEffect, useState } from 'react'
import {
    getEffectiveThemePreset,
    getThemeEngineState,
    hydrateThemeEngineFromSettings,
    selectThemePreset,
    setThemeColorblindSafe,
    setThemeMode,
    syncDomWithThemeEngine,
    type ThemeMode,
    type ThemePreset
} from '../lib/themeEngine'

export type Theme = ThemeMode

export function resolveIsDark(theme: Theme): boolean {
    if (theme === 'dark') return true
    if (theme === 'light') return false
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return true
    return window.matchMedia('(prefers-color-scheme: dark)').matches
}

export function useTheme(): {
    theme: Theme
    colorblindSafe: boolean
    isDark: boolean
    activePreset: ThemePreset
    setTheme: (theme: Theme) => void
    setColorblindSafe: (value: boolean) => void
    setPreset: (presetId: string) => void
} {
    const [engineState, setEngineState] = useState(getThemeEngineState)
    const [activePreset, setActivePreset] = useState<ThemePreset>(() => getEffectiveThemePreset())

    const refresh = useCallback(() => {
        const next = getThemeEngineState()
        setEngineState(next)
        setActivePreset(getEffectiveThemePreset(next))
    }, [])

    // Terapkan tema awal ke DOM dan sinkronisasi dari SQLite via IPC
    useEffect(() => {
        syncDomWithThemeEngine()
        refresh()

        if (typeof window !== 'undefined' && window.api?.getSettings) {
            window.api
                .getSettings()
                .then((settings) => {
                    hydrateThemeEngineFromSettings(settings as Record<string, unknown>)
                    refresh()
                })
                .catch(() => {
                    // Abaikan bila IPC belum siap
                })
        }

        window.addEventListener('nitirekso:theme-updated', refresh)
        return () => window.removeEventListener('nitirekso:theme-updated', refresh)
    }, [refresh])

    // Ikuti perubahan tema OS saat mode `system` aktif
    useEffect(() => {
        if (engineState.mode !== 'system') return
        if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
        const query = window.matchMedia('(prefers-color-scheme: dark)')
        const listener = (): void => {
            syncDomWithThemeEngine()
            refresh()
        }
        query.addEventListener('change', listener)
        return () => query.removeEventListener('change', listener)
    }, [engineState.mode, refresh])

    const setTheme = useCallback((next: Theme) => {
        setThemeMode(next)
    }, [])

    const setColorblindSafe = useCallback((value: boolean) => {
        setThemeColorblindSafe(value)
    }, [])

    const setPreset = useCallback((presetId: string) => {
        selectThemePreset(presetId)
    }, [])

    return {
        theme: engineState.mode,
        colorblindSafe: engineState.colorblindSafe,
        isDark: activePreset.polarity === 'dark',
        activePreset,
        setTheme,
        setColorblindSafe,
        setPreset
    }
}
