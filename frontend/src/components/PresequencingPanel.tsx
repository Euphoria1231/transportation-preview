import type { PresequencingZone } from '../types/simulation'

interface PresequencingPanelProps {
  zones: PresequencingZone[]
}

export function PresequencingPanel({ zones }: PresequencingPanelProps) {
  const activeCount = zones.filter((zone) => zone.active).length
  const averageIntensity =
    zones.length > 0
      ? zones.reduce((sum, zone) => sum + zone.intensity, 0) / zones.length
      : 0

  return (
    <section className="rounded-2xl border border-slate-200 bg-white/88 p-4 shadow-xl shadow-slate-200/70 backdrop-blur">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-xs tracking-[0.18em] text-slate-500">整序区</p>
          <h2 className="text-lg font-semibold text-slate-900">动态整序控制</h2>
        </div>
        <div className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-right">
          <p className="text-[11px] tracking-[0.16em] text-sky-600">激活</p>
          <p className="text-lg font-semibold text-sky-800">
            {activeCount}/{zones.length || 4}
          </p>
        </div>
      </div>

      <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50/90 px-3 py-3">
        <div className="mb-2 flex items-center justify-between text-sm">
          <span className="text-slate-600">平均激活</span>
          <span className="font-semibold text-slate-900">
            {Math.round(averageIntensity * 100)}%
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-slate-200">
          <div
            className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-emerald-300"
            style={{ width: `${Math.max(0, averageIntensity * 100)}%` }}
          />
        </div>
      </div>

      <div className="space-y-3">
        {zones.length > 0 ? (
          zones.map((zone) => <ZoneCard key={zone.id} zone={zone} />)
        ) : (
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-3 text-sm text-slate-500">
            等待仿真数据。
          </div>
        )}
      </div>
    </section>
  )
}

function ZoneCard({ zone }: { zone: PresequencingZone }) {
  const tone = zone.intent === 'exit' ? 'amber' : 'sky'
  const fillClass = tone === 'amber' ? 'from-amber-400 to-orange-300' : 'from-sky-400 to-cyan-300'
  const badgeClass = zone.active
    ? tone === 'amber'
      ? 'bg-amber-100 text-amber-700'
      : 'bg-sky-100 text-sky-700'
    : 'bg-slate-100 text-slate-600'

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/90 px-3 py-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-900">
            {zone.id} {zone.sourceLane} 至 {zone.targetLane}
          </p>
          <p className="text-xs text-slate-500">{formatTargetFlow(zone.targetFlow)}</p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${badgeClass}`}>
          {zone.active ? '激活' : '待命'}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2 text-xs">
        <MiniMetric label="候选" value={zone.candidateCount} />
        <MiniMetric label="CAV" value={zone.cavCandidateCount} />
        <MiniMetric label="风险" value={`${Math.round(zone.riskScore * 100)}%`} />
      </div>

      <div className="mt-3">
        <div className="mb-1.5 flex items-center justify-between text-xs">
          <span className="text-slate-500">强度</span>
          <span className="font-medium text-slate-900">{Math.round(zone.intensity * 100)}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-slate-200">
          <div
            className={`h-full rounded-full bg-gradient-to-r ${fillClass}`}
            style={{ width: `${Math.max(4, zone.intensity * 100)}%` }}
          />
        </div>
      </div>

      <p className="mt-3 text-xs leading-relaxed text-slate-500">
        {formatReason(zone.reason)}
      </p>
    </div>
  )
}

function MiniMetric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-2 py-2">
      <p className="text-[10px] tracking-[0.14em] text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-slate-900">{value}</p>
    </div>
  )
}

function formatTargetFlow(value: string) {
  return value
    .replace('exit flow', '出口车流')
    .replace('ramp flow', '匝道车流')
    .replace(/lane (\d+)/g, '车道 $1')
    .replace(' to ', ' 至 ')
}

function formatReason(value: string) {
  return value
    .replace('lane-change control disabled', '协同调控关闭')
    .replace('no candidate vehicles in zone', '整序区暂无候选车辆')
    .replace('active sequencing pressure', '整序压力已激活')
}
