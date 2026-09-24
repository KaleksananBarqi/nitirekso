import '@testing-library/jest-dom'
import { vi } from 'vitest'

// Mock matchMedia
Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation(query => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(), // Deprecated
        removeListener: vi.fn(), // Deprecated
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
    })),
})

// Mock window.api
window.api = {
    getAppHealth: vi.fn().mockResolvedValue({ dbPath: '/mock/path' }),
    logInfo: vi.fn().mockResolvedValue(undefined),
    logError: vi.fn().mockResolvedValue(undefined),
    logWarn: vi.fn().mockResolvedValue(undefined),
    getCredentialStatuses: vi.fn().mockResolvedValue([{ configured: true }]),
    runSync: vi.fn().mockResolvedValue({ ok: true }),
    getSettings: vi.fn().mockResolvedValue({ hide_pnl: false }),
    setSettings: vi.fn().mockResolvedValue(undefined),
    listTrades: vi.fn().mockResolvedValue([]),
    getTradeMeta: vi.fn().mockResolvedValue({}),
} as any
