import { describe, expect, it } from 'vitest'
import { SharePnlModal } from './SharePnlModal'
import * as SharePnlModalModule from './SharePnlModal'
import {
    getGradientDimmingStyle,
    applyCanvasDimming
} from '../lib/share'

describe('SharePnlModal Module Interface', () => {
    it('mengekspor komponen SharePnlModal sebagai fungsi React', () => {
        expect(typeof SharePnlModal).toBe('function')
    })

    it('memastikan getGradientDimmingStyle dan applyCanvasDimming tidak lagi di-reexport dari SharePnlModal (decoupling bersih)', () => {
        expect((SharePnlModalModule as any).getGradientDimmingStyle).toBeUndefined()
        expect((SharePnlModalModule as any).applyCanvasDimming).toBeUndefined()
    })

    it('memastikan pustaka share mandiri menyediakan fungsi gradien dimming', () => {
        const style = getGradientDimmingStyle(50, 'top-right')
        expect(style.background).toContain('linear-gradient(to top right')
        expect(typeof applyCanvasDimming).toBe('function')
    })
})
