/**
 * Unified Theme Engine untuk nitirekso (ADR-0005).
 *
 * Menyatukan polaritas gelap/terang, 34 Theme Preset bawaan (32 tema Jawa dari warna.md
 * selaras dengan ekosistem trawangan + 2 tema bawaan nitirekso), serta tema kustom pengguna.
 *
 * Seluruh token permukaan (`--bg-shell`, `--background`, `--card`, `--secondary`, `--muted`,
 * `--border`) dan kontras teks (`--foreground`, `--primary-foreground`, `--profit`, `--loss`)
 * diturunkan secara deterministik memenuhi WCAG 2.1 AA (>= 4.5:1).
 */

export type ThemeMode = 'dark' | 'light' | 'system'
export type ThemePolarity = 'dark' | 'light'

export interface ThemePreset {
    id: string
    name: string
    description: string
    polarity: ThemePolarity
    background: string
    card: string
    foreground: string
    primary: string
    profit: string
    loss: string
    isBuiltin: boolean
    createdAt: number
}

export interface CustomThemeInput {
    name: string
    primary: string
    profit: string
    loss: string
    background?: string
    card?: string
    foreground?: string
    polarity?: ThemePolarity
}

export const DEFAULT_DARK_PRESET_ID = 'obsidian_amethyst'
export const DEFAULT_LIGHT_PRESET_ID = 'kertas_editorial'

const LEGACY_REMOVED_BUILTIN_IDS = new Set([
    'cyberpunk-neon',
    'emerald-flow',
    'tokyo-night',
    'binance-gold'
])

// ---------------------------------------------------------------------------
// Utilitas Warna & Kontras WCAG 2.1 AA
// ---------------------------------------------------------------------------

interface Rgb {
    r: number
    g: number
    b: number
}

export function normalizeHex(hex: string, fallback = '#0C0B14'): string {
    const clean = hex.trim().replace(/^#/, '')
    if (/^[0-9a-fA-F]{3}$/.test(clean)) {
        return (
            '#' +
            clean
                .split('')
                .map((c) => c + c)
                .join('')
                .toUpperCase()
        )
    }
    if (/^[0-9a-fA-F]{6}$/.test(clean)) {
        return '#' + clean.toUpperCase()
    }
    return fallback
}

function hexToRgb(hex: string): Rgb {
    const norm = normalizeHex(hex)
    return {
        r: parseInt(norm.slice(1, 3), 16),
        g: parseInt(norm.slice(3, 5), 16),
        b: parseInt(norm.slice(5, 7), 16)
    }
}

function rgbToHex({ r, g, b }: Rgb): string {
    const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)))
    return (
        '#' +
        [clamp(r), clamp(g), clamp(b)]
            .map((v) => v.toString(16).padStart(2, '0'))
            .join('')
            .toUpperCase()
    )
}

/** Mencampur warna A menuju warna B sebanyak `ratio` (0..1). */
export function mixColors(hexA: string, hexB: string, ratio: number): string {
    const a = hexToRgb(hexA)
    const b = hexToRgb(hexB)
    const t = Math.max(0, Math.min(1, ratio))
    return rgbToHex({
        r: a.r + (b.r - a.r) * t,
        g: a.g + (b.g - a.g) * t,
        b: a.b + (b.b - a.b) * t
    })
}

export function getRelativeLuminance(hex: string): number {
    const { r, g, b } = hexToRgb(hex)
    const channel = (c: number) => {
        const s = c / 255
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
    }
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

export function getContrastRatio(hexA: string, hexB: string): number {
    const l1 = getRelativeLuminance(hexA)
    const l2 = getRelativeLuminance(hexB)
    const lighter = Math.max(l1, l2)
    const darker = Math.min(l1, l2)
    return (lighter + 0.05) / (darker + 0.05)
}

export function isDarkColor(hex: string): boolean {
    const { r, g, b } = hexToRgb(hex)
    const perceived = 0.299 * r + 0.587 * g + 0.114 * b
    return perceived < 128
}

/** Memilih teks terang/gelap paling kontras di atas warna latar tombol atau badge. */
export function resolveContrastTextColor(bgHex: string): string {
    const white = '#FFFFFF'
    const dark = '#0F1117'
    return getContrastRatio(bgHex, white) >= getContrastRatio(bgHex, dark) ? white : dark
}

/** Menjamin warna teks mencapai rasio kontras minimal `minRatio` di atas `bgHex`. */
export function ensureReadableColor(fgHex: string, bgHex: string, minRatio = 4.5): string {
    const normFg = normalizeHex(fgHex)
    const normBg = normalizeHex(bgHex)
    if (getContrastRatio(normFg, normBg) >= minRatio) {
        return normFg
    }
    const target = isDarkColor(normBg) ? '#F8F9FA' : '#14161B'
    for (let step = 1; step <= 12; step++) {
        const candidate = mixColors(normFg, target, step / 12)
        if (getContrastRatio(candidate, normBg) >= minRatio) {
            return candidate
        }
    }
    return target
}

/** Menurunkan warna lapisan dasar shell (`--bg-shell`) untuk pemisahan tonal Neo-Quant Bento Shell. */
export function deriveShellColor(bgHex: string, polarity: ThemePolarity): string {
    if (polarity === 'dark') {
        const lum = getRelativeLuminance(bgHex)
        // Jika background sudah hitam pekat (#000000), angkat sedikit agar panel tetap terpisah tonal
        return lum < 0.008 ? '#090A0E' : mixColors(bgHex, '#000000', 0.42)
    }
    return mixColors(bgHex, '#000000', 0.065)
}

interface PresetSeed {
    id: string
    name: string
    description: string
    polarity: ThemePolarity
    background: string
    foreground: string
    primary: string
    profit: string
    loss: string
    card?: string
}

function createBuiltInPreset(seed: PresetSeed, index: number): ThemePreset {
    const bg = normalizeHex(seed.background)
    const isDark = seed.polarity === 'dark'
    const card = seed.card
        ? normalizeHex(seed.card)
        : isDark
          ? mixColors(bg, '#FFFFFF', getRelativeLuminance(bg) < 0.01 ? 0.065 : 0.055)
          : mixColors(bg, '#FFFFFF', 0.45) === bg
            ? mixColors(bg, '#000000', 0.03)
            : mixColors(bg, '#FFFFFF', 0.55)

    return {
        id: seed.id,
        name: seed.name,
        description: seed.description,
        polarity: seed.polarity,
        background: bg,
        card,
        foreground: ensureReadableColor(seed.foreground, card, 4.6),
        primary: normalizeHex(seed.primary),
        profit: normalizeHex(seed.profit),
        loss: normalizeHex(seed.loss),
        isBuiltin: true,
        createdAt: index + 1
    }
}

/**
 * 34 Theme Preset Bawaan:
 * - 2 Preset Khas nitirekso (Obsidian Amethyst & Kertas Editorial)
 * - 19 Preset Jawa Mode Terang (dari warna.md, selaras Trawangan)
 * - 13 Preset Jawa Mode Gelap (dari warna.md, selaras Trawangan)
 */
const PRESET_SEEDS: PresetSeed[] = [
    // --- 2 Tema Bawaan nitirekso ---
    {
        id: DEFAULT_DARK_PRESET_ID,
        name: 'Obsidian Amethyst',
        description: 'Tema gelap bawaan nitirekso dengan aksen Royal Amethyst',
        polarity: 'dark',
        background: '#0C0B14',
        card: '#151322',
        foreground: '#F8F7FC',
        primary: '#9333EA',
        profit: '#10B981',
        loss: '#F43F5E'
    },
    {
        id: DEFAULT_LIGHT_PRESET_ID,
        name: 'Kertas Editorial',
        description: 'Tema terang bawaan nitirekso bernuansa kertas bersih dan tenang',
        polarity: 'light',
        background: '#F5F5F7',
        card: '#FFFFFF',
        foreground: '#1D1D1F',
        primary: '#7E22CE',
        profit: '#047857',
        loss: '#B91C1C'
    },

    // --- 19 Tema Jawa Mode Terang (dari warna.md) ---
    {
        id: 'ngrembaka',
        name: 'Ngrembaka',
        description: 'Hijau zamrud segar di atas kanvas putih salju (Compound Interest)',
        polarity: 'light',
        background: '#FCF7F7',
        card: '#FFFFFF',
        foreground: '#2E312E',
        primary: '#046908',
        profit: '#46B86D',
        loss: '#006400'
    },
    {
        id: 'kopi_tubruk',
        name: 'Kopi Tubruk',
        description: 'Krem hangat dan cokelat seduhan kopi klasik (Double Espresso)',
        polarity: 'light',
        background: '#FAF3E1',
        card: '#FFFBF0',
        foreground: '#553A2E',
        primary: '#994E2B',
        profit: '#9A7648',
        loss: '#9B4D29'
    },
    {
        id: 'geni_mrengkang',
        name: 'Geni Mrengkang',
        description: 'Nuansa jingga bara menyala di atas krem hangat (Short Squeeze)',
        polarity: 'light',
        background: '#FAF0E8',
        card: '#FFF8F3',
        foreground: '#B83400',
        primary: '#E63F00',
        profit: '#D86339',
        loss: '#D93B00'
    },
    {
        id: 'rega_pasar',
        name: 'Rega Pasar',
        description: 'Biru baja tenang berpadu merah koral di atas pirus muda (Bid n Ask)',
        polarity: 'light',
        background: '#EAF8F8',
        card: '#F7FFFF',
        foreground: '#2F5C83',
        primary: '#3B72A3',
        profit: '#376790',
        loss: '#DC4C35'
    },
    {
        id: 'watu_putih',
        name: 'Watu Putih',
        description: 'Monokrom bersih abu batu dan tinta arang (Hawks and Doves)',
        polarity: 'light',
        background: '#F4F4F5',
        card: '#FFFFFF',
        foreground: '#2E2E30',
        primary: '#4A4A4D',
        profit: '#464649',
        loss: '#7A7A7E'
    },
    {
        id: 'warta_abang',
        name: 'Warta Abang',
        description: 'Kertas koran abu hangat dengan aksen merah tua tegas (Red Folder News)',
        polarity: 'light',
        background: '#EAEAE5',
        card: '#F5F5F1',
        foreground: '#470D0E',
        primary: '#941B1E',
        profit: '#7C4D4D',
        loss: '#941B1E'
    },
    {
        id: 'laku_batin',
        name: 'Laku Batin',
        description: 'Abu netral teduh tanpa distraksi warna (Trust the Process)',
        polarity: 'light',
        background: '#F1F1F2',
        card: '#FAFAFB',
        foreground: '#2F3033',
        primary: '#5C5D61',
        profit: '#606162',
        loss: '#8C8D91'
    },
    {
        id: 'pasar_esuk',
        name: 'Pasar Esuk',
        description: 'Minimalis terang monokrom untuk fokus sesi pagi (Intraday)',
        polarity: 'light',
        background: '#F2F2F3',
        card: '#FFFFFF',
        foreground: '#2D2E30',
        primary: '#48494C',
        profit: '#494A4D',
        loss: '#8B8C90'
    },
    {
        id: 'gading_ijo',
        name: 'Gading Ijo',
        description: 'Kuning gading lembut dengan hijau daun segar (Withdrawal Request)',
        polarity: 'light',
        background: '#F5F4CC',
        card: '#FCFCE2',
        foreground: '#1F6F1F',
        primary: '#1E7E1E',
        profit: '#259A25',
        loss: '#DC4F37'
    },
    {
        id: 'sekar_jambon',
        name: 'Sekar Jambon',
        description: 'Merah muda bunga lembut dengan aksen magenta tajam (Love for the Game)',
        polarity: 'light',
        background: '#FCECF2',
        card: '#FFF6F9',
        foreground: '#9E126A',
        primary: '#BE187E',
        profit: '#C94B8B',
        loss: '#B5176E'
    },
    {
        id: 'kuning_kunir',
        name: 'Kuning Kunir',
        description: 'Putih cerah berpadu oranye kunir dan merah tomat (Micky D Job Application)',
        polarity: 'light',
        background: '#F8F9FA',
        card: '#FFFFFF',
        foreground: '#B35912',
        primary: '#C46817',
        profit: '#B58900',
        loss: '#D13B2E'
    },
    {
        id: 'mas_kencana',
        name: 'Mas Kencana',
        description: 'Abu batu hangat dengan kilau emas kencana (XAU)',
        polarity: 'light',
        background: '#E3E0DB',
        card: '#F0EEEA',
        foreground: '#52382C',
        primary: '#9A6F09',
        profit: '#9B740B',
        loss: '#8B6207'
    },
    {
        id: 'wangsit_lembah',
        name: 'Wangsit Lembah',
        description: 'Abu perak sejuk dengan hijau gelap slate (Tip from a Dip)',
        polarity: 'light',
        background: '#ECEEED',
        card: '#F7F8F8',
        foreground: '#284444',
        primary: '#2C4B4B',
        profit: '#2D4F4F',
        loss: '#7D8282'
    },
    {
        id: 'dana_lestari',
        name: 'Dana Lestari',
        description: 'Krem zaitun klasik bernuansa tenang dan matang (Funded)',
        polarity: 'light',
        background: '#F0F0D8',
        card: '#F9F9EB',
        foreground: '#52392D',
        primary: '#4E632A',
        profit: '#4F652A',
        loss: '#688524'
    },
    {
        id: 'peken_ijo',
        name: 'Peken Ijo',
        description: 'Putih mint sejuk dengan hijau pasar segar (Green Week)',
        polarity: 'light',
        background: '#EFFBF5',
        card: '#FAFFFC',
        foreground: '#1E741E',
        primary: '#1E7E1E',
        profit: '#229B22',
        loss: '#DC4C35'
    },
    {
        id: 'paring_eling',
        name: 'Paring Eling',
        description: 'Krem hangat dengan aksen bata dan merah tua pengingat risiko (Margin Call)',
        polarity: 'light',
        background: '#FBF0E8',
        card: '#FFF8F3',
        foreground: '#7A3B10',
        primary: '#9F2020',
        profit: '#954A15',
        loss: '#A81E1E'
    },
    {
        id: 'lembayung_awan',
        name: 'Lembayung Awan',
        description: 'Lavender lembut dengan ungu nila mendalam (Whipsaw)',
        polarity: 'light',
        background: '#E3E2F7',
        card: '#F2F1FC',
        foreground: '#420073',
        primary: '#6D289A',
        profit: '#634B94',
        loss: '#800080'
    },
    {
        id: 'kopi_klotok',
        name: 'Kopi Klotok',
        description: 'Krem susu hangat dengan cokelat terakota (Caffeinated)',
        polarity: 'light',
        background: '#F4E8DC',
        card: '#FCF5EE',
        foreground: '#7B3C12',
        primary: '#844335',
        profit: '#8D6954',
        loss: '#844335'
    },
    {
        id: 'banyu_segara',
        name: 'Banyu Segara',
        description: 'Abu awan cerah dengan toska laut dan merah tajam (TP Slapped)',
        polarity: 'light',
        background: '#E7ECEE',
        card: '#F6F8F9',
        foreground: '#263747',
        primary: '#148F77',
        profit: '#138D75',
        loss: '#D13B2E'
    },

    // --- 13 Tema Jawa Mode Gelap (dari warna.md) ---
    {
        id: 'pundi_arta',
        name: 'Pundi Arta',
        description: 'Hijau hutan gelap dengan aksen mint lembut (Money Printer)',
        polarity: 'dark',
        background: '#021704',
        card: '#09240C',
        foreground: '#DCDCDC',
        primary: '#7EB37E',
        profit: '#A8C4A9',
        loss: '#7AA87A'
    },
    {
        id: 'samodra_wengi',
        name: 'Samodra Wengi',
        description: 'Biru tengah malam pekat dengan cyan cerah dan koral (Missed by a Pip)',
        polarity: 'dark',
        background: '#03042B',
        card: '#0A0D3D',
        foreground: '#C6DCFF',
        primary: '#1DB8F0',
        profit: '#20C2FF',
        loss: '#FF6B52'
    },
    {
        id: 'undhuh_dana',
        name: 'Undhuh Dana',
        description: 'Arang gelap tenang dengan aksen toska laut dalam (Payout)',
        polarity: 'dark',
        background: '#17181A',
        card: '#212326',
        foreground: '#D8D8DA',
        primary: '#249A9A',
        profit: '#47A5A4',
        loss: '#668787'
    },
    {
        id: 'segara_jero',
        name: 'Segara Jero',
        description: 'Biru laut dalam hampir hitam dengan biru dodger (Underwater)',
        polarity: 'dark',
        background: '#02041A',
        card: '#0A0E2B',
        foreground: '#C4DAFF',
        primary: '#2E94FF',
        profit: '#DCE4F0',
        loss: '#3B9AFF'
    },
    {
        id: 'getih_segara',
        name: 'Getih Segara',
        description: 'Merah marun gelap dengan aksen mawar pudar (Blood in the Water)',
        polarity: 'dark',
        background: '#18090A',
        card: '#261214',
        foreground: '#FFE0E0',
        primary: '#C48A8A',
        profit: '#D8B4B4',
        loss: '#B87878'
    },
    {
        id: 'tutup_sasi',
        name: 'Tutup Sasi',
        description: 'Indigo malam dalam dengan periwinkle dingin (Month End Rebalancing)',
        polarity: 'dark',
        background: '#04061C',
        card: '#0D112E',
        foreground: '#BCCEFF',
        primary: '#9AA4D6',
        profit: '#D4D6EB',
        loss: '#959EC9'
    },
    {
        id: 'kilat_wengi',
        name: 'Kilat Wengi',
        description: 'Hitam OLED pekat dengan hijau neon dan jingga tajam (New York Volume)',
        polarity: 'dark',
        background: '#050608',
        card: '#111318',
        foreground: '#E8E9EC',
        primary: '#00E68E',
        profit: '#00F094',
        loss: '#FF541F'
    },
    {
        id: 'tengah_wengi',
        name: 'Tengah Wengi',
        description: 'Hitam monokrom murni dengan kontras perak bersih (Midnight Rally)',
        polarity: 'dark',
        background: '#060607',
        card: '#131316',
        foreground: '#E5E5E7',
        primary: '#CFCFD4',
        profit: '#D6D6DB',
        loss: '#9E9EA4'
    },
    {
        id: 'surya_baskara',
        name: 'Surya Baskara',
        description: 'Biru arang terminal finansial dengan aksen amber terang (Bloomberg Terminal)',
        polarity: 'dark',
        background: '#0D0F16',
        card: '#171A24',
        foreground: '#F5F6F8',
        primary: '#FF9244',
        profit: '#FF964A',
        loss: '#C2C0B8'
    },
    {
        id: 'sapu_tirta',
        name: 'Sapu Tirta',
        description: 'Arang gelap lembut dengan biru es dan dodger (Liquidity Grab)',
        polarity: 'dark',
        background: '#0E1012',
        card: '#181B1F',
        foreground: '#C4EAF0',
        primary: '#3699FF',
        profit: '#B4E4EA',
        loss: '#389BFF'
    },
    {
        id: 'rame_sore',
        name: 'Rame Sore',
        description: 'Hitam grafit sesi London dengan hijau & merah klasik (London Volume)',
        polarity: 'dark',
        background: '#0B0C10',
        card: '#15171F',
        foreground: '#F5F6FA',
        primary: '#00BD52',
        profit: '#00C254',
        loss: '#ED3232'
    },
    {
        id: 'ayem_tentrem',
        name: 'Ayem Tentrem',
        description: 'Arang teduh dengan cyan pucat dan biru baja tenang (Risk Free Runner)',
        polarity: 'dark',
        background: '#131416',
        card: '#1D1F23',
        foreground: '#E2FFFF',
        primary: '#5694C7',
        profit: '#D4F8F8',
        loss: '#5D98C9'
    },
    {
        id: 'wates_dhuwur',
        name: 'Wates Dhuwur',
        description: 'Monokrom gelap elegan dengan skala abu terukur (Limit Up)',
        polarity: 'dark',
        background: '#111113',
        card: '#1C1C20',
        foreground: '#E4E4E8',
        primary: '#B4B4BC',
        profit: '#B8B8C0',
        loss: '#7E7E86'
    }
]

export const BUILTIN_THEME_PRESETS: ThemePreset[] = PRESET_SEEDS.map((seed, idx) =>
    createBuiltInPreset(seed, idx)
)

// ---------------------------------------------------------------------------
// Resolusi Token CSS Deterministik
// ---------------------------------------------------------------------------

export interface ResolvedThemeTokens {
    polarity: ThemePolarity
    '--bg-shell': string
    '--background': string
    '--foreground': string
    '--card': string
    '--card-foreground': string
    '--popover': string
    '--popover-foreground': string
    '--primary': string
    '--primary-foreground': string
    '--secondary': string
    '--secondary-foreground': string
    '--muted': string
    '--muted-foreground': string
    '--accent': string
    '--accent-foreground': string
    '--destructive': string
    '--destructive-foreground': string
    '--border': string
    '--input': string
    '--ring': string
    '--profit': string
    '--profit-foreground': string
    '--loss': string
    '--loss-foreground': string
    '--flat': string
    '--chart-1': string
    '--chart-2': string
    '--chart-3': string
    '--chart-4': string
    '--chart-5': string
}

export function resolveThemeCssTokens(
    preset: ThemePreset,
    colorblindSafe = false
): ResolvedThemeTokens {
    const isDark = preset.polarity === 'dark'
    const bg = normalizeHex(preset.background, isDark ? '#0C0B14' : '#F5F5F7')
    const card = normalizeHex(
        preset.card,
        isDark ? mixColors(bg, '#FFFFFF', 0.06) : '#FFFFFF'
    )
    const shell = deriveShellColor(bg, preset.polarity)
    const fg = ensureReadableColor(preset.foreground, card, 4.6)
    const fgOnBg = ensureReadableColor(fg, bg, 4.6)
    const primary = normalizeHex(preset.primary, isDark ? '#9333EA' : '#7E22CE')
    const primaryFg = resolveContrastTextColor(primary)

    const secondary = isDark ? mixColors(card, '#FFFFFF', 0.07) : mixColors(card, '#000000', 0.05)
    const muted = isDark ? mixColors(card, '#FFFFFF', 0.05) : mixColors(bg, '#000000', 0.04)
    const mutedFg = ensureReadableColor(
        mixColors(fg, bg, isDark ? 0.36 : 0.42),
        card,
        4.5
    )
    const accent = isDark ? mixColors(card, primary, 0.14) : mixColors(card, primary, 0.09)
    const border = isDark ? mixColors(card, '#FFFFFF', 0.12) : mixColors(card, '#000000', 0.12)
    const inputBorder = isDark ? mixColors(card, '#FFFFFF', 0.18) : mixColors(card, '#000000', 0.18)

    const rawProfit = colorblindSafe
        ? isDark
            ? '#60A5FA'
            : '#1D4ED8'
        : preset.profit
    const rawLoss = colorblindSafe
        ? isDark
            ? '#FB923C'
            : '#C2410C'
        : preset.loss

    const profit = ensureReadableColor(rawProfit, card, 4.5)
    const loss = ensureReadableColor(rawLoss, card, 4.5)
    const destructive = isDark ? '#F43F5E' : '#B91C1C'

    return {
        polarity: preset.polarity,
        '--bg-shell': shell,
        '--background': bg,
        '--foreground': fgOnBg,
        '--card': card,
        '--card-foreground': fg,
        '--popover': card,
        '--popover-foreground': fg,
        '--primary': primary,
        '--primary-foreground': primaryFg,
        '--secondary': secondary,
        '--secondary-foreground': ensureReadableColor(fg, secondary, 4.5),
        '--muted': muted,
        '--muted-foreground': mutedFg,
        '--accent': accent,
        '--accent-foreground': ensureReadableColor(fg, accent, 4.5),
        '--destructive': destructive,
        '--destructive-foreground': resolveContrastTextColor(destructive),
        '--border': border,
        '--input': inputBorder,
        '--ring': primary,
        '--profit': profit,
        '--profit-foreground': resolveContrastTextColor(profit),
        '--loss': loss,
        '--loss-foreground': resolveContrastTextColor(loss),
        '--flat': mutedFg,
        '--chart-1': primary,
        '--chart-2': profit,
        '--chart-3': isDark ? '#F59E0B' : '#B45309',
        '--chart-4': isDark ? '#38BDF8' : '#0369A1',
        '--chart-5': loss
    }
}

export function applyThemePresetToDom(preset: ThemePreset, colorblindSafe = false): void {
    if (typeof document === 'undefined') return
    const root = document.documentElement
    const tokens = resolveThemeCssTokens(preset, colorblindSafe)

    root.classList.toggle('dark', tokens.polarity === 'dark')
    root.classList.toggle('colorblind-safe', colorblindSafe)
    root.dataset.theme = preset.id
    root.style.colorScheme = tokens.polarity

    const keys = Object.keys(tokens) as Array<keyof ResolvedThemeTokens>
    for (const key of keys) {
        if (key === 'polarity') continue
        root.style.setProperty(key, tokens[key])
    }
}

// ---------------------------------------------------------------------------
// Store Memori & Sinkronisasi Settings
// ---------------------------------------------------------------------------

export interface ThemeEngineState {
    mode: ThemeMode
    activePresetId: string
    darkPresetId: string
    lightPresetId: string
    colorblindSafe: boolean
    customPresets: ThemePreset[]
}

const LS_THEME_MODE = 'trading-journal-theme'
const LS_COLORBLIND = 'trading-journal-colorblind'
const LS_ACTIVE_PRESET = 'nitirekso-active-theme-preset'
const LS_DARK_PRESET = 'nitirekso-dark-theme-preset'
const LS_LIGHT_PRESET = 'nitirekso-light-theme-preset'

function safeGetLs(key: string): string | null {
    try {
        return typeof window !== 'undefined' ? window.localStorage.getItem(key) : null
    } catch {
        return null
    }
}

function safeSetLs(key: string, value: string): void {
    try {
        if (typeof window !== 'undefined') window.localStorage.setItem(key, value)
    } catch {
        // Abaikan
    }
}

function prefersSystemDark(): boolean {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return true
    return window.matchMedia('(prefers-color-scheme: dark)').matches
}

let state: ThemeEngineState = {
    mode: (() => {
        const stored = safeGetLs(LS_THEME_MODE)
        return stored === 'dark' || stored === 'light' || stored === 'system' ? stored : 'dark'
    })(),
    activePresetId: safeGetLs(LS_ACTIVE_PRESET) || DEFAULT_DARK_PRESET_ID,
    darkPresetId: safeGetLs(LS_DARK_PRESET) || DEFAULT_DARK_PRESET_ID,
    lightPresetId: safeGetLs(LS_LIGHT_PRESET) || DEFAULT_LIGHT_PRESET_ID,
    colorblindSafe: safeGetLs(LS_COLORBLIND) === 'true',
    customPresets: []
}

function notifyUpdated(): void {
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
        try {
            window.dispatchEvent(new CustomEvent('custom-themes:updated'))
            window.dispatchEvent(new CustomEvent('nitirekso:theme-updated'))
        } catch {
            // Abaikan
        }
    }
}

function persistPatch(patch: Record<string, unknown>): void {
    if (typeof window !== 'undefined' && window.api?.setSettings) {
        void window.api.setSettings(patch).catch(() => {
            // Abaikan error sementara
        })
    }
}

export function getAllThemePresets(): ThemePreset[] {
    return [...BUILTIN_THEME_PRESETS, ...state.customPresets]
}

export function findThemePresetById(id: string | null | undefined): ThemePreset | null {
    if (!id) return null
    if (LEGACY_REMOVED_BUILTIN_IDS.has(id)) {
        return BUILTIN_THEME_PRESETS.find((p) => p.id === DEFAULT_DARK_PRESET_ID) ?? null
    }
    return getAllThemePresets().find((p) => p.id === id) ?? null
}

export function getEffectiveThemePreset(s: ThemeEngineState = state): ThemePreset {
    const all = [...BUILTIN_THEME_PRESETS, ...s.customPresets]
    const byId = (id: string) => all.find((p) => p.id === id) ?? null

    if (s.mode === 'system') {
        const targetId = prefersSystemDark() ? s.darkPresetId : s.lightPresetId
        const fallbackId = prefersSystemDark() ? DEFAULT_DARK_PRESET_ID : DEFAULT_LIGHT_PRESET_ID
        return byId(targetId) ?? byId(fallbackId) ?? BUILTIN_THEME_PRESETS[0]!
    }

    const active = byId(s.activePresetId)
    if (active) return active

    const fallbackId = s.mode === 'light' ? s.lightPresetId : s.darkPresetId
    return (
        byId(fallbackId) ??
        byId(s.mode === 'light' ? DEFAULT_LIGHT_PRESET_ID : DEFAULT_DARK_PRESET_ID) ??
        BUILTIN_THEME_PRESETS[0]!
    )
}

export function getThemeEngineState(): ThemeEngineState {
    return {
        ...state,
        customPresets: [...state.customPresets]
    }
}

export function syncDomWithThemeEngine(): void {
    const effective = getEffectiveThemePreset(state)
    applyThemePresetToDom(effective, state.colorblindSafe)
}

export function setThemeMode(mode: ThemeMode): void {
    state.mode = mode
    if (mode === 'dark') {
        state.activePresetId = state.darkPresetId
    } else if (mode === 'light') {
        state.activePresetId = state.lightPresetId
    }
    safeSetLs(LS_THEME_MODE, mode)
    safeSetLs(LS_ACTIVE_PRESET, state.activePresetId)
    syncDomWithThemeEngine()
    persistPatch({
        theme: mode,
        activeThemePresetId: state.activePresetId,
        activeCustomColorSchemeId: state.activePresetId
    })
    notifyUpdated()
}

export function selectThemePreset(presetId: string | null): void {
    const target =
        findThemePresetById(presetId) ??
        findThemePresetById(
            state.mode === 'light' ? DEFAULT_LIGHT_PRESET_ID : DEFAULT_DARK_PRESET_ID
        ) ??
        BUILTIN_THEME_PRESETS[0]!

    state.activePresetId = target.id
    if (target.polarity === 'dark') {
        state.darkPresetId = target.id
        safeSetLs(LS_DARK_PRESET, target.id)
    } else {
        state.lightPresetId = target.id
        safeSetLs(LS_LIGHT_PRESET, target.id)
    }

    // Jika sedang tidak di mode system, selaraskan mode dengan polaritas preset terpilih
    if (state.mode !== 'system') {
        state.mode = target.polarity
        safeSetLs(LS_THEME_MODE, state.mode)
    }
    safeSetLs(LS_ACTIVE_PRESET, target.id)

    syncDomWithThemeEngine()
    persistPatch({
        theme: state.mode,
        activeThemePresetId: state.activePresetId,
        activeCustomColorSchemeId: state.activePresetId,
        darkThemePresetId: state.darkPresetId,
        lightThemePresetId: state.lightPresetId
    })
    notifyUpdated()
}

export function setThemeColorblindSafe(value: boolean): void {
    state.colorblindSafe = value
    safeSetLs(LS_COLORBLIND, String(value))
    syncDomWithThemeEngine()
    persistPatch({ colorblindSafe: value })
    notifyUpdated()
}

function buildNormalizedCustomPreset(params: {
    id: string
    name: string
    description?: string
    background?: string
    card?: string
    foreground?: string
    polarity?: ThemePolarity
    primary?: string
    profit?: string
    loss?: string
    createdAt: number
}): ThemePreset {
    const bg = normalizeHex(params.background || '#0C0B14')
    const polarity: ThemePolarity = params.polarity ?? (isDarkColor(bg) ? 'dark' : 'light')
    const card = normalizeHex(
        params.card || (polarity === 'dark' ? mixColors(bg, '#FFFFFF', 0.06) : '#FFFFFF')
    )
    const fg = normalizeHex(params.foreground || (polarity === 'dark' ? '#F8F7FC' : '#1D1D1F'))

    return {
        id: params.id,
        name: params.name.trim() || 'Tema Kustom',
        description: params.description || 'Tema kustom buatan Anda',
        polarity,
        background: bg,
        card,
        foreground: ensureReadableColor(fg, card, 4.6),
        primary: normalizeHex(params.primary || '#9333EA'),
        profit: normalizeHex(params.profit || '#10B981'),
        loss: normalizeHex(params.loss || '#F43F5E'),
        isBuiltin: false,
        createdAt: params.createdAt
    }
}

function normalizeCustomPreset(raw: Record<string, unknown>): ThemePreset | null {
    if (!raw || typeof raw.id !== 'string' || typeof raw.name !== 'string') return null
    if (raw.isBuiltin === true) return null
    return buildNormalizedCustomPreset({
        id: raw.id,
        name: raw.name,
        description: typeof raw.description === 'string' ? raw.description : undefined,
        background: typeof raw.background === 'string' ? raw.background : undefined,
        card: typeof raw.card === 'string' ? raw.card : undefined,
        foreground: typeof raw.foreground === 'string' ? raw.foreground : undefined,
        polarity: raw.polarity === 'light' || raw.polarity === 'dark' ? raw.polarity : undefined,
        primary: typeof raw.primary === 'string' ? raw.primary : undefined,
        profit: typeof raw.profit === 'string' ? raw.profit : undefined,
        loss: typeof raw.loss === 'string' ? raw.loss : undefined,
        createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : Date.now()
    })
}

export function addCustomThemePreset(input: CustomThemeInput): ThemePreset {
    const created = buildNormalizedCustomPreset({
        id: `custom-scheme-${Date.now()}`,
        name: input.name,
        background: input.background,
        card: input.card,
        foreground: input.foreground,
        polarity: input.polarity,
        primary: input.primary,
        profit: input.profit,
        loss: input.loss,
        createdAt: Date.now()
    })
    state.customPresets = [...state.customPresets, created]
    persistPatch({ customColorSchemes: state.customPresets })
    notifyUpdated()
    return created
}

export function updateCustomThemePreset(
    id: string,
    updates: Partial<CustomThemeInput>
): ThemePreset | null {
    const idx = state.customPresets.findIndex((p) => p.id === id)
    if (idx < 0) return null
    const prev = state.customPresets[idx]!
    const updated = buildNormalizedCustomPreset({
        id: prev.id,
        name: updates.name !== undefined ? updates.name.trim() || prev.name : prev.name,
        description: prev.description,
        background: updates.background ?? prev.background,
        card: updates.card ?? prev.card,
        foreground: updates.foreground ?? prev.foreground,
        polarity: updates.polarity,
        primary: updates.primary ?? prev.primary,
        profit: updates.profit ?? prev.profit,
        loss: updates.loss ?? prev.loss,
        createdAt: prev.createdAt
    })

    const nextList = [...state.customPresets]
    nextList[idx] = updated
    state.customPresets = nextList
    persistPatch({ customColorSchemes: nextList })
    if (state.activePresetId === id) {
        syncDomWithThemeEngine()
    }
    notifyUpdated()
    return updated
}

export function deleteCustomThemePreset(id: string): void {
    state.customPresets = state.customPresets.filter((p) => p.id !== id)
    persistPatch({ customColorSchemes: state.customPresets })
    if (state.activePresetId === id) {
        selectThemePreset(state.mode === 'light' ? DEFAULT_LIGHT_PRESET_ID : DEFAULT_DARK_PRESET_ID)
        return
    }
    notifyUpdated()
}

export function hydrateThemeEngineFromSettings(settings: Record<string, unknown>): void {
    if (Array.isArray(settings.customColorSchemes)) {
        state.customPresets = (settings.customColorSchemes as Array<Record<string, unknown>>)
            .map(normalizeCustomPreset)
            .filter((p): p is ThemePreset => p !== null)
    }

    const storedMode = settings.theme ?? settings[LS_THEME_MODE]
    if (storedMode === 'dark' || storedMode === 'light' || storedMode === 'system') {
        state.mode = storedMode
        safeSetLs(LS_THEME_MODE, storedMode)
    }

    const storedCb = settings.colorblindSafe ?? settings[LS_COLORBLIND]
    if (typeof storedCb === 'boolean') {
        state.colorblindSafe = storedCb
        safeSetLs(LS_COLORBLIND, String(storedCb))
    }

    if (typeof settings.darkThemePresetId === 'string' && findThemePresetById(settings.darkThemePresetId)) {
        state.darkPresetId = settings.darkThemePresetId
        safeSetLs(LS_DARK_PRESET, state.darkPresetId)
    }
    if (typeof settings.lightThemePresetId === 'string' && findThemePresetById(settings.lightThemePresetId)) {
        state.lightPresetId = settings.lightThemePresetId
        safeSetLs(LS_LIGHT_PRESET, state.lightPresetId)
    }

    const rawActive = settings.activeThemePresetId ?? settings.activeCustomColorSchemeId
    if (typeof rawActive === 'string' && rawActive) {
        const resolved = findThemePresetById(rawActive)
        if (resolved) {
            state.activePresetId = resolved.id
            safeSetLs(LS_ACTIVE_PRESET, resolved.id)
        }
    } else if (rawActive === null) {
        state.activePresetId = state.mode === 'light' ? DEFAULT_LIGHT_PRESET_ID : DEFAULT_DARK_PRESET_ID
        safeSetLs(LS_ACTIVE_PRESET, state.activePresetId)
    }

    syncDomWithThemeEngine()
    notifyUpdated()
}

export function _resetThemeEngineForTesting(): void {
    state = {
        mode: 'dark',
        activePresetId: DEFAULT_DARK_PRESET_ID,
        darkPresetId: DEFAULT_DARK_PRESET_ID,
        lightPresetId: DEFAULT_LIGHT_PRESET_ID,
        colorblindSafe: false,
        customPresets: []
    }
}
