import type { LaneChangeEvent } from '../types/simulation'

interface EventFeedProps {
  event: LaneChangeEvent | null
}

export function EventFeed({ event }: EventFeedProps) {
  return (
    <section className="rounded-2xl border border-slate-800/70 bg-slate-950/70 p-4 shadow-2xl shadow-black/20 backdrop-blur">
      <div className="mb-4">
        <p className="text-xs uppercase tracking-[0.28em] text-slate-400">Events</p>
        <h2 className="text-lg font-semibold text-white">Latest Lane Change</h2>
      </div>

      {event ? (
        <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-900/70 p-4 text-sm text-slate-200">
          <div className="flex items-center justify-between">
            <span className="text-slate-400">Vehicle</span>
            <span className="font-semibold text-white">{event.vehicleId}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-400">Step</span>
            <span>{event.step}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-400">From</span>
            <span>
              {event.fromEdge} / lane {event.fromLane}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-400">To Lane</span>
            <span>{event.toLane}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-400">Destination</span>
            <span>{event.destination ?? '--'}</span>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-slate-700 bg-slate-900/40 px-4 py-6 text-sm text-slate-400">
          No lane change event yet.
        </div>
      )}
    </section>
  )
}
