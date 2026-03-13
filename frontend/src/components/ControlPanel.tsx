interface ControlPanelProps {
  running: boolean
  busy: boolean
  onStart: () => Promise<void>
  onPause: () => Promise<void>
  onReset: () => Promise<void>
  onStep: () => Promise<void>
  onResetViewport: () => void
}

function PanelButton({
  label,
  onClick,
  disabled,
  accent = false,
}: {
  label: string
  onClick: () => Promise<void> | void
  disabled: boolean
  accent?: boolean
}) {
  return (
    <button
      className={`rounded-xl border px-4 py-2 text-sm font-semibold transition ${
        accent
          ? 'border-emerald-400/40 bg-emerald-500/20 text-emerald-100 hover:bg-emerald-500/30'
          : 'border-slate-700 bg-slate-900/70 text-slate-100 hover:border-slate-500 hover:bg-slate-800/80'
      } disabled:cursor-not-allowed disabled:opacity-50`}
      disabled={disabled}
      onClick={() => void onClick()}
      type="button"
    >
      {label}
    </button>
  )
}

export function ControlPanel({
  running,
  busy,
  onStart,
  onPause,
  onReset,
  onStep,
  onResetViewport,
}: ControlPanelProps) {
  return (
    <section className="rounded-2xl border border-slate-800/70 bg-slate-950/70 p-4 shadow-2xl shadow-black/20 backdrop-blur">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.28em] text-slate-400">Controls</p>
          <h2 className="text-lg font-semibold text-white">Simulation Runner</h2>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold ${
            running ? 'bg-emerald-500/20 text-emerald-200' : 'bg-amber-500/20 text-amber-200'
          }`}
        >
          {running ? 'Running' : 'Paused'}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <PanelButton accent disabled={busy || running} label="Start" onClick={onStart} />
        <PanelButton disabled={busy || !running} label="Pause" onClick={onPause} />
        <PanelButton disabled={busy} label="Step" onClick={onStep} />
        <PanelButton disabled={busy} label="Reset" onClick={onReset} />
      </div>

      <div className="mt-3">
        <PanelButton disabled={busy} label="Reset View" onClick={onResetViewport} />
      </div>
    </section>
  )
}
