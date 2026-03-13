import { useEffect, useState } from 'react'

import { CanvasScene } from '../components/CanvasScene'
import { ControlPanel } from '../components/ControlPanel'
import { EventFeed } from '../components/EventFeed'
import { StatusPanel } from '../components/StatusPanel'
import { useSimulationStream } from '../hooks/useSimulationStream'
import { fetchConfig, sendSimulationCommand } from '../services/api'
import type { NetworkConfig } from '../types/simulation'

export function SimulationView() {
  const [config, setConfig] = useState<NetworkConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [viewportResetTick, setViewportResetTick] = useState(0)
  const { simulation, connectionStatus, snapshotTick } = useSimulationStream()

  useEffect(() => {
    let mounted = true

    const loadConfig = async () => {
      try {
        const nextConfig = await fetchConfig()
        if (!mounted) {
          return
        }
        setConfig(nextConfig)
      } catch (error) {
        if (!mounted) {
          return
        }
        setFetchError(error instanceof Error ? error.message : 'Failed to load config.')
      } finally {
        if (mounted) {
          setLoading(false)
        }
      }
    }

    void loadConfig()
    return () => {
      mounted = false
    }
  }, [])

  const runCommand = async (action: 'start' | 'pause' | 'reset' | 'step') => {
    setBusy(true)
    try {
      await sendSimulationCommand(action)
      if (action === 'reset') {
        setViewportResetTick((tick) => tick + 1)
      }
    } catch (error) {
      setFetchError(error instanceof Error ? error.message : 'Command failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="grid min-h-screen grid-cols-[minmax(0,1fr)_360px] gap-5 p-5">
      <section className="min-h-[calc(100vh-2.5rem)]">
        {loading ? (
          <div className="flex h-full items-center justify-center rounded-[28px] border border-slate-800/70 bg-slate-950/70 text-slate-300">
            Loading network...
          </div>
        ) : fetchError ? (
          <div className="flex h-full items-center justify-center rounded-[28px] border border-rose-500/40 bg-rose-500/10 px-8 text-center text-rose-100">
            {fetchError}
          </div>
        ) : (
          <CanvasScene
            config={config}
            key={viewportResetTick}
            snapshotTick={snapshotTick}
            vehicles={simulation?.vehicles ?? []}
          />
        )}
      </section>

      <aside className="flex min-h-[calc(100vh-2.5rem)] flex-col gap-4">
        <ControlPanel
          busy={busy}
          onPause={() => runCommand('pause')}
          onReset={() => runCommand('reset')}
          onResetViewport={() => setViewportResetTick((tick) => tick + 1)}
          onStart={() => runCommand('start')}
          onStep={() => runCommand('step')}
          running={simulation?.running ?? false}
        />
        <StatusPanel connectionStatus={connectionStatus} simulation={simulation} />
        <EventFeed event={simulation?.lastLaneChangeEvent ?? null} />
      </aside>
    </main>
  )
}
