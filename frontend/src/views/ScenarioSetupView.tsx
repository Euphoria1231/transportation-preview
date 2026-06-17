import { useEffect, useMemo, useState } from 'react'
import {
  applyScenarioConfig,
  fetchDefaultScenarioConfig,
} from '../services/api'
import type {
  ScenarioApplyResponse,
  ScenarioConfig,
  ScenarioFlowPlan,
  ScenarioPreset,
} from '../types/simulation'

interface ScenarioSetupViewProps {
  initialConfig?: ScenarioConfig | null
  onScenarioApplied: (response: ScenarioApplyResponse) => void
}

const DURATION_OPTIONS = [300, 600, 1200, 3600]

const PRESETS: Array<{
  id: ScenarioPreset
  label: string
  description: string
  values: Partial<ScenarioConfig>
}> = [
  {
    id: 'balanced',
    label: '均衡场景',
    description: '主路与匝道保持常规比例',
    values: {
      totalFlow: 3000,
      cavPenetrationRate: 0.5,
      mainlineRatio: 0.75,
      exitRatio: 0.2,
    },
  },
  {
    id: 'high-flow',
    label: '高流量',
    description: '接近容量压力的总流量',
    values: {
      totalFlow: 8000,
      cavPenetrationRate: 0.5,
      mainlineRatio: 0.78,
      exitRatio: 0.2,
    },
  },
  {
    id: 'high-cav',
    label: '高 CAV',
    description: '较高联网车辆渗透率',
    values: {
      totalFlow: 3000,
      cavPenetrationRate: 0.8,
      mainlineRatio: 0.75,
      exitRatio: 0.2,
    },
  },
  {
    id: 'low-cav',
    label: '低 CAV',
    description: '以人工驾驶车辆为主',
    values: {
      totalFlow: 3000,
      cavPenetrationRate: 0.2,
      mainlineRatio: 0.75,
      exitRatio: 0.2,
    },
  },
  {
    id: 'ramp-heavy',
    label: '匝道偏重',
    description: '支路汇入压力更明显',
    values: {
      totalFlow: 3200,
      cavPenetrationRate: 0.5,
      mainlineRatio: 0.6,
      exitRatio: 0.18,
    },
  },
  {
    id: 'exit-heavy',
    label: '出口偏重',
    description: '主路出口分流比例更高',
    values: {
      totalFlow: 3200,
      cavPenetrationRate: 0.5,
      mainlineRatio: 0.78,
      exitRatio: 0.4,
    },
  },
]

export function ScenarioSetupView({
  initialConfig,
  onScenarioApplied,
}: ScenarioSetupViewProps) {
  const [config, setConfig] = useState<ScenarioConfig | null>(initialConfig ?? null)
  const [loading, setLoading] = useState(true)
  const [applying, setApplying] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true

    const load = async () => {
      try {
        const nextConfig = initialConfig ?? await fetchDefaultScenarioConfig()

        if (!mounted) {
          return
        }
        setConfig(withDerivedRampRatio(nextConfig))
      } catch (loadError) {
        if (!mounted) {
          return
        }
        setError(loadError instanceof Error ? loadError.message : '场景默认参数加载失败。')
      } finally {
        if (mounted) {
          setLoading(false)
        }
      }
    }

    void load()
    return () => {
      mounted = false
    }
  }, [initialConfig])

  const flowPlan = useMemo(
    () => (config ? deriveScenarioFlowPlan(config) : null),
    [config],
  )

  const updateConfig = (updates: Partial<ScenarioConfig>) => {
    setConfig((current) => (current ? withDerivedRampRatio({ ...current, ...updates }) : current))
  }

  const applyPreset = (presetId: ScenarioPreset) => {
    const preset = PRESETS.find((candidate) => candidate.id === presetId)
    if (!preset) {
      return
    }
    updateConfig({
      ...preset.values,
      scenarioPreset: presetId,
    })
  }

  const applyControlMode = (mode: 'algorithm' | 'no-control') => {
    updateConfig({
      enableCavLaneChangeControl: mode === 'algorithm',
      disableSumoLaneChangeControl: false,
    })
  }

  const handleApply = async () => {
    if (!config) {
      return
    }

    setApplying(true)
    setError(null)
    try {
      const response = await applyScenarioConfig(config)
      onScenarioApplied(response)
    } catch (applyError) {
      setError(applyError instanceof Error ? applyError.message : '场景应用失败。')
    } finally {
      setApplying(false)
    }
  }

  if (loading && !config) {
    return (
      <main className="flex h-screen items-center justify-center p-5">
        <div className="rounded-2xl border border-slate-200 bg-white/90 px-8 py-6 text-slate-600 shadow-xl shadow-slate-200/70">
          正在加载场景参数...
        </div>
      </main>
    )
  }

  return (
    <main className="h-screen overflow-hidden p-5">
      <div className="grid h-full grid-cols-[minmax(0,1fr)_390px] gap-5 max-lg:grid-cols-1 max-lg:overflow-y-auto">
        <section className="panel-scroll min-h-0 overflow-y-auto rounded-2xl border border-slate-200 bg-white/90 p-5 shadow-xl shadow-slate-200/70">
          <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-emerald-700">Scenario Setup</p>
              <h1 className="mt-1 text-2xl font-semibold text-slate-950">场景参数设置</h1>
            </div>
            <button
              className="rounded-xl bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-slate-300 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!config || applying}
              onClick={() => void handleApply()}
              type="button"
            >
              {applying ? '正在启动...' : '启动仿真'}
            </button>
          </div>

          {error ? (
            <div className="mb-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {error}
            </div>
          ) : null}

          {config ? (
            <div className="space-y-5">
              <section>
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-base font-semibold text-slate-900">场景预设</h2>
                  <span className="text-sm text-slate-500">预设可调</span>
                </div>
                <div className="grid grid-cols-3 gap-3 max-xl:grid-cols-2 max-sm:grid-cols-1">
                  {PRESETS.map((preset) => {
                    const selected = config.scenarioPreset === preset.id
                    return (
                      <button
                        className={`min-h-[86px] rounded-xl border px-4 py-3 text-left transition ${
                          selected
                            ? 'border-emerald-300 bg-emerald-50 text-emerald-950 shadow-sm'
                            : 'border-slate-200 bg-slate-50/80 text-slate-700 hover:border-slate-300 hover:bg-white'
                        }`}
                        key={preset.id}
                        onClick={() => applyPreset(preset.id)}
                        type="button"
                      >
                        <span className="block text-sm font-semibold">{preset.label}</span>
                        <span className="mt-1 block text-xs leading-5 text-slate-500">
                          {preset.description}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </section>

              <section className="rounded-xl border border-slate-200 bg-slate-50/80 p-4">
                <h2 className="mb-3 text-sm font-semibold text-slate-900">仿真时间</h2>
                <div className="grid grid-cols-4 gap-2 max-sm:grid-cols-2">
                  {DURATION_OPTIONS.map((duration) => (
                    <button
                      className={`rounded-xl border px-3 py-2 text-sm font-semibold transition ${
                        config.simulationDuration === duration
                          ? 'border-sky-300 bg-sky-50 text-sky-700'
                          : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                      }`}
                      key={duration}
                      onClick={() => updateConfig({ simulationDuration: duration })}
                      type="button"
                    >
                      {formatDuration(duration)}
                    </button>
                  ))}
                </div>
              </section>

              <section className="grid grid-cols-2 gap-4 max-xl:grid-cols-1">
                <RangeField
                  label="总流量"
                  max={8000}
                  min={500}
                  onChange={(value) => updateConfig({ totalFlow: value })}
                  suffix="veh/h"
                  value={config.totalFlow}
                />
                <RangeField
                  label="CAV 渗透率"
                  max={1}
                  min={0}
                  onChange={(value) => updateConfig({ cavPenetrationRate: value })}
                  inputScale={100}
                  step={0.01}
                  suffix="%"
                  value={config.cavPenetrationRate}
                  valueFormatter={(value) => `${Math.round(value * 100)}%`}
                />
                <RangeField
                  label="主路流量比例"
                  max={1}
                  min={0}
                  onChange={(value) => updateConfig({ mainlineRatio: value })}
                  inputScale={100}
                  step={0.01}
                  suffix="%"
                  value={config.mainlineRatio}
                  valueFormatter={(value) => `${Math.round(value * 100)}%`}
                />
                <RangeField
                  label="出口比例"
                  max={1}
                  min={0}
                  onChange={(value) => updateConfig({ exitRatio: value })}
                  inputScale={100}
                  step={0.01}
                  suffix="%"
                  value={config.exitRatio}
                  valueFormatter={(value) => `${Math.round(value * 100)}%`}
                />
              </section>

              <ControlModePanel config={config} onModeChange={applyControlMode} />
            </div>
          ) : null}
        </section>

        <aside className="panel-scroll min-h-0 overflow-y-auto rounded-2xl border border-slate-200 bg-white/88 p-5 shadow-xl shadow-slate-200/70">
          <div className="mb-5">
            <p className="text-sm font-medium text-sky-700">Live Summary</p>
            <h2 className="mt-1 text-xl font-semibold text-slate-950">场景摘要</h2>
          </div>

          {config && flowPlan ? (
            <div className="space-y-5">
              <SummaryGrid
                items={[
                  ['总流量', formatFlow(flowPlan.totalFlow)],
                  ['CAV 流量', formatFlow(flowPlan.cavFlow)],
                  ['HDV 流量', formatFlow(flowPlan.hdvFlow)],
                  ['主路流量', formatFlow(flowPlan.mainlineFlow)],
                  ['匝道流量', formatFlow(flowPlan.rampFlow)],
                  ['出口流量', formatFlow(flowPlan.exitFlow)],
                  ['直行流量', formatFlow(flowPlan.straightFlow)],
                  ['仿真时长', formatDuration(config.simulationDuration)],
                ]}
              />

              <section className="rounded-xl border border-slate-200 bg-slate-50/80 p-4">
                <h3 className="mb-3 text-sm font-semibold text-slate-900">速度与方案</h3>
                <div className="space-y-3 text-sm">
                  <SummaryRow label="限速 km/h" value={`${config.speedLimitKmh.toFixed(0)} km/h`} />
                  <SummaryRow
                    label="限速 m/s"
                    value={`${flowPlan.speedLimitMetersPerSecond.toFixed(2)} m/s`}
                  />
                  <SummaryRow
                    label="主路 / 匝道"
                    value={`${formatRatio(config.mainlineRatio)} / ${formatRatio(config.rampRatio)}`}
                  />
                  <SummaryRow
                    label="协同调控"
                    value={config.enableCavLaneChangeControl ? '启用' : '关闭'}
                  />
                </div>
              </section>

              <section className="rounded-xl border border-slate-200 bg-slate-50/80 p-4">
                <h3 className="mb-3 text-sm font-semibold text-slate-900">流量分配</h3>
                <div className="space-y-2 text-xs text-slate-600">
                  <SummaryRow
                    label="Straight A"
                    value={`${formatFlow(flowPlan.straightFlowAConnected)} CAV / ${formatFlow(flowPlan.straightFlowAHuman)} HDV`}
                  />
                  <SummaryRow
                    label="Straight B"
                    value={`${formatFlow(flowPlan.straightFlowBConnected)} CAV / ${formatFlow(flowPlan.straightFlowBHuman)} HDV`}
                  />
                  <SummaryRow
                    label="Exit"
                    value={`${formatFlow(flowPlan.exitFlowConnected)} CAV / ${formatFlow(flowPlan.exitFlowHuman)} HDV`}
                  />
                  <SummaryRow
                    label="Ramp"
                    value={`${formatFlow(flowPlan.rampFlowConnected)} CAV / ${formatFlow(flowPlan.rampFlowHuman)} HDV`}
                  />
                </div>
              </section>

              <button
                className="w-full rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-200 transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={applying}
                onClick={() => void handleApply()}
                type="button"
              >
                {applying ? '启动中...' : '启动仿真'}
              </button>
            </div>
          ) : (
            <p className="text-sm text-slate-500">等待参数加载。</p>
          )}
        </aside>
      </div>
    </main>
  )
}

function ControlModePanel({
  config,
  onModeChange,
}: {
  config: ScenarioConfig
  onModeChange: (mode: 'algorithm' | 'no-control') => void
}) {
  const activeMode = config.enableCavLaneChangeControl && !config.disableSumoLaneChangeControl
    ? 'algorithm'
    : 'no-control'

  return (
    <section className="rounded-xl border border-slate-200 bg-slate-50/80 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-slate-900">控制模式</h2>
        <span className="text-xs font-medium text-slate-500">
          {activeMode === 'algorithm' ? '实验组' : '对照组'}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3 max-sm:grid-cols-1">
        <ControlModeButton
          active={activeMode === 'algorithm'}
          description="实验组"
          label="协同调控"
          onClick={() => onModeChange('algorithm')}
        />
        <ControlModeButton
          active={activeMode === 'no-control'}
          description="对照组"
          label="无控对照"
          onClick={() => onModeChange('no-control')}
        />
      </div>
    </section>
  )
}

function ControlModeButton({
  active,
  label,
  description,
  onClick,
}: {
  active: boolean
  label: string
  description: string
  onClick: () => void
}) {
  return (
    <button
      className={`min-h-[78px] rounded-xl border px-4 py-3 text-left transition ${
        active
          ? 'border-emerald-300 bg-emerald-50 text-emerald-950 shadow-sm'
          : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
      }`}
      onClick={onClick}
      type="button"
    >
      <span className="block text-sm font-semibold">{label}</span>
      <span className={`mt-1 block text-xs leading-5 ${active ? 'text-emerald-700' : 'text-slate-500'}`}>
        {description}
      </span>
    </button>
  )
}

function RangeField({
  label,
  min,
  max,
  step = 1,
  suffix,
  inputScale = 1,
  value,
  valueFormatter,
  onChange,
}: {
  label: string
  min: number
  max: number
  step?: number
  suffix?: string
  inputScale?: number
  value: number
  valueFormatter?: (value: number) => string
  onChange: (value: number) => void
}) {
  const displayValue = valueFormatter ? valueFormatter(value) : `${value}${suffix ? ` ${suffix}` : ''}`
  const numberStep = step * inputScale
  const numberValue = roundNumber(value * inputScale, inputScale === 1 ? 2 : 0)

  return (
    <label className="rounded-xl border border-slate-200 bg-slate-50/80 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="text-sm font-semibold text-slate-900">{label}</span>
        <span className="text-sm font-medium text-slate-600">{displayValue}</span>
      </div>
      <input
        className="w-full accent-emerald-500"
        max={max}
        min={min}
        onChange={(event) => onChange(Number(event.target.value))}
        step={step}
        type="range"
        value={value}
      />
      <div className="mt-3 flex items-center gap-2">
        <input
          className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100"
          max={max * inputScale}
          min={min * inputScale}
          onChange={(event) => onChange(Number(event.target.value) / inputScale)}
          step={numberStep}
          type="number"
          value={numberValue}
        />
        {suffix ? <span className="w-14 text-sm text-slate-500">{suffix}</span> : null}
      </div>
    </label>
  )
}

function SummaryGrid({ items }: { items: Array<[string, string]> }) {
  return (
    <section className="grid grid-cols-2 gap-3">
      {items.map(([label, value]) => (
        <div className="rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-3" key={label}>
          <p className="text-xs text-slate-500">{label}</p>
          <p className="mt-1 text-base font-semibold text-slate-900">{value}</p>
        </div>
      ))}
    </section>
  )
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-slate-500">{label}</span>
      <span className="text-right font-semibold text-slate-900">{value}</span>
    </div>
  )
}

function withDerivedRampRatio(config: ScenarioConfig): ScenarioConfig {
  return {
    ...config,
    rampRatio: roundNumber(1 - config.mainlineRatio, 4),
  }
}

function deriveScenarioFlowPlan(config: ScenarioConfig): ScenarioFlowPlan {
  const totalFlow = config.totalFlow
  const mainlineFlow = totalFlow * config.mainlineRatio
  const rampFlow = totalFlow - mainlineFlow
  const exitFlow = mainlineFlow * config.exitRatio
  const straightFlow = mainlineFlow - exitFlow
  const straightFlowA = straightFlow * 0.5
  const straightFlowB = straightFlow * 0.5
  const cavRate = config.cavPenetrationRate

  return {
    totalFlow: roundNumber(totalFlow),
    cavFlow: roundNumber(totalFlow * cavRate),
    hdvFlow: roundNumber(totalFlow * (1 - cavRate)),
    mainlineFlow: roundNumber(mainlineFlow),
    rampFlow: roundNumber(rampFlow),
    exitFlow: roundNumber(exitFlow),
    straightFlow: roundNumber(straightFlow),
    straightFlowA: roundNumber(straightFlowA),
    straightFlowB: roundNumber(straightFlowB),
    straightFlowAConnected: roundNumber(straightFlowA * cavRate),
    straightFlowAHuman: roundNumber(straightFlowA * (1 - cavRate)),
    straightFlowBConnected: roundNumber(straightFlowB * cavRate),
    straightFlowBHuman: roundNumber(straightFlowB * (1 - cavRate)),
    exitFlowConnected: roundNumber(exitFlow * cavRate),
    exitFlowHuman: roundNumber(exitFlow * (1 - cavRate)),
    rampFlowConnected: roundNumber(rampFlow * cavRate),
    rampFlowHuman: roundNumber(rampFlow * (1 - cavRate)),
    speedLimitMetersPerSecond: roundNumber(config.speedLimitKmh / 3.6),
  }
}

function roundNumber(value: number, digits = 2) {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function formatFlow(value: number) {
  return `${Math.round(value)} veh/h`
}

function formatRatio(value: number) {
  return `${Math.round(value * 100)}%`
}

function formatDuration(seconds: number) {
  if (seconds >= 3600) {
    return `${Math.round(seconds / 3600)} h`
  }
  return `${seconds} s`
}
