import { describe, expect, it, vi } from 'vitest'
import type {
    InstallEnvironment,
    ReleaseAssetInfo,
    ReleaseMetadataResult,
} from '@shared/ipc-contract'
import { InMemoryMockAdapter, ok, err, createAppError } from '../ipc'
import {
    compareSemver,
    formatAssetSize,
    formatRateLimitMessage,
    getUpdatePillContent,
    isNewerSemver,
    selectMatchedAsset,
    type UpdateState,
} from './updateHelpers'
import { UpdateService, type UpdaterPluginDriver } from './updateService'

const SAMPLE_ASSETS: ReleaseAssetInfo[] = [
    {
        name: 'nitirekso-1.9.1-1.x86_64.rpm',
        downloadUrl: 'https://github.com/KaleksananBarqi/nitirekso/releases/download/v1.9.1/nitirekso-1.9.1-1.x86_64.rpm',
        size: 7_800_000,
    },
    {
        name: 'nitirekso_1.9.1_amd64.deb',
        downloadUrl: 'https://github.com/KaleksananBarqi/nitirekso/releases/download/v1.9.1/nitirekso_1.9.1_amd64.deb',
        size: 7_700_000,
    },
    {
        name: 'nitirekso_1.9.1_amd64.AppImage',
        downloadUrl: 'https://github.com/KaleksananBarqi/nitirekso/releases/download/v1.9.1/nitirekso_1.9.1_amd64.AppImage',
        size: 85_000_000,
    },
    {
        name: 'nitirekso_1.9.1_universal.dmg',
        downloadUrl: 'https://github.com/KaleksananBarqi/nitirekso/releases/download/v1.9.1/nitirekso_1.9.1_universal.dmg',
        size: 9_100_000,
    },
    {
        name: 'nitirekso_1.9.1_x64-setup.exe',
        downloadUrl: 'https://github.com/KaleksananBarqi/nitirekso/releases/download/v1.9.1/nitirekso_1.9.1_x64-setup.exe',
        size: 5_900_000,
    },
    {
        name: 'nitirekso_1.9.1_x64_en-US.msi',
        downloadUrl: 'https://github.com/KaleksananBarqi/nitirekso/releases/download/v1.9.1/nitirekso_1.9.1_x64_en-US.msi',
        size: 6_800_000,
    },
]

function makeEnv(overrides: Partial<InstallEnvironment>): InstallEnvironment {
    return {
        os: 'linux',
        arch: 'x86_64',
        installKind: 'rpm',
        packageManager: 'dnf',
        canSelfUpdate: true,
        storeManaged: false,
        isDev: false,
        executablePath: '/usr/bin/nitirekso',
        ...overrides,
    }
}

describe('updateHelpers - SemVer, Asset Matching & UI Pill', () => {
    it('membandingkan versi SemVer dengan akurat termasuk prefix v dan prerelease', () => {
        expect(isNewerSemver('1.9.1', '1.9.0')).toBe(true)
        expect(isNewerSemver('v2.0.0', '1.9.9')).toBe(true)
        expect(isNewerSemver('1.9.0', '1.9.0')).toBe(false)
        expect(isNewerSemver('1.8.9', '1.9.0')).toBe(false)
        expect(compareSemver('1.9.0', '1.9.0-mock')).toBe(1)
    })

    it('memilih paket installer tepat untuk Fedora RPM, Ubuntu DEB, AppImage, Flatpak, Windows, dan macOS', () => {
        expect(selectMatchedAsset(SAMPLE_ASSETS, makeEnv({ os: 'linux', installKind: 'rpm' }))?.name).toBe(
            'nitirekso-1.9.1-1.x86_64.rpm'
        )
        expect(selectMatchedAsset(SAMPLE_ASSETS, makeEnv({ os: 'linux', installKind: 'deb' }))?.name).toBe(
            'nitirekso_1.9.1_amd64.deb'
        )
        expect(selectMatchedAsset(SAMPLE_ASSETS, makeEnv({ os: 'linux', installKind: 'app-image' }))?.name).toBe(
            'nitirekso_1.9.1_amd64.AppImage'
        )
        expect(selectMatchedAsset(SAMPLE_ASSETS, makeEnv({ os: 'linux', installKind: 'flatpak', storeManaged: true }))).toBeNull()
        expect(selectMatchedAsset(SAMPLE_ASSETS, makeEnv({ os: 'windows', installKind: 'windows-nsis' }))?.name).toBe(
            'nitirekso_1.9.1_x64-setup.exe'
        )
        expect(selectMatchedAsset(SAMPLE_ASSETS, makeEnv({ os: 'macos', installKind: 'mac-os' }))?.name).toBe(
            'nitirekso_1.9.1_universal.dmg'
        )
    })

    it('menyembunyikan ukuran 0 B dan memformat ukuran file serta pesan rate limit', () => {
        expect(formatAssetSize(0)).toBe('')
        expect(formatAssetSize(null)).toBe('')
        expect(formatAssetSize(7_800_000)).toBe('7.4 MB')
        expect(formatRateLimitMessage('Gagal (HTTP 403) (resetEpoch:1795075200)')).toContain(
            'Batas permintaan GitHub API tercapai'
        )
    })

    it('menghasilkan label pill non-blocking untuk status available, downloading, ready-to-install, dan dismissed', () => {
        const baseState: UpdateState = {
            status: 'available',
            currentVersion: '1.9.0',
            environment: null,
            latestVersion: '1.9.1',
            releaseUrl: 'https://github.com/KaleksananBarqi/nitirekso/releases',
            releaseNotes: null,
            publishedAt: null,
            assets: [],
            matchedAsset: null,
            dismissedVersion: null,
            isDismissed: false,
            downloadProgress: null,
            downloadedLocalPath: null,
            errorMessage: null,
            lastCheckedAt: null,
            source: null,
        }

        expect(getUpdatePillContent(baseState)).toMatchObject({
            visible: true,
            label: 'Update v1.9.1',
            badgeText: 'Baru',
        })

        expect(getUpdatePillContent({ ...baseState, isDismissed: true }).visible).toBe(false)

        expect(
            getUpdatePillContent({
                ...baseState,
                status: 'downloading',
                downloadProgress: {
                    downloadedBytes: 500,
                    totalBytes: 1000,
                    percent: 50,
                    assetName: 'pkg.rpm',
                },
            })
        ).toMatchObject({
            visible: true,
            label: 'Mengunduh update 50%',
            badgeText: '50%',
        })

        expect(getUpdatePillContent({ ...baseState, status: 'ready-to-install' })).toMatchObject({
            visible: true,
            label: 'Siap pasang v1.9.1',
            badgeText: 'Siap',
        })
    })
})

describe('UpdateService - State Machine, Hybrid Path & Persistensi SQLite', () => {
    it('mendeteksi mode store-managed (Flatpak) dan menonaktifkan self-update', async () => {
        const mock = new InMemoryMockAdapter()
        vi.spyOn(mock.system, 'getAppVersion').mockResolvedValue(ok('1.9.0'))
        vi.spyOn(mock.system, 'detectInstallEnvironment').mockResolvedValue(
            ok(makeEnv({ installKind: 'flatpak', storeManaged: true, canSelfUpdate: false }))
        )

        const service = new UpdateService({ client: mock })
        const initState = await service.init()
        expect(initState.status).toBe('store-managed')

        const afterCheck = await service.checkForUpdates()
        expect(afterCheck.status).toBe('store-managed')
    })

    it('menangani ETag 304 Not Modified, simpan dismissedUpdateVersion ke SQLite, dan jalur download/install Linux RPM', async () => {
        const mock = new InMemoryMockAdapter()
        vi.spyOn(mock.system, 'getAppVersion').mockResolvedValue(ok('1.9.0'))
        vi.spyOn(mock.system, 'detectInstallEnvironment').mockResolvedValue(
            ok(makeEnv({ os: 'linux', installKind: 'rpm', packageManager: 'dnf' }))
        )

        const firstMeta: ReleaseMetadataResult = {
            notModified: false,
            etag: '"etag-v191"',
            source: 'github-api',
            latestVersion: '1.9.1',
            releaseUrl: 'https://github.com/KaleksananBarqi/nitirekso/releases/tag/v1.9.1',
            releaseNotes: 'Catatan rilis 1.9.1',
            publishedAt: '2026-11-19T00:00:00Z',
            assets: SAMPLE_ASSETS,
            rateLimitResetAt: null,
        }

        const fetchSpy = vi
            .spyOn(mock.system, 'fetchReleaseMetadata')
            .mockResolvedValueOnce(ok(firstMeta))
            .mockResolvedValueOnce(
                ok({
                    ...firstMeta,
                    notModified: true,
                    source: 'cache',
                    assets: [],
                })
            )

        const service = new UpdateService({ client: mock })

        // 1. Cek pertama -> menemukan v1.9.1 & mencocokkan paket .rpm
        const state1 = await service.checkForUpdates()
        expect(state1.status).toBe('available')
        expect(state1.latestVersion).toBe('1.9.1')
        expect(state1.matchedAsset?.name).toBe('nitirekso-1.9.1-1.x86_64.rpm')

        // 2. Cek kedua -> mengirim ETag dan menangani 304 Not Modified tanpa kehilangan metadata
        const state2 = await service.checkForUpdates()
        expect(fetchSpy).toHaveBeenNthCalledWith(2, '"etag-v191"')
        expect(state2.status).toBe('available')
        expect(state2.assets).toHaveLength(SAMPLE_ASSETS.length)

        // 3. Abaikan versi ini -> tersimpan di settings SQLite
        await service.dismissLatestVersion()
        expect(service.getState().isDismissed).toBe(true)
        const settingsRes = await mock.settings.getAll()
        expect(settingsRes.ok && settingsRes.data.dismissedUpdateVersion).toBe('1.9.1')

        // 4. Unduh paket .rpm (jalur native Linux) -> transisi ke ready-to-install
        const dlSpy = vi.spyOn(mock.system, 'downloadLinuxPackage').mockResolvedValue(
            ok({
                localPath: '/tmp/nitirekso-updates/nitirekso-1.9.1-1.x86_64.rpm',
                sha256: 'abc123',
                size: 7_800_000,
            })
        )
        const afterDl = await service.downloadUpdate()
        expect(dlSpy).toHaveBeenCalledWith(
            SAMPLE_ASSETS[0]!.downloadUrl,
            'nitirekso-1.9.1-1.x86_64.rpm',
            '1.9.1'
        )
        expect(afterDl.status).toBe('ready-to-install')
        expect(afterDl.downloadedLocalPath).toContain('nitirekso-1.9.1-1.x86_64.rpm')

        // 5. Jika pengguna membatalkan pkexec, status tetap ready-to-install dengan pesan ramah
        vi.spyOn(mock.system, 'installLinuxPackageAndRelaunch').mockResolvedValueOnce(
            ok({
                status: 'cancelled',
                message: 'Otentikasi dibatalkan oleh pengguna.',
            })
        )
        const afterCancel = await service.installAndRestart()
        expect(afterCancel.status).toBe('ready-to-install')
        expect(afterCancel.errorMessage).toContain('Otentikasi dibatalkan')
    })

    it('menjalankan jalur tauri-plugin-updater (minisign) + relaunch pada Windows/macOS/AppImage', async () => {
        const mock = new InMemoryMockAdapter()
        vi.spyOn(mock.system, 'getAppVersion').mockResolvedValue(ok('1.9.0'))
        vi.spyOn(mock.system, 'detectInstallEnvironment').mockResolvedValue(
            ok(makeEnv({ os: 'windows', installKind: 'windows-nsis', packageManager: 'none' }))
        )
        vi.spyOn(mock.system, 'fetchReleaseMetadata').mockResolvedValue(
            ok({
                notModified: false,
                etag: null,
                source: 'static-fallback',
                latestVersion: '1.9.1',
                releaseUrl: 'https://github.com/KaleksananBarqi/nitirekso/releases/tag/v1.9.1',
                assets: SAMPLE_ASSETS,
            })
        )

        const installMock = vi.fn().mockResolvedValue(undefined)
        const relaunchMock = vi.fn().mockResolvedValue(undefined)
        const pluginDriver: UpdaterPluginDriver = {
            checkPluginUpdate: vi.fn().mockResolvedValue({
                version: '1.9.1',
                download: vi.fn(async (onEvent) => {
                    onEvent?.({ event: 'Started', data: { contentLength: 1000 } })
                    onEvent?.({ event: 'Progress', data: { chunkLength: 500 } })
                    onEvent?.({ event: 'Finished' })
                }),
                install: installMock,
            }),
            relaunchApp: relaunchMock,
        }

        const service = new UpdateService({ client: mock, pluginDriver })
        await service.checkForUpdates()
        const afterDl = await service.downloadUpdate()
        expect(afterDl.status).toBe('ready-to-install')
        expect(afterDl.downloadProgress?.percent).toBe(100)

        await service.installAndRestart()
        expect(installMock).toHaveBeenCalledTimes(1)
        expect(relaunchMock).toHaveBeenCalledTimes(1)
    })

    it('silent check tidak menampilkan status error ke UI saat offline, sedangkan cek manual menampilkan pesan error', async () => {
        const mock = new InMemoryMockAdapter()
        vi.spyOn(mock.system, 'getAppVersion').mockResolvedValue(ok('1.9.0'))
        vi.spyOn(mock.system, 'detectInstallEnvironment').mockResolvedValue(
            ok(makeEnv({ os: 'windows', installKind: 'windows-nsis', packageManager: 'none' }))
        )
        vi.spyOn(mock.system, 'fetchReleaseMetadata').mockResolvedValue(
            err(createAppError('FETCH_RELEASE_METADATA_FAILED', 'HTTP 403 (resetEpoch:1795075200)'))
        )

        const service = new UpdateService({ client: mock })
        const silentState = await service.checkForUpdates({ silent: true })
        expect(silentState.status).toBe('idle')
        expect(silentState.errorMessage).toBeNull()

        const manualState = await service.checkForUpdates({ silent: false })
        expect(manualState.status).toBe('error')
        expect(manualState.errorMessage).toContain('Batas permintaan GitHub API tercapai')
    })
})
