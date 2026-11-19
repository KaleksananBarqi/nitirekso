import type {
    InstallEnvironment,
    ReleaseAssetInfo,
} from '@shared/ipc-contract'

export type UpdateStatus =
    | 'idle'
    | 'checking'
    | 'up-to-date'
    | 'available'
    | 'downloading'
    | 'ready-to-install'
    | 'installing'
    | 'error'
    | 'store-managed'

export interface UpdateDownloadProgressState {
    downloadedBytes: number
    totalBytes: number | null
    percent: number
    assetName: string
}

export interface UpdateState {
    status: UpdateStatus
    currentVersion: string
    environment: InstallEnvironment | null
    latestVersion: string | null
    releaseUrl: string
    releaseNotes: string | null
    publishedAt: string | null
    assets: ReleaseAssetInfo[]
    matchedAsset: ReleaseAssetInfo | null
    dismissedVersion: string | null
    isDismissed: boolean
    downloadProgress: UpdateDownloadProgressState | null
    downloadedLocalPath: string | null
    errorMessage: string | null
    lastCheckedAt: number | null
    source: string | null
}

export interface UpdatePillContent {
    visible: boolean
    label: string
    badgeText: string
    tone: 'default' | 'profit' | 'warning'
}

export const DEFAULT_RELEASES_URL = 'https://github.com/KaleksananBarqi/nitirekso/releases'

/** Membersihkan prefix 'v' dan memisah komponen numerik serta prerelease SemVer. */
export function normalizeSemver(version: string): { core: [number, number, number]; pre: string } {
    const cleaned = version.trim().replace(/^v/i, '')
    const [corePart = '0.0.0', prePart = ''] = cleaned.split('-', 2)
    const nums = corePart.split('.').map((part) => {
        const digits = /^\d+/.exec(part)?.[0]
        return digits ? Number.parseInt(digits, 10) : 0
    })
    return {
        core: [nums[0] ?? 0, nums[1] ?? 0, nums[2] ?? 0],
        pre: prePart.toLowerCase(),
    }
}

/** Membandingkan dua versi SemVer: 1 jika a > b, -1 jika a < b, 0 jika setara. */
export function compareSemver(a: string, b: string): -1 | 0 | 1 {
    const parsedA = normalizeSemver(a)
    const parsedB = normalizeSemver(b)

    for (let i = 0; i < 3; i++) {
        const va = parsedA.core[i]!
        const vb = parsedB.core[i]!
        if (va > vb) return 1
        if (va < vb) return -1
    }

    // Versi rilis final lebih tinggi daripada prerelease (mis. 1.9.0 > 1.9.0-mock)
    if (!parsedA.pre && parsedB.pre) return 1
    if (parsedA.pre && !parsedB.pre) return -1
    if (parsedA.pre === parsedB.pre) return 0
    return parsedA.pre > parsedB.pre ? 1 : -1
}

/** Mengembalikan true jika `latest` secara matematis lebih baru daripada `current`. */
export function isNewerSemver(latest: string, current: string): boolean {
    return compareSemver(latest, current) > 0
}

/** Memilih berkas installer rilis yang paling cocok dengan OS, arsitektur, dan paket terpasang. */
export function selectMatchedAsset(
    assets: ReleaseAssetInfo[],
    env: InstallEnvironment | null
): ReleaseAssetInfo | null {
    if (!assets.length || !env) return null

    const visibleAssets = assets.filter((a) => !a.name.endsWith('.sig'))
    const os = env.os.toLowerCase()
    const arch = env.arch.toLowerCase()
    const isArm = arch.includes('aarch64') || arch.includes('arm64')

    if (os === 'windows') {
        const exeCandidates = visibleAssets.filter((a) => a.name.toLowerCase().endsWith('.exe'))
        const msiCandidates = visibleAssets.filter((a) => a.name.toLowerCase().endsWith('.msi'))
        if (env.installKind === 'windows-msi') {
            return msiCandidates[0] ?? exeCandidates[0] ?? null
        }
        return (
            exeCandidates.find((a) => a.name.toLowerCase().includes('setup')) ??
            exeCandidates[0] ??
            msiCandidates[0] ??
            null
        )
    }

    if (os === 'macos') {
        const dmgCandidates = visibleAssets.filter((a) => a.name.toLowerCase().endsWith('.dmg'))
        const universalDmg = dmgCandidates.find((a) => a.name.toLowerCase().includes('universal'))
        if (universalDmg) return universalDmg
        const archDmg = dmgCandidates.find((a) =>
            isArm
                ? a.name.toLowerCase().includes('aarch64') || a.name.toLowerCase().includes('arm64')
                : a.name.toLowerCase().includes('x64') || a.name.toLowerCase().includes('x86_64')
        )
        if (archDmg) return archDmg
        if (dmgCandidates[0]) return dmgCandidates[0]
        return visibleAssets.find((a) => a.name.toLowerCase().endsWith('.app.tar.gz')) ?? null
    }

    if (os === 'linux') {
        const matchArch = (name: string): boolean => {
            const lower = name.toLowerCase()
            if (isArm) {
                return lower.includes('aarch64') || lower.includes('arm64')
            }
            return lower.includes('x86_64') || lower.includes('amd64') || !lower.includes('aarch64')
        }

        const pickByExt = (ext: string): ReleaseAssetInfo | null => {
            const matching = visibleAssets.filter((a) => a.name.toLowerCase().endsWith(ext))
            return matching.find((a) => matchArch(a.name)) ?? matching[0] ?? null
        }

        if (env.installKind === 'rpm') {
            return pickByExt('.rpm') ?? pickByExt('.appimage')
        }
        if (env.installKind === 'deb') {
            return pickByExt('.deb') ?? pickByExt('.appimage')
        }
        if (env.installKind === 'flatpak') {
            return null
        }
        return pickByExt('.appimage') ?? pickByExt('.deb') ?? pickByExt('.rpm')
    }

    return null
}

/** Memformat ukuran berkas dalam MB/KB. Mengembalikan string kosong bila ukuran 0 (data statis fallback). */
export function formatAssetSize(bytes: number | null | undefined): string {
    if (!bytes || bytes <= 0) return ''
    if (bytes < 1024) return `${bytes} B`
    const kb = bytes / 1024
    if (kb < 1024) return `${kb.toFixed(0)} KB`
    const mb = kb / 1024
    return `${mb.toFixed(1)} MB`
}

/** Menghasilkan label deskriptif lingkungan instalasi yang jujur untuk halaman About. */
export function formatEnvironmentLabel(env: InstallEnvironment | null): string {
    if (!env) return 'Lingkungan sistem belum terdeteksi'
    const osLabel = env.os === 'macos' ? 'macOS' : env.os === 'windows' ? 'Windows' : 'Linux'
    const kindMap: Record<InstallEnvironment['installKind'], string> = {
        flatpak: 'Flatpak (Store-Managed)',
        'app-image': 'AppImage',
        rpm: 'Paket RPM',
        deb: 'Paket DEB',
        'windows-nsis': 'Installer NSIS',
        'windows-msi': 'Installer MSI',
        'mac-os': 'Paket macOS',
        dev: 'Mode Pengembangan',
        unknown: 'Manual',
    }
    return `${osLabel} ${env.arch} (${kindMap[env.installKind]})`
}

/** Menyusun pesan ramah pengguna saat batas kuota GitHub API tercapai. */
export function formatRateLimitMessage(rawError: string, resetEpochSec?: number | null): string {
    const matchEpoch = /resetEpoch:(\d+)/.exec(rawError)
    const effectiveEpoch = resetEpochSec ?? (matchEpoch?.[1] ? Number.parseInt(matchEpoch[1], 10) : null)

    if (effectiveEpoch && Number.isFinite(effectiveEpoch)) {
        const resetDate = new Date(effectiveEpoch * 1000)
        const hh = String(resetDate.getHours()).padStart(2, '0')
        const mm = String(resetDate.getMinutes()).padStart(2, '0')
        return `Batas permintaan GitHub API tercapai (HTTP 403/429). Coba lagi setelah pukul ${hh}:${mm} atau periksa langsung di GitHub Releases.`
    }

    return rawError.replace(/\s*\(resetEpoch:\d+\)/g, '').trim()
}

/** Menentukan konten indikator pembaruan non-blocking untuk navigasi & status sidebar. */
export function getUpdatePillContent(state: UpdateState): UpdatePillContent {
    if (state.status === 'store-managed') {
        return {
            visible: false,
            label: 'Dikelola Store',
            badgeText: 'Store',
            tone: 'default',
        }
    }

    if (state.status === 'downloading') {
        const pct = Math.round(state.downloadProgress?.percent ?? 0)
        return {
            visible: true,
            label: `Mengunduh update ${pct}%`,
            badgeText: `${pct}%`,
            tone: 'default',
        }
    }

    if (state.status === 'installing') {
        return {
            visible: true,
            label: 'Memasang update...',
            badgeText: 'Pasang',
            tone: 'warning',
        }
    }

    if (state.status === 'ready-to-install') {
        return {
            visible: true,
            label: state.latestVersion
                ? `Siap pasang v${state.latestVersion}`
                : 'Siap pasang update',
            badgeText: 'Siap',
            tone: 'profit',
        }
    }

    if (state.status === 'available' && state.latestVersion && !state.isDismissed) {
        return {
            visible: true,
            label: `Update v${state.latestVersion}`,
            badgeText: 'Baru',
            tone: 'default',
        }
    }

    return {
        visible: false,
        label: '',
        badgeText: '',
        tone: 'default',
    }
}
