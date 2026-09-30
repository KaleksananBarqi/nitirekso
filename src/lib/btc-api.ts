/**
 * Utilitas untuk mengambil data historis BTC/USDT dari Binance Public API
 * dan menghitung perbandingan ROI (Alpha) terhadap portofolio trading pengguna.
 */

export interface BtcPricePoint {
    /** Epoch ms */
    time: number
    close: number
}

export interface RoiComparisonPoint {
    /** Epoch ms */
    time: number
    userRoi: number
    btcRoi: number
    userEquity: number
    btcPrice: number
}

export interface BtcComparisonSummary {
    userFinalRoi: number
    btcFinalRoi: number
    alpha: number
    isOutperforming: boolean
    startBtcPrice: number
    endBtcPrice: number
    startDate: number
    endDate: number
}

/**
 * Fetch data klines/candlestick harian BTC/USDT.
 * Menggunakan IPC Electron Main Process bila tersedia (bebas batasan CSP & blokir ISP),
 * dengan multi-provider fallback otomatis (Binance, Kraken, CoinGecko).
 */
export async function fetchBtcKlines(startTimeMs: number, endTimeMs: number): Promise<BtcPricePoint[]> {
    // 1. Prioritas Utama: Gunakan IPC Main Process Electron jika tersedia
    if (typeof window !== 'undefined' && window.api?.getBtcKlines) {
        try {
            const res = await window.api.getBtcKlines({ startTime: startTimeMs, endTime: endTimeMs })
            if (res.ok && Array.isArray(res.data) && res.data.length > 0) {
                return res.data
            }
            if (!res.ok) {
                console.warn('[btc] IPC getBtcKlines error:', res.error)
            }
        } catch (ipcErr) {
            console.warn('[btc] Gagal memanggil IPC getBtcKlines, mencoba direct fetch...', ipcErr)
        }
    }

    // 2. Fallback Direct Fetch (Mode Browser Web Development)
    const adjustedStart = Math.max(0, startTimeMs - 24 * 60 * 60 * 1000)
    const adjustedEnd = endTimeMs + 24 * 60 * 60 * 1000

    // Provider 1: Binance Spot
    try {
        const url = `https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1d&startTime=${adjustedStart}&endTime=${adjustedEnd}&limit=1000`
        const response = await fetch(url)
        if (response.ok) {
            const data = (await response.json()) as (string | number)[][]
            if (Array.isArray(data) && data.length > 0) {
                return data.map((item) => ({
                    time: Number(item[0]),
                    close: parseFloat(String(item[4]))
                }))
            }
        }
    } catch {
        // Lanjut ke provider berikutnya
    }

    // Provider 2: Binance Vision
    try {
        const fallbackUrl = `https://data-api.binance.vision/api/v3/klines?symbol=BTCUSDT&interval=1d&startTime=${adjustedStart}&endTime=${adjustedEnd}&limit=1000`
        const response = await fetch(fallbackUrl)
        if (response.ok) {
            const data = (await response.json()) as (string | number)[][]
            if (Array.isArray(data) && data.length > 0) {
                return data.map((item) => ({
                    time: Number(item[0]),
                    close: parseFloat(String(item[4]))
                }))
            }
        }
    } catch {
        // Lanjut ke provider berikutnya
    }

    // Provider 3: Kraken Public OHLC
    try {
        const sinceSec = Math.floor(adjustedStart / 1000)
        const url = `https://api.kraken.com/0/public/OHLC?pair=XBTUSD&interval=1440&since=${sinceSec}`
        const response = await fetch(url)
        if (response.ok) {
            const json = (await response.json()) as { result?: Record<string, (string | number)[][]> }
            if (json.result) {
                const pairKey = Object.keys(json.result)[0]
                const rows = pairKey ? json.result[pairKey] : []
                if (Array.isArray(rows) && rows.length > 0) {
                    const filtered = rows
                        .map((r) => ({
                            time: Number(r[0]) * 1000,
                            close: parseFloat(String(r[4]))
                        }))
                        .filter((p) => p.time >= adjustedStart - 86400000 && p.time <= adjustedEnd + 86400000)
                    if (filtered.length > 0) return filtered
                }
            }
        }
    } catch {
        // Lanjut ke provider berikutnya
    }

    // Provider 4: CoinGecko
    try {
        const fromSec = Math.floor(adjustedStart / 1000)
        const toSec = Math.ceil(adjustedEnd / 1000)
        const url = `https://api.coingecko.com/api/v3/coins/bitcoin/market_chart/range?vs_currency=usd&from=${fromSec}&to=${toSec}`
        const response = await fetch(url)
        if (response.ok) {
            const json = (await response.json()) as { prices?: [number, number][] }
            if (Array.isArray(json.prices) && json.prices.length > 0) {
                return json.prices.map((p) => ({
                    time: p[0],
                    close: p[1]
                }))
            }
        }
    } catch {
        // Fallback habis
    }

    throw new Error('Tidak dapat mengambil data harga BTC. Pastikan koneksi internet aktif.')
}

/**
 * Hitung kurva perbandingan ROI User vs ROI BTC berdasarkan modal awal (initial capital).
 */
export function calculateRoiComparison(
    btcKlines: BtcPricePoint[],
    userEquityPoints: { time: number; equity: number }[],
    initialCapital: number
): { points: RoiComparisonPoint[]; summary: BtcComparisonSummary | null } {
    if (userEquityPoints.length === 0 || btcKlines.length === 0 || initialCapital <= 0) {
        return { points: [], summary: null }
    }

    // Urutkan titik
    const sortedUser = [...userEquityPoints].sort((a, b) => a.time - b.time)
    const sortedBtc = [...btcKlines].sort((a, b) => a.time - b.time)

    // Cari harga BTC acuan awal (candle terdekat sebelum atau sama dengan trade pertama)
    const firstTradeTime = sortedUser[0]!.time
    let startBtcCandle = sortedBtc.find((k) => k.time >= firstTradeTime) || sortedBtc[0]!
    const startBtcPrice = startBtcCandle.close

    // Helper cari harga BTC pada waktu tertentu (interpolasi terdekat)
    function findBtcPriceAt(timeMs: number): number {
        let best = sortedBtc[0]!
        let minDiff = Math.abs(best.time - timeMs)
        for (const item of sortedBtc) {
            const diff = Math.abs(item.time - timeMs)
            if (diff < minDiff) {
                minDiff = diff
                best = item
            }
        }
        return best.close
    }

    const points: RoiComparisonPoint[] = []

    // Buat titik awal (Day 0)
    points.push({
        time: firstTradeTime - 1000,
        userRoi: 0,
        btcRoi: 0,
        userEquity: 0,
        btcPrice: startBtcPrice
    })

    for (const point of sortedUser) {
        const btcPrice = findBtcPriceAt(point.time)
        const btcRoi = ((btcPrice - startBtcPrice) / startBtcPrice) * 100
        const userRoi = (point.equity / initialCapital) * 100

        points.push({
            time: point.time,
            userRoi,
            btcRoi,
            userEquity: point.equity,
            btcPrice
        })
    }

    const lastPoint = points[points.length - 1]!
    const userFinalRoi = lastPoint.userRoi
    const btcFinalRoi = lastPoint.btcRoi
    const alpha = userFinalRoi - btcFinalRoi

    const summary: BtcComparisonSummary = {
        userFinalRoi,
        btcFinalRoi,
        alpha,
        isOutperforming: alpha > 0,
        startBtcPrice,
        endBtcPrice: lastPoint.btcPrice,
        startDate: points[0]!.time,
        endDate: lastPoint.time
    }

    return { points, summary }
}
