import type { CSSProperties } from 'react'
import type { BgDimmingDirection } from '../shareSettings'

export interface DimmingOpacities {
    baseOpacity: number
    darkOpacity: number
    lightOpacity: number
}

/**
 * Menghitung nilai opacity relatif (base, dark, light) dari persentase bgDimming (0-100).
 * Digunakan bersama oleh perenderan DOM CSS dan kanvas 2D untuk konsistensi visual.
 */
export function computeDimmingOpacities(bgDimming: number): DimmingOpacities {
    const baseOpacity = Math.max(0, Math.min(1, bgDimming / 100))
    const darkOpacity = Math.min(0.96, baseOpacity * 1.15)
    const lightOpacity = Math.max(0.12, baseOpacity * 0.28)
    return { baseOpacity, darkOpacity, lightOpacity }
}

/**
 * Menghasilkan objek CSSProperties untuk perenderan gradien dimming DOM.
 */
export function getGradientDimmingStyle(
    bgDimming: number,
    direction: BgDimmingDirection = 'uniform'
): CSSProperties {
    const { baseOpacity, darkOpacity, lightOpacity } = computeDimmingOpacities(bgDimming)

    switch (direction) {
        case 'top-right':
            return {
                background: `linear-gradient(to top right, rgba(0,0,0,${darkOpacity}) 0%, rgba(0,0,0,${baseOpacity}) 45%, rgba(0,0,0,${lightOpacity}) 100%)`
            }
        case 'top-left':
            return {
                background: `linear-gradient(to top left, rgba(0,0,0,${darkOpacity}) 0%, rgba(0,0,0,${baseOpacity}) 45%, rgba(0,0,0,${lightOpacity}) 100%)`
            }
        case 'bottom-right':
            return {
                background: `linear-gradient(to bottom right, rgba(0,0,0,${darkOpacity}) 0%, rgba(0,0,0,${baseOpacity}) 45%, rgba(0,0,0,${lightOpacity}) 100%)`
            }
        case 'bottom-left':
            return {
                background: `linear-gradient(to bottom left, rgba(0,0,0,${darkOpacity}) 0%, rgba(0,0,0,${baseOpacity}) 45%, rgba(0,0,0,${lightOpacity}) 100%)`
            }
        case 'left':
            return {
                background: `linear-gradient(to right, rgba(0,0,0,${lightOpacity}) 0%, rgba(0,0,0,${darkOpacity}) 100%)`
            }
        case 'right':
            return {
                background: `linear-gradient(to left, rgba(0,0,0,${lightOpacity}) 0%, rgba(0,0,0,${darkOpacity}) 100%)`
            }
        case 'uniform':
        default:
            return {
                backgroundColor: `rgba(0, 0, 0, ${baseOpacity})`
            }
    }
}
