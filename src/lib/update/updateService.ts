import type {
    InstallEnvironment,
    ReleaseMetadataResult,
} from '@shared/ipc-contract'
import { APP_VERSION } from '../config/version'
import { createApiClient, isTauriEnvironment, type IpcClient } from '../ipc'
import {
    DEFAULT_RELEASES_URL,
    formatRateLimitMessage,
    isNewerSemver,
    selectMatchedAsset,
    type UpdateState,
} from './updateHelpers'

export interface TauriPluginUpdateHandle {
    version: string
    download(
        onEvent?: (event: {
            event: 'Started' | 'Progress' | 'Finished'
            data?: { contentLength?: number; chunkLength?: number }
        }) => void
    ): Promise<void>
    install(): Promise<void>
}

export interface UpdaterPluginDriver {
    checkPluginUpdate(): Promise<TauriPluginUpdateHandle | null>
    relaunchApp(): Promise<void>
}

const defaultPluginDriver: UpdaterPluginDriver = {
    async checkPluginUpdate() {
        if (!isTauriEnvironment()) return null
        const { check } = await import('@tauri-apps/plugin-updater')
        const update = await check()
        if (!update) return null
        return {
            version: update.version,
            download: (onEvent) =>
                update.download((ev) => {
                    onEvent?.(ev as {
                        event: 'Started' | 'Progress' | 'Finished'
                        data?: { contentLength?: number; chunkLength?: number }
                    })
                }),
            install: () => update.install(),
        }
    },
    async relaunchApp() {
        const { relaunch } = await import('@tauri-apps/plugin-process')
        await relaunch()
    },
}

type StateListener = (state: UpdateState) => void

export class UpdateService {
    private client: IpcClient
    private pluginDriver: UpdaterPluginDriver
    private listeners = new Set<StateListener>()
    private initPromise: Promise<UpdateState> | null = null
    private lastEtag: string | null = null
    private lastCachedMeta: ReleaseMetadataResult | null = null
    private pendingPluginUpdate: TauriPluginUpdateHandle | null = null

    private state: UpdateState = {
        status: 'idle',
        currentVersion: APP_VERSION,
        environment: null,
        latestVersion: null,
        releaseUrl: DEFAULT_RELEASES_URL,
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

    constructor(options?: { client?: IpcClient; pluginDriver?: UpdaterPluginDriver }) {
        // Konstruktor bebas side-effect agar aman saat diimport atau diuji headless
        this.client = options?.client ?? createApiClient()
        this.pluginDriver = options?.pluginDriver ?? defaultPluginDriver
    }

    public getState(): UpdateState {
        return this.state
    }

    public subscribe(listener: StateListener): () => void {
        this.listeners.add(listener)
        listener(this.state)
        return () => {
            this.listeners.delete(listener)
        }
    }

    private setState(partial: Partial<UpdateState>): void {
        this.state = { ...this.state, ...partial }
        for (const listener of this.listeners) {
            listener(this.state)
        }
    }

    /** Memuat versi runtime, lingkungan instalasi, dan versi yang diabaikan dari SQLite. */
    public async init(): Promise<UpdateState> {
        if (this.initPromise) return this.initPromise

        this.initPromise = (async () => {
            const [verRes, envRes, settingsRes] = await Promise.all([
                this.client.system.getAppVersion(),
                this.client.system.detectInstallEnvironment(),
                this.client.settings.getAll(),
            ])

            const currentVersion = verRes.ok && verRes.data ? verRes.data : APP_VERSION
            const environment: InstallEnvironment | null = envRes.ok ? envRes.data : null
            const dismissedVersion =
                settingsRes.ok && typeof settingsRes.data.dismissedUpdateVersion === 'string'
                    ? settingsRes.data.dismissedUpdateVersion
                    : null

            const isStoreManaged = Boolean(
                environment?.storeManaged || environment?.installKind === 'flatpak'
            )

            this.setState({
                currentVersion,
                environment,
                dismissedVersion,
                status: isStoreManaged ? 'store-managed' : this.state.status,
            })

            return this.state
        })()

        return this.initPromise
    }

    /** Memeriksa rilis terbaru di GitHub (mendukung ETag 304 dan fallback statis). */
    public async checkForUpdates(options?: { silent?: boolean }): Promise<UpdateState> {
        await this.init()

        if (this.state.status === 'store-managed') {
            return this.state
        }
        if (
            this.state.status === 'downloading' ||
            this.state.status === 'installing' ||
            this.state.status === 'ready-to-install'
        ) {
            return this.state
        }

        const isSilent = Boolean(options?.silent)
        if (!isSilent) {
            this.setState({ status: 'checking', errorMessage: null })
        }

        const metaRes = await this.client.system.fetchReleaseMetadata(this.lastEtag)
        if (!metaRes.ok) {
            const formatted = formatRateLimitMessage(metaRes.error.message)
            if (isSilent) {
                // Silent check yang gagal jaringan tidak menimpa status siap-pakai dengan banner error mengganggu
                return this.state
            }
            this.setState({
                status: 'error',
                errorMessage: formatted,
                lastCheckedAt: Date.now(),
            })
            return this.state
        }

        let meta = metaRes.data
        if (meta.notModified && this.lastCachedMeta) {
            meta = this.lastCachedMeta
        } else if (!meta.notModified) {
            if (meta.etag) {
                this.lastEtag = meta.etag
            }
            this.lastCachedMeta = meta
        }

        const hasUpdate = isNewerSemver(meta.latestVersion, this.state.currentVersion)
        const matchedAsset = selectMatchedAsset(meta.assets, this.state.environment)
        const isDismissed = Boolean(
            hasUpdate &&
                this.state.dismissedVersion &&
                this.state.dismissedVersion === meta.latestVersion
        )

        this.setState({
            status: hasUpdate ? 'available' : 'up-to-date',
            latestVersion: meta.latestVersion,
            releaseUrl: meta.releaseUrl || DEFAULT_RELEASES_URL,
            releaseNotes: meta.releaseNotes ?? null,
            publishedAt: meta.publishedAt ?? null,
            assets: meta.assets,
            matchedAsset,
            isDismissed,
            errorMessage: null,
            lastCheckedAt: Date.now(),
            source: meta.source,
        })

        return this.state
    }

    /** Mengunduh paket pembaruan sesuai jalur platform (plugin updater atau native Linux). */
    public async downloadUpdate(): Promise<UpdateState> {
        await this.init()
        const env = this.state.environment
        const latestVersion = this.state.latestVersion
        if (!latestVersion) {
            this.setState({
                status: 'error',
                errorMessage: 'Metadata rilis terbaru belum tersedia. Periksa pembaruan terlebih dahulu.',
            })
            return this.state
        }

        if (env?.storeManaged || env?.installKind === 'flatpak') {
            this.setState({ status: 'store-managed' })
            return this.state
        }

        if (env?.isDev || env?.installKind === 'dev') {
            this.setState({
                status: 'error',
                errorMessage:
                    'Pembaruan otomatis di dalam aplikasi dinonaktifkan pada mode pengembangan. Gunakan rilis produksi atau unduh installer manual.',
            })
            return this.state
        }

        this.setState({
            status: 'downloading',
            errorMessage: null,
            downloadProgress: {
                downloadedBytes: 0,
                totalBytes: this.state.matchedAsset?.size || null,
                percent: 0,
                assetName: this.state.matchedAsset?.name || `nitirekso-${latestVersion}`,
            },
        })

        // Jalur 1: Paket sistem Linux (.rpm / .deb) via backend Rust + verifikasi SHA-256
        if (env?.installKind === 'rpm' || env?.installKind === 'deb') {
            const targetAsset = this.state.matchedAsset
            if (
                !targetAsset ||
                (!targetAsset.name.toLowerCase().endsWith('.rpm') &&
                    !targetAsset.name.toLowerCase().endsWith('.deb'))
            ) {
                this.setState({
                    status: 'error',
                    downloadProgress: null,
                    errorMessage: `Berkas installer ${env.installKind.toUpperCase()} tidak ditemukan pada rilis v${latestVersion}.`,
                })
                return this.state
            }

            const unlisten = this.client.system.onUpdateDownloadProgress((progress) => {
                this.setState({
                    downloadProgress: {
                        downloadedBytes: progress.downloadedBytes,
                        totalBytes: progress.totalBytes ?? null,
                        percent: progress.percent,
                        assetName: progress.assetName,
                    },
                })
            })

            try {
                const res = await this.client.system.downloadLinuxPackage(
                    targetAsset.downloadUrl,
                    targetAsset.name,
                    latestVersion
                )
                if (!res.ok) {
                    this.setState({
                        status: 'error',
                        downloadProgress: null,
                        errorMessage: res.error.message,
                    })
                    return this.state
                }

                this.setState({
                    status: 'ready-to-install',
                    downloadedLocalPath: res.data.localPath,
                    downloadProgress: {
                        downloadedBytes: res.data.size,
                        totalBytes: res.data.size,
                        percent: 100,
                        assetName: targetAsset.name,
                    },
                    errorMessage: null,
                })
                return this.state
            } finally {
                unlisten()
            }
        }

        // Jalur 2: Windows, macOS, & Linux AppImage via tauri-plugin-updater (minisign)
        try {
            const pluginUpdate = await this.pluginDriver.checkPluginUpdate()
            if (!pluginUpdate) {
                this.setState({
                    status: 'error',
                    downloadProgress: null,
                    errorMessage:
                        'Manifest pembaruan bertanda tangan (latest.json) belum tersedia untuk platform ini. Gunakan unduhan manual.',
                })
                return this.state
            }

            this.pendingPluginUpdate = pluginUpdate
            let totalBytes: number | null = null
            let downloadedBytes = 0

            await pluginUpdate.download((event) => {
                if (event.event === 'Started') {
                    totalBytes = event.data?.contentLength ?? null
                    downloadedBytes = 0
                    this.setState({
                        downloadProgress: {
                            downloadedBytes: 0,
                            totalBytes,
                            percent: 0,
                            assetName: this.state.matchedAsset?.name || `v${pluginUpdate.version}`,
                        },
                    })
                } else if (event.event === 'Progress') {
                    downloadedBytes += event.data?.chunkLength ?? 0
                    const percent =
                        totalBytes && totalBytes > 0
                            ? Math.min(100, (downloadedBytes / totalBytes) * 100)
                            : 0
                    this.setState({
                        downloadProgress: {
                            downloadedBytes,
                            totalBytes,
                            percent,
                            assetName: this.state.matchedAsset?.name || `v${pluginUpdate.version}`,
                        },
                    })
                } else if (event.event === 'Finished') {
                    this.setState({
                        downloadProgress: {
                            downloadedBytes: totalBytes ?? downloadedBytes,
                            totalBytes,
                            percent: 100,
                            assetName: this.state.matchedAsset?.name || `v${pluginUpdate.version}`,
                        },
                    })
                }
            })

            this.setState({
                status: 'ready-to-install',
                errorMessage: null,
            })
            return this.state
        } catch (err) {
            this.pendingPluginUpdate = null
            const message = err instanceof Error ? err.message : String(err)
            this.setState({
                status: 'error',
                downloadProgress: null,
                errorMessage: `Gagal mengunduh pembaruan terverifikasi: ${message}`,
            })
            return this.state
        }
    }

    /** Memasang paket yang sudah terunduh & terverifikasi lalu melakukan restart bersih. */
    public async installAndRestart(): Promise<UpdateState> {
        if (this.state.status !== 'ready-to-install') {
            return this.state
        }

        const env = this.state.environment
        this.setState({ status: 'installing', errorMessage: null })

        if (
            (env?.installKind === 'rpm' || env?.installKind === 'deb') &&
            this.state.downloadedLocalPath
        ) {
            const res = await this.client.system.installLinuxPackageAndRelaunch(
                this.state.downloadedLocalPath,
                env.installKind
            )
            if (!res.ok) {
                this.setState({
                    status: 'ready-to-install',
                    errorMessage: res.error.message,
                })
                return this.state
            }

            if (res.data.status === 'cancelled' || res.data.status === 'opened-fallback') {
                this.setState({
                    status: 'ready-to-install',
                    errorMessage: res.data.message,
                })
            }
            return this.state
        }

        if (this.pendingPluginUpdate) {
            try {
                await this.pendingPluginUpdate.install()
                await this.pluginDriver.relaunchApp()
                return this.state
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err)
                this.setState({
                    status: 'ready-to-install',
                    errorMessage: `Gagal memasang pembaruan: ${msg}`,
                })
                return this.state
            }
        }

        this.setState({
            status: 'error',
            errorMessage: 'Paket pembaruan belum siap dipasang.',
        })
        return this.state
    }

    /** Membuka berkas installer Linux hasil unduhan dengan aplikasi pengelola paket sistem. */
    public async openDownloadedInstallerFallback(): Promise<string | null> {
        if (!this.state.downloadedLocalPath) return null
        const res = await this.client.system.openLocalInstallerFallback(
            this.state.downloadedLocalPath
        )
        if (!res.ok) {
            this.setState({ errorMessage: res.error.message })
            return res.error.message
        }
        this.setState({ errorMessage: res.data.message })
        return res.data.message
    }

    private async persistDismissedVersion(version: string | null): Promise<void> {
        const existingRes = await this.client.settings.getAll()
        const existing = existingRes.ok ? existingRes.data : {}
        const saveRes = await this.client.settings.set({
            ...existing,
            dismissedUpdateVersion: version,
        })
        if (saveRes.ok) {
            this.setState({
                dismissedVersion: version,
                isDismissed: Boolean(
                    version && this.state.latestVersion && version === this.state.latestVersion
                ),
            })
        }
    }

    /** Menyimpan versi yang diabaikan ke SQLite melalui IPC Settings. */
    public async dismissLatestVersion(): Promise<void> {
        if (!this.state.latestVersion) return
        await this.persistDismissedVersion(this.state.latestVersion)
    }

    /** Menghapus penanda abaikan versi dari SQLite. */
    public async clearDismissedVersion(): Promise<void> {
        await this.persistDismissedVersion(null)
    }
}

export const updateService = new UpdateService()
