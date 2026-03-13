import type { ConnectionStatus, SimulationState } from '../types/simulation'

interface StatusPanelProps {
  simulation: SimulationState | null
  connectionStatus: ConnectionStatus
}

function formatConnectionStatus(status: ConnectionStatus) {
  if (status === 'open') {
    return 'Connected'
  }
  if (status === 'error') {
    return 'Reconnecting'
  }
  return 'Connecting'
}

export function StatusPanel({ simulation, connectionStatus }: StatusPanelProps) {
  const stats = [
    { label: 'Sim Time', value: simulation ? `${simulation.simTime.toFixed(1)} s` : '--' },
    { label: 'Step', value: simulation ? simulation.step : '--' },
    { label: 'Vehicles', value: simulation ? simulation.vehicleCount : '--' },
    { label: 'Connected', value: simulation ? simulation.connectedCount : '--' },
  ]

  return (
    <section className="rounded-2xl border border-slate-800/70 bg-slate-950/70 p-4 shadow-2xl shadow-black/20 backdrop-blur">
      <div className="mb-4">
        <p className="text-xs uppercase tracking-[0.28em] text-slate-400">Status</p>
        <h2 className="text-lg font-semibold text-white">Live Telemetry</h2>
      </div>

      <div className="mb-4 flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/70 px-3 py-2">
        <span className="text-sm text-slate-300">Stream</span>
        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold ${
            connectionStatus === 'open'
              ? 'bg-sky-500/20 text-sky-100'
              : connectionStatus === 'error'
                ? 'bg-rose-500/20 text-rose-100'
                : 'bg-slate-700/80 text-slate-200'
          }`}
        >
          {formatConnectionStatus(connectionStatus)}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {stats.map((item) => (
          <div
            className="rounded-xl border border-slate-800 bg-slate-900/70 px-3 py-3"
            key={item.label}
          >
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">{item.label}</p>
            <p className="mt-2 text-xl font-semibold text-white">{item.value}</p>
          </div>
        ))}
      </div>

      {simulation?.error ? (
        <div className="mt-4 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">
          {simulation.error}
        </div>
      ) : null}
    </section>
  )
}
