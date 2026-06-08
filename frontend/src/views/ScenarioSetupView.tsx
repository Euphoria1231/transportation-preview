import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'

import {
  applyScenarioConfig,
  fetchConfig,
  fetchDefaultScenarioConfig,
} from '../services/api'
import type {
  NetworkConfig,
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
      totalFlow: 4800,
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
  const [networkConfig, setNetworkConfig] = useState<NetworkConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [applying, setApplying] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true

    const load = async () => {
      try {
        const configPromise = initialConfig
          ? Promise.resolve(initialConfig)
          : fetchDefaultScenarioConfig()
        const [nextConfig, nextNetworkConfig] = await Promise.all([
          configPromise,
          fetchConfig(),
        ])

        if (!mounted) {
          return
        }
        setConfig(withDerivedRampRatio(nextConfig))
        setNetworkConfig(nextNetworkConfig)
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
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                设置流量、CAV 渗透率、限速和分流比例后启动新的 SUMO 场景。
              </p>
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
                  <span className="text-sm text-slate-500">可继续微调参数</span>
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

              <section className="grid grid-cols-2 gap-4 max-xl:grid-cols-1">
                <PanelBlock title="仿真时间">
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
                </PanelBlock>

                <PanelBlock title="固定路网">
                  <div className="grid grid-cols-2 gap-3">
                    <ReadOnlyField label="Net 文件" value="test.net.xml" />
                    <ReadOnlyField
                      label="车道数"
                      value={networkConfig ? `${networkConfig.lanes.length} 条` : '--'}
                    />
                  </div>
                  <p className="mt-3 text-xs leading-5 text-slate-500">
                    当前阶段固定使用现有路网，车道数不在参数页动态修改。
                  </p>
                </PanelBlock>
              </section>

              <section className="grid grid-cols-2 gap-4 max-xl:grid-cols-1">
                <RangeField
                  label="总流量"
                  max={5000}
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

              <section className="grid grid-cols-3 gap-4 max-xl:grid-cols-1">
                <NumberField
                  label="限速"
                  max={140}
                  min={30}
                  onChange={(value) => updateConfig({ speedLimitKmh: value })}
                  suffix="km/h"
                  value={config.speedLimitKmh}
                />
                <NumberField
                  label="随机种子"
                  max={999999}
                  min={0}
                  onChange={(value) => updateConfig({ randomSeed: Math.round(value) })}
                  value={config.randomSeed}
                />
                <NumberField
                  label="Step Length"
                  max={1}
                  min={0.05}
                  onChange={(value) => updateConfig({ stepLength: value })}
                  step={0.05}
                  suffix="s"
                  value={config.stepLength}
                />
              </section>

              <label className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-3">
                <span>
                  <span className="block text-sm font-semibold text-slate-900">
                    启用 CAV 换道控制
                  </span>
                  <span className="mt-1 block text-xs text-slate-500">
                    关闭后后端 step 不调用现有 lane-change logic。
                  </span>
                </span>
                <input
                  checked={config.enableCavLaneChangeControl}
                  className="h-5 w-5 accent-emerald-500"
                  onChange={(event) =>
                    updateConfig({ enableCavLaneChangeControl: event.target.checked })
                  }
                  type="checkbox"
                />
              </label>
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
                <h3 className="mb-3 text-sm font-semibold text-slate-900">速度与控制</h3>
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
                    label="CAV 换道控制"
                    value={config.enableCavLaneChangeControl ? '启用' : '关闭'}
                  />
                </div>
              </section>

              <section className="rounded-xl border border-slate-200 bg-slate-50/80 p-4">
                <h3 className="mb-3 text-sm font-semibold text-slate-900">Route Flow 写入</h3>
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
                {applying ? '正在应用场景...' : '应用参数并进入仿真'}
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

function PanelBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-slate-50/80 p-4">
      <h2 className="mb-3 text-sm font-semibold text-slate-900">{title}</h2>
      {children}
    </section>
  )
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-slate-900">{value}</p>
    </div>
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

function NumberField({
  label,
  min,
  max,
  step = 1,
  suffix,
  value,
  onChange,
}: {
  label: string
  min: number
  max: number
  step?: number
  suffix?: string
  value: number
  onChange: (value: number) => void
}) {
  return (
    <label className="rounded-xl border border-slate-200 bg-slate-50/80 p-4">
      <span className="mb-2 block text-sm font-semibold text-slate-900">{label}</span>
      <div className="flex items-center gap-2">
        <input
          className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100"
          max={max}
          min={min}
          onChange={(event) => onChange(Number(event.target.value))}
          step={step}
          type="number"
          value={value}
        />
        {suffix ? <span className="text-sm text-slate-500">{suffix}</span> : null}
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
