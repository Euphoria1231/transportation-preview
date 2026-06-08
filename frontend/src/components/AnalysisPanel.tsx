import { useEffect, useMemo, useState } from 'react'

import { fetchAnalysisSummary, fetchMetricHistory } from '../services/api'
import type { AnalysisSummary, HeatmapMode, MetricSample } from '../types/simulation'
import { HeatmapControls } from './HeatmapControls'
import { MetricChart, type MetricChartKey } from './MetricChart'

type WindowMode = '60s' | '100' | '300' | 'all'

interface AnalysisPanelProps {
  heatmapMode: HeatmapMode | null
  onHeatmapModeChange: (mode: HeatmapMode | null) => void
  refreshKey: number
}

const WINDOW_OPTIONS: Array<{ mode: WindowMode; label: string; requestWindow: number }> = [
  { mode: '60s', label: '最近 60 秒', requestWindow: 600 },
  { mode: '100', label: '最近 100 step', requestWindow: 100 },
  { mode: '300', label: '最近 300 step', requestWindow: 300 },
  { mode: 'all', label: '全部缓存', requestWindow: 1000 },
]

export function AnalysisPanel({
  heatmapMode,
  onHeatmapModeChange,
  refreshKey,
}: AnalysisPanelProps) {
  const [windowMode, setWindowMode] = useState<WindowMode>('100')
  const [metricKey, setMetricKey] = useState<MetricChartKey>('averageSpeedKmh')
  const [samples, setSamples] = useState<MetricSample[]>([])
  const [summary, setSummary] = useState<AnalysisSummary | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const selectedWindow = useMemo(
    () => WINDOW_OPTIONS.find((option) => option.mode === windowMode) ?? WINDOW_OPTIONS[1],
    [windowMode],
  )

  useEffect(() => {
    let mounted = true

    const loadMetrics = async () => {
      setLoading(true)
      try {
        const [history, nextSummary] = await Promise.all([
          fetchMetricHistory(selectedWindow.requestWindow),
          fetchAnalysisSummary(),
        ])
        if (!mounted) {
          return
        }
        setSamples(filterSamplesByWindow(history, windowMode))
        setSummary(nextSummary)
        setError(null)
      } catch (nextError) {
        if (!mounted) {
          return
        }
        setError(nextError instanceof Error ? nextError.message : '指标加载失败。')
      } finally {
        if (mounted) {
          setLoading(false)
        }
      }
    }

    void loadMetrics()
    const timer = window.setInterval(() => void loadMetrics(), 1000)
    return () => {
      mounted = false
      window.clearInterval(timer)
    }
  }, [refreshKey, selectedWindow.requestWindow, windowMode])

  return (
    <section className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-xl shadow-slate-200/70 backdrop-blur">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs tracking-[0.28em] text-slate-500">ANALYSIS</p>
            <h2 className="text-lg font-semibold text-slate-950">仿真分析</h2>
          </div>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
            {loading ? '刷新中' : `${samples.length} 点`}
          </span>
        </div>

        {error ? (
          <div className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </div>
        ) : null}

        <div className="mb-3 grid grid-cols-2 gap-2">
          {WINDOW_OPTIONS.map((option) => (
            <button
              className={`rounded-xl border px-3 py-2 text-sm font-semibold transition ${
                windowMode === option.mode
                  ? 'border-sky-300 bg-sky-50 text-sky-800'
                  : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-white'
              }`}
              key={option.mode}
              onClick={() => setWindowMode(option.mode)}
              type="button"
            >
              {option.label}
            </button>
          ))}
        </div>

        <label className="mb-3 block">
          <span className="mb-1 block text-xs font-medium text-slate-500">曲线指标</span>
          <select
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
            onChange={(event) => setMetricKey(event.target.value as MetricChartKey)}
            value={metricKey}
          >
            {MetricChart.options.map((option) => (
              <option key={option.key} value={option.key}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <MetricChart metricKey={metricKey} samples={samples} />
      </div>

      <HeatmapControls mode={heatmapMode} onModeChange={onHeatmapModeChange} />

      <div className="rounded-2xl border border-slate-200 bg-white/88 p-4 shadow-xl shadow-slate-200/70 backdrop-blur">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <p className="text-xs tracking-[0.2em] text-slate-500">SUMMARY</p>
            <h3 className="text-sm font-semibold text-slate-950">聚合摘要</h3>
          </div>
        </div>
        {summary ? (
          <div className="grid grid-cols-2 gap-2">
            <SummaryMetric label="平均速度" value={`${summary.averageSpeedKmh.toFixed(1)} km/h`} />
            <SummaryMetric label="平均延误" value={`${summary.averageDelay.toFixed(2)} s`} />
            <SummaryMetric label="急刹" value={`${summary.totalHardBrakes} 次`} />
            <SummaryMetric label="高风险" value={`${summary.totalHighRiskEvents} 次`} />
            <SummaryMetric label="最小 TTC" value={summary.minTtc === null ? '--' : `${summary.minTtc.toFixed(2)} s`} />
            <SummaryMetric label="CAV" value={`${(summary.cavPenetrationRate * 100).toFixed(0)}%`} />
          </div>
        ) : (
          <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-6 text-center text-sm text-slate-500">
            暂无聚合摘要。
          </p>
        )}
      </div>
    </section>
  )
}

function SummaryMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/90 px-3 py-2">
      <p className="text-[11px] tracking-[0.14em] text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-slate-950">{value}</p>
    </div>
  )
}

function filterSamplesByWindow(samples: MetricSample[], windowMode: WindowMode) {
  if (windowMode !== '60s' || samples.length === 0) {
    return samples
  }
  const latest = samples[samples.length - 1]
  const cutoff = latest.simTime - 60
  return samples.filter((sample) => sample.simTime >= cutoff)
}
