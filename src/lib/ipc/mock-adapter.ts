/**
 * Adapter Fake In-Memory Mock untuk IPC Nitirekso.
 *
 * Mengimplementasikan kontrak IpcClient tanpa ketergantungan pada binary Tauri native,
 * sangat berguna untuk unit test, e2e test berbasis web browser biasa,
 * dan preview antarmuka tanpa backend desktop.
 */

import type {
    AccountBalance,
    AiConfigPayload,
    AiConfigStatus,
    AppHealth,
    AppUpdateInfo,
    BackupRestoreResult,
    BackupRunResult,
    BackupStatusPayload,
    BtcKlinePoint,
    ChecklistItem,
    CredentialSavePayload,
    CredentialStatusPayload,
    JournalAnalysisResult,
    LogEntry,
    ScreenshotUploadPayload,
    SettingsPayload,
    SyncableExchange,
    SyncProgressPayload,
    SyncRunResult,
    SyncStatePayload,
    TradeDetail,
    TradeFilterPayload,
    TradeMeta,
    TradeSavePayload,
} from '@shared/ipc-contract'
import type {
    PlannedRisk,
    Trade,
    TradeJournal,
    TradeTag,
} from '@shared/domain'
import {
    createAppError,
    err,
    ok,
    type AiClient,
    type AppResult,
    type BackupClient,
    type IpcClient,
    type MediaClient,
    type SettingsClient,
    type SyncClient,
    type SystemClient,
    type TradesClient,
} from './types'

export interface InMemoryMockState {
    trades?: TradeDetail[]
    settings?: Record<string, unknown>
    credentialStatuses?: CredentialStatusPayload[]
    syncStates?: SyncStatePayload[]
    balances?: AccountBalance[]
    aiConfig?: AiConfigStatus
    backupStatus?: BackupStatusPayload
    logs?: LogEntry[]
}

export class InMemoryMockAdapter implements IpcClient {
    private tradesState: TradeDetail[] = []
    private settingsState: Record<string, unknown> = {}
    private credentialStatusesState: Map<SyncableExchange, CredentialStatusPayload> = new Map()
    private syncStatesState: Map<SyncableExchange, SyncStatePayload> = new Map()
    private balancesState: AccountBalance[] = []
    private aiConfigState: AiConfigStatus = {
        configured: false,
        model: null,
        baseUrl: null,
        keyHint: null,
    }
    private backupStatusState: BackupStatusPayload = {
        connected: false,
        email: null,
        folder: null,
        lastBackupAt: null,
        nextBackupAt: null,
        syncMode: 'folder',
        localFolder: null,
        clientIdConfigured: false,
    }
    private logsState: LogEntry[] = []
    private screenshotsState: Map<string, Uint8Array> = new Map()
    private syncProgressListeners: Set<(progress: SyncProgressPayload) => void> = new Set()
    private nextTradeId = 1

    constructor(initialState?: InMemoryMockState) {
        if (initialState?.trades) {
            this.tradesState = [...initialState.trades]
            const maxId = this.tradesState.reduce((max, t) => Math.max(max, t.trade.id), 0)
            this.nextTradeId = maxId + 1
        }
        if (initialState?.settings) {
            this.settingsState = { ...initialState.settings }
        }
        if (initialState?.credentialStatuses) {
            for (const status of initialState.credentialStatuses) {
                this.credentialStatusesState.set(status.exchange, { ...status })
            }
        }
        if (initialState?.syncStates) {
            for (const state of initialState.syncStates) {
                this.syncStatesState.set(state.exchange, { ...state })
            }
        }
        if (initialState?.balances) {
            this.balancesState = [...initialState.balances]
        }
        if (initialState?.aiConfig) {
            this.aiConfigState = { ...initialState.aiConfig }
        }
        if (initialState?.backupStatus) {
            this.backupStatusState = { ...initialState.backupStatus }
        }
        if (initialState?.logs) {
            this.logsState = [...initialState.logs]
        }
    }

    // -----------------------------------------------------------------------
    // Helper untuk Pengujian
    // -----------------------------------------------------------------------

    /** Reset seluruh data mock ke kondisi awal kosong. */
    public reset(): void {
        this.tradesState = []
        this.settingsState = {}
        this.credentialStatusesState.clear()
        this.syncStatesState.clear()
        this.balancesState = []
        this.aiConfigState = {
            configured: false,
            model: null,
            baseUrl: null,
            keyHint: null,
        }
        this.backupStatusState = {
            connected: false,
            email: null,
            folder: null,
            lastBackupAt: null,
            nextBackupAt: null,
            syncMode: 'folder',
            localFolder: null,
            clientIdConfigured: false,
        }
        this.logsState = []
        this.screenshotsState.clear()
        this.syncProgressListeners.clear()
        this.nextTradeId = 1
    }

    /** Emulasi penyiaran event progres sinkronisasi ke semua pendengar. */
    public emitSyncProgress(progress: SyncProgressPayload): void {
        for (const listener of this.syncProgressListeners) {
            try {
                listener(progress)
            } catch (e) {
                console.error('[InMemoryMockAdapter] Kesalahan listener progres sinkronisasi:', e)
            }
        }
    }

    // -----------------------------------------------------------------------
    // Domain Trades
    // -----------------------------------------------------------------------

    public readonly trades: TradesClient = {
        list: async (filter?: TradeFilterPayload): Promise<AppResult<TradeDetail[]>> => {
            let result = [...this.tradesState]

            if (filter?.exchange) {
                result = result.filter((t) => t.trade.exchange === filter.exchange)
            }
            if (filter?.symbol) {
                result = result.filter((t) =>
                    t.trade.symbol.toLowerCase().includes(filter.symbol!.toLowerCase())
                )
            }
            if (filter?.from !== undefined) {
                result = result.filter((t) => t.trade.entryTime >= filter.from!)
            }
            if (filter?.to !== undefined) {
                result = result.filter((t) => t.trade.exitTime <= filter.to!)
            }
            if (filter?.setupTag) {
                result = result.filter((t) => t.journal?.setupTag === filter.setupTag)
            }

            // Urutkan default: entryTime descending
            result.sort((a, b) => b.trade.entryTime - a.trade.entryTime)

            const offset = filter?.offset ?? 0
            const limit = filter?.limit ?? result.length
            return ok(result.slice(offset, offset + limit))
        },

        get: async (id: number): Promise<AppResult<TradeDetail | null>> => {
            const found = this.tradesState.find((t) => t.trade.id === id)
            return ok(found ? { ...found } : null)
        },

        create: async (payload: TradeSavePayload): Promise<AppResult<number>> => {
            const newId = this.nextTradeId++
            const now = Date.now()

            const tradeObj: Trade = {
                id: newId,
                exchange: payload.trade.exchange,
                externalId: payload.trade.externalId ?? null,
                symbol: payload.trade.symbol,
                direction: payload.trade.direction,
                entryPrice: payload.trade.entryPrice,
                exitPrice: payload.trade.exitPrice,
                entryTime: payload.trade.entryTime,
                exitTime: payload.trade.exitTime,
                size: payload.trade.size,
                leverage: payload.trade.leverage,
                marginMode: payload.trade.marginMode ?? null,
                realizedPnl: payload.trade.realizedPnl,
                pnlSource: 'manual',
                feeOpen: payload.trade.feeOpen,
                feeClose: payload.trade.feeClose,
                feeOpenMaker: null,
                feeCloseMaker: null,
                fundingFee: payload.trade.fundingFee,
                createdAt: now,
                updatedAt: now,
            }

            const journalObj: TradeJournal | null = payload.journal
                ? {
                      tradeId: newId,
                      setupTag: payload.journal.setupTag ?? null,
                      preTradeThesis: payload.journal.preTradeThesis ?? null,
                      postTradeReview: payload.journal.postTradeReview ?? null,
                      emotionTag: payload.journal.emotionTag ?? null,
                      executionGrade: payload.journal.executionGrade ?? null,
                      screenshotPath: payload.journal.screenshotPath ?? null,
                      updatedAt: now,
                  }
                : null

            const plannedRiskObj: PlannedRisk | null = payload.plannedRisk
                ? {
                      tradeId: newId,
                      plannedStop: payload.plannedRisk.plannedStop ?? null,
                      plannedTarget: payload.plannedRisk.plannedTarget ?? null,
                      riskAmount: payload.plannedRisk.riskAmount ?? null,
                      plannedRr: payload.plannedRisk.plannedRr ?? null,
                  }
                : null

            const tagsObj: TradeTag[] = (payload.journal?.tags ?? []).map((name, i) => ({
                id: i + 1,
                name,
            }))

            const checklistObj: ChecklistItem[] = (payload.journal?.checklist ?? []).map((c, i) => ({
                id: i + 1,
                tradeId: newId,
                label: c.label,
                checked: c.checked,
                sortOrder: i,
            }))

            const newTrade: TradeDetail = {
                trade: tradeObj,
                journal: journalObj,
                plannedRisk: plannedRiskObj,
                checklist: checklistObj,
                tags: tagsObj,
                rMultiple: plannedRiskObj?.plannedRr ?? null,
            }

            this.tradesState.push(newTrade)
            return ok(newId)
        },

        update: async (id: number, payload: TradeSavePayload): Promise<AppResult<void>> => {
            const idx = this.tradesState.findIndex((t) => t.trade.id === id)
            if (idx === -1) {
                return err(
                    createAppError('TRADE_NOT_FOUND', `Transaksi dengan ID ${id} tidak ditemukan`)
                )
            }

            const existing = this.tradesState[idx]
            if (!existing) {
                return err(
                    createAppError('TRADE_NOT_FOUND', `Transaksi dengan ID ${id} tidak ditemukan`)
                )
            }
            const now = Date.now()

            const updatedTrade: Trade = {
                ...existing.trade,
                exchange: payload.trade.exchange,
                externalId: payload.trade.externalId ?? existing.trade.externalId,
                symbol: payload.trade.symbol,
                direction: payload.trade.direction,
                entryPrice: payload.trade.entryPrice,
                exitPrice: payload.trade.exitPrice,
                entryTime: payload.trade.entryTime,
                exitTime: payload.trade.exitTime,
                size: payload.trade.size,
                leverage: payload.trade.leverage,
                marginMode: payload.trade.marginMode ?? existing.trade.marginMode,
                realizedPnl: payload.trade.realizedPnl,
                feeOpen: payload.trade.feeOpen,
                feeClose: payload.trade.feeClose,
                fundingFee: payload.trade.fundingFee,
                updatedAt: now,
            }

            const updatedJournal: TradeJournal | null = payload.journal
                ? {
                      tradeId: id,
                      setupTag: payload.journal.setupTag ?? existing.journal?.setupTag ?? null,
                      preTradeThesis:
                          payload.journal.preTradeThesis ??
                          existing.journal?.preTradeThesis ??
                          null,
                      postTradeReview:
                          payload.journal.postTradeReview ??
                          existing.journal?.postTradeReview ??
                          null,
                      emotionTag:
                          payload.journal.emotionTag ??
                          existing.journal?.emotionTag ??
                          null,
                      executionGrade:
                          payload.journal.executionGrade ??
                          existing.journal?.executionGrade ??
                          null,
                      screenshotPath:
                          payload.journal.screenshotPath ??
                          existing.journal?.screenshotPath ??
                          null,
                      updatedAt: now,
                  }
                : existing.journal

            const updatedPlannedRisk: PlannedRisk | null = payload.plannedRisk
                ? {
                      tradeId: id,
                      plannedStop:
                          payload.plannedRisk.plannedStop ??
                          existing.plannedRisk?.plannedStop ??
                          null,
                      plannedTarget:
                          payload.plannedRisk.plannedTarget ??
                          existing.plannedRisk?.plannedTarget ??
                          null,
                      riskAmount:
                          payload.plannedRisk.riskAmount ??
                          existing.plannedRisk?.riskAmount ??
                          null,
                      plannedRr:
                          payload.plannedRisk.plannedRr ??
                          existing.plannedRisk?.plannedRr ??
                          null,
                  }
                : existing.plannedRisk

            const updatedTags: TradeTag[] = payload.journal?.tags
                ? payload.journal.tags.map((name, i) => ({ id: i + 1, name }))
                : existing.tags

            const updatedChecklist: ChecklistItem[] = payload.journal?.checklist
                ? payload.journal.checklist.map((c, i) => ({
                      id: i + 1,
                      tradeId: id,
                      label: c.label,
                      checked: c.checked,
                      sortOrder: i,
                  }))
                : existing.checklist

            this.tradesState[idx] = {
                trade: updatedTrade,
                journal: updatedJournal,
                plannedRisk: updatedPlannedRisk,
                checklist: updatedChecklist,
                tags: updatedTags,
                rMultiple: updatedPlannedRisk?.plannedRr ?? existing.rMultiple,
            }

            return ok(undefined)
        },

        delete: async (id: number): Promise<AppResult<void>> => {
            const idx = this.tradesState.findIndex((t) => t.trade.id === id)
            if (idx === -1) {
                return err(
                    createAppError('TRADE_NOT_FOUND', `Transaksi dengan ID ${id} tidak ditemukan`)
                )
            }
            this.tradesState.splice(idx, 1)
            return ok(undefined)
        },

        getMeta: async (): Promise<AppResult<TradeMeta>> => {
            const symbols = new Set<string>()
            const setupTags = new Set<string>()
            const emotionTags = new Set<string>()
            const tags = new Set<string>()

            for (const t of this.tradesState) {
                if (t.trade.symbol) symbols.add(t.trade.symbol)
                if (t.journal?.setupTag) setupTags.add(t.journal.setupTag)
                if (t.journal?.emotionTag) emotionTags.add(t.journal.emotionTag)
                for (const tag of t.tags) {
                    tags.add(tag.name)
                }
            }

            return ok({
                symbols: Array.from(symbols),
                setupTags: Array.from(setupTags),
                emotionTags: Array.from(emotionTags),
                tags: Array.from(tags),
                checklistTemplate: [
                    'Analisis multi-timeframe',
                    'Konfirmasi volume',
                    'Risk/Reward >= 1:2',
                ],
                totalTrades: this.tradesState.length,
            })
        },

        exportJournal: async (
            format: 'csv' | 'json' | 'pdf',
            filter?: TradeFilterPayload
        ): Promise<AppResult<string>> => {
            const listRes = await this.trades.list(filter)
            if (!listRes.ok) return listRes

            if (format === 'json') {
                return ok(JSON.stringify(listRes.data, null, 2))
            }
            if (format === 'csv') {
                const header = 'id,symbol,direction,entryPrice,exitPrice,realizedPnl\n'
                const rows = listRes.data
                    .map(
                        (t) =>
                            `${t.trade.id},${t.trade.symbol},${t.trade.direction},${t.trade.entryPrice},${t.trade.exitPrice},${t.trade.realizedPnl}`
                    )
                    .join('\n')
                return ok(header + rows)
            }
            return ok('/mock/path/journal-export.pdf')
        },
    }

    // -----------------------------------------------------------------------
    // Domain Settings
    // -----------------------------------------------------------------------

    public readonly settings: SettingsClient = {
        getAll: async (): Promise<AppResult<Record<string, unknown>>> => {
            return ok({ ...this.settingsState })
        },

        set: async (payload: SettingsPayload): Promise<AppResult<void>> => {
            this.settingsState = {
                ...this.settingsState,
                ...(payload as Record<string, unknown>),
            }
            return ok(undefined)
        },
    }

    // -----------------------------------------------------------------------
    // Domain Sync
    // -----------------------------------------------------------------------

    public readonly sync: SyncClient = {
        getStates: async (): Promise<AppResult<SyncStatePayload[]>> => {
            return ok(Array.from(this.syncStatesState.values()))
        },

        run: async (): Promise<AppResult<SyncRunResult>> => {
            const exchanges = Array.from(this.syncStatesState.keys()).map((ex) => ({
                exchange: ex,
                status: 'ok' as const,
                inserted: 0,
                updated: 0,
                wasFullBackfill: false,
            }))

            return ok({
                status: 'ok',
                exchanges,
                durationMs: 100,
            })
        },

        onProgress: (callback: (progress: SyncProgressPayload) => void): (() => void) => {
            this.syncProgressListeners.add(callback)
            return () => {
                this.syncProgressListeners.delete(callback)
            }
        },

        getBalances: async (): Promise<AppResult<AccountBalance[]>> => {
            return ok([...this.balancesState])
        },

        syncBalances: async (): Promise<AppResult<AccountBalance[]>> => {
            return ok([...this.balancesState])
        },

        getCredentialStatuses: async (): Promise<AppResult<CredentialStatusPayload[]>> => {
            return ok(Array.from(this.credentialStatusesState.values()))
        },

        saveCredentials: async (payload: CredentialSavePayload): Promise<AppResult<void>> => {
            const keyHint =
                payload.apiKey.length > 6
                    ? `${payload.apiKey.slice(0, 3)}...${payload.apiKey.slice(-3)}`
                    : '***'
            this.credentialStatusesState.set(payload.exchange, {
                exchange: payload.exchange,
                configured: true,
                keyHint,
                updatedAt: Date.now(),
            })
            return ok(undefined)
        },

        deleteCredentials: async (exchange: SyncableExchange): Promise<AppResult<void>> => {
            this.credentialStatusesState.delete(exchange)
            return ok(undefined)
        },
    }

    // -----------------------------------------------------------------------
    // Domain Media
    // -----------------------------------------------------------------------

    public readonly media: MediaClient = {
        uploadScreenshot: async (payload: ScreenshotUploadPayload): Promise<AppResult<string>> => {
            const relPath = `screenshots/${Date.now()}_${payload.fileName}`
            this.screenshotsState.set(relPath, payload.data)
            return ok(relPath)
        },

        getScreenshot: async (relPath: string): Promise<AppResult<string>> => {
            const data = this.screenshotsState.get(relPath)
            if (!data) {
                // Return default SVG placeholder mock jika tidak ada
                return ok('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg"/>')
            }
            return ok('data:image/png;base64,mockScreenshotBase64')
        },

        remuxVideoMp4: async (
            data: Uint8Array,
            _audioData?: Uint8Array
        ): Promise<AppResult<Uint8Array>> => {
            // Pada mock, kembalikan data biner masukan secara utuh
            return ok(data)
        },

        saveVideoFile: async (
            defaultName: string,
            _data: Uint8Array
        ): Promise<AppResult<string | null>> => {
            return ok(`/mock/videos/${defaultName}`)
        },
    }

    // -----------------------------------------------------------------------
    // Domain Backup
    // -----------------------------------------------------------------------

    public readonly backup: BackupClient = {
        getStatus: async (): Promise<AppResult<BackupStatusPayload>> => {
            return ok({ ...this.backupStatusState })
        },

        run: async (): Promise<AppResult<BackupRunResult>> => {
            const now = Date.now()
            this.backupStatusState.lastBackupAt = now
            return ok({
                status: 'ok',
                filesUploaded: 3,
                bytesUploaded: 4096,
                durationMs: 80,
            })
        },

        restore: async (folderPath?: string): Promise<AppResult<BackupRestoreResult>> => {
            return ok({
                success: true,
                sourcePath: folderPath ?? '/mock/backup-folder',
                tradesCount: this.tradesState.length,
                screenshotsRestored: this.screenshotsState.size,
                message: 'Data cadangan berhasil dipulihkan di memori mock.',
            })
        },

        disconnect: async (): Promise<AppResult<void>> => {
            this.backupStatusState.connected = false
            this.backupStatusState.email = null
            this.backupStatusState.folder = null
            return ok(undefined)
        },

        startOAuth: async (_clientId?: string): Promise<AppResult<void>> => {
            this.backupStatusState.connected = true
            this.backupStatusState.email = 'trader@example.com'
            this.backupStatusState.folder = 'Nitirekso Backups'
            return ok(undefined)
        },

        selectFolder: async (): Promise<AppResult<string | null>> => {
            const selected = '/mock/google-drive-sync-folder'
            this.backupStatusState.localFolder = selected
            return ok(selected)
        },
    }

    // -----------------------------------------------------------------------
    // Domain AI
    // -----------------------------------------------------------------------

    public readonly ai: AiClient = {
        getConfig: async (): Promise<AppResult<AiConfigStatus>> => {
            return ok({ ...this.aiConfigState })
        },

        saveConfig: async (payload: AiConfigPayload): Promise<AppResult<void>> => {
            this.aiConfigState = {
                configured: true,
                model: payload.model,
                baseUrl: payload.baseUrl ?? null,
                keyHint:
                    payload.apiKey.length > 6
                        ? `${payload.apiKey.slice(0, 3)}...${payload.apiKey.slice(-3)}`
                        : '***',
            }
            return ok(undefined)
        },

        deleteConfig: async (): Promise<AppResult<void>> => {
            this.aiConfigState = {
                configured: false,
                model: null,
                baseUrl: null,
                keyHint: null,
            }
            return ok(undefined)
        },

        analyzeJournal: async (
            _filter?: TradeFilterPayload
        ): Promise<AppResult<JournalAnalysisResult>> => {
            return ok({
                summary: 'Analisis mock AI: Pola eksekusi konsisten dengan disiplin risiko baik.',
                weaknesses: ['Kecenderungan exit terlalu dini sebelum mencapai target planned RR.'],
                suggestions: ['Pertahankan trailing stop dinamis alih-alih market close manual.'],
                metrics: [
                    { label: 'Win Rate', value: '62%' },
                    { label: 'Avg RR', value: '1.8' },
                ],
            })
        },
    }

    // -----------------------------------------------------------------------
    // Domain System
    // -----------------------------------------------------------------------

    public readonly system: SystemClient = {
        getAppHealth: async (): Promise<AppResult<AppHealth>> => {
            return ok({
                ok: true,
                details: [
                    '[ok] InMemoryMockAdapter aktif',
                    '[ok] SQLite in-memory virtual state siap',
                ],
                dbPath: ':memory:',
            })
        },

        getAppVersion: async (): Promise<AppResult<string>> => {
            return ok('1.8.3-mock')
        },

        checkForUpdates: async (): Promise<AppResult<AppUpdateInfo>> => {
            return ok({
                hasUpdate: false,
                currentVersion: '1.8.3-mock',
                latestVersion: '1.8.3-mock',
                releaseUrl: 'https://github.com/KaleksananBarqi/nitirekso/releases',
            })
        },

        openExternalUrl: async (_url: string): Promise<AppResult<void>> => {
            return ok(undefined)
        },

        getBtcKlines: async (payload: {
            startTime: number
            endTime: number
        }): Promise<AppResult<BtcKlinePoint[]>> => {
            const step = 3600 * 1000 // 1 jam
            const points: BtcKlinePoint[] = []
            let curr = payload.startTime
            let price = 65000
            while (curr <= payload.endTime && points.length < 500) {
                points.push({ time: Math.floor(curr / 1000), close: price })
                price += (Math.random() - 0.48) * 200
                curr += step
            }
            return ok(points)
        },

        getLogs: async (limit?: number): Promise<AppResult<LogEntry[]>> => {
            const logs = [...this.logsState]
            if (limit && limit > 0) {
                return ok(logs.slice(-limit))
            }
            return ok(logs)
        },

        clearLogs: async (): Promise<AppResult<void>> => {
            this.logsState = []
            return ok(undefined)
        },

        openLogFolder: async (): Promise<AppResult<void>> => {
            return ok(undefined)
        },

        log: async (
            level: 'INFO' | 'WARN' | 'ERROR',
            message: string,
            details?: unknown
        ): Promise<void> => {
            const entry: LogEntry = {
                timestamp: new Date().toISOString(),
                level,
                message,
                details: details
                    ? typeof details === 'string'
                        ? details
                        : JSON.stringify(details)
                    : undefined,
                raw: `[${new Date().toISOString()}] [${level}] ${message}`,
            }
            this.logsState.push(entry)
        },

        logInfo: async (message: string, details?: unknown): Promise<void> => {
            await this.system.log('INFO', message, details)
        },

        logWarn: async (message: string, details?: unknown): Promise<void> => {
            await this.system.log('WARN', message, details)
        },

        logError: async (message: string, details?: unknown): Promise<void> => {
            await this.system.log('ERROR', message, details)
        },
    }
}
