import { useEffect, useState } from 'react'
import { PageHeader } from '../components/AppShell'
import { Button } from '../components/ui'
import logoUrl from '../assets/logo.svg'
import type { AppUpdateInfo } from '../../shared/ipc-contract'

export function About(): React.JSX.Element {
    const [version, setVersion] = useState<string>('1.3.0')
    const [updateStatus, setUpdateStatus] = useState<'idle' | 'checking' | 'up-to-date' | 'available' | 'error'>('idle')
    const [updateInfo, setUpdateInfo] = useState<AppUpdateInfo | null>(null)
    const [errorMessage, setErrorMessage] = useState<string>('')

    useEffect(() => {
        if (window.api?.getAppVersion) {
            window.api.getAppVersion().then(setVersion).catch(() => setVersion('1.3.0'))
        }
    }, [])

    const handleCheckUpdate = async () => {
        if (!window.api?.checkForUpdates) return
        setUpdateStatus('checking')
        setErrorMessage('')
        try {
            const res = await window.api.checkForUpdates()
            if (res.ok && res.data) {
                setUpdateInfo(res.data)
                if (res.data.hasUpdate) {
                    setUpdateStatus('available')
                } else {
                    setUpdateStatus('up-to-date')
                }
            } else {
                setUpdateStatus('error')
                setErrorMessage(res.error || 'Tidak dapat terhubung ke server pembaruan.')
            }
        } catch (err) {
            setUpdateStatus('error')
            setErrorMessage(err instanceof Error ? err.message : String(err))
        }
    }

    const openLink = (url: string) => {
        if (window.api?.openExternalUrl) {
            void window.api.openExternalUrl(url)
        } else {
            window.open(url, '_blank')
        }
    }

    return (
        <div className="flex h-full flex-col overflow-hidden">
            <PageHeader
                title="Tentang Nitirekso"
                description="Informasi aplikasi, pembaruan versi, repositori, dan dukungan pengembang"
            />

            <div className="flex-1 overflow-y-auto px-6 py-6 max-w-4xl space-y-6">
                {/* ── HERO BANNER ── */}
                <div className="relative overflow-hidden rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/15 via-card to-background p-6 shadow-sm">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5">
                        <img
                            src={logoUrl}
                            alt="Nitirekso Logo"
                            className="h-20 w-20 rounded-2xl object-contain shadow-md border border-white/10 p-1.5 bg-card/80 shrink-0"
                        />
                        <div className="space-y-1">
                            <div className="flex items-center gap-3 flex-wrap">
                                <h2 className="text-2xl font-black tracking-tight text-foreground">
                                    nitirekso
                                </h2>
                                <span className="text-xs font-mono font-bold bg-primary/20 text-primary border border-primary/40 px-2.5 py-0.5 rounded-full">
                                    v{version}
                                </span>
                            </div>
                            <p className="text-sm font-semibold text-primary/90">
                                ꦤꦶꦠꦶꦫꦼꦏ꧀ꦱ — Niti Transaksi, Rekso Evaluasi
                            </p>
                            <p className="text-xs text-muted-foreground max-w-xl leading-relaxed pt-1">
                                Aplikasi jurnal trading kripto lokal (*offline-first*) yang dibangun untuk privasi penuh tanpa telemetri pihak ketiga, mendukung analisis mendalam perpetual futures MEXC dan Bitunix.
                            </p>
                        </div>
                    </div>
                </div>

                {/* ── CEK PEMBARUAN APLIKASI ── */}
                <div className="rounded-xl border border-border bg-card p-5 space-y-4">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                        <div>
                            <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                                <span>🔄</span>
                                <span>Pembaruan Aplikasi</span>
                            </h3>
                            <p className="text-xs text-muted-foreground mt-0.5">
                                Periksa apakah tersedia rilis versi terbaru di repositori resmi GitHub
                            </p>
                        </div>
                        <Button
                            variant="primary"
                            size="sm"
                            disabled={updateStatus === 'checking'}
                            onClick={handleCheckUpdate}
                        >
                            {updateStatus === 'checking' ? 'Memeriksa...' : 'Periksa Pembaruan'}
                        </Button>
                    </div>

                    {/* Status Feedback Pembaruan */}
                    {updateStatus === 'up-to-date' && (
                        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-400 flex items-center gap-2">
                            <span>✅</span>
                            <span>Aplikasi Anda sudah menggunakan versi terkini (v{version}).</span>
                        </div>
                    )}

                    {updateStatus === 'available' && updateInfo && (
                        <div className="rounded-xl border border-primary/40 bg-primary/10 p-4 space-y-3">
                            <div className="flex items-center justify-between flex-wrap gap-2">
                                <div>
                                    <span className="text-xs font-bold text-primary block">
                                        🎉 Versi Baru Tersedia: v{updateInfo.latestVersion}
                                    </span>
                                    <span className="text-[11px] text-muted-foreground">
                                        Versi Anda saat ini: v{version}
                                    </span>
                                </div>
                                <Button
                                    size="sm"
                                    variant="primary"
                                    onClick={() => openLink(updateInfo.releaseUrl)}
                                >
                                    Unduh di GitHub ↗
                                </Button>
                            </div>
                            {updateInfo.releaseNotes && (
                                <div className="rounded-lg bg-card/60 p-3 text-[11px] font-mono text-muted-foreground border border-border/50 max-h-36 overflow-y-auto whitespace-pre-wrap">
                                    {updateInfo.releaseNotes}
                                </div>
                            )}
                        </div>
                    )}

                    {updateStatus === 'error' && (
                        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive flex items-center justify-between gap-3 flex-wrap">
                            <div className="flex items-center gap-2">
                                <span>⚠️</span>
                                <span>{errorMessage}</span>
                            </div>
                            <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 text-xs text-destructive hover:bg-destructive/10"
                                onClick={() => openLink('https://github.com/KaleksananBarqi/nitirekso/releases')}
                            >
                                Periksa di GitHub ↗
                            </Button>
                        </div>
                    )}
                </div>

                {/* ── DUKUNGAN PENGEMBANG (SAWERIA) & GITHUB ── */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Kartu Traktir Kopi */}
                    <div className="rounded-xl border border-amber-500/30 bg-gradient-to-br from-amber-500/10 via-card to-card p-5 flex flex-col justify-between space-y-3">
                        <div className="space-y-1.5">
                            <div className="flex items-center gap-2">
                                <span className="text-xl">☕</span>
                                <h3 className="text-sm font-bold text-amber-400">Beliin Aku Kopi</h3>
                            </div>
                            <p className="text-xs text-muted-foreground leading-relaxed">
                                Nitirekso adalah proyek open-source dan bebas digunakan sepenuhnya. Jika aplikasi ini membantu perjalanan trading Anda, dukung pengembang lewat Saweria!
                            </p>
                        </div>
                        <Button
                            variant="secondary"
                            className="w-full justify-center gap-2 border-amber-500/40 text-amber-300 hover:bg-amber-500/20 font-bold"
                            onClick={() => openLink('https://saweria.co/arthex1204')}
                        >
                            <span>☕</span>
                            <span>Traktir Kopi via Saweria</span>
                        </Button>
                    </div>

                    {/* Kartu GitHub & Komunitas */}
                    <div className="rounded-xl border border-border bg-card p-5 flex flex-col justify-between space-y-3">
                        <div className="space-y-1.5">
                            <div className="flex items-center gap-2">
                                <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" className="text-foreground">
                                    <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
                                </svg>
                                <h3 className="text-sm font-bold text-foreground">Repositori & Kode Sumber</h3>
                            </div>
                            <p className="text-xs text-muted-foreground leading-relaxed">
                                Kode sumber terbuka di GitHub. Temukan rilis mandiri multiplatform, diskusikan fitur baru, atau laporkan bug lewat issue tracker.
                            </p>
                        </div>
                        <Button
                            variant="secondary"
                            className="w-full justify-center gap-2 border-border/80 font-bold"
                            onClick={() => openLink('https://github.com/KaleksananBarqi/nitirekso')}
                        >
                            <span>Buka Repositori GitHub ↗</span>
                        </Button>
                    </div>
                </div>

                {/* ── ARSITEKTUR & KEAMANAN ── */}
                <div className="rounded-xl border border-border/70 bg-card/60 p-5 space-y-3">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                        🛡️ Jaminan Privasi & Lingkungan Sistem
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                        <div className="rounded-lg border border-border/50 bg-background/60 p-3 space-y-1">
                            <span className="font-bold text-foreground block">Zero-Telemetry</span>
                            <p className="text-[11px] text-muted-foreground">
                                Tidak ada data trading atau analitik yang dikirim ke server cloud eksternal. Semua komputasi berjalan di mesin Anda.
                            </p>
                        </div>
                        <div className="rounded-lg border border-border/50 bg-background/60 p-3 space-y-1">
                            <span className="font-bold text-foreground block">Database Lokal</span>
                            <p className="text-[11px] text-muted-foreground">
                                Disimpan dengan SQLite ACID compliant. Berkas database ada di direktori pengguna lokal (%APPDATA%\nitirekso).
                            </p>
                        </div>
                        <div className="rounded-lg border border-border/50 bg-background/60 p-3 space-y-1">
                            <span className="font-bold text-foreground block">Enkripsi OS</span>
                            <p className="text-[11px] text-muted-foreground">
                                API Key & Secret exchange dienkripsi dengan standar Windows DPAPI (Electron safeStorage).
                            </p>
                        </div>
                    </div>
                </div>

                {/* Lisensi & Hak Cipta */}
                <div className="text-center text-[11px] text-muted-foreground/60 py-2">
                    Copyright © 2026 nitirekso. Lisensi MIT. Bebas dimodifikasi dan didistribusikan.
                </div>
            </div>
        </div>
    )
}
