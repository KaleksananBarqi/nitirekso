import { describe, expect, it } from 'vitest'
import {
    SharePnlModal,
    getGradientDimmingStyle,
    applyCanvasDimming
} from './SharePnlModal'
import {
    getGradientDimmingStyle as originalGetGradientDimmingStyle,
    applyCanvasDimming as originalApplyCanvasDimming
} from '../lib/share'

describe('SharePnlModal Module Interface', () => {
    it('mengekspor komponen SharePnlModal sebagai fungsi React', () => {
        expect(typeof SharePnlModal).toBe('function')
    })

    it('mere-ekspor getGradientDimmingStyle dengan referensi yang identik ke mesin share', () => {
        expect(getGradientDimmingStyle).toBe(originalGetGradientDimmingStyle)
        const style = getGradientDimmingStyle(50, 'top-right')
        expect(style.background).toContain('linear-gradient(to top right')
    })

    it('mere-ekspor applyCanvasDimming dengan referensi yang identik ke mesin share', () => {
        expect(applyCanvasDimming).toBe(originalApplyCanvasDimming)
    })
})
