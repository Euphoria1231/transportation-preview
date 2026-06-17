import { useEffect, useState } from 'react'

import { AnalysisPanel } from '../components/AnalysisPanel'
import { CanvasScene } from '../components/CanvasScene'
import { ControlPanel } from '../components/ControlPanel'
import { EventFeed } from '../components/EventFeed'
import { InspectorPanel } from '../components/InspectorPanel'
import { PresequencingPanel } from '../components/PresequencingPanel'
import { ReportPanel } from '../components/ReportPanel'
import { StatusPanel } from '../components/StatusPanelLight'
import { useSimulationStream } from '../hooks/useSimulationStream'
import {
  fetchConfig,
  fetchCurrentScenarioConfig,
  fetchLatestLaneMetrics,
  sendSimulationCommand,
} from '../services/api'
import {
  appendSnapshot,
  deriveLaneMetrics,
  exportVehicleCsv,
  findSnapshotAt,
  getRoutePath,
  getVehicleTrail,
} from '../services/simulationMetrics'
import type {
  NetworkConfig,
  HeatmapMode,
  LaneMetric,
  ScenarioConfig,
  ScenarioFlowPlan,
  SimulationSnapshot,
} from '../types/simulation'

interface SimulationViewProps {
  onBackToSetup?: () => void
  scenarioConfig?: ScenarioConfig | null
  scenarioFlowPlan?: ScenarioFlowPlan | null
}

export function SimulationView({
  onBackToSetup,
  scenarioConfig,
  scenarioFlowPlan,
}: SimulationViewProps) {
  const [config, setConfig] = useState<NetworkConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [loadedScenarioConfig, setLoadedScenarioConfig] = useState<ScenarioConfig | null>(
    scenarioConfig ?? null,
  )
  const [loadedScenarioFlowPlan, setLoadedScenarioFlowPlan] = useState<ScenarioFlowPlan | null>(
    scenarioFlowPlan ?? null,
  )
  const [viewportResetTick, setViewportResetTick] = useState(0)
  const [history, setHistory] = useState<SimulationSnapshot[]>([])
  const [replayMode, setReplayMode] = useState(false)
  const [replayPercent, setReplayPercent] = useState(1)
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null)
  const [selectedLaneId, setSelectedLaneId] = useState<string | null>(null)
  const [trailSeconds, setTrailSeconds] = useState(20)
  const [activePanel, setActivePanel] = useState<SidePanelTab>('control')
  const [heatmapMode, setHeatmapMode] = useState<HeatmapMode | null>(null)
  const [serverLaneMetrics, setServerLaneMetrics] = useState<LaneMetric[]>([])
  const [analysisRefreshKey, setAnalysisRefreshKey] = useState(0)
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
    if (scenarioConfig) {
      setLoadedScenarioConfig(scenarioConfig)
    }
    if (scenarioFlowPlan) {
      setLoadedScenarioFlowPlan(scenarioFlowPlan)
    }
  }, [scenarioConfig, scenarioFlowPlan])

  useEffect(() => {
    if (scenarioConfig && scenarioFlowPlan) {
      return
    }

    let mounted = true
    const loadScenario = async () => {
      try {
        const response = await fetchCurrentScenarioConfig()
        if (!mounted) {
          return
        }
        setLoadedScenarioConfig(response.config)
        setLoadedScenarioFlowPlan(response.flowPlan)
      } catch {
        if (!mounted) {
          return
        }
        setLoadedScenarioConfig(null)
        setLoadedScenarioFlowPlan(null)
      }
    }

    void loadScenario()
    return () => {
      mounted = false
    }
  }, [scenarioConfig, scenarioFlowPlan])

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

  useEffect(() => {
    let mounted = true

    const loadLaneMetrics = async () => {
      try {
        const metrics = await fetchLatestLaneMetrics()
        if (mounted) {
          setServerLaneMetrics(metrics)
        }
      } catch {
        if (mounted) {
          setServerLaneMetrics([])
        }
      }
    }

    void loadLaneMetrics()
    const timer = window.setInterval(() => void loadLaneMetrics(), 1000)
    return () => {
      mounted = false
      window.clearInterval(timer)
    }
  }, [])

  const clearLocalSimulationState = () => {
    setViewportResetTick((tick) => tick + 1)
    setHistory([])
    setReplayMode(false)
    setReplayPercent(1)
    setSelectedVehicleId(null)
    setSelectedLaneId(null)
    setServerLaneMetrics([])
    setAnalysisRefreshKey((key) => key + 1)
  }

  const runCommand = async (action: 'start' | 'pause' | 'reset' | 'step') => {
    setBusy(true)
    try {
      await sendSimulationCommand(action)
      setAnalysisRefreshKey((key) => key + 1)
      if (action === 'reset') {
        clearLocalSimulationState()
      }
    } catch (error) {
      setFetchError(error instanceof Error ? error.message : 'Command failed.')
    } finally {
      setBusy(false)
    }
  }

  const handleBackToSetup = async () => {
    if (!onBackToSetup) {
      return
    }

    setBusy(true)
    try {
      await sendSimulationCommand('reset')
      clearLocalSimulationState()
      onBackToSetup()
    } catch (error) {
      setFetchError(error instanceof Error ? error.message : 'Command failed.')
    } finally {
      setBusy(false)
    }
  }

  const replaySnapshot = replayMode ? findSnapshotAt(history, replayPercent) : null
  const visibleSimulation = replaySnapshot?.state ?? simulation
  const visibleVehicles = visibleSimulation?.vehicles ?? []
  const visiblePresequencingZones = visibleSimulation?.presequencingZones ?? []
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
  const visibleScenarioConfig = scenarioConfig ?? loadedScenarioConfig
  const visibleScenarioFlowPlan = scenarioFlowPlan ?? loadedScenarioFlowPlan

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
            heatmapMode={heatmapMode}
            laneMetrics={serverLaneMetrics}
            key={viewportResetTick}
            presequencingZones={visiblePresequencingZones}
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

      <aside className="flex min-h-0 flex-col gap-3 overflow-hidden">
        <PanelTabs activePanel={activePanel} onPanelChange={setActivePanel} />
        <div className="panel-scroll min-h-0 flex-1 overflow-y-auto pr-1">
          {activePanel === 'control' ? (
            <div className="space-y-4">
              <ScenarioSummaryPanel
                busy={busy}
                config={visibleScenarioConfig}
                flowPlan={visibleScenarioFlowPlan}
                onBackToSetup={onBackToSetup ? handleBackToSetup : undefined}
              />
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
            </div>
          ) : null}

          {activePanel === 'inspector' ? (
            <InspectorPanel
              onExportVehicle={handleExportVehicle}
              onTrailSecondsChange={setTrailSeconds}
              selectedLane={selectedLane}
              selectedVehicle={selectedVehicle}
              trailPointCount={vehicleTrail.length}
              trailSeconds={trailSeconds}
            />
          ) : null}

          {activePanel === 'metrics' ? (
            <div className="space-y-4">
              <StatusPanel config={config} connectionStatus={connectionStatus} simulation={visibleSimulation} />
              <PresequencingPanel zones={visiblePresequencingZones} />
              <EventFeed event={visibleSimulation?.lastLaneChangeEvent ?? null} />
            </div>
          ) : null}

          {activePanel === 'analysis' ? (
            <AnalysisPanel
              heatmapMode={heatmapMode}
              onHeatmapModeChange={setHeatmapMode}
              refreshKey={analysisRefreshKey}
            />
          ) : null}

          {activePanel === 'report' ? <ReportPanel refreshKey={analysisRefreshKey} /> : null}
        </div>
      </aside>
    </main>
  )
}

type SidePanelTab = 'control' | 'inspector' | 'metrics' | 'analysis' | 'report'

const SIDE_PANEL_TABS: Array<{ key: SidePanelTab; label: string }> = [
  { key: 'control', label: '控制' },
  { key: 'inspector', label: '对象详情' },
  { key: 'metrics', label: '实时指标' },
  { key: 'analysis', label: '分析' },
  { key: 'report', label: '报告' },
]

function PanelTabs({
  activePanel,
  onPanelChange,
}: {
  activePanel: SidePanelTab
  onPanelChange: (panel: SidePanelTab) => void
}) {
  return (
    <div className="grid grid-cols-5 gap-1 rounded-2xl border border-slate-200 bg-white/90 p-1 shadow-xl shadow-slate-200/70 backdrop-blur">
      {SIDE_PANEL_TABS.map((tab) => (
        <button
          className={`min-h-10 rounded-xl px-2 text-xs font-semibold transition ${
            activePanel === tab.key
              ? 'bg-slate-900 text-white shadow-md shadow-slate-300'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
          key={tab.key}
          onClick={() => onPanelChange(tab.key)}
          type="button"
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}

function ScenarioSummaryPanel({
  config,
  flowPlan,
  busy,
  onBackToSetup,
}: {
  config: ScenarioConfig | null
  flowPlan: ScenarioFlowPlan | null
  busy: boolean
  onBackToSetup?: () => Promise<void>
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-xl shadow-slate-200/70 backdrop-blur">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-emerald-700">SCENARIO</p>
          <h2 className="text-lg font-semibold text-slate-900">当前场景</h2>
        </div>
        {onBackToSetup ? (
          <button
            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
            disabled={busy}
            onClick={() => void onBackToSetup()}
            type="button"
          >
            重新配置
          </button>
        ) : null}
      </div>

      {config && flowPlan ? (
        <div className="grid grid-cols-2 gap-3">
          <ScenarioMetric label="总流量" value={`${Math.round(flowPlan.totalFlow)} veh/h`} />
          <ScenarioMetric label="CAV" value={`${Math.round(config.cavPenetrationRate * 100)}%`} />
          <ScenarioMetric label="主路" value={`${Math.round(config.mainlineRatio * 100)}%`} />
          <ScenarioMetric label="出口" value={`${Math.round(config.exitRatio * 100)}%`} />
          <ScenarioMetric label="限速" value={`${config.speedLimitKmh.toFixed(0)} km/h`} />
          <ScenarioMetric label="时长" value={formatDuration(config.simulationDuration)} />
          <ScenarioMetric label="方案" value={formatControlMode(config)} />
        </div>
      ) : (
        <p className="text-sm text-slate-500">场景参数加载中。</p>
      )}
    </section>
  )
}

function ScenarioMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/90 px-3 py-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-2 text-base font-semibold text-slate-900">{value}</p>
    </div>
  )
}

function formatDuration(seconds: number) {
  if (seconds >= 3600) {
    return `${Math.round(seconds / 3600)} h`
  }
  return `${seconds} s`
}

function formatControlMode(config: ScenarioConfig) {
  if (config.enableCavLaneChangeControl && !config.disableSumoLaneChangeControl) {
    return '协同调控'
  }
  if (!config.enableCavLaneChangeControl && !config.disableSumoLaneChangeControl) {
    return '无控对照'
  }
  return config.enableCavLaneChangeControl ? '协同调控' : '换道关闭'
}
