/**
 * @deprecated Gunakan `src/lib/themeEngine.ts` (Unified Theme Engine) secara langsung.
 * Fasade kompatibilitas mundur ini hanya dipertahankan sementara bagi pemanggil/tes lama.
 */

import {
    BUILTIN_THEME_PRESETS,
    DEFAULT_DARK_PRESET_ID,
    _resetThemeEngineForTesting,
    addCustomThemePreset,
    applyThemePresetToDom,
    deleteCustomThemePreset,
    findThemePresetById,
    getAllThemePresets,
    getThemeEngineState,
    hydrateThemeEngineFromSettings,
    selectThemePreset,
    updateCustomThemePreset,
    type ThemePreset
} from './themeEngine'

export interface CustomColorScheme {
    id: string
    name: string
    primary: string
    profit: string
    loss: string
    background?: string
    card?: string
    foreground?: string
    polarity?: 'dark' | 'light'
    description?: string
    createdAt: number
    isBuiltin?: boolean
}

export const LEGACY_CUSTOM_SCHEMES_KEY = 'nitirekso_custom_color_schemes'
export const LEGACY_ACTIVE_SCHEME_KEY = 'nitirekso_active_custom_color_scheme_id'

export const BUILTIN_SCHEMES: CustomColorScheme[] = BUILTIN_THEME_PRESETS

export function hydrateCustomThemesFromSettings(settings: Record<string, unknown>): void {
    hydrateThemeEngineFromSettings(settings)
}

export function _resetCustomThemesForTesting(): void {
    _resetThemeEngineForTesting()
}

export function loadAllColorSchemes(): CustomColorScheme[] {
    return getAllThemePresets()
}

export function addCustomColorScheme(
    data: Omit<CustomColorScheme, 'id' | 'createdAt' | 'isBuiltin'>
): CustomColorScheme {
    return addCustomThemePreset(data)
}

export function deleteCustomColorScheme(id: string): void {
    deleteCustomThemePreset(id)
}

export function updateCustomColorScheme(
    id: string,
    data: Partial<Omit<CustomColorScheme, 'id' | 'createdAt' | 'isBuiltin'>>
): CustomColorScheme | null {
    return updateCustomThemePreset(id, data)
}

export function getActiveCustomSchemeId(): string | null {
    return getThemeEngineState().activePresetId
}

export function setActiveCustomSchemeId(id: string | null): void {
    selectThemePreset(id || DEFAULT_DARK_PRESET_ID)
}

export function applyColorSchemeToDom(scheme: CustomColorScheme | null): void {
    const preset: ThemePreset | null = scheme
        ? findThemePresetById(scheme.id) ?? {
              id: scheme.id,
              name: scheme.name,
              description: scheme.description ?? '',
              polarity: scheme.polarity ?? 'dark',
              background: scheme.background ?? '#0C0B14',
              card: scheme.card ?? '#151322',
              foreground: scheme.foreground ?? '#F8F7FC',
              primary: scheme.primary,
              profit: scheme.profit,
              loss: scheme.loss,
              isBuiltin: Boolean(scheme.isBuiltin),
              createdAt: scheme.createdAt
          }
        : findThemePresetById(DEFAULT_DARK_PRESET_ID)

    if (preset) {
        applyThemePresetToDom(preset, getThemeEngineState().colorblindSafe)
    }
}
