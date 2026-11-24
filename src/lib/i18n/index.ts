/**
 * Arekan Localization Engine untuk nitirekso (ADR-0005).
 *
 * Mendukung 3 bahasa penuh dengan Basa Jawa Ngoko Arekan (`jv`) sebagai bahasa bawaan,
 * disertai Bahasa Indonesia (`id`) dan English (`en`), sambil mempertahankan istilah
 * trading teknis baku (`Win Rate`, `Profit Factor`, `Drawdown`, `Funding Fee`, `R-Multiple`).
 */

import { useCallback, useEffect, useState } from 'react'

export type Locale = 'jv' | 'id' | 'en'

export const DEFAULT_LOCALE: Locale = 'jv'
const LOCALE_STORAGE_KEY = 'nitirekso_locale'

export const LOCALE_OPTIONS: ReadonlyArray<{
    code: Locale
    label: string
    nativeName: string
    hint: string
}> = [
    {
        code: 'jv',
        label: 'Basa Jawa (Arekan)',
        nativeName: 'Jawa Arekan',
        hint: 'Basa gawan nitirekso: santai, lugas, khas Suroboyoan/Arekan'
    },
    {
        code: 'id',
        label: 'Bahasa Indonesia',
        nativeName: 'Indonesia',
        hint: 'Bahasa Indonesia modern yang ringkas dan profesional'
    },
    {
        code: 'en',
        label: 'English',
        nativeName: 'English',
        hint: 'Clean international trading journal interface'
    }
]

const DICTIONARY = {
    jv: {
        // Brand & Navigasi
        'brand.tagline': 'Niti Transaksi, Rekso Evaluasi',
        'nav.dashboard': 'Ringkesan',
        'nav.dashboard.short': 'Ringkesan',
        'nav.dashboard.hint': 'Pantau performa',
        'nav.trades': 'Catetan Trade',
        'nav.trades.short': 'Trade',
        'nav.trades.hint': 'Daftar posisi',
        'nav.journal': 'Jurnal',
        'nav.journal.short': 'Jurnal',
        'nav.journal.hint': 'Tesis & evaluasi',
        'nav.analytics': 'Analitik',
        'nav.analytics.short': 'Analitik',
        'nav.analytics.hint': 'Bedah performa',
        'nav.settings': 'Setelan',
        'nav.settings.short': 'Setelan',
        'nav.settings.hint': 'Tema, basa & sinkron',
        'nav.logs': 'Log Sistem',
        'nav.logs.short': 'Log',
        'nav.logs.hint': 'Diagnostik galat',
        'nav.about': 'Babagan',
        'nav.about.short': 'Babagan',
        'nav.about.hint': 'Versi & update',
        'nav.menu': 'Menu',
        'nav.moreMenu': 'Menu Liyane',
        'nav.closeMenu': 'Tutup menu',
        'nav.openUpdate': 'Bukak',
        'nav.support': 'Traktir Kopi',
        'nav.totalTrades': 'Total trade',
        'nav.database': 'Database',
        'nav.dbError': 'galat',
        'nav.dbLoading': 'ngemot',
        'nav.dbReady': 'siap',
        'nav.hidePnl': 'Delikno PnL',
        'nav.showPnl': 'Tuduhno PnL',
        'nav.newTrade': '+ Catet Trade',
        'nav.mainAria': 'Navigasi utama',
        'nav.secondaryAria': 'Navigasi tambahan',
        'nav.bottomAria': 'Navigasi ngisor',

        // Dashboard (Bento)
        'dash.title': 'Ringkesan Performa',
        'dash.subtitle': 'Saka {count} trade · P&L resik sawise fee & funding',
        'dash.emptySubtitle': 'Ringkesan performa tradingmu',
        'dash.emptyTitle': 'Durung ana data trade',
        'dash.emptyDesc': 'Ringkesan bakal muncul yen wis ana trade kecatet. Tambah trade manual ing Catetan Trade, utawa sambungno API key exchange ing Setelan.',
        'dash.shareReport': 'Bagikno Laporan',
        'dash.netPnl': 'P&L Resik',
        'dash.grossAndFee': 'Kotor {gross} · fee {fee}',
        'dash.winRate': 'Win Rate',
        'dash.profitFactor': 'Profit Factor',
        'dash.pfInfinite': 'Tanpa rugi (ora winates)',
        'dash.pfHint': 'Profit kotor / loss kotor',
        'dash.expectancy': 'Expectancy',
        'dash.expectancyHint': 'Rata-rata saben trade',
        'dash.maxDrawdown': 'Max Drawdown',
        'dash.noDrawdown': 'Durung ana drawdown',
        'dash.worstAt': 'Paling jero {time}',
        'dash.drawdownDuration': 'Suwene Drawdown',
        'dash.notRecovered': 'Durung pulih',
        'dash.drawdownDurationHint': 'Saka pucuk tekan pulih',
        'dash.fundingFee': 'Funding Fee',
        'dash.fundingFeeHint': 'Biaya perpetual futures',
        'dash.validR': 'R Valid',
        'dash.validRHint': 'Trade nganggo stop loss',
        'dash.partial': 'sebagian',
        'dash.totalR': 'Total R',
        'dash.avgR': 'Rata-rata {avg}/trade',
        'dash.noValidR': 'Durung ana trade R valid',
        'dash.expectancyR': 'Expectancy (R)',
        'dash.expectancyRHint': 'Ekspektasi ing unit risiko',
        'dash.recoveryFactor': 'Recovery Factor',
        'dash.recoveryHint': 'Net profit ÷ Max drawdown',
        'dash.resilient': 'Tangguh',
        'dash.maxStreak': 'Streak Maksimal',
        'dash.streakHint': 'Menang / kalah beruntun',
        'dash.winStreakBadge': '{n} Win Streak',
        'dash.equityCurve': 'Kurva Equity',
        'dash.equityCurveAria': 'Kurva equity kumulatif',
        'dash.equityCurveDesc': 'Akumulasi P&L resik miturut wektu exit',
        'dash.equityNeedTwo': 'Butuh minimal 2 trade kanggo nggambar kurva equity.',
        'dash.recentTrades': 'Trade Paling Anyar',
        'dash.riskSummary': 'Ringkesan Risiko & Eksekusi',
        'dash.shareTrade': 'Bagikno',
        'dash.footnote': 'Catetan: kabeh angka nganggo P&L resik (realized P&L dikurangi fee buka, fee tutup, lan funding fee).',

        // Settings (5 Tab)
        'settings.title': 'Setelan',
        'settings.subtitle': 'Atur tampilan, basa, koneksi exchange, kartu share, lan cadangan',
        'settings.tab.appearance': 'Tampilan & Basa',
        'settings.tab.connections': 'Koneksi & Sinkron',
        'settings.tab.share': 'Kartu Share',
        'settings.tab.journal': 'Jurnal & AI',
        'settings.tab.system': 'Cadangan & Sistem',

        // Appearance & Language
        'appearance.title': 'Mode Tampilan & Basa',
        'appearance.desc': 'Pilih polaritas tema, basa aplikasi, lan mode aman wuta warna',
        'appearance.language': 'Basa Aplikasi',
        'appearance.languageHint': 'Ganti basa ing sakabehing aplikasi tanpa restart',
        'appearance.mode': 'Mode Polaritas',
        'appearance.modeHint': 'Melu Sistem otomatis ganti antarane preset peteng lan padhang favoritmu',
        'appearance.modeDark': 'Peteng',
        'appearance.modeLight': 'Padhang',
        'appearance.modeSystem': 'Melu Sistem',
        'appearance.colorblind': 'Mode Colorblind-Safe',
        'appearance.colorblindHint': 'Ganti ijo/abang dadi biru/oranye ing kabeh tema',
        'appearance.previewTitle': 'Pratinjau warna profit/loss',
        'appearance.profit': 'Profit',
        'appearance.loss': 'Loss',
        'appearance.neutral': 'Netral',

        // Theme Gallery
        'themes.title': 'Galeri Tema Jawa & Kustom',
        'themes.desc': '34 preset bawaan (32 tema Jawa selaras Trawangan + 2 tema khas nitirekso) lan tema kustommu dhewe',
        'themes.activeLabel': 'Tema Aktif',
        'themes.resetDefault': 'Balekno Standar',
        'themes.createNew': '+ Gawe Tema Anyar',
        'themes.closeForm': 'Tutup Form',
        'themes.searchPlaceholder': 'Golek jeneng tema (contone: Kopi Tubruk, Surya Baskara)...',
        'themes.filterAll': 'Kabeh',
        'themes.filterDark': 'Peteng',
        'themes.filterLight': 'Padhang',
        'themes.filterCustom': 'Kustom',
        'themes.builtinTag': 'Preset Jawa',
        'themes.customTag': 'Kustom',
        'themes.activeBadge': 'Aktif',
        'themes.select': 'Pilih',
        'themes.edit': 'Ubah',
        'themes.delete': 'Busak',
        'themes.confirmDelete': 'Yakin busak?',
        'themes.cancel': 'Batal',
        'themes.saveNew': 'Simpen & Pasang',
        'themes.saveEdit': 'Simpen Owahan',
        'themes.noMatch': 'Ora ana tema sing cocog karo tembung kunci iki.',
        'themes.formNameLabel': 'Jeneng Tema',
        'themes.formNamePlaceholder': 'Contone: Wengi Trawangan, Kopi Ireng...',
        'themes.formNameError': 'Lebokno jeneng tema dhisik.',
        'themes.formPreview': 'Pratinjau Tema',
        'themes.colorPrimary': 'Aksen Utama',
        'themes.colorProfit': 'Profit',
        'themes.colorLoss': 'Loss',
        'themes.colorBg': 'Latar (Background)',
        'themes.colorCard': 'Kartu / Panel',

        // Checklist & System
        'checklist.title': 'Template Checklist',
        'checklist.desc': 'Sak aturan saben baris. Disalin menyang trade anyar tanpa ngowahi riwayat lawas.',
        'checklist.save': 'Simpen Template',
        'checklist.saving': 'Nyimpen…',
        'checklist.saved': 'Kesimpen',
        'exchange.title': 'Koneksi Exchange',
        'exchange.desc': 'Mung API key read-only, kesimpen terenkripsi ing brankas OS',
        'exchange.readOnlyTitle': 'Aplikasi iki mung read-only.',
        'exchange.readOnlyDesc': 'Aja ngaktifake izin trading utawa withdraw ing API key sing dilebokake. Aplikasi ora tau ngirim order menyang bursa.',
        'exchangeSync.title': 'Exchange Sync',
        'exchangeSync.desc': 'Tarik riwayat posisi, fills, lan funding saka API exchange',
        'system.title': 'Status Sistem',
        'system.desc': 'Diagnostik database lan preferensi aktif',
        'system.dbLocation': 'Lokasi database',
        'system.colorblind': 'Mode colorblind-safe',
        'system.autoSync': 'Auto-sync exchange',
        'system.active': 'aktif',
        'system.inactive': 'nonaktif',
        'system.inactiveDefault': 'nonaktif (gawan)',

        // Common / Share feedback
        'common.save': 'Simpen',
        'common.cancel': 'Batal',
        'common.close': 'Tutup',
        'common.savedTo': 'Kesimpen ing: {path}',
        'common.saveCancelled': 'Simpen berkas dibatalake.'
    },
    id: {
        // Brand & Navigasi
        'brand.tagline': 'Niti Transaksi, Rekso Evaluasi',
        'nav.dashboard': 'Ringkasan',
        'nav.dashboard.short': 'Ringkasan',
        'nav.dashboard.hint': 'Pantau performa',
        'nav.trades': 'Trade Log',
        'nav.trades.short': 'Trades',
        'nav.trades.hint': 'Daftar transaksi',
        'nav.journal': 'Jurnal',
        'nav.journal.short': 'Jurnal',
        'nav.journal.hint': 'Tesis & evaluasi',
        'nav.analytics': 'Analitik',
        'nav.analytics.short': 'Analitik',
        'nav.analytics.hint': 'Bedah performa',
        'nav.settings': 'Pengaturan',
        'nav.settings.short': 'Setelan',
        'nav.settings.hint': 'Tema, bahasa & sinkron',
        'nav.logs': 'Log Sistem',
        'nav.logs.short': 'Log',
        'nav.logs.hint': 'Diagnostik galat',
        'nav.about': 'Tentang',
        'nav.about.short': 'Tentang',
        'nav.about.hint': 'Versi & pembaruan',
        'nav.menu': 'Menu',
        'nav.moreMenu': 'Menu Lainnya',
        'nav.closeMenu': 'Tutup menu',
        'nav.openUpdate': 'Buka',
        'nav.support': 'Traktir Kopi',
        'nav.totalTrades': 'Total trade',
        'nav.database': 'Database',
        'nav.dbError': 'galat',
        'nav.dbLoading': 'memuat',
        'nav.dbReady': 'siap',
        'nav.hidePnl': 'Samarkan PnL',
        'nav.showPnl': 'Tampilkan PnL',
        'nav.newTrade': '+ Catat Trade',
        'nav.mainAria': 'Navigasi utama',
        'nav.secondaryAria': 'Navigasi sekunder',
        'nav.bottomAria': 'Navigasi bawah',

        // Dashboard (Bento)
        'dash.title': 'Ringkasan Performa',
        'dash.subtitle': 'Berdasarkan {count} trade · P&L bersih setelah fee & funding',
        'dash.emptySubtitle': 'Ringkasan performa trading',
        'dash.emptyTitle': 'Belum ada data trade',
        'dash.emptyDesc': 'Ringkasan akan tampil setelah ada trade tercatat. Tambahkan trade manual lewat Trade Log, atau hubungkan API key exchange di Pengaturan.',
        'dash.shareReport': 'Bagikan Laporan',
        'dash.netPnl': 'P&L Bersih',
        'dash.grossAndFee': 'Kotor {gross} · fee {fee}',
        'dash.winRate': 'Win Rate',
        'dash.profitFactor': 'Profit Factor',
        'dash.pfInfinite': 'Tanpa loss (tidak terhingga)',
        'dash.pfHint': 'Profit kotor / loss kotor',
        'dash.expectancy': 'Expectancy',
        'dash.expectancyHint': 'Rata-rata hasil per trade',
        'dash.maxDrawdown': 'Max Drawdown',
        'dash.noDrawdown': 'Belum ada drawdown',
        'dash.worstAt': 'Terburuk {time}',
        'dash.drawdownDuration': 'Durasi Drawdown',
        'dash.notRecovered': 'Belum pulih',
        'dash.drawdownDurationHint': 'Dari puncak sampai pulih',
        'dash.fundingFee': 'Funding Fee',
        'dash.fundingFeeHint': 'Biaya berkelanjutan perpetual futures',
        'dash.validR': 'R Valid',
        'dash.validRHint': 'Trade dengan stop loss terisi',
        'dash.partial': 'sebagian',
        'dash.totalR': 'Total R',
        'dash.avgR': 'Rata-rata {avg}/trade',
        'dash.noValidR': 'Belum ada trade R valid',
        'dash.expectancyR': 'Expectancy (R)',
        'dash.expectancyRHint': 'Ekspektasi hasil dalam unit risiko',
        'dash.recoveryFactor': 'Recovery Factor',
        'dash.recoveryHint': 'Net profit ÷ Max drawdown',
        'dash.resilient': 'Tangguh',
        'dash.maxStreak': 'Streak Maksimal',
        'dash.streakHint': 'Kemenangan / kekalahan beruntun',
        'dash.winStreakBadge': '{n} Win Streak',
        'dash.equityCurve': 'Kurva Equity',
        'dash.equityCurveAria': 'Kurva equity kumulatif',
        'dash.equityCurveDesc': 'Kumulatif P&L bersih menurut waktu exit',
        'dash.equityNeedTwo': 'Butuh minimal 2 trade untuk menggambar kurva equity.',
        'dash.recentTrades': 'Trade Terakhir',
        'dash.riskSummary': 'Ringkasan Risiko & Eksekusi',
        'dash.shareTrade': 'Bagikan',
        'dash.footnote': 'Catatan: seluruh metrik memakai P&L bersih (realized P&L dikurangi fee buka, fee tutup, dan funding fee).',

        // Settings (5 Tab)
        'settings.title': 'Pengaturan',
        'settings.subtitle': 'Atur tampilan, bahasa, koneksi exchange, kartu share, dan cadangan',
        'settings.tab.appearance': 'Tampilan & Bahasa',
        'settings.tab.connections': 'Koneksi & Sinkron',
        'settings.tab.share': 'Kartu Share',
        'settings.tab.journal': 'Jurnal & AI',
        'settings.tab.system': 'Cadangan & Sistem',

        // Appearance & Language
        'appearance.title': 'Mode Tampilan & Bahasa',
        'appearance.desc': 'Pilih polaritas tema, bahasa aplikasi, dan mode aman buta warna',
        'appearance.language': 'Bahasa Aplikasi',
        'appearance.languageHint': 'Berubah seketika di seluruh aplikasi tanpa perlu restart',
        'appearance.mode': 'Mode Polaritas',
        'appearance.modeHint': 'Ikuti Sistem otomatis beralih antara preset gelap & terang favorit Anda',
        'appearance.modeDark': 'Gelap',
        'appearance.modeLight': 'Terang',
        'appearance.modeSystem': 'Ikuti Sistem',
        'appearance.colorblind': 'Mode Colorblind-Safe',
        'appearance.colorblindHint': 'Menukar hijau/merah menjadi biru/oranye di semua tema',
        'appearance.previewTitle': 'Pratinjau warna profit/loss',
        'appearance.profit': 'Profit',
        'appearance.loss': 'Loss',
        'appearance.neutral': 'Netral',

        // Theme Gallery
        'themes.title': 'Galeri Tema Jawa & Kustom',
        'themes.desc': '34 preset bawaan (32 tema Jawa selaras Trawangan + 2 tema khas nitirekso) dan tema kustom Anda',
        'themes.activeLabel': 'Tema Aktif',
        'themes.resetDefault': 'Reset ke Standar',
        'themes.createNew': '+ Buat Tema Baru',
        'themes.closeForm': 'Tutup Form',
        'themes.searchPlaceholder': 'Cari nama tema (misal: Kopi Tubruk, Surya Baskara)...',
        'themes.filterAll': 'Semua',
        'themes.filterDark': 'Gelap',
        'themes.filterLight': 'Terang',
        'themes.filterCustom': 'Kustom',
        'themes.builtinTag': 'Preset Jawa',
        'themes.customTag': 'Kustom',
        'themes.activeBadge': 'Aktif',
        'themes.select': 'Pilih',
        'themes.edit': 'Edit',
        'themes.delete': 'Hapus',
        'themes.confirmDelete': 'Yakin hapus?',
        'themes.cancel': 'Batal',
        'themes.saveNew': 'Simpan & Terapkan',
        'themes.saveEdit': 'Simpan Perubahan',
        'themes.noMatch': 'Tidak ada tema yang cocok dengan kata kunci tersebut.',
        'themes.formNameLabel': 'Nama Tema',
        'themes.formNamePlaceholder': 'Contoh: Wengi Trawangan, Kopi Ireng...',
        'themes.formNameError': 'Masukkan nama tema terlebih dahulu.',
        'themes.formPreview': 'Pratinjau Tema',
        'themes.colorPrimary': 'Aksen Utama',
        'themes.colorProfit': 'Profit',
        'themes.colorLoss': 'Loss',
        'themes.colorBg': 'Latar (Background)',
        'themes.colorCard': 'Kartu / Panel',

        // Checklist & System
        'checklist.title': 'Template Checklist',
        'checklist.desc': 'Satu aturan per baris. Disalin ke trade baru tanpa mengubah riwayat lama.',
        'checklist.save': 'Simpan Template',
        'checklist.saving': 'Menyimpan…',
        'checklist.saved': 'Tersimpan',
        'exchange.title': 'Koneksi Exchange',
        'exchange.desc': 'Hanya API key read-only, tersimpan terenkripsi di penyimpanan aman OS',
        'exchange.readOnlyTitle': 'Aplikasi ini read-only.',
        'exchange.readOnlyDesc': 'Jangan aktifkan izin trading atau withdraw pada API key yang Anda masukkan. Aplikasi tidak pernah mengirim order ke bursa.',
        'exchangeSync.title': 'Exchange Sync',
        'exchangeSync.desc': 'Tarik histori posisi, fills, dan funding dari API exchange',
        'system.title': 'Status Sistem',
        'system.desc': 'Diagnostik database dan preferensi aktif',
        'system.dbLocation': 'Lokasi database',
        'system.colorblind': 'Mode colorblind-safe',
        'system.autoSync': 'Auto-sync exchange',
        'system.active': 'aktif',
        'system.inactive': 'nonaktif',
        'system.inactiveDefault': 'nonaktif (default)',

        // Common / Share feedback
        'common.save': 'Simpan',
        'common.cancel': 'Batal',
        'common.close': 'Tutup',
        'common.savedTo': 'Tersimpan di: {path}',
        'common.saveCancelled': 'Penyimpanan berkas dibatalkan.'
    },
    en: {
        // Brand & Navigation
        'brand.tagline': 'Niti Transaksi, Rekso Evaluasi',
        'nav.dashboard': 'Overview',
        'nav.dashboard.short': 'Overview',
        'nav.dashboard.hint': 'Performance summary',
        'nav.trades': 'Trade Log',
        'nav.trades.short': 'Trades',
        'nav.trades.hint': 'Executed positions',
        'nav.journal': 'Journal',
        'nav.journal.short': 'Journal',
        'nav.journal.hint': 'Thesis & grading',
        'nav.analytics': 'Analytics',
        'nav.analytics.short': 'Analytics',
        'nav.analytics.hint': 'Deep breakdown',
        'nav.settings': 'Settings',
        'nav.settings.short': 'Settings',
        'nav.settings.hint': 'Themes, language & sync',
        'nav.logs': 'System Logs',
        'nav.logs.short': 'Logs',
        'nav.logs.hint': 'Diagnostics',
        'nav.about': 'About',
        'nav.about.short': 'About',
        'nav.about.hint': 'Version & updates',
        'nav.menu': 'Menu',
        'nav.moreMenu': 'More',
        'nav.closeMenu': 'Close menu',
        'nav.openUpdate': 'Open',
        'nav.support': 'Buy Me a Coffee',
        'nav.totalTrades': 'Total trades',
        'nav.database': 'Database',
        'nav.dbError': 'error',
        'nav.dbLoading': 'loading',
        'nav.dbReady': 'ready',
        'nav.hidePnl': 'Hide PnL',
        'nav.showPnl': 'Show PnL',
        'nav.newTrade': '+ Log Trade',
        'nav.mainAria': 'Main navigation',
        'nav.secondaryAria': 'Secondary navigation',
        'nav.bottomAria': 'Bottom navigation',

        // Dashboard (Bento)
        'dash.title': 'Performance Overview',
        'dash.subtitle': 'Based on {count} trades · Net P&L after fees & funding',
        'dash.emptySubtitle': 'Your trading performance summary',
        'dash.emptyTitle': 'No trades recorded yet',
        'dash.emptyDesc': 'Your overview will appear once trades are logged. Add a manual trade in Trade Log, or connect a read-only exchange API key in Settings.',
        'dash.shareReport': 'Share Report',
        'dash.netPnl': 'Net P&L',
        'dash.grossAndFee': 'Gross {gross} · fees {fee}',
        'dash.winRate': 'Win Rate',
        'dash.profitFactor': 'Profit Factor',
        'dash.pfInfinite': 'No losses (infinite)',
        'dash.pfHint': 'Gross profit / gross loss',
        'dash.expectancy': 'Expectancy',
        'dash.expectancyHint': 'Average result per trade',
        'dash.maxDrawdown': 'Max Drawdown',
        'dash.noDrawdown': 'No drawdown yet',
        'dash.worstAt': 'Worst at {time}',
        'dash.drawdownDuration': 'Drawdown Duration',
        'dash.notRecovered': 'Not recovered',
        'dash.drawdownDurationHint': 'Peak to recovery',
        'dash.fundingFee': 'Funding Fee',
        'dash.fundingFeeHint': 'Perpetual futures carry cost',
        'dash.validR': 'Valid R',
        'dash.validRHint': 'Trades with planned stop loss',
        'dash.partial': 'partial',
        'dash.totalR': 'Total R',
        'dash.avgR': 'Avg {avg}/trade',
        'dash.noValidR': 'No valid R trades yet',
        'dash.expectancyR': 'Expectancy (R)',
        'dash.expectancyRHint': 'Expected return in R units',
        'dash.recoveryFactor': 'Recovery Factor',
        'dash.recoveryHint': 'Net profit ÷ Max drawdown',
        'dash.resilient': 'Resilient',
        'dash.maxStreak': 'Max Streak',
        'dash.streakHint': 'Consecutive wins / losses',
        'dash.winStreakBadge': '{n} Win Streak',
        'dash.equityCurve': 'Equity Curve',
        'dash.equityCurveAria': 'Cumulative equity curve',
        'dash.equityCurveDesc': 'Cumulative net P&L by exit time',
        'dash.equityNeedTwo': 'At least 2 trades are required to draw the equity curve.',
        'dash.recentTrades': 'Recent Trades',
        'dash.riskSummary': 'Risk & Execution Summary',
        'dash.shareTrade': 'Share',
        'dash.footnote': 'Note: all metrics use net P&L (realized P&L minus open/close fees and funding fees).',

        // Settings (5 Tab)
        'settings.title': 'Settings',
        'settings.subtitle': 'Configure appearance, language, exchange sync, share cards, and backups',
        'settings.tab.appearance': 'Appearance & Language',
        'settings.tab.connections': 'Connections & Sync',
        'settings.tab.share': 'Share Cards',
        'settings.tab.journal': 'Journal & AI',
        'settings.tab.system': 'Backup & System',

        // Appearance & Language
        'appearance.title': 'Display Mode & Language',
        'appearance.desc': 'Choose theme polarity, interface language, and colorblind-safe mode',
        'appearance.language': 'Interface Language',
        'appearance.languageHint': 'Applies immediately across the app without restarting',
        'appearance.mode': 'Polarity Mode',
        'appearance.modeHint': 'Follow System automatically switches between your favorite dark & light presets',
        'appearance.modeDark': 'Dark',
        'appearance.modeLight': 'Light',
        'appearance.modeSystem': 'Follow System',
        'appearance.colorblind': 'Colorblind-Safe Mode',
        'appearance.colorblindHint': 'Swaps green/red to blue/orange across all themes',
        'appearance.previewTitle': 'Profit/loss color preview',
        'appearance.profit': 'Profit',
        'appearance.loss': 'Loss',
        'appearance.neutral': 'Neutral',

        // Theme Gallery
        'themes.title': 'Javanese & Custom Theme Gallery',
        'themes.desc': '34 built-in presets (32 Javanese themes aligned with Trawangan + 2 nitirekso defaults) and your custom palettes',
        'themes.activeLabel': 'Active Theme',
        'themes.resetDefault': 'Reset Default',
        'themes.createNew': '+ New Theme',
        'themes.closeForm': 'Close Form',
        'themes.searchPlaceholder': 'Search theme name (e.g. Kopi Tubruk, Surya Baskara)...',
        'themes.filterAll': 'All',
        'themes.filterDark': 'Dark',
        'themes.filterLight': 'Light',
        'themes.filterCustom': 'Custom',
        'themes.builtinTag': 'Javanese Preset',
        'themes.customTag': 'Custom',
        'themes.activeBadge': 'Active',
        'themes.select': 'Select',
        'themes.edit': 'Edit',
        'themes.delete': 'Delete',
        'themes.confirmDelete': 'Delete?',
        'themes.cancel': 'Cancel',
        'themes.saveNew': 'Save & Apply',
        'themes.saveEdit': 'Save Changes',
        'themes.noMatch': 'No themes match your search.',
        'themes.formNameLabel': 'Theme Name',
        'themes.formNamePlaceholder': 'e.g. Wengi Trawangan, Kopi Ireng...',
        'themes.formNameError': 'Please enter a theme name first.',
        'themes.formPreview': 'Theme Preview',
        'themes.colorPrimary': 'Primary Accent',
        'themes.colorProfit': 'Profit',
        'themes.colorLoss': 'Loss',
        'themes.colorBg': 'Background',
        'themes.colorCard': 'Card / Panel',

        // Checklist & System
        'checklist.title': 'Checklist Template',
        'checklist.desc': 'One rule per line. Copied into new trades without altering historical records.',
        'checklist.save': 'Save Template',
        'checklist.saving': 'Saving…',
        'checklist.saved': 'Saved',
        'exchange.title': 'Exchange Connections',
        'exchange.desc': 'Read-only API keys only, stored encrypted in OS secure storage',
        'exchange.readOnlyTitle': 'This app is strictly read-only.',
        'exchange.readOnlyDesc': 'Never enable trading or withdrawal permissions on your API keys. The app never submits orders to any exchange.',
        'exchangeSync.title': 'Exchange Sync',
        'exchangeSync.desc': 'Pull position history, fills, and funding fees from exchange APIs',
        'system.title': 'System Status',
        'system.desc': 'Database diagnostics and active preferences',
        'system.dbLocation': 'Database path',
        'system.colorblind': 'Colorblind-safe mode',
        'system.autoSync': 'Exchange auto-sync',
        'system.active': 'active',
        'system.inactive': 'off',
        'system.inactiveDefault': 'off (default)',

        // Common / Share feedback
        'common.save': 'Save',
        'common.cancel': 'Cancel',
        'common.close': 'Close',
        'common.savedTo': 'Saved to: {path}',
        'common.saveCancelled': 'File save cancelled.'
    }
} as const

export type TranslationKey = keyof typeof DICTIONARY.jv

function readStoredLocale(): Locale {
    try {
        if (typeof window === 'undefined') return DEFAULT_LOCALE
        const raw = window.localStorage.getItem(LOCALE_STORAGE_KEY)
        if (raw === 'jv' || raw === 'id' || raw === 'en') return raw
    } catch {
        // Abaikan
    }
    return DEFAULT_LOCALE
}

let currentLocale: Locale = readStoredLocale()

export function getLocale(): Locale {
    return currentLocale
}

function notifyLocaleChanged(): void {
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
        try {
            window.dispatchEvent(new CustomEvent('nitirekso:locale-changed'))
        } catch {
            // Abaikan
        }
    }
}

export function setLocale(next: Locale): void {
    currentLocale = next
    try {
        if (typeof window !== 'undefined') {
            window.localStorage.setItem(LOCALE_STORAGE_KEY, next)
            document.documentElement.lang = next
        }
    } catch {
        // Abaikan
    }
    if (typeof window !== 'undefined' && window.api?.setSettings) {
        void window.api.setSettings({ locale: next }).catch(() => {
            // Abaikan
        })
    }
    notifyLocaleChanged()
}

export function hydrateLocaleFromSettings(settings: Record<string, unknown>): void {
    const raw = settings.locale
    if (raw === 'jv' || raw === 'id' || raw === 'en') {
        currentLocale = raw
        try {
            if (typeof window !== 'undefined') {
                window.localStorage.setItem(LOCALE_STORAGE_KEY, raw)
                document.documentElement.lang = raw
            }
        } catch {
            // Abaikan
        }
        notifyLocaleChanged()
    }
}

export function translate(
    key: TranslationKey,
    params?: Record<string, string | number>,
    locale: Locale = currentLocale
): string {
    const table = DICTIONARY[locale] ?? DICTIONARY[DEFAULT_LOCALE]
    let text: string = table[key] ?? DICTIONARY[DEFAULT_LOCALE][key] ?? key
    if (params) {
        for (const [k, v] of Object.entries(params)) {
            text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v))
        }
    }
    return text
}

export function useI18n(): {
    locale: Locale
    setLocale: (next: Locale) => void
    t: (key: TranslationKey, params?: Record<string, string | number>) => string
} {
    const [locale, setLocaleState] = useState<Locale>(getLocale)

    useEffect(() => {
        const onChange = () => setLocaleState(getLocale())
        window.addEventListener('nitirekso:locale-changed', onChange)
        return () => window.removeEventListener('nitirekso:locale-changed', onChange)
    }, [])

    const t = useCallback(
        (key: TranslationKey, params?: Record<string, string | number>) =>
            translate(key, params, locale),
        [locale]
    )

    return { locale, setLocale, t }
}

export function _resetLocaleForTesting(): void {
    currentLocale = DEFAULT_LOCALE
}
