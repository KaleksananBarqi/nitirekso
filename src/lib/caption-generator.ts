/**
 * Modul Caption Maker Otomatis untuk Jurnal Trading
 *
 * Menghasilkan caption berbahasa Indonesia yang SEO-friendly untuk TikTok, Instagram,
 * dan X/Twitter dengan adaptasi otomatis untuk posisi Menang (Win), Kalah (Loss), dan Impas (BEP).
 * Mendukung rotasi hook pembuka, token dinamis, dan perlindungan privasi (hide USD).
 */

import { type TradeDetail, normalizeTagName } from '@shared/domain'
import { formatDate, formatDuration, formatPercent, formatPrice, formatR } from './format'

export type TradeOutcome = 'win' | 'loss' | 'be'

export interface CaptionContext {
    symbol: string
    coin: string
    side: string
    sideUpper: string
    leverage: string
    roi: string
    roiPercent: number
    pnl: string
    pnlRaw: number
    entryPrice: string
    exitPrice: string
    duration: string
    plannedStop: string
    plannedTarget: string
    rr: string
    rMultiple: string
    rMultipleRaw: number | null
    setup: string
    grade: string
    emotion: string
    tags: string[]
    thesis: string
    review: string
    exchange: string
    referral: string
    handle: string
    date: string
    brand: string
    outcome: TradeOutcome
}

export interface CaptionPreset {
    id: string
    name: string
    description: string
    platform: 'tiktok' | 'x' | 'universal'
    templates: {
        win: string
        loss: string
        be: string
    }
}

/** Ekstrak kode koin utama dari simbol (mis. "BTCUSDT" -> "BTC", "1000PEPEUSDT" -> "PEPE") */
export function extractCoinName(symbol: string): string {
    const clean = symbol.replace(/[^A-Za-z0-9]/g, '').toUpperCase()
    const match = clean.match(/^(?:1000|10000|1000000)?([A-Z0-9]+?)(?:USDT|USDC|BUSD|USD|PERP)?$/)
    return match && match[1] ? match[1] : clean.replace(/USDT$/, '')
}

/** Deteksi hasil trade: BEP (margin error < 0.5%), Profit (Win), atau Loss */
export function detectTradeOutcome(realizedPnl: number, roiPercent: number): TradeOutcome {
    if (Math.abs(roiPercent) < 0.5) return 'be'
    if (realizedPnl >= 0) return 'win'
    return 'loss'
}

/** Buat token konteks lengkap dari data TradeDetail */
export function buildCaptionContext(
    tradeDetail: TradeDetail,
    extras: {
        traderHandle?: string
        brandTitle?: string
        selectedExchange?: string
        activeReferral?: string
        customThesis?: string
        customReview?: string
    } = {}
): CaptionContext {
    const t = tradeDetail.trade
    const j = tradeDetail.journal
    const pr = tradeDetail.plannedRisk

    const leverage = t.leverage || 1
    const margin = t.entryPrice > 0 ? (t.size * t.entryPrice) / leverage : 0
    const roiPercent = margin > 0 ? (t.realizedPnl / margin) * 100 : 0
    const outcome = detectTradeOutcome(t.realizedPnl, roiPercent)

    const symbol = t.symbol.toUpperCase()
    const coin = extractCoinName(symbol)
    const side = t.direction.toLowerCase() === 'buy' || t.direction.toLowerCase() === 'long' ? 'Long' : 'Short'
    const duration = formatDuration(t.entryTime, t.exitTime)

    // Planned R:R dan R-Multiple
    const plannedRrStr = pr?.plannedRr ? `1:${pr.plannedRr.toFixed(1)}` : ''
    const rMultipleStr = formatR(tradeDetail.rMultiple)

    // Format PnL USD
    const pnlFormatted = t.realizedPnl >= 0
        ? `+$${Math.abs(t.realizedPnl).toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
        : `-$${Math.abs(t.realizedPnl).toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

    return {
        symbol,
        coin,
        side,
        sideUpper: side.toUpperCase(),
        leverage: `${leverage}x`,
        roi: formatPercent(roiPercent),
        roiPercent,
        pnl: pnlFormatted,
        pnlRaw: t.realizedPnl,
        entryPrice: formatPrice(t.entryPrice),
        exitPrice: formatPrice(t.exitPrice),
        duration,
        plannedStop: pr?.plannedStop ? formatPrice(pr.plannedStop) : '',
        plannedTarget: pr?.plannedTarget ? formatPrice(pr.plannedTarget) : '',
        rr: plannedRrStr,
        rMultiple: rMultipleStr !== '—' ? rMultipleStr : '',
        rMultipleRaw: tradeDetail.rMultiple,
        setup: j?.setupTag || '',
        grade: j?.executionGrade || '',
        emotion: j?.emotionTag || '',
        tags: tradeDetail.tags?.map((tag) => normalizeTagName(tag.name)) || [],
        thesis: (extras.customThesis ?? j?.preTradeThesis ?? '').trim(),
        review: (extras.customReview ?? j?.postTradeReview ?? '').trim(),
        exchange: (extras.selectedExchange || t.exchange || 'MEXC').toUpperCase(),
        referral: (extras.activeReferral || '').trim(),
        handle: extras.traderHandle || '@trader',
        date: formatDate(t.exitTime),
        brand: extras.brandTitle || 'NITIREKSO',
        outcome
    }
}

/** Koleksi Hook SEO Pembuka yang Bergulir (Rotasi) */
const HOOK_PRESETS = {
    win: [
        'Jurnal Trading Crypto: Profit {roi} di {symbol} 🚀\n{sideUpper} {leverage} di {exchange}, take profit tercapai sesuai target. Catatan lengkapnya 👇',
        'Setup jalan mulus! Cuan {roi} di {symbol} 🎯\nEksekusi disiplin di {exchange}, profit sesuai skenario plan. Catatan evaluasinya 👇',
        'Catatan Jurnal Trading: Sukses ambil {roi} di {symbol} 🔥\nBukan tebak-tebakan, murni konfirmasi setup & risk plan yang matang 👇',
        'Jurnal Trading Harian: Take Profit {roi} di {symbol} 📈\n{sideUpper} {leverage} membuahkan hasil. Simak catatan alasan entry & exit di bawah 👇'
    ],
    loss: {
        slPlan: [
            'Jurnal Trading Crypto: Cut Loss {roi} di {symbol} 📉\n{sideUpper} {leverage} di {exchange} kena stop loss — dan itu memang bagian dari plan. Ini evaluasinya 👇',
            'Kena Stop Loss di {symbol} ({roi}) 🛑\nSL tersentuh sesuai batasan risiko awal. Loss terkontrol, modal tetap terlindungi 👇',
            'Evaluasi Jurnal: Disiplin Stop Loss di {symbol} ({roi}) 🛡️\nLebih baik rugi terukur sesuai rencana daripada nahan floating loss tanpa batas 👇'
        ],
        cutEarly: [
            'Jurnal Trading Crypto: Cut Loss Lebih Awal di {symbol} ({roi}) ✂️\nSetup batal di {exchange}, langsung buang posisi sebelum kena SL penuh. Catatan evaluasinya 👇',
            'Evaluasi Trade: Cut Loss Lebih Awal {roi} di {symbol} ⚠️\nMelihat momentum tidak mendukung, posisi diamankan lebih awal agar risiko minimal 👇'
        ],
        general: [
            'Jurnal Trading Crypto: Cut Loss {roi} di {symbol} 📉\n{sideUpper} {leverage} di {exchange} ditutup rugi. Pelajaran & evaluasi lengkapnya di sini 👇',
            'Loss adalah bagian dari bisnis trading: {symbol} ({roi}) 📉\nTetap tenang & objektif evaluasi kesalahan entry dan timing eksekusi 👇'
        ]
    },
    be: [
        'Jurnal Trading Crypto: Breakeven di {symbol} ⚖️\n{sideUpper} {leverage} di {exchange}, amankan posisi di titik impas buat lindungi modal. Catatannya 👇',
        'Jaga modal nomor satu! Trade {symbol} keluar di BEP 🛡️\nDaripada kena floating loss saat momentum hilang, mending amankan modal dulu 👇',
        'Trade Review: Exit Impas di {symbol} ({roi}) ⚖️\nGak semua trade harus profit. Yang paling penting tetap disiplin pada sistem 👇'
    ]
}

/** Ambil Hook pembuka berdasarkan hasil trade dan indeks rotasi */
export function getRotatingHook(ctx: CaptionContext, hookIndex = 0): string {
    if (ctx.outcome === 'win') {
        const list = HOOK_PRESETS.win
        return list[Math.abs(hookIndex) % list.length]!
    }

    if (ctx.outcome === 'be') {
        const list = HOOK_PRESETS.be
        return list[Math.abs(hookIndex) % list.length]!
    }

    // Loss: pisahkan apakah kena SL plan, cut early, atau general
    const r = ctx.rMultipleRaw
    let list = HOOK_PRESETS.loss.general
    if (r !== null && Number.isFinite(r)) {
        if (r <= -0.8) {
            list = HOOK_PRESETS.loss.slPlan
        } else if (r > -0.8 && r < 0) {
            list = HOOK_PRESETS.loss.cutEarly
        }
    }
    return list[Math.abs(hookIndex) % list.length]!
}

/** Hasilkan daftar hashtag otomatis yang relevan dan SEO-friendly (maks 6 hashtag) */
export function generateHashtags(ctx: CaptionContext): string[] {
    const tags = new Set<string>()

    // Tag primer SEO
    tags.add('#jurnaltrading')
    tags.add('#tradingcrypto')
    tags.add(`#${ctx.coin}`)

    // Tag kontekstual hasil
    if (ctx.outcome === 'win') {
        tags.add('#futurestrading')
        tags.add('#belajartrading')
    } else {
        tags.add('#manajemenrisiko')
        tags.add('#cutloss')
    }

    // Tag kustom jurnal user (jika ada)
    for (const t of ctx.tags) {
        if (tags.size >= 5) break
        const cleanTag = t.replace(/[^a-zA-Z0-9]/g, '')
        if (cleanTag) tags.add(`#${cleanTag}`)
    }

    // Brand tag
    if (tags.size < 6) {
        tags.add('#nitirekso')
    }

    return Array.from(tags).slice(0, 6)
}

/** Koleksi Preset Caption Bawaan */
export const CAPTION_PRESETS: CaptionPreset[] = [
    {
        id: 'tiktok-jurnal',
        name: 'TikTok Jurnal (Lengkap & SEO)',
        description: 'Format narasi komprehensif dengan hook tajam, metrik lengkap, evaluasi, dan CTA engagement.',
        platform: 'tiktok',
        templates: {
            win: `{HOOK}

📈 Posisi: {sideUpper} {symbol} {leverage}
✅ ROI: {roi}{PNL_LINE}
🎯 Setup: {setup}{GRADE_LINE}
⚖️ Risk/Reward: {rr}{RMULTIPLE_LINE}
⏱️ Durasi: {duration}

💡 Alasan Entry: {thesis}
📝 Evaluasi: {review}

Profit bukan soal hoki, tapi disiplin menjalankan plan & manajemen risiko. Simpan video ini buat referensi setup kamu! 🔖

{HASHTAGS}`,
            loss: `{HOOK}

📉 Posisi: {sideUpper} {symbol} {leverage}
❌ ROI: {roi}{PNL_LINE}
🛑 Hasil R: {rMultiple}
🎯 Setup: {setup}{GRADE_LINE}
⏱️ Durasi: {duration}

💡 Alasan Entry: {thesis}
📝 Pelajaran & Evaluasi: {review}

Loss itu biaya bisnis dalam trading. Yang penting risiko terukur dan tetap disiplin. Kamu biasanya ngapain kalau kena SL? Tulis di komentar 👇

{HASHTAGS}`,
            be: `{HOOK}

📊 Posisi: {sideUpper} {symbol} {leverage}
⚖️ ROI: {roi}{PNL_LINE}
🎯 Setup: {setup}{GRADE_LINE}
⏱️ Durasi: {duration}

💡 Alasan Entry: {thesis}
📝 Evaluasi: {review}

Gak semua trade harus profit — menjaga modal tetap prioritas nomor satu. Setuju? 💬

{HASHTAGS}`
        }
    },
    {
        id: 'edukasi-thesis',
        name: 'Edukasi & Analisis Setup',
        description: 'Menekankan proses berpikir, thesis trading teknikal, dan evaluasi pasca-trade.',
        platform: 'universal',
        templates: {
            win: `{HOOK}

🔍 Bedah Analisis:
• Aset: {symbol} ({sideUpper} {leverage})
• Setup: {setup} (Grade {grade})
• Hasil: ROI {roi}{PNL_LINE} ({rMultiple})

💡 Rencana & Thesis Awal:
"{thesis}"

📝 Evaluasi Eksekusi:
"{review}"

Manajemen risiko yang baik membuat trading tetap tenang. Pelajari pola ini dan sesuaikan dengan gaya tradingmu! 🚀

{HASHTAGS}`,
            loss: `{HOOK}

🔍 Evaluasi Kesalahan:
• Aset: {symbol} ({sideUpper} {leverage})
• Setup: {setup} (Grade {grade})
• Hasil: ROI {roi}{PNL_LINE} ({rMultiple})

💡 Rencana Awal:
"{thesis}"

📝 Pelajaran dari Trade Ini:
"{review}"

Trading adalah proses belajar terus menerus. Ambil hikmahnya, perbaiki sistemnya! 🧠

{HASHTAGS}`,
            be: `{HOOK}

🔍 Evaluasi Trade Impas:
• Aset: {symbol} ({sideUpper} {leverage})
• Setup: {setup}
• Hasil: ROI {roi}{PNL_LINE}

💡 Catatan:
"{thesis}"

📝 Evaluasi:
"{review}"

{HASHTAGS}`
        }
    },
    {
        id: 'singkat-tiktok',
        name: 'Singkat & To the Point',
        description: 'Ringkas, cocok untuk video cepat dengan caption padat dan jelas.',
        platform: 'tiktok',
        templates: {
            win: `{HOOK}

📊 {sideUpper} {symbol} {leverage} | {roi}{PNL_LINE}
🎯 Setup: {setup} | Durasi: {duration}
Disiplin plan itu kuncinya! 🚀

{HASHTAGS}`,
            loss: `{HOOK}

📊 {sideUpper} {symbol} {leverage} | {roi}{PNL_LINE}
🛑 R: {rMultiple} | Durasi: {duration}
Tetap tenang, risiko tetap terukur. Lanjut trade berikutnya! 🛡️

{HASHTAGS}`,
            be: `{HOOK}

📊 {sideUpper} {symbol} {leverage} | {roi}
Amankan modal dulu, cari peluang baru! ⚖️

{HASHTAGS}`
        }
    },
    {
        id: 'twitter-x',
        name: 'X / Twitter (≤280 Karakter)',
        description: 'Didesain padat agar langsung muat dalam batas karakter Twitter/X.',
        platform: 'x',
        templates: {
            win: `Profit {roi} di #{coin} 🚀
{sideUpper} {leverage} di {exchange}. Setup {setup}, hasil {rMultiple}. Disiplin jalani plan!

#jurnaltrading #tradingcrypto`,
            loss: `Cut loss {roi} di #{coin} 📉
{sideUpper} {leverage} di {exchange}. Risiko terukur ({rMultiple}), lanjut evaluasi.

#jurnaltrading #manajemenrisiko`,
            be: `Trade impas di #{coin} ({roi}) ⚖️
{sideUpper} {leverage} di {exchange}. Amankan modal dulu!

#jurnaltrading #tradingcrypto`
        }
    }
]

export interface RenderCaptionOptions {
    hidePnl?: boolean
    hookIndex?: number
    customTemplate?: string
}

/**
 * Merender string caption akhir dengan token yang disubstitusi secara cerdas.
 * Baris-baris opsional yang tokennya kosong otomatis dihilangkan agar rapi.
 */
export function renderCaption(
    presetId: string,
    ctx: CaptionContext,
    options: RenderCaptionOptions = {}
): string {
    const { hidePnl = false, hookIndex = 0, customTemplate } = options

    const preset = CAPTION_PRESETS.find((p) => p.id === presetId) || CAPTION_PRESETS[0]!
    let rawTemplate = customTemplate || preset.templates[ctx.outcome] || preset.templates.win

    // Siapkan sub-token kondisional
    const pnlLine = !hidePnl && ctx.pnl ? ` | PnL: ${ctx.pnl}` : ''
    const gradeLine = ctx.grade ? ` • Grade ${ctx.grade}` : ''
    const rMultipleLine = ctx.rMultiple ? ` • Hasil ${ctx.rMultiple}` : ''
    const hook = getRotatingHook(ctx, hookIndex)
    const hashtags = generateHashtags(ctx).join(' ')

    // Substitusi Hook & Hashtag terlebih dahulu
    rawTemplate = rawTemplate
        .replace('{HOOK}', hook)
        .replace('{HASHTAGS}', hashtags)
        .replace('{PNL_LINE}', pnlLine)
        .replace('{GRADE_LINE}', gradeLine)
        .replace('{RMULTIPLE_LINE}', rMultipleLine)

    // Substitusi semua token dasar
    const replacements: Record<string, string> = {
        '{symbol}': ctx.symbol,
        '{coin}': ctx.coin,
        '{side}': ctx.side,
        '{sideUpper}': ctx.sideUpper,
        '{leverage}': ctx.leverage,
        '{roi}': ctx.roi,
        '{pnl}': hidePnl ? '' : ctx.pnl,
        '{entry}': ctx.entryPrice,
        '{exit}': ctx.exitPrice,
        '{duration}': ctx.duration,
        '{plannedStop}': ctx.plannedStop,
        '{plannedTarget}': ctx.plannedTarget,
        '{rr}': ctx.rr,
        '{rMultiple}': ctx.rMultiple,
        '{setup}': ctx.setup,
        '{grade}': ctx.grade,
        '{emotion}': ctx.emotion,
        '{thesis}': ctx.thesis,
        '{review}': ctx.review,
        '{exchange}': ctx.exchange,
        '{referral}': ctx.referral,
        '{handle}': ctx.handle,
        '{date}': ctx.date,
        '{brand}': ctx.brand
    }

    let result = rawTemplate
    for (const [token, value] of Object.entries(replacements)) {
        result = result.split(token).join(value)
    }

    // Bersihkan baris yang mengandung token kosong / label tanpa isi
    const cleanedLines = result
        .split('\n')
        .filter((line) => {
            const trimmed = line.trim()
            if (!trimmed) return true // Biarkan baris spasi antar paragraf
            // Cek jika baris hanya berisi label seperti "• Setup: " atau "💡 Alasan Entry: " tanpa nilai
            if (/^(?:•\s*)?(?:Setup|Risk\/Reward|Alasan Entry|Evaluasi|Pelajaran & Evaluasi|Rencana Awal|Catatan|Rencana & Thesis Awal):\s*(?:""|''|—)?$/i.test(trimmed)) {
                return false
            }
            return true
        })

    // Gabungkan kembali dan batasi duplikasi baris kosong lebih dari 2
    return cleanedLines.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}
