import { useEffect, useState } from 'react'
import type { BackupStatusPayload, BackupRunResult, BackupRestoreResult } from '@shared/ipc-contract'
import { Badge, Button, Card, CardHeader, ErrorNote } from './ui'
import { formatDateTime } from '../lib/format'
import { formatVaultLocationLabel } from '../lib/platform'

/**
 * Panel Local Snapshot — pencadangan dan pemulihan point-in-time ke folder lokal perangkat.
 * Sepenuhnya luring tanpa integrasi cloud pihak ketiga.
 */

interface BackupPanelProps {
    onSyncComplete: () => void
}

export function BackupPanel({ onSyncComplete }: BackupPanelProps): React.JSX.Element {
    const [status, setStatus] = useState<BackupStatusPayload | null>(null)
    const [running, setRunning] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [result, setResult] = useState<BackupRunResult | null>(null)
    const [restoreResult, setRestoreResult] = useState<BackupRestoreResult | null>(null)

    useEffect(() => {
        void loadStatus()
    }, [])

    async function loadStatus(): Promise<void> {
        try {
            const s = await window.api.getBackupStatus()
            setStatus(s)
        } catch {
            // Status gagal dimuat — tidak fatal.
        }
    }

    async function handleSelectFolder(): Promise<void> {
        setError(null)
        try {
            const res = await window.api.selectBackupFolder()
            if (!res.ok) {
                setError(res.error ?? 'Gagal memilih folder Local Snapshot.')
                return
            }
            if (res.data) {
                await loadStatus()
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err))
        }
    }

    async function handleRunBackup(): Promise<void> {
        setRunning(true)
        setError(null)
        setResult(null)
        try {
            const res = await window.api.runBackup()
            if (!res.ok || !res.data) {
                setError(res.error ?? 'Gagal membuat Local Snapshot.')
                return
            }
            setResult(res.data)
            await loadStatus()
            onSyncComplete()
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err))
        } finally {
            setRunning(false)
        }
    }

    async function handleRestoreBackup(folderPath?: string): Promise<void> {
        const confirmMsg = folderPath
            ? `Pulihkan Local Cache dari folder snapshot berikut?\n\n${folderPath}\n\nPERINGATAN: Data lokal saat ini akan digantikan oleh arsip snapshot tersebut.`
            : 'Pilih folder Local Snapshot nitirekso untuk dipulihkan.\n\nPERINGATAN: Data lokal saat ini akan digantikan oleh arsip snapshot tersebut. Lanjutkan?'

        if (!window.confirm(confirmMsg)) {
            return
        }

        setRunning(true)
        setError(null)
        setResult(null)
        setRestoreResult(null)
        try {
            const res = await window.api.restoreBackup(folderPath)
            if (!res.ok || !res.data) {
                setError(res.error ?? 'Gagal memulihkan Local Snapshot.')
                return
            }
            setRestoreResult(res.data)
            await loadStatus()
            onSyncComplete()
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err))
        } finally {
            setRunning(false)
        }
    }

    async function handleDisconnect(): Promise<void> {
        setRunning(true)
        setError(null)
        try {
            const res = await window.api.disconnectBackup()
            if (!res.ok) {
                setError(res.error ?? 'Gagal melepas folder Local Snapshot.')
                return
            }
            setResult(null)
            await loadStatus()
            onSyncComplete()
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err))
        } finally {
            setRunning(false)
        }
    }

    const connected = status?.connected ?? false
    const localFolder = status?.localFolder ?? ''
    const lastBackup = status?.lastBackupAt

    return (
        <Card>
            <CardHeader
                title="Local Snapshot (Cadangan Offline)"
                description="Simpan arsip point-in-time Local Cache (SQLite), JSON portabel, dan berkas media ke folder lokal atau drive eksternal."
            />
            <div className="flex flex-col gap-4 p-4">
                {error && <ErrorNote message={error} />}

                <div className="flex flex-wrap items-center gap-2 text-xs">
                    <Badge tone={connected ? 'profit' : 'muted'}>
                        {connected ? 'Folder Siap' : 'Belum Diatur'}
                    </Badge>
                    <span className="text-muted-foreground">
                        Mode: <strong className="text-foreground">100% Luring (Folder Lokal)</strong>
                    </span>
                    {lastBackup && (
                        <span className="text-muted-foreground">
                            · Terakhir: {formatDateTime(lastBackup)}
                        </span>
                    )}
                </div>

                {result && (
                    <div className="rounded-md border border-profit/40 bg-profit/10 px-3 py-2 text-[11px]">
                        <p className="font-medium text-profit">Local Snapshot berhasil dibuat!</p>
                        <p className="mt-0.5 text-muted-foreground">
                            {result.filesUploaded} berkas · {(result.bytesUploaded / 1024).toFixed(1)} KB · {(result.durationMs / 1000).toFixed(1)}s
                        </p>
                    </div>
                )}

                {restoreResult && (
                    <div className="rounded-md border border-profit/40 bg-profit/10 px-3 py-2 text-[11px]">
                        <p className="font-medium text-profit">Pemulihan Local Snapshot berhasil!</p>
                        <p className="mt-0.5 text-muted-foreground">{restoreResult.message}</p>
                    </div>
                )}

                <div className="rounded-lg border border-border bg-card p-3.5">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-foreground">
                            Folder Tujuan Local Snapshot
                        </span>
                        {connected && (
                            <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => void handleDisconnect()}
                                disabled={running}
                            >
                                Lepas Folder
                            </Button>
                        )}
                    </div>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                        Berbeda dari <strong>Sync Vault</strong> (yang menyinkronkan perubahan harian), Local Snapshot membekukan kondisi penuh database saat ini untuk arsip darurat di disk atau flashdisk Anda.
                    </p>
                    {localFolder ? (
                        <div
                            className="mt-2.5 truncate rounded bg-muted/60 p-2 font-mono text-[11px] text-foreground"
                            title={localFolder}
                        >
                            {formatVaultLocationLabel(localFolder)}
                        </div>
                    ) : (
                        <p className="mt-2 text-[11px] font-medium text-amber-500">
                            Belum ada folder Local Snapshot yang dipilih.
                        </p>
                    )}

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={() => void handleSelectFolder()}
                            disabled={running}
                        >
                            {localFolder ? 'Ganti Folder' : 'Pilih Folder'}
                        </Button>
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={() => void handleRestoreBackup()}
                            disabled={running}
                        >
                            Pulihkan dari Folder Lain…
                        </Button>
                    </div>
                </div>

                <div className="mt-1 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
                    <p className="text-[11px] text-muted-foreground">
                        Seluruh arsip ditulis langsung ke penyimpanan lokal Anda tanpa koneksi internet.
                    </p>
                    <div className="flex items-center gap-2">
                        {localFolder && (
                            <Button
                                variant="outline"
                                onClick={() => void handleRestoreBackup(localFolder)}
                                disabled={running}
                            >
                                {running ? 'Memproses…' : 'Pulihkan Snapshot'}
                            </Button>
                        )}
                        <Button
                            variant="primary"
                            onClick={() => void handleRunBackup()}
                            disabled={running || !connected}
                        >
                            {running ? 'Menyimpan…' : 'Buat Snapshot Sekarang'}
                        </Button>
                    </div>
                </div>
            </div>
        </Card>
    )
}
