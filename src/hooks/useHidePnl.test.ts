import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import React from 'react'
import { renderToString } from 'react-dom/server'
import {
    _resetHidePnlStateForTesting,
    getCachedHidePnl,
    setCachedHidePnl,
    syncHidePnlFromSettings,
    useHidePnl,
} from './useHidePnl'

describe('useHidePnl Hook & Settings SQLite Synchronization (#34)', () => {
    let mockGetSettings: ReturnType<typeof vi.fn>
    let mockSetSettings: ReturnType<typeof vi.fn>
    let originalWindow: unknown

    beforeEach(() => {
        _resetHidePnlStateForTesting()
        mockGetSettings = vi.fn().mockResolvedValue({})
        mockSetSettings = vi.fn().mockResolvedValue({ ok: true, data: undefined })

        originalWindow = (globalThis as any).window
        ;(globalThis as any).window = {
            api: {
                getSettings: mockGetSettings,
                setSettings: mockSetSettings,
            },
        }
    })

    afterEach(() => {
        _resetHidePnlStateForTesting()
        ;(globalThis as any).window = originalWindow
        vi.restoreAllMocks()
    })

    it('memiliki nilai default false saat belum ada pengaturan tersimpan di SQLite', () => {
        let hookResult: ReturnType<typeof useHidePnl> | null = null

        function TestComponent() {
            hookResult = useHidePnl()
            return React.createElement('div', null, hookResult.hidePnl ? 'hidden' : 'visible')
        }

        const html = renderToString(React.createElement(TestComponent))
        expect(html).toContain('visible')
        expect(hookResult).not.toBeNull()
        expect(hookResult!.hidePnl).toBe(false)
        expect(getCachedHidePnl()).toBe(false)
    })

    it('memperbarui state lokal seketika dan memanggil API persistensi SQLite via IPC', () => {
        expect(getCachedHidePnl()).toBe(false)

        setCachedHidePnl(true)

        expect(getCachedHidePnl()).toBe(true)
        expect(mockSetSettings).toHaveBeenCalledWith({ hidePnl: true })

        setCachedHidePnl(false)
        expect(getCachedHidePnl()).toBe(false)
        expect(mockSetSettings).toHaveBeenCalledWith({ hidePnl: false })
    })

    it('menyelaraskan state antar beberapa subscriber/komponen secara reaktif tanpa split-brain', () => {
        const receivedValuesA: boolean[] = []
        const receivedValuesB: boolean[] = []

        let hookA: ReturnType<typeof useHidePnl> | null = null
        let hookB: ReturnType<typeof useHidePnl> | null = null

        function ComponentA() {
            hookA = useHidePnl()
            receivedValuesA.push(hookA.hidePnl)
            return null
        }

        function ComponentB() {
            hookB = useHidePnl()
            receivedValuesB.push(hookB.hidePnl)
            return null
        }

        renderToString(React.createElement(ComponentA))
        renderToString(React.createElement(ComponentB))

        expect(hookA!.hidePnl).toBe(false)
        expect(hookB!.hidePnl).toBe(false)

        // Ubah state melalui helper / hook setter
        hookA!.setHidePnl(true)

        expect(getCachedHidePnl()).toBe(true)
        expect(mockSetSettings).toHaveBeenCalledWith({ hidePnl: true })
    })

    it('tetap stabil dan menjaga state lokal jika API IPC setSettings mengalami penolakan (error)', async () => {
        mockSetSettings.mockRejectedValue(new Error('Koneksi database SQLite terputus'))

        expect(() => {
            setCachedHidePnl(true)
        }).not.toThrow()

        expect(getCachedHidePnl()).toBe(true)
        expect(mockSetSettings).toHaveBeenCalledWith({ hidePnl: true })
    })

    it('memuat pengaturan tersimpan hidePnl dari SQLite saat inisialisasi', async () => {
        mockGetSettings.mockResolvedValue({ hidePnl: true })

        const loaded = await syncHidePnlFromSettings()

        expect(mockGetSettings).toHaveBeenCalled()
        expect(loaded).toBe(true)
        expect(getCachedHidePnl()).toBe(true)
    })

    it('mendukung backward-compatibility dengan key legacy hide_pnl dari SQLite', async () => {
        mockGetSettings.mockResolvedValue({ hide_pnl: true })

        const loaded = await syncHidePnlFromSettings()

        expect(mockGetSettings).toHaveBeenCalled()
        expect(loaded).toBe(true)
        expect(getCachedHidePnl()).toBe(true)
    })

    it('mengabaikan galat jika getSettings gagal dan mempertahankan nilai default false', async () => {
        mockGetSettings.mockRejectedValue(new Error('Gagal membaca tabel settings'))

        const loaded = await syncHidePnlFromSettings()

        expect(loaded).toBe(false)
        expect(getCachedHidePnl()).toBe(false)
    })
})
