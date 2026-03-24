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
          ? 'border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
          : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300 hover:bg-white'
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
    <section className="rounded-2xl border border-slate-200 bg-white/88 p-4 shadow-xl shadow-slate-200/70 backdrop-blur">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-xs tracking-[0.28em] text-slate-500">控制台</p>
          <h2 className="text-lg font-semibold text-slate-900">仿真控制</h2>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold ${
            running ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
          }`}
        >
          {running ? '运行中' : '已暂停'}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <PanelButton accent disabled={busy || running} label="开始" onClick={onStart} />
        <PanelButton disabled={busy || !running} label="暂停" onClick={onPause} />
        <PanelButton disabled={busy} label="单步" onClick={onStep} />
        <PanelButton disabled={busy} label="重置" onClick={onReset} />
      </div>

      <div className="mt-3">
        <PanelButton disabled={busy} label="重置视图" onClick={onResetViewport} />
      </div>
    </section>
  )
}
