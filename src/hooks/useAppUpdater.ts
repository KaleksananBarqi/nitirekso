import { useEffect, useState } from 'react'
import type { UpdateState } from '../lib/update/updateHelpers'
import { updateService } from '../lib/update/updateService'

/** Hook reaktif untuk memantau dan mengontrol status pembaruan aplikasi nitirekso. */
export function useAppUpdater(): UpdateState {
    const [state, setState] = useState<UpdateState>(() => updateService.getState())

    useEffect(() => {
        return updateService.subscribe(setState)
    }, [])

    return state
}
