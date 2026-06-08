import { useEffect, useMemo, useState } from 'react'

import type { ConnectionStatus, SimulationState } from '../types/simulation'

interface StreamState {
  simulation: SimulationState | null
  connectionStatus: ConnectionStatus
  snapshotTick: number
}

export function useSimulationStream(): StreamState {
  const [simulation, setSimulation] = useState<SimulationState | null>(null)
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('connecting')
  const [snapshotTick, setSnapshotTick] = useState(0)

  useEffect(() => {
    const source = new EventSource('/api/stream')

    const handleState = (event: MessageEvent<string>) => {
      const nextState = JSON.parse(event.data) as SimulationState
      setSimulation(nextState)
      setSnapshotTick(Date.now())
    }

    source.addEventListener('state', handleState as EventListener)
    source.onopen = () => setConnectionStatus('open')
    source.onerror = () => setConnectionStatus('error')

    return () => {
      source.removeEventListener('state', handleState as EventListener)
      source.close()
    }
  }, [])

  return useMemo(
    () => ({
      simulation,
      connectionStatus,
      snapshotTick,
    }),
    [simulation, connectionStatus, snapshotTick],
  )
}
