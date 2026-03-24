import type { LaneChangeEvent } from '../types/simulation'

interface EventFeedProps {
  event: LaneChangeEvent | null
}

export function EventFeed({ event }: EventFeedProps) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white/88 p-4 shadow-xl shadow-slate-200/70 backdrop-blur">
      <div className="mb-4">
        <p className="text-xs tracking-[0.28em] text-slate-500">事件</p>
        <h2 className="text-lg font-semibold text-slate-900">最新变道事件</h2>
      </div>

      {event ? (
        <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/90 p-4 text-sm text-slate-700">
          <div className="flex items-center justify-between">
            <span className="text-slate-500">车辆</span>
            <span className="font-semibold text-slate-900">{event.vehicleId}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-500">步数</span>
            <span>{event.step}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-500">来源车道</span>
            <span>
              {event.fromEdge} / 车道 {event.fromLane}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-500">目标车道</span>
            <span>{event.toLane}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-500">目标方向</span>
            <span>{event.destination ?? '--'}</span>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/70 px-4 py-6 text-sm text-slate-500">
          暂无变道事件。
        </div>
      )}
    </section>
  )
}
