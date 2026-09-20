/**
 * Service AI Insights — analisa journal via OpenAI API (fitur 6).
 *
 * ===========================================================================
 * DESAIN
 * ===========================================================================
 *
 * - Memakai OpenAI Chat Completions API (compatibel dengan provider OpenAI-compatible).
 * - API key disimpan via safeStorage (lihat `ai-keystore.ts`).
 * - Model name dan base URL disimpan di tabel settings (bukan kredensial).
 * - Prompt terstruktur dalam Bahasa Indonesia, meminta output JSON stabil.
 * - Data trade di-serialisasi ringkas: hanya field yang relevan untuk analisis.
 *
 * KEAMANAN:
 * - API key TIDAK PERNAH dikirim ke renderer.
 * - Request ke API dilakukan dari main process, bukan renderer.
 * - Tidak ada data PII yang dikirim selain yang sudah ada di journal trade user.
 */

import { getDb } from '../db/index'
import { getSetting, setSetting, SETTING_KEYS } from '../db/repositories/settings'
import { listTrades } from '../db/repositories/trades'
import { loadAiApiKey, saveAiApiKey, deleteAiApiKey, getAiKeyHint, isSecureStorageAvailable } from '../credentials/ai-keystore'
import type { AiConfigPayload, AiConfigStatus, JournalAnalysisResult, TradeFilterPayload } from '../../shared/ipc-contract'
import type { TradeDetail } from '../../shared/domain'
import { logger } from '../utils/logger'

const DEFAULT_MODEL = 'gpt-4o'
const DEFAULT_BASE_URL = 'https://api.openai.com/v1'

// ---------------------------------------------------------------------------
// Konfigurasi
// ---------------------------------------------------------------------------

export function getAiConfig(): AiConfigStatus {
    const db = getDb()
    const model = getSetting<string>(db, SETTING_KEYS.aiModel, DEFAULT_MODEL)
    const baseUrl = getSetting<string>(db, SETTING_KEYS.aiBaseUrl, DEFAULT_BASE_URL)
    const keyHint = getAiKeyHint()
    return {
        configured: keyHint !== null,
        model,
        baseUrl,
        keyHint
    }
}

export function saveAiConfig(payload: AiConfigPayload): void {
    if (!isSecureStorageAvailable()) {
        throw new Error('Penyimpanan aman OS tidak tersedia. API key tidak disimpan.')
    }
    saveAiApiKey(payload.apiKey)
    const db = getDb()
    if (payload.model) {
        setSetting(db, SETTING_KEYS.aiModel, payload.model)
    }
    if (payload.baseUrl) {
        setSetting(db, SETTING_KEYS.aiBaseUrl, payload.baseUrl)
    }
    logger.info('[ai] Konfigurasi AI disimpan.')
}

export function deleteAiConfig(): void {
    deleteAiApiKey()
    logger.info('[ai] Konfigurasi AI dihapus.')
}

// ---------------------------------------------------------------------------
// Analisa journal
// -----------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Analisa journal
// -----------------------------------------------------------------------

export async function analyzeJournal(filter?: TradeFilterPayload): Promise<JournalAnalysisResult> {
    const apiKey = loadAiApiKey()
    if (!apiKey) {
        throw new Error('API key AI belum dikonfigurasi. Atur di Settings terlebih dahulu.')
    }

    const db = getDb()
    const model = getSetting<string>(db, SETTING_KEYS.aiModel, DEFAULT_MODEL)
    const baseUrl = getSetting<string>(db, SETTING_KEYS.aiBaseUrl, DEFAULT_BASE_URL)
    const trades = listTrades(db, filter ?? {})

    if (trades.length === 0) {
        throw new Error('Tidak ada trade untuk dianalisis.')
    }

    logger.info(`[ai] Memulai analisis journal (${trades.length} trade) dengan model '${model}' di ${baseUrl}`)

    try {
        const prompt = buildPrompt(trades)
        const response = await callOpenAI(apiKey, model, baseUrl, prompt)
        const result = parseResponse(response)
        logger.info('[ai] Analisis journal berhasil dihasilkan.')
        return result
    } catch (err) {
        logger.error('[ai] Gagal menganalisis journal:', err)
        throw err
    }
}

// ---------------------------------------------------------------------------
// Prompt construction
// ---------------------------------------------------------------------------

function buildPrompt(trades: TradeDetail[]): string {
    const tradeData = trades.map((d) => {
        const { trade, journal, plannedRisk, tags, rMultiple } = d
        return {
            symbol: trade.symbol,
            direction: trade.direction,
            entryPrice: trade.entryPrice,
            exitPrice: trade.exitPrice,
            realizedPnl: trade.realizedPnl,
            rMultiple,
            plannedRr: plannedRisk?.plannedRr ?? null,
            feeTotal: trade.feeOpen + trade.feeClose + trade.fundingFee,
            setupTag: journal?.setupTag ?? null,
            emotionTag: journal?.emotionTag ?? null,
            executionGrade: journal?.executionGrade ?? null,
            tags: tags.map((t) => t.name),
            thesis: journal?.preTradeThesis ?? null,
            review: journal?.postTradeReview ?? null
        }
    })

    const stats = {
        totalTrades: trades.length,
        wins: trades.filter((d) => d.trade.realizedPnl > 0).length,
        losses: trades.filter((d) => d.trade.realizedPnl < 0).length,
        netPnl: trades.reduce((s, d) => s + d.trade.realizedPnl, 0),
        avgR: trades.filter((d) => d.rMultiple !== null).length > 0
            ? trades.filter((d) => d.rMultiple !== null).reduce((s, d) => s + (d.rMultiple ?? 0), 0) / trades.filter((d) => d.rMultiple !== null).length
            : null
    }

    return `Anda adalah analis trading profesional. Analisa journal trading berikut dan berikan wawasan dalam Bahasa Indonesia.

STATISTIK RINGKAS:
- Total trade: ${stats.totalTrades}
- Win/Loss: ${stats.wins}/${stats.losses}
- P&L bersih total: ${stats.netPnl.toFixed(2)}
- Rata-rata R-multiple: ${stats.avgR !== null ? stats.avgR.toFixed(2) : 'tidak tersedia'}

DATA TRADE:
${JSON.stringify(tradeData, null, 2)}

Instruksi:
1. Identifikasi pola kelemahan (mis. sering revenge trade setelah loss, win rate rendah di sesi tertentu, grade eksekusi buruk).
2. Berikan saran perbaikan yang konkret dan dapat ditindaklanjuti.
3. Jangan mengulang teori umum — fokus pada pola yang terlihat di data.

Format respons WAJIB JSON:
{
  "summary": "Ringkasan satu paragraf",
  "weaknesses": ["Kelemahan 1", "Kelemahan 2", ...],
  "suggestions": ["Saran 1", "Saran 2", ...],
  "metrics": [{"label": "Win Rate", "value": "45%"}, ...]
}`
}

// ---------------------------------------------------------------------------
// Robust JSON Helpers
// ---------------------------------------------------------------------------

/**
 * Ekstrak blok JSON valid dari string respons HTTP yang mungkin memiliki trailing non-whitespace,
 * event stream (SSE), atau format chunked ganda dari proxy lokal.
 */
function parseApiResponse(rawText: string): { choices: { message: { content: string } }[] } {
    try {
        return JSON.parse(rawText)
    } catch {
        // Mencari objek JSON valid pertama dengan penyeimbangan kurung kurawal
        const firstBrace = rawText.indexOf('{')
        if (firstBrace !== -1) {
            let depth = 0
            let inString = false
            let escape = false
            for (let i = firstBrace; i < rawText.length; i++) {
                const char = rawText[i]
                if (escape) {
                    escape = false
                    continue
                }
                if (char === '\\') {
                    escape = true
                    continue
                }
                if (char === '"') {
                    inString = !inString
                    continue
                }
                if (!inString) {
                    if (char === '{') depth++
                    else if (char === '}') {
                        depth--
                        if (depth === 0) {
                            const jsonSub = rawText.slice(firstBrace, i + 1)
                            try {
                                return JSON.parse(jsonSub)
                            } catch {
                                break
                            }
                        }
                    }
                }
            }
        }

        // Fallback jika berupa stream SSE (data: {...})
        const lines = rawText.split(/\r?\n/)
        for (const line of lines) {
            const trimmed = line.trim()
            if (trimmed.startsWith('data:') && !trimmed.includes('[DONE]')) {
                const dataPart = trimmed.slice(5).trim()
                try {
                    const parsed = JSON.parse(dataPart)
                    if (parsed.choices) return parsed
                } catch {
                    // Coba baris berikutnya
                }
            }
        }

        throw new Error(`Gagal membaca respons API AI (format JSON tidak valid): ${rawText.slice(0, 200)}...`)
    }
}

/**
 * Ekstrak JSON murni dari konten model, membersihkan markdown code fencing (```json ... ```)
 * atau teks pengantar/penutup.
 */
function extractJsonFromContent(content: string): string {
    let text = content.trim()

    // Hapus code fence markdown jika ada
    const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
    if (codeBlockMatch && codeBlockMatch[1]) {
        text = codeBlockMatch[1].trim()
    }

    // Ambil substring antara { pertama dan } terakhir
    const firstBrace = text.indexOf('{')
    const lastBrace = text.lastIndexOf('}')
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        return text.slice(firstBrace, lastBrace + 1)
    }

    return text
}

// ---------------------------------------------------------------------------
// OpenAI API call
// ---------------------------------------------------------------------------

async function callOpenAI(apiKey: string, model: string, baseUrl: string, prompt: string): Promise<string> {
    const url = `${baseUrl.replace(/\/$/, '')}/chat/completions`
    const body = {
        model,
        messages: [
            {
                role: 'system',
                content: 'Anda adalah asisten analisis trading journal. Selalu respons dengan JSON yang valid sesuai format yang diminta.'
            },
            {
                role: 'user',
                content: prompt
            }
        ],
        temperature: 0.7,
        response_format: { type: 'json_object' }
    }

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify(body)
    })

    if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`API error ${response.status}: ${errorText}`)
    }

    const rawText = await response.text()
    const data = parseApiResponse(rawText)

    if (!data.choices || data.choices.length === 0) {
        throw new Error('Respons API tidak memiliki choices.')
    }

    const choice = data.choices[0]
    if (!choice?.message?.content) {
        throw new Error('Respons API tidak memiliki content.')
    }
    return choice.message.content
}

// ---------------------------------------------------------------------------
// Parse response
// ---------------------------------------------------------------------------

function parseResponse(content: string): JournalAnalysisResult {
    const cleanJson = extractJsonFromContent(content)
    try {
        const parsed = JSON.parse(cleanJson) as JournalAnalysisResult
        if (!parsed.summary || !Array.isArray(parsed.weaknesses) || !Array.isArray(parsed.suggestions)) {
            throw new Error('Struktur JSON tidak sesuai format yang diharapkan.')
        }
        return {
            summary: parsed.summary,
            weaknesses: parsed.weaknesses,
            suggestions: parsed.suggestions,
            metrics: parsed.metrics
        }
    } catch {
        // Fallback jika parsing tetap gagal, bungkus konten mentah dengan aman
        logger.warn('[ai] Gagal mem-parse JSON hasil model, menggunakan format fallback.')
        return {
            summary: content.slice(0, 500),
            weaknesses: ['Respons AI tidak terstruktur dengan format JSON baku.'],
            suggestions: ['Coba ulangi analisa atau gunakan model lain.']
        }
    }
}
