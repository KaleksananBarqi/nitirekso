import mexcLogo from '../assets/exchanges/mexc.png'
import bitunixLogo from '../assets/exchanges/bitunix.png'
import bybitLogo from '../assets/exchanges/bybit.png'
import binanceLogo from '../assets/exchanges/binance.png'
import bingxLogo from '../assets/exchanges/bingx.png'
import nitireksoLogo from '../assets/logo.png'

export { nitireksoLogo }

export const DEFAULT_EXCHANGE_LOGOS: Record<string, string> = {
    mexc: mexcLogo,
    bitunix: bitunixLogo,
    bybit: bybitLogo,
    binance: binanceLogo,
    bingx: bingxLogo
}

export const EXCHANGE_DISPLAY_NAMES: Record<string, string> = {
    mexc: 'MEXC Futures',
    bitunix: 'Bitunix Futures',
    bybit: 'Bybit Futures',
    binance: 'Binance Futures',
    bingx: 'BingX Futures',
    manual: 'Manual'
}

/**
 * Mengambil URL logo exchange bawaan aplikasi.
 */
export function getExchangeDefaultLogo(exchange: string | null | undefined): string | null {
    if (!exchange) return null
    return DEFAULT_EXCHANGE_LOGOS[exchange.toLowerCase()] || null
}

/**
 * Mengambil nama tampilan exchange.
 */
export function getExchangeDisplayName(exchange: string | null | undefined): string {
    if (!exchange) return 'Exchange'
    return EXCHANGE_DISPLAY_NAMES[exchange.toLowerCase()] || exchange.toUpperCase()
}
