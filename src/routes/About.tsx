import { useAppUpdater } from '../hooks/useAppUpdater'
import { PageHeader } from '../components/AppShell'
import { Badge, Button } from '../components/ui'
import logoUrl from '../assets/logo.svg'
import {
    formatAssetSize,
    formatEnvironmentLabel,
} from '../lib/update/updateHelpers'
import { updateService } from '../lib/update/updateService'

const NON_INSTALLER_FILES = new Set(['latest.json', 'sha256sums.txt'])

function formatPublishedDate(iso: string | null): string | null {
    if (!iso) return null
    const date = new Date(iso)
    if (Number.isNaN(date.getTime())) return null
    return date.toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
    })
}

export function About(): React.JSX.Element {
    const updater = useAppUpdater()

    const openLink = (url: string) => {
        if (window.api?.openExternalUrl) {
            void window.api.openExternalUrl(url)
        } else {
            window.open(url, '_blank')
        }
    }

    const visibleAssets = updater.assets.filter((asset) => {
        const lower = asset.name.toLowerCase()
        return !lower.endsWith('.sig') && !NON_INSTALLER_FILES.has(lower)
    })
    const envLabel = formatEnvironmentLabel(updater.environment)
    const publishedLabel = formatPublishedDate(updater.publishedAt)
    const matchedSizeLabel = formatAssetSize(updater.matchedAsset?.size)
    const isBusy =
        updater.status === 'checking' ||
        updater.status === 'downloading' ||
        updater.status === 'installing'
    const isLinuxPackage =
        updater.environment?.installKind === 'rpm' || updater.environment?.installKind === 'deb'

    return (
        <div className="flex h-full flex-col overflow-hidden">
            <PageHeader
                title="Tentang nitirekso"
                description="Informasi aplikasi, pembaruan hybrid dalam aplikasi, repositori, dan jaminan privasi lokal"
            />

            <div className="flex-1 overflow-y-auto px-6 py-6 max-w-4xl space-y-6">
                {/* Banner Identitas Produk */}
                <section className="rounded-xl border border-border bg-card p-6">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5">
                        <img
                            src={logoUrl}
                            alt="Logo nitirekso"
                            width={80}
                            height={80}
                            className="h-20 w-20 rounded-xl object-contain border border-border p-1.5 bg-background shrink-0"
                        />
                        <div className="space-y-1.5 min-w-0">
                            <div className="flex items-center gap-2.5 flex-wrap">
                                <h2 className="text-2xl font-bold tracking-tight text-foreground">
                                    nitirekso
                                </h2>
                                <span className="tabular text-xs font-semibold bg-primary/15 text-foreground border border-primary/40 px-2.5 py-0.5 rounded-md">
                                    v{updater.currentVersion}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                    {envLabel}
                                </span>
                            </div>
                            <p className="text-sm font-medium text-foreground">
                                ꦤꦶꦠꦶꦫꦼꦏ꧀ꦱ : Niti Transaksi, Rekso Evaluasi
                            </p>
                            <p className="text-xs text-muted-foreground max-w-2xl leading-relaxed">
                                Aplikasi jurnal trading kripto lokal (offline-first) tanpa telemetri pihak ketiga, mendukung sinkronisasi read-only untuk MEXC, Bitunix, Bybit, Binance, dan BingX Futures.
                            </p>
                        </div>
                    </div>
                </section>

                {/* Pembaruan Aplikasi (Hybrid In-App Updater) */}
                <section className="rounded-xl border border-border bg-card p-5 space-y-4">
                    <div className="flex items-start justify-between flex-wrap gap-3">
                        <div>
                            <h3 className="text-sm font-semibold text-foreground">
                                Pembaruan Aplikasi
                            </h3>
                            <p className="text-xs text-muted-foreground mt-0.5">
                                Pemeriksaan otomatis berjalan di latar belakang tiap 6 jam atau manual dari tombol ini.
                            </p>
                        </div>
                        <Button
                            variant="primary"
                            size="sm"
                            disabled={isBusy || updater.status === 'store-managed'}
                            onClick={() => void updateService.checkForUpdates({ silent: false })}
                        >
                            {updater.status === 'checking' ? 'Memeriksa...' : 'Periksa Pembaruan'}
                        </Button>
                    </div>

                    {/* Banner permanen khusus mode Flatpak / Store-Managed */}
                    {updater.status === 'store-managed' && (
                        <div className="rounded-lg border border-border bg-muted/50 p-4 space-y-2 text-xs">
                            <div className="flex items-center gap-2">
                                <Badge tone="default">Store-Managed</Badge>
                                <span className="font-semibold text-foreground">
                                    Pembaruan Dikelola oleh Flatpak / Software Store
                                </span>
                            </div>
                            <p className="text-muted-foreground leading-relaxed">
                                Instalasi Flatpak menonaktifkan pembaruan mandiri di dalam aplikasi. Perbarui nitirekso melalui KDE Discover, GNOME Software, atau jalankan perintah terminal: <code className="font-mono text-foreground">flatpak update com.nitirekso.app</code>.
                            </p>
                        </div>
                    )}

                    {/* Loading State */}
                    {updater.status === 'checking' && (
                        <div
                            className="rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground"
                            role="status"
                        >
                            Memeriksa rilis terbaru dari repositori GitHub...
                        </div>
                    )}

                    {/* Up-to-date State */}
                    {updater.status === 'up-to-date' && (
                        <div className="rounded-lg border border-profit/50 bg-card p-3 text-xs flex items-center justify-between gap-2 flex-wrap">
                            <span className="font-medium text-profit">
                                Aplikasi Anda sudah menggunakan versi terkini (v{updater.currentVersion}).
                            </span>
                            {updater.lastCheckedAt && (
                                <span className="text-[11px] text-muted-foreground tabular">
                                    Terakhir diperiksa:{' '}
                                    {new Date(updater.lastCheckedAt).toLocaleTimeString('id-ID', {
                                        hour: '2-digit',
                                        minute: '2-digit',
                                    })}
                                </span>
                            )}
                        </div>
                    )}

                    {/* Available State */}
                    {updater.status === 'available' && updater.latestVersion && (
                        <div className="rounded-xl border border-primary/50 bg-background/60 p-4 space-y-3">
                            <div className="flex items-start justify-between flex-wrap gap-3">
                                <div className="space-y-1">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className="text-sm font-semibold text-foreground">
                                            Versi Baru Tersedia: v{updater.latestVersion}
                                        </span>
                                        {updater.isDismissed && (
                                            <Badge tone="muted">Diabaikan</Badge>
                                        )}
                                    </div>
                                    <p className="text-xs text-muted-foreground tabular">
                                        Terpasang: v{updater.currentVersion}
                                        {publishedLabel ? ` · Terbit ${publishedLabel}` : ''}
                                        {updater.matchedAsset
                                            ? ` · Paket cocok: ${updater.matchedAsset.name}${matchedSizeLabel ? ` (${matchedSizeLabel})` : ''}`
                                            : ''}
                                    </p>
                                </div>

                                <div className="flex items-center gap-2 flex-wrap">
                                    {updater.environment?.canSelfUpdate ? (
                                        <Button
                                            size="sm"
                                            variant="primary"
                                            onClick={() => void updateService.downloadUpdate()}
                                        >
                                            {matchedSizeLabel
                                                ? `Unduh Pembaruan (${matchedSizeLabel})`
                                                : 'Unduh Pembaruan'}
                                        </Button>
                                    ) : (
                                        <Button
                                            size="sm"
                                            variant="primary"
                                            onClick={() => openLink(updater.releaseUrl)}
                                        >
                                            Unduh di GitHub
                                        </Button>
                                    )}

                                    {updater.isDismissed ? (
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => void updateService.clearDismissedVersion()}
                                        >
                                            Tampilkan Notifikasi Lagi
                                        </Button>
                                    ) : (
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            onClick={() => void updateService.dismissLatestVersion()}
                                        >
                                            Abaikan Versi Ini
                                        </Button>
                                    )}
                                </div>
                            </div>

                            {updater.environment?.isDev && (
                                <p className="text-xs text-muted-foreground">
                                    Mode pengembangan aktif: unduhan langsung dinonaktifkan agar biner lokal tidak tertimpa.
                                </p>
                            )}

                            {updater.releaseNotes && (
                                <div className="rounded-lg bg-background/80 p-3 text-xs font-mono text-muted-foreground border border-border max-h-40 overflow-y-auto whitespace-pre-wrap">
                                    {updater.releaseNotes}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Downloading State */}
                    {updater.status === 'downloading' && updater.downloadProgress && (
                        <div className="rounded-xl border border-primary/50 bg-background/60 p-4 space-y-2.5">
                            <div className="flex items-center justify-between gap-2 text-xs">
                                <span className="font-semibold text-foreground truncate">
                                    Mengunduh {updater.downloadProgress.assetName}
                                </span>
                                <span className="tabular font-semibold text-foreground shrink-0">
                                    {Math.round(updater.downloadProgress.percent)}%
                                </span>
                            </div>

                            <div
                                className="h-2 w-full overflow-hidden rounded-full bg-muted"
                                role="progressbar"
                                aria-label="Progres unduhan pembaruan"
                                aria-valuemin={0}
                                aria-valuemax={100}
                                aria-valuenow={Math.round(updater.downloadProgress.percent)}
                            >
                                <div
                                    className="h-full bg-primary transition-all duration-150"
                                    style={{
                                        width: `${Math.min(100, Math.max(0, updater.downloadProgress.percent))}%`,
                                    }}
                                />
                            </div>

                            <div className="flex items-center justify-between text-[11px] text-muted-foreground tabular">
                                <span>
                                    {formatAssetSize(updater.downloadProgress.downloadedBytes) || '0 KB'}
                                    {updater.downloadProgress.totalBytes
                                        ? ` / ${formatAssetSize(updater.downloadProgress.totalBytes)}`
                                        : ''}
                                </span>
                                <span>Berjalan di latar belakang, Anda tetap dapat menggunakan jurnal.</span>
                            </div>
                        </div>
                    )}

                    {/* Ready to Install State */}
                    {updater.status === 'ready-to-install' && (
                        <div className="rounded-xl border border-profit/50 bg-background/60 p-4 space-y-3">
                            <div className="flex items-start justify-between flex-wrap gap-3">
                                <div className="space-y-1">
                                    <p className="text-sm font-semibold text-profit">
                                        Pembaruan v{updater.latestVersion} Siap Dipasang
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                        {isLinuxPackage
                                            ? 'Berkas telah lolos verifikasi checksum SHA-256. Pemasangan meminta otorisasi administrator sistem (pkexec).'
                                            : 'Berkas pembaruan telah lolos verifikasi tanda tangan kriptografis minisign.'}
                                    </p>
                                </div>
                                <div className="flex items-center gap-2 flex-wrap">
                                    <Button
                                        size="sm"
                                        variant="primary"
                                        onClick={() => void updateService.installAndRestart()}
                                    >
                                        Pasang & Restart Sekarang
                                    </Button>
                                    {isLinuxPackage && updater.downloadedLocalPath && (
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => void updateService.openDownloadedInstallerFallback()}
                                        >
                                            Buka Berkas Installer
                                        </Button>
                                    )}
                                </div>
                            </div>

                            {updater.errorMessage && (
                                <p className="text-xs text-muted-foreground border-t border-border/60 pt-2">
                                    {updater.errorMessage}
                                </p>
                            )}
                        </div>
                    )}

                    {/* Installing State */}
                    {updater.status === 'installing' && (
                        <div
                            className="rounded-lg border border-border bg-muted/50 p-3 text-xs text-foreground"
                            role="status"
                        >
                            Memasang pembaruan dan menyiapkan restart aplikasi...
                        </div>
                    )}

                    {/* Error State */}
                    {updater.status === 'error' && (
                        <div
                            className="rounded-lg border border-loss/50 bg-card p-3 text-xs flex items-center justify-between gap-3 flex-wrap"
                            role="alert"
                        >
                            <div className="flex items-center gap-2 min-w-0">
                                <Badge tone="loss">Gagal</Badge>
                                <span className="text-foreground font-medium">
                                    {updater.errorMessage || 'Tidak dapat memeriksa pembaruan saat ini.'}
                                </span>
                            </div>
                            <div className="flex items-center gap-2">
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => void updateService.checkForUpdates({ silent: false })}
                                >
                                    Coba Lagi
                                </Button>
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => openLink(updater.releaseUrl)}
                                >
                                    Buka GitHub Releases
                                </Button>
                            </div>
                        </div>
                    )}

                    {/* Drawer Unduhan Manual Lintas Format */}
                    {visibleAssets.length > 0 && (
                        <details className="rounded-lg border border-border bg-background/50">
                            <summary className="px-3.5 py-2.5 text-xs font-medium text-foreground select-none hover:bg-accent/50 rounded-lg transition-colors">
                                Pilihan Unduhan Manual Lintas Format ({visibleAssets.length} berkas)
                            </summary>
                            <div className="border-t border-border px-3.5 py-2.5 space-y-1.5">
                                {visibleAssets.map((asset) => {
                                    const sizeText = formatAssetSize(asset.size)
                                    const isRecommended = updater.matchedAsset?.name === asset.name
                                    return (
                                        <div
                                            key={asset.name}
                                            className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 text-xs hover:bg-accent/40"
                                        >
                                            <div className="flex items-center gap-2 min-w-0">
                                                <span className="font-mono text-foreground truncate">
                                                    {asset.name}
                                                </span>
                                                {isRecommended && (
                                                    <Badge tone="default">Cocok</Badge>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-3 shrink-0">
                                                {sizeText && (
                                                    <span className="text-muted-foreground tabular">
                                                        {sizeText}
                                                    </span>
                                                )}
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    className="h-7 px-2 text-xs"
                                                    onClick={() => openLink(asset.downloadUrl)}
                                                >
                                                    Unduh
                                                </Button>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        </details>
                    )}
                </section>

                {/* Dukungan Pengembang & Repositori */}
                <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="rounded-xl border border-border bg-card p-5 flex flex-col justify-between space-y-3">
                        <div className="space-y-1.5">
                            <h3 className="text-sm font-semibold text-foreground">
                                Dukung Pengembang
                            </h3>
                            <p className="text-xs text-muted-foreground leading-relaxed">
                                nitirekso bersifat open-source dan bebas digunakan sepenuhnya. Jika aplikasi ini membantu evaluasi trading Anda, Anda dapat mendukung pengembangan lewat Saweria.
                            </p>
                        </div>
                        <Button
                            variant="secondary"
                            className="w-full justify-center font-semibold"
                            onClick={() => openLink('https://saweria.co/arthex1204')}
                        >
                            Traktir Kopi via Saweria
                        </Button>
                    </div>

                    <div className="rounded-xl border border-border bg-card p-5 flex flex-col justify-between space-y-3">
                        <div className="space-y-1.5">
                            <h3 className="text-sm font-semibold text-foreground">
                                Repositori & Kode Sumber
                            </h3>
                            <p className="text-xs text-muted-foreground leading-relaxed">
                                Kode sumber terbuka tersedia di GitHub. Telusuri rilis multiplatform, catatan perubahan, atau laporkan kendala melalui issue tracker.
                            </p>
                        </div>
                        <Button
                            variant="secondary"
                            className="w-full justify-center font-semibold"
                            onClick={() => openLink('https://github.com/KaleksananBarqi/nitirekso')}
                        >
                            Buka Repositori GitHub
                        </Button>
                    </div>
                </section>

                {/* Jaminan Privasi & Lingkungan Sistem */}
                <section className="rounded-xl border border-border bg-card p-5 space-y-3">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Jaminan Privasi & Lingkungan Sistem
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                        <div className="rounded-lg border border-border bg-background/60 p-3 space-y-1">
                            <span className="font-semibold text-foreground block">Zero-Telemetry</span>
                            <p className="text-[11px] text-muted-foreground leading-relaxed">
                                Tidak ada data trading atau analitik yang dikirim ke server cloud eksternal. Semua komputasi berjalan di mesin Anda.
                            </p>
                        </div>
                        <div className="rounded-lg border border-border bg-background/60 p-3 space-y-1">
                            <span className="font-semibold text-foreground block">Database Lokal</span>
                            <p className="text-[11px] text-muted-foreground leading-relaxed">
                                Data transaksi dan jurnal tersimpan di SQLite lokal pada direktori pengguna sistem operasi Anda.
                            </p>
                        </div>
                        <div className="rounded-lg border border-border bg-background/60 p-3 space-y-1">
                            <span className="font-semibold text-foreground block">Enkripsi Lokal</span>
                            <p className="text-[11px] text-muted-foreground leading-relaxed">
                                API Key dan Secret exchange dienkripsi menggunakan AES-256-GCM native Rust pada penyimpanan kredensial lokal.
                            </p>
                        </div>
                    </div>
                </section>

                <footer className="text-center text-[11px] text-muted-foreground py-2">
                    Copyright © 2026 nitirekso. Lisensi MIT. Bebas dimodifikasi dan didistribusikan.
                </footer>
            </div>
        </div>
    )
}
