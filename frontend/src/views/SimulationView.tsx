import { useEffect, useState } from 'react'

import { CanvasScene } from '../components/CanvasScene'
import { ControlPanel } from '../components/ControlPanel'
import { EventFeed } from '../components/EventFeed'
import { InspectorPanel } from '../components/InspectorPanel'
import { StatusPanel } from '../components/StatusPanelLight'
import { useSimulationStream } from '../hooks/useSimulationStream'
import { fetchConfig, sendSimulationCommand } from '../services/api'
import {
  appendSnapshot,
  deriveLaneMetrics,
  exportVehicleCsv,
  findSnapshotAt,
  getRoutePath,
  getVehicleTrail,
} from '../services/simulationMetrics'
import type { NetworkConfig, SimulationSnapshot } from '../types/simulation'

export function SimulationView() {
  const [config, setConfig] = useState<NetworkConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [viewportResetTick, setViewportResetTick] = useState(0)
  const [history, setHistory] = useState<SimulationSnapshot[]>([])
  const [replayMode, setReplayMode] = useState(false)
  const [replayPercent, setReplayPercent] = useState(1)
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null)
  const [selectedLaneId, setSelectedLaneId] = useState<string | null>(null)
  const [trailSeconds, setTrailSeconds] = useState(20)
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

  useEffect(() => {
    if (!simulation) {
      return
    }

    setHistory((current) => appendSnapshot(current, simulation))
    if (!replayMode) {
      setReplayPercent(1)
    }
  }, [replayMode, simulation])

  useEffect(() => {
    if (replayMode) {
      return
    }

    if (!simulation?.vehicles.some((vehicle) => vehicle.id === selectedVehicleId)) {
      setSelectedVehicleId(null)
    }
  }, [replayMode, selectedVehicleId, simulation?.vehicles])

  useEffect(() => {
    if (selectedLaneId && !config?.lanes.some((lane) => lane.id === selectedLaneId)) {
      setSelectedLaneId(null)
    }
  }, [config?.lanes, selectedLaneId])

  const runCommand = async (action: 'start' | 'pause' | 'reset' | 'step') => {
    setBusy(true)
    try {
      await sendSimulationCommand(action)
      if (action === 'reset') {
        setViewportResetTick((tick) => tick + 1)
        setHistory([])
        setReplayMode(false)
        setReplayPercent(1)
        setSelectedVehicleId(null)
        setSelectedLaneId(null)
      }
    } catch (error) {
      setFetchError(error instanceof Error ? error.message : 'Command failed.')
    } finally {
      setBusy(false)
    }
  }

  const replaySnapshot = replayMode ? findSnapshotAt(history, replayPercent) : null
  const visibleSimulation = replaySnapshot?.state ?? simulation
  const visibleVehicles = visibleSimulation?.vehicles ?? []
  const laneMetrics = deriveLaneMetrics(config, visibleVehicles)
  const selectedVehicle = selectedVehicleId
    ? visibleVehicles.find((vehicle) => vehicle.id === selectedVehicleId) ?? null
    : null
  const selectedLane = selectedLaneId
    ? laneMetrics.find((lane) => lane.laneId === selectedLaneId) ?? null
    : null
  const vehicleTrail = getVehicleTrail(
    history,
    selectedVehicleId,
    trailSeconds,
    replaySnapshot?.capturedAt ?? null,
  )
  const routePath = getRoutePath(config, selectedVehicle)
  const replayTimeLabel = visibleSimulation ? `${visibleSimulation.simTime.toFixed(1)} s` : '--'

  const handleVehicleSelect = (vehicleId: string | null) => {
    setSelectedVehicleId(vehicleId)
    if (vehicleId) {
      setSelectedLaneId(null)
    }
  }

  const handleLaneSelect = (laneId: string | null) => {
    setSelectedLaneId(laneId)
    if (laneId) {
      setSelectedVehicleId(null)
    }
  }

  const handleExportVehicle = () => {
    if (!selectedVehicleId) {
      return
    }

    exportVehicleCsv(history, selectedVehicleId)
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
            onLaneSelect={handleLaneSelect}
            onVehicleSelect={handleVehicleSelect}
            routePath={routePath}
            selectedLaneId={selectedLaneId}
            selectedVehicleId={selectedVehicleId}
            vehicleTrail={vehicleTrail}
            vehicles={visibleVehicles}
          />
        )}
      </section>

      <aside className="panel-scroll flex min-h-0 flex-col gap-4 overflow-y-auto pr-1">
        <ControlPanel
          busy={busy}
          historyCount={history.length}
          onPause={() => runCommand('pause')}
          onReplayModeChange={setReplayMode}
          onReplayPercentChange={setReplayPercent}
          onReset={() => runCommand('reset')}
          onResetViewport={() => setViewportResetTick((tick) => tick + 1)}
          onStart={() => runCommand('start')}
          onStep={() => runCommand('step')}
          replayMode={replayMode}
          replayPercent={replayPercent}
          replayTimeLabel={replayTimeLabel}
          running={visibleSimulation?.running ?? false}
        />
        <InspectorPanel
          onExportVehicle={handleExportVehicle}
          onTrailSecondsChange={setTrailSeconds}
          selectedLane={selectedLane}
          selectedVehicle={selectedVehicle}
          trailPointCount={vehicleTrail.length}
          trailSeconds={trailSeconds}
        />
        <StatusPanel config={config} connectionStatus={connectionStatus} simulation={visibleSimulation} />
        <EventFeed event={visibleSimulation?.lastLaneChangeEvent ?? null} />
      </aside>
    </main>
  )
}
