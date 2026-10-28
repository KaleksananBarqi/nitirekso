import { describe, expect, it } from 'vitest'
import { ShareAnalyticsModal } from './ShareAnalyticsModal'
import { AnalyticsCard } from './share/AnalyticsCard'

describe('ShareAnalyticsModal Module Interface', () => {
    it('mengekspor komponen ShareAnalyticsModal sebagai fungsi React', () => {
        expect(typeof ShareAnalyticsModal).toBe('function')
    })

    it('mengekspor komponen AnalyticsCard sebagai fungsi React pratinjau DOM', () => {
        expect(typeof AnalyticsCard).toBe('function')
    })
})
