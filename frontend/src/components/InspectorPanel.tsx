import type { LaneMetrics, VehicleState } from '../types/simulation'

interface InspectorPanelProps {
  selectedVehicle: VehicleState | null
  selectedLane: LaneMetrics | null
  trailSeconds: number
  trailPointCount: number
  onTrailSecondsChange: (seconds: number) => void
  onExportVehicle: () => void
}

export function InspectorPanel({
  selectedVehicle,
  selectedLane,
  trailSeconds,
  trailPointCount,
  onTrailSecondsChange,
  onExportVehicle,
}: InspectorPanelProps) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-xl shadow-slate-200/70 backdrop-blur">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-xs tracking-[0.28em] text-slate-500">INSPECTOR</p>
          <h2 className="text-lg font-semibold text-slate-950">对象详情</h2>
        </div>
        <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
          点击车辆 / 车道
        </div>
      </div>

      {selectedVehicle ? (
        <VehicleDetails
          onExportVehicle={onExportVehicle}
          onTrailSecondsChange={onTrailSecondsChange}
          trailPointCount={trailPointCount}
          trailSeconds={trailSeconds}
          vehicle={selectedVehicle}
        />
      ) : selectedLane ? (
        <LaneDetails lane={selectedLane} />
      ) : (
        <EmptyInspector />
      )}

      <div className="mt-4 grid grid-cols-3 gap-2 rounded-2xl border border-slate-200 bg-slate-50/80 p-3 text-[11px] text-slate-600">
        <LegendItem color="bg-emerald-500" label="历史轨迹" />
        <LegendItem color="bg-blue-500" label="未来路线" />
        <LegendItem color="bg-yellow-400" label="当前选中" />
      </div>
    </section>
  )
}

function VehicleDetails({
  vehicle,
  trailSeconds,
  trailPointCount,
  onTrailSecondsChange,
  onExportVehicle,
}: {
  vehicle: VehicleState
  trailSeconds: number
  trailPointCount: number
  onTrailSecondsChange: (seconds: number) => void
  onExportVehicle: () => void
}) {
  const isConnected = /connected|cav/i.test(vehicle.type)

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-slate-50/90 p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs text-slate-500">车辆 ID</p>
            <h3 className="text-lg font-semibold text-slate-950">{vehicle.id}</h3>
          </div>
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              isConnected ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
            }`}
          >
            {isConnected ? 'CAV' : 'HDV'}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <DetailItem label="当前速度" value={formatSpeed(vehicle.speed)} />
          <DetailItem label="当前加速度" value={`${vehicle.acceleration.toFixed(2)} m/s²`} />
          <DetailItem label="所在道路" value={vehicle.edgeId || '--'} />
          <DetailItem label="所在车道" value={`Lane ${vehicle.laneIndex}`} />
          <DetailItem label="跟驰间距" value={formatOptionalMeters(vehicle.leaderGap)} />
          <DetailItem label="前车 ID" value={vehicle.leaderId ?? '--'} />
          <DetailItem label="是否换道中" value={vehicle.isChangingLane ? '是' : '否'} />
          <DetailItem label="车道位置" value={`${vehicle.lanePosition.toFixed(1)} m`} />
        </div>

        <div className="mt-3 rounded-xl border border-slate-200 bg-white/80 px-3 py-2">
          <p className="text-[11px] tracking-[0.16em] text-slate-500">目标路线</p>
          <p className="mt-1 break-words text-sm font-medium text-slate-800">
            {vehicle.route.length > 0 ? vehicle.route.join(' → ') : '--'}
          </p>
        </div>
      </div>

      {isConnected ? (
        <div className="grid grid-cols-3 gap-2 rounded-2xl border border-emerald-200 bg-emerald-50/80 p-3">
          <DetailItem label="期望速度" value={formatOptionalSpeed(vehicle.desiredSpeed)} />
          <DetailItem label="期望车头时距" value={formatOptionalSeconds(vehicle.desiredHeadway)} />
          <DetailItem label="期望加速度" value={formatOptionalAcceleration(vehicle.desiredAcceleration)} />
        </div>
      ) : null}

      <div className="rounded-2xl border border-slate-200 bg-white/80 p-4">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <p className="text-xs tracking-[0.2em] text-slate-500">TRACE</p>
            <h3 className="text-sm font-semibold text-slate-950">车辆轨迹追踪</h3>
          </div>
          <button
            className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-white"
            onClick={onExportVehicle}
            type="button"
          >
            导出 CSV
          </button>
        </div>

        <div className="space-y-3">
          <label className="block">
            <div className="mb-1 flex items-center justify-between text-xs text-slate-600">
              <span>历史轨迹窗口</span>
              <span>{trailSeconds}s / {trailPointCount} 点</span>
            </div>
            <input
              className="w-full accent-emerald-500"
              max={60}
              min={5}
              onChange={(event) => onTrailSecondsChange(Number(event.target.value))}
              step={5}
              type="range"
              value={trailSeconds}
            />
          </label>

          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600">
            绿色线表示过去 N 秒轨迹，蓝色虚线表示车辆后续 route，黄色光圈表示当前车辆。
          </div>
        </div>
      </div>
    </div>
  )
}

function LaneDetails({ lane }: { lane: LaneMetrics }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/90 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <p className="text-xs text-slate-500">车道</p>
          <h3 className="text-lg font-semibold text-slate-950">{lane.laneId}</h3>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${laneToneClass(lane.congestionLevel)}`}>
          {laneCongestionLabel(lane.congestionLevel)}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <DetailItem label="车辆数" value={`${lane.vehicleCount}`} />
        <DetailItem label="平均速度" value={formatSpeed(lane.averageSpeed)} />
        <DetailItem label="密度" value={`${lane.densityPerKm.toFixed(1)} 辆/km`} />
        <DetailItem label="占有率" value={`${(lane.occupancy * 100).toFixed(0)}%`} />
        <DetailItem label="排队长度" value={`${lane.queueLength.toFixed(1)} m`} />
        <DetailItem label="所在道路" value={lane.edgeId} />
      </div>
    </div>
  )
}

function EmptyInspector() {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 px-4 py-8 text-center text-sm text-slate-500">
      在画布中点击某辆车查看车辆状态和轨迹；点击某条车道查看车道运行状态。
    </div>
  )
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white/80 px-3 py-2">
      <p className="text-[11px] tracking-[0.12em] text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-slate-900">{value}</p>
    </div>
  )
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={`h-2.5 w-2.5 rounded-full ${color}`} />
      <span>{label}</span>
    </div>
  )
}

function laneCongestionLabel(level: LaneMetrics['congestionLevel']) {
  if (level === 'risk') {
    return '高风险'
  }
  if (level === 'heavy') {
    return '拥堵'
  }
  if (level === 'moderate') {
    return '中度拥堵'
  }
  return '通畅'
}

function laneToneClass(level: LaneMetrics['congestionLevel']) {
  if (level === 'risk') {
    return 'bg-purple-100 text-purple-700'
  }
  if (level === 'heavy') {
    return 'bg-red-100 text-red-700'
  }
  if (level === 'moderate') {
    return 'bg-amber-100 text-amber-700'
  }
  return 'bg-emerald-100 text-emerald-700'
}

function formatSpeed(speedMetersPerSecond: number) {
  return `${(speedMetersPerSecond * 3.6).toFixed(1)} km/h`
}

function formatOptionalSpeed(value: number | null) {
  return value === null ? '--' : formatSpeed(value)
}

function formatOptionalMeters(value: number | null) {
  return value === null ? '--' : `${value.toFixed(1)} m`
}

function formatOptionalSeconds(value: number | null) {
  return value === null ? '--' : `${value.toFixed(2)} s`
}

function formatOptionalAcceleration(value: number | null) {
  return value === null ? '--' : `${value.toFixed(2)} m/s²`
}
