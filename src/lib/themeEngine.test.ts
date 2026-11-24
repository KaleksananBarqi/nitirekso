import { describe, expect, it, beforeEach } from 'vitest'
import {
    BUILTIN_THEME_PRESETS,
    DEFAULT_DARK_PRESET_ID,
    _resetThemeEngineForTesting,
    findThemePresetById,
    getContrastRatio,
    resolveThemeCssTokens
} from './themeEngine'
import { _resetLocaleForTesting, getLocale, setLocale, translate } from './i18n'

describe('Unified Theme Engine (34 Preset Jawa & WCAG AA)', () => {
    beforeEach(() => {
        _resetThemeEngineForTesting()
    })

    it('menyediakan tepat 34 preset bawaan (14 mode gelap & 20 mode terang)', () => {
        expect(BUILTIN_THEME_PRESETS).toHaveLength(34)
        const darkCount = BUILTIN_THEME_PRESETS.filter((p) => p.polarity === 'dark').length
        const lightCount = BUILTIN_THEME_PRESETS.filter((p) => p.polarity === 'light').length
        expect(darkCount).toBe(14)
        expect(lightCount).toBe(20)
    })

    it('memiliki ID unik dan nama Jawa baku selaras ekosistem trawangan', () => {
        const ids = new Set(BUILTIN_THEME_PRESETS.map((p) => p.id))
        expect(ids.size).toBe(34)
        expect(findThemePresetById('warta_abang')?.name).toBe('Warta Abang')
        expect(findThemePresetById('kopi_tubruk')?.name).toBe('Kopi Tubruk')
        expect(findThemePresetById('surya_baskara')?.name).toBe('Surya Baskara')
        expect(findThemePresetById('ayem_tentrem')?.name).toBe('Ayem Tentrem')
    })

    it('menjamin rasio kontras WCAG 2.1 AA (>= 4.5:1) untuk teks utama, muted, dan tombol utama di seluruh 34 preset', () => {
        for (const preset of BUILTIN_THEME_PRESETS) {
            const tokens = resolveThemeCssTokens(preset, false)
            expect(
                getContrastRatio(tokens['--foreground'], tokens['--background']),
                `${preset.id}: foreground vs background`
            ).toBeGreaterThanOrEqual(4.5)
            expect(
                getContrastRatio(tokens['--card-foreground'], tokens['--card']),
                `${preset.id}: card-foreground vs card`
            ).toBeGreaterThanOrEqual(4.5)
            expect(
                getContrastRatio(tokens['--muted-foreground'], tokens['--card']),
                `${preset.id}: muted-foreground vs card`
            ).toBeGreaterThanOrEqual(4.5)
            expect(
                getContrastRatio(tokens['--primary-foreground'], tokens['--primary']),
                `${preset.id}: primary-foreground vs primary`
            ).toBeGreaterThanOrEqual(4.5)
            expect(
                getContrastRatio(tokens['--profit'], tokens['--card']),
                `${preset.id}: profit vs card`
            ).toBeGreaterThanOrEqual(4.5)
            expect(
                getContrastRatio(tokens['--loss'], tokens['--card']),
                `${preset.id}: loss vs card`
            ).toBeGreaterThanOrEqual(4.5)
            expect(tokens['--bg-shell']).not.toBe(tokens['--background'])
        }
    })

    it('memberikan fallback aman ke default untuk 4 preset lama yang sudah diganti', () => {
        for (const legacyId of ['cyberpunk-neon', 'emerald-flow', 'tokyo-night', 'binance-gold']) {
            expect(findThemePresetById(legacyId)?.id).toBe(DEFAULT_DARK_PRESET_ID)
        }
    })

    it('menerapkan override Colorblind-Safe (biru/oranye) di atas preset mana pun', () => {
        const kopi = findThemePresetById('kopi_tubruk')!
        const normal = resolveThemeCssTokens(kopi, false)
        const cb = resolveThemeCssTokens(kopi, true)
        expect(cb['--profit']).not.toBe(normal['--profit'])
        expect(cb['--loss']).not.toBe(normal['--loss'])
    })
})

describe('Arekan Localization Engine (jv, id, en)', () => {
    beforeEach(() => {
        _resetLocaleForTesting()
    })

    it('menggunakan Basa Jawa Ngoko Arekan (jv) sebagai bahasa bawaan', () => {
        expect(getLocale()).toBe('jv')
        expect(translate('dash.title')).toBe('Ringkesan Performa')
        expect(translate('dash.subtitle', { count: 12 })).toContain('Saka 12 trade')
    })

    it('mendukung perpindahan bahasa ke Indonesia (id) dan English (en)', () => {
        setLocale('id')
        expect(translate('settings.title')).toBe('Pengaturan')
        expect(translate('dash.subtitle', { count: 5 })).toContain('Berdasarkan 5 trade')

        setLocale('en')
        expect(translate('settings.title')).toBe('Settings')
        expect(translate('dash.subtitle', { count: 5 })).toContain('Based on 5 trades')
    })
})
