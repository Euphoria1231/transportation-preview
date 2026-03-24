import { useEffect, useState } from 'react'

import { CanvasScene } from '../components/CanvasScene'
import { ControlPanel } from '../components/ControlPanel'
import { EventFeed } from '../components/EventFeed'
import { StatusPanel } from '../components/StatusPanelLight'
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
    <main className="grid h-screen grid-cols-[minmax(0,1fr)_360px] gap-5 overflow-hidden p-5">
      <section className="min-h-0">
        {loading ? (
          <div className="flex h-full items-center justify-center rounded-[28px] border border-slate-200 bg-white/80 text-slate-600 shadow-xl shadow-slate-200/70">
            正在加载路网...
          </div>
        ) : fetchError ? (
          <div className="flex h-full items-center justify-center rounded-[28px] border border-rose-200 bg-rose-50 px-8 text-center text-rose-700 shadow-xl shadow-rose-100/80">
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

      <aside className="panel-scroll flex min-h-0 flex-col gap-4 overflow-y-auto pr-1">
        <ControlPanel
          busy={busy}
          onPause={() => runCommand('pause')}
          onReset={() => runCommand('reset')}
          onResetViewport={() => setViewportResetTick((tick) => tick + 1)}
          onStart={() => runCommand('start')}
          onStep={() => runCommand('step')}
          running={simulation?.running ?? false}
        />
        <StatusPanel config={config} connectionStatus={connectionStatus} simulation={simulation} />
        <EventFeed event={simulation?.lastLaneChangeEvent ?? null} />
      </aside>
    </main>
  )
}
