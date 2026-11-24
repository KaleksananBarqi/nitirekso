import { useEffect, useState } from 'react'
import type { DeviceSyncRunResult, DeviceSyncStatusPayload } from '@shared/ipc-contract'
import { Badge, Button, Card, CardHeader, ErrorNote, Field } from './ui'
import { formatDateTime } from '../lib/format'
import { formatVaultLocationLabel, isAndroidApp, isContentUri } from '../lib/platform'
import { hydrateShareSettingsFromBackend } from '../lib/shareSettings'
import { hydrateCustomThemesFromSettings } from '../lib/customThemes'

interface DeviceSyncPanelProps {
    onSynced: () => Promise<void> | void
}

/**
 * Panel pengaturan Device Sync melalui Sync Vault (folder lokal untuk Syncthing).
 * Menggantikan ketergantungan penyimpanan tersebar dan mendukung enkripsi kredensial
 * lintas perangkat menggunakan Vault Passphrase.
 */
export function DeviceSyncPanel({ onSynced }: DeviceSyncPanelProps): React.JSX.Element {
    const [status, setStatus] = useState<DeviceSyncStatusPayload | null>(null)
    const [folderPath, setFolderPath] = useState('')
    const [passphrase, setPassphrase] = useState('')
    const [showPassphrase, setShowPassphrase] = useState(false)
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [result, setResult] = useState<DeviceSyncRunResult | null>(null)

    useEffect(() => {
        void loadStatus()
        const unlisten = window.api?.onDeviceSyncUpdated?.(() => {
            void loadStatus()
        })
        return () => {
            if (unlisten) unlisten()
        }
    }, [])

    async function loadStatus(): Promise<void> {
        try {
            if (!window.api?.getDeviceSyncStatus) return
            const s = await window.api.getDeviceSyncStatus()
            setStatus(s)
            if (s.vaultPath) {
                setFolderPath(s.vaultPath)
            }
        } catch {
            // Tidak fatal jika status belum siap
        }
    }

    async function handlePickFolder(): Promise<void> {
        setError(null)
        try {
            const res = await window.api.selectSyncVaultFolder()
            if (!res.ok) {
                setError(res.error ?? 'Gagal memilih folder Sync Vault.')
                return
            }
            if (res.data) {
                setFolderPath(res.data)
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err))
        }
    }

    async function handleConnect(): Promise<void> {
        setError(null)
        setResult(null)
        const trimmedFolder = folderPath.trim()
        if (!trimmedFolder) {
            setError('Pilih folder Sync Vault terlebih dahulu.')
            return
        }
        if (passphrase.trim().length < 4) {
            setError('Vault Passphrase minimal 4 karakter.')
            return
        }

        setBusy(true)
        try {
            const res = await window.api.connectSyncVault({
                folderPath: trimmedFolder,
                passphrase,
            })
            if (!res.ok || !res.data) {
                setError(res.error ?? 'Gagal menghubungkan Sync Vault.')
                return
            }
            setResult(res.data)
            setPassphrase('')
            await loadStatus()
            try {
                const freshSettings = await window.api.getSettings()
                hydrateCustomThemesFromSettings(freshSettings)
                await hydrateShareSettingsFromBackend(freshSettings)
            } catch {
                // Abaikan bila hidrasi pengaturan gagal sementara
            }
            await onSynced()
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err))
        } finally {
            setBusy(false)
        }
    }

    async function handleRunSync(): Promise<void> {
        setError(null)
        setResult(null)
        setBusy(true)
        try {
            const res = await window.api.runDeviceSync()
            if (!res.ok || !res.data) {
                setError(res.error ?? 'Gagal menjalankan Device Sync.')
                return
            }
            setResult(res.data)
            await loadStatus()
            if (res.data.appliedOps > 0 || res.data.mediaSynced > 0 || res.data.credentialsSynced > 0) {
                try {
                    const freshSettings = await window.api.getSettings()
                    hydrateCustomThemesFromSettings(freshSettings)
                    await hydrateShareSettingsFromBackend(freshSettings)
                } catch {
                    // Abaikan bila hidrasi pengaturan gagal sementara
                }
                await onSynced()
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err))
        } finally {
            setBusy(false)
        }
    }

    async function handleDisconnect(): Promise<void> {
        const confirmed = window.confirm(
            'Putuskan tautan Sync Vault dari perangkat ini?\n\nData di Local Cache tetap aman di perangkat ini, namun perubahan berikutnya tidak akan disinkronkan sampai terhubung kembali.'
        )
        if (!confirmed) return

        setBusy(true)
        setError(null)
        setResult(null)
        try {
            const res = await window.api.disconnectSyncVault()
            if (!res.ok) {
                setError(res.error ?? 'Gagal memutus Sync Vault.')
                return
            }
            await loadStatus()
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err))
        } finally {
            setBusy(false)
        }
    }

    const connected = status?.connected ?? false

    return (
        <Card>
            <CardHeader
                title="Device Sync (Sync Vault untuk Syncthing)"
                description="Sinkronkan jurnal, pengaturan, tema, media, dan kredensial terenkripsi antar-perangkat secara 100% lokal melalui Sync Vault."
            />
            <div className="flex flex-col gap-4 p-4">
                {error && <ErrorNote message={error} />}
                {status?.lastError && !error && <ErrorNote message={status.lastError} />}

                <div className="flex flex-wrap items-center gap-2 text-xs">
                    <Badge tone={connected ? 'profit' : 'muted'}>
                        {connected ? 'Sync Vault Aktif' : 'Lokal Saja (Belum Terhubung)'}
                    </Badge>
                    {status?.deviceId && (
                        <span className="font-mono text-[11px] text-muted-foreground" title={status.deviceId}>
                            ID Perangkat: {status.deviceId.slice(0, 8)}…
                        </span>
                    )}
                    {status?.lastSyncAt && (
                        <span className="text-muted-foreground">
                            · Sinkron terakhir: {formatDateTime(status.lastSyncAt)}
                        </span>
                    )}
                </div>

                {result && (
                    <div className="rounded-md border border-profit/40 bg-profit/10 px-3 py-2 text-[11px]">
                        <p className="font-medium text-profit">Device Sync selesai ({result.durationMs} ms)</p>
                        <p className="mt-0.5 text-muted-foreground">
                            Diterapkan: {result.appliedOps} op · Dikirim: {result.emittedOps} op · Media: {result.mediaSynced} · Kredensial: {result.credentialsSynced}
                        </p>
                    </div>
                )}

                {connected ? (
                    <div className="flex flex-col gap-3 rounded-lg border border-primary/40 bg-primary/5 p-3.5">
                        <div className="flex items-start justify-between gap-2">
                            <div>
                                <p className="text-xs font-semibold text-foreground">Folder Sync Vault Terhubung</p>
                                <p className="mt-0.5 text-[11px] text-muted-foreground">
                                    Arahkan Syncthing ke folder ini. Local Cache (SQLite) tetap berada di internal aplikasi agar aman dari konflik berkas.
                                </p>
                            </div>
                            <Badge tone="profit">Passphrase Aktif</Badge>
                        </div>

                        <div
                            className="truncate rounded bg-muted/70 p-2 font-mono text-[11px] text-foreground"
                            title={status?.vaultPath ?? undefined}
                        >
                            {formatVaultLocationLabel(status?.vaultPath)}
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                            <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => void handleDisconnect()}
                                disabled={busy}
                            >
                                Putuskan Sync Vault
                            </Button>
                            <Button
                                size="sm"
                                variant="primary"
                                onClick={() => void handleRunSync()}
                                disabled={busy}
                            >
                                {busy ? 'Menyinkronkan…' : 'Sinkron Sekarang'}
                            </Button>
                        </div>
                    </div>
                ) : (
                    <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-3.5">
                        <p className="text-[11px] text-muted-foreground">
                            Pilih folder yang disinkronkan Syncthing, lalu buat <strong>Vault Passphrase</strong> baru (atau masukkan passphrase yang sama dengan perangkat lain). Anda hanya perlu memasukkannya <strong>sekali per perangkat</strong>.
                        </p>

                        <Field label="Folder Sync Vault" hint="Berisi subfolder ops/ dan media/ yang aman untuk Syncthing">
                            <div className="flex flex-wrap gap-2">
                                <input
                                    type="text"
                                    value={isContentUri(folderPath) ? formatVaultLocationLabel(folderPath) : folderPath}
                                    readOnly={isContentUri(folderPath)}
                                    onChange={(e) => setFolderPath(e.target.value)}
                                    placeholder={isAndroidApp() ? 'Ketuk Pilih Folder untuk memilih folder Syncthing' : '/home/user/Syncthing/nitirekso-vault'}
                                    className="h-11 sm:h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-3 font-mono text-xs focus:border-primary focus:outline-none"
                                />
                                <Button
                                    size="sm"
                                    variant="outline"
                                    className="min-h-11 sm:min-h-8"
                                    onClick={() => void handlePickFolder()}
                                    disabled={busy}
                                >
                                    Pilih Folder
                                </Button>
                            </div>
                        </Field>

                        <Field
                            label="Vault Passphrase"
                            hint="Mengenkripsi API Key exchange & AI key di dalam Sync Vault dengan Argon2id + AES-256-GCM"
                        >
                            <div className="flex gap-2">
                                <input
                                    type={showPassphrase ? 'text' : 'password'}
                                    value={passphrase}
                                    onChange={(e) => setPassphrase(e.target.value)}
                                    placeholder="Minimal 4 karakter..."
                                    className="h-9 flex-1 rounded-md border border-input bg-background px-3 text-xs focus:border-primary focus:outline-none"
                                />
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => setShowPassphrase((v) => !v)}
                                    type="button"
                                >
                                    {showPassphrase ? 'Sembunyikan' : 'Lihat'}
                                </Button>
                            </div>
                        </Field>

                        <div className="flex justify-end pt-1">
                            <Button
                                variant="primary"
                                onClick={() => void handleConnect()}
                                disabled={busy || !folderPath.trim() || passphrase.trim().length < 4}
                            >
                                {busy ? 'Menghubungkan…' : 'Hubungkan Sync Vault'}
                            </Button>
                        </div>
                    </div>
                )}
            </div>
        </Card>
    )
}
