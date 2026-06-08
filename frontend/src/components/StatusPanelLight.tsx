import { useMemo } from 'react'

import type { ConnectionStatus, NetworkConfig, SimulationState, VehicleState } from '../types/simulation'

interface StatusPanelProps {
  config: NetworkConfig | null
  simulation: SimulationState | null
  connectionStatus: ConnectionStatus
}

function formatConnectionStatus(status: ConnectionStatus) {
  if (status === 'open') {
    return '已连接'
  }
  if (status === 'error') {
    return '重连中'
  }
  return '连接中'
}

interface TrafficMetrics {
  averageSpeed: number
  maxSpeed: number
  stoppedVehicles: number
  activeLanes: number
  activeLaneRatio: number
  densityPerKm: number
}

export function StatusPanel({ config, simulation, connectionStatus }: StatusPanelProps) {
  const trafficMetrics = useMemo(
    () => deriveTrafficMetrics(simulation?.vehicles ?? [], config),
    [config, simulation?.vehicles],
  )

  const stats = [
    { label: '仿真时间', value: simulation ? `${simulation.simTime.toFixed(1)} 秒` : '--' },
    { label: '步数', value: simulation ? simulation.step : '--' },
    { label: '车辆数', value: simulation ? simulation.vehicleCount : '--' },
    { label: '联网数', value: simulation ? simulation.connectedCount : '--' },
  ]

  return (
    <section className="rounded-2xl border border-slate-200 bg-white/88 p-4 shadow-xl shadow-slate-200/70 backdrop-blur">
      <div className="mb-4">
        <p className="text-xs tracking-[0.28em] text-slate-500">状态</p>
        <h2 className="text-lg font-semibold text-slate-900">实时指标</h2>
      </div>

      <div className="mb-4 flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50/90 px-3 py-2">
        <span className="text-sm text-slate-600">数据流</span>
        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold ${
            connectionStatus === 'open'
              ? 'bg-sky-100 text-sky-700'
              : connectionStatus === 'error'
                ? 'bg-rose-100 text-rose-700'
                : 'bg-slate-200 text-slate-700'
          }`}
        >
          {formatConnectionStatus(connectionStatus)}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {stats.map((item) => (
          <div
            className="rounded-xl border border-slate-200 bg-slate-50/90 px-3 py-3"
            key={item.label}
          >
            <p className="text-xs tracking-[0.18em] text-slate-500">{item.label}</p>
            <p className="mt-2 text-xl font-semibold text-slate-900">{item.value}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <p className="text-xs tracking-[0.22em] text-slate-500">交通流</p>
            <h3 className="text-sm font-semibold text-slate-900">路网指标</h3>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <MetricCard label="平均速度" value={formatSpeed(trafficMetrics.averageSpeed)} />
          <MetricCard label="最高速度" value={formatSpeed(trafficMetrics.maxSpeed)} />
          <MetricCard label="停车数量" value={`${trafficMetrics.stoppedVehicles}`} />
          <MetricCard
            label="车道占用"
            value={`${trafficMetrics.activeLanes}${config ? ` / ${config.lanes.length}` : ''}`}
          />
        </div>

        <div className="mt-4 space-y-3">
          <ProgressMetric
            label="活跃车道占比"
            value={`${(trafficMetrics.activeLaneRatio * 100).toFixed(0)}%`}
            progress={trafficMetrics.activeLaneRatio}
            tone="sky"
          />
          <ProgressMetric
            label="车辆密度"
            value={`${trafficMetrics.densityPerKm.toFixed(1)} 辆/km`}
            progress={Math.min(trafficMetrics.densityPerKm / 80, 1)}
            tone="amber"
          />
        </div>
      </div>

      {simulation?.error ? (
        <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {simulation.error}
        </div>
      ) : null}
    </section>
  )
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white/80 px-3 py-3">
      <p className="text-[11px] tracking-[0.18em] text-slate-500">{label}</p>
      <p className="mt-2 text-lg font-semibold text-slate-900">{value}</p>
    </div>
  )
}

function ProgressMetric({
  label,
  value,
  progress,
  tone,
}: {
  label: string
  value: string
  progress: number
  tone: 'sky' | 'amber'
}) {
  const fillClass = tone === 'sky' ? 'from-sky-400 to-cyan-300' : 'from-amber-400 to-orange-300'

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-sm">
        <span className="text-slate-600">{label}</span>
        <span className="font-medium text-slate-900">{value}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-200">
        <div
          className={`h-full rounded-full bg-gradient-to-r ${fillClass}`}
          style={{ width: progress <= 0 ? '0%' : `${Math.max(6, progress * 100)}%` }}
        />
      </div>
    </div>
  )
}

function deriveTrafficMetrics(vehicles: VehicleState[], config: NetworkConfig | null): TrafficMetrics {
  if (vehicles.length === 0) {
    return {
      averageSpeed: 0,
      maxSpeed: 0,
      stoppedVehicles: 0,
      activeLanes: 0,
      activeLaneRatio: 0,
      densityPerKm: 0,
    }
  }

  const activeLanes = new Set(vehicles.map((vehicle) => vehicle.laneId)).size
  const totalSpeed = vehicles.reduce((sum, vehicle) => sum + vehicle.speed, 0)
  const maxSpeed = vehicles.reduce((max, vehicle) => Math.max(max, vehicle.speed), 0)
  const stoppedVehicles = vehicles.filter((vehicle) => vehicle.speed < 0.5).length
  const totalLaneLengthKm = config ? getTotalLaneLength(config) / 1000 : 0

  return {
    averageSpeed: totalSpeed / vehicles.length,
    maxSpeed,
    stoppedVehicles,
    activeLanes,
    activeLaneRatio: config?.lanes.length ? activeLanes / config.lanes.length : 0,
    densityPerKm: totalLaneLengthKm > 0 ? vehicles.length / totalLaneLengthKm : 0,
  }
}

function getTotalLaneLength(config: NetworkConfig) {
  return config.lanes.reduce((sum, lane) => {
    let laneLength = 0
    for (let index = 1; index < lane.shape.length; index += 1) {
      const [prevX, prevY] = lane.shape[index - 1]
      const [nextX, nextY] = lane.shape[index]
      laneLength += Math.hypot(nextX - prevX, nextY - prevY)
    }
    return sum + laneLength
  }, 0)
}

function formatSpeed(speedMetersPerSecond: number) {
  return `${(speedMetersPerSecond * 3.6).toFixed(1)} km/h`
}
