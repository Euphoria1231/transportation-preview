import type { ReactElement } from 'react'

import type { MetricSample } from '../types/simulation'

export type MetricChartKey =
  | 'averageSpeedKmh'
  | 'vehicleCount'
  | 'densityPerKm'
  | 'averageDelay'
  | 'queueLength'
  | 'laneChangeCount'
  | 'minTtc'
  | 'highRiskEventCount'

interface MetricChartProps {
  samples: MetricSample[]
  metricKey: MetricChartKey
}

interface MetricChartComponent {
  (props: MetricChartProps): ReactElement
  options: Array<{ key: MetricChartKey; label: string }>
}

const METRIC_META: Record<MetricChartKey, { label: string; unit: string; emptyValue: number }> = {
  averageSpeedKmh: { label: '平均速度', unit: 'km/h', emptyValue: 0 },
  vehicleCount: { label: '车辆数', unit: '辆', emptyValue: 0 },
  densityPerKm: { label: '密度', unit: '辆/km', emptyValue: 0 },
  averageDelay: { label: '延误 proxy', unit: 's', emptyValue: 0 },
  queueLength: { label: '排队长度', unit: 'm', emptyValue: 0 },
  laneChangeCount: { label: '变道次数', unit: '次/step', emptyValue: 0 },
  minTtc: { label: '最小 TTC', unit: 's', emptyValue: 0 },
  highRiskEventCount: { label: '高风险事件', unit: '次/step', emptyValue: 0 },
}

export const MetricChart: MetricChartComponent = ({ samples, metricKey }: MetricChartProps) => {
  const meta = METRIC_META[metricKey]
  const values = samples.map((sample) => getMetricValue(sample, metricKey, meta.emptyValue))
  const hasData = samples.length > 0
  const maxValue = Math.max(...values, meta.emptyValue)
  const minValue = Math.min(...values, meta.emptyValue)
  const range = Math.max(maxValue - minValue, 1)
  const points = values
    .map((value, index) => {
      const x = values.length <= 1 ? 300 : (index / (values.length - 1)) * 600
      const y = 180 - ((value - minValue) / range) * 140
      return `${x.toFixed(2)},${y.toFixed(2)}`
    })
    .join(' ')
  const latest = values[values.length - 1] ?? meta.emptyValue

  return (
    <div className="rounded-2xl border border-slate-200 bg-white/85 p-3">
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <p className="text-xs tracking-[0.18em] text-slate-500">{meta.label}</p>
          <p className="mt-1 text-lg font-semibold text-slate-950">
            {formatMetric(latest)} <span className="text-xs font-medium text-slate-500">{meta.unit}</span>
          </p>
        </div>
        <div className="text-right text-xs text-slate-500">
          <p>范围 {formatMetric(minValue)} - {formatMetric(maxValue)}</p>
          <p>{samples.length} 点</p>
        </div>
      </div>

      {hasData ? (
        <svg
          aria-label={`${meta.label} 曲线`}
          className="h-48 w-full overflow-visible"
          preserveAspectRatio="none"
          viewBox="0 0 600 200"
        >
          <line stroke="rgba(148, 163, 184, 0.35)" strokeWidth="1" x1="0" x2="600" y1="180" y2="180" />
          <line stroke="rgba(148, 163, 184, 0.25)" strokeWidth="1" x1="0" x2="600" y1="110" y2="110" />
          <line stroke="rgba(148, 163, 184, 0.35)" strokeWidth="1" x1="0" x2="600" y1="40" y2="40" />
          <polyline
            fill="none"
            points={points}
            stroke="rgb(14, 165, 233)"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="3"
          />
        </svg>
      ) : (
        <div className="flex h-48 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50/80 text-sm text-slate-500">
          暂无指标数据，启动仿真后会显示曲线。
        </div>
      )}
    </div>
  )
}

const metricChartOptions: Array<{ key: MetricChartKey; label: string }> = [
  { key: 'averageSpeedKmh', label: '平均速度' },
  { key: 'vehicleCount', label: '车辆数' },
  { key: 'densityPerKm', label: '密度' },
  { key: 'averageDelay', label: '延误' },
  { key: 'queueLength', label: '排队长度' },
  { key: 'laneChangeCount', label: '变道次数' },
  { key: 'minTtc', label: 'TTC 最小值' },
  { key: 'highRiskEventCount', label: '高风险事件' },
]

MetricChart.options = metricChartOptions

function getMetricValue(sample: MetricSample, metricKey: MetricChartKey, emptyValue: number) {
  if (metricKey === 'minTtc') {
    return sample.minTtc ?? emptyValue
  }
  return sample[metricKey]
}

function formatMetric(value: number) {
  if (Math.abs(value) >= 100) {
    return value.toFixed(0)
  }
  if (Math.abs(value) >= 10) {
    return value.toFixed(1)
  }
  return value.toFixed(2)
}
