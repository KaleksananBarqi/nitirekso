import type { CSSProperties } from 'react'
import type { BgDimmingDirection } from '../shareSettings'

/**
 * Menghasilkan objek CSSProperties untuk perenderan gradien dimming DOM.
 */
export function getGradientDimmingStyle(
    bgDimming: number,
    direction: BgDimmingDirection = 'uniform'
): CSSProperties {
    const baseOpacity = bgDimming / 100
    const darkOpacity = Math.min(0.96, baseOpacity * 1.15)
    const lightOpacity = Math.max(0.12, baseOpacity * 0.28)

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
