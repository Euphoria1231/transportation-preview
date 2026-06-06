interface ControlPanelProps {
  running: boolean
  busy: boolean
  replayMode: boolean
  replayPercent: number
  historyCount: number
  replayTimeLabel: string
  onStart: () => Promise<void>
  onPause: () => Promise<void>
  onReset: () => Promise<void>
  onStep: () => Promise<void>
  onResetViewport: () => void
  onReplayModeChange: (enabled: boolean) => void
  onReplayPercentChange: (percent: number) => void
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
  replayMode,
  replayPercent,
  historyCount,
  replayTimeLabel,
  onStart,
  onPause,
  onReset,
  onStep,
  onResetViewport,
  onReplayModeChange,
  onReplayPercentChange,
}: ControlPanelProps) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-xl shadow-slate-200/70 backdrop-blur">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-xs tracking-[0.28em] text-slate-500">CONTROL</p>
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

      <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/90 p-3">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs tracking-[0.2em] text-slate-500">REPLAY</p>
            <h3 className="text-sm font-semibold text-slate-900">时间轴回放</h3>
          </div>
          <button
            className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
              replayMode
                ? 'bg-blue-100 text-blue-700'
                : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
            } disabled:cursor-not-allowed disabled:opacity-50`}
            disabled={historyCount < 2}
            onClick={() => onReplayModeChange(!replayMode)}
            type="button"
          >
            {replayMode ? '回放中' : '实时'}
          </button>
        </div>

        <label className="block">
          <div className="mb-1 flex items-center justify-between text-xs text-slate-600">
            <span>{replayMode ? replayTimeLabel : '最近 60 秒缓存'}</span>
            <span>{historyCount} 帧</span>
          </div>
          <input
            className="w-full accent-blue-500 disabled:opacity-40"
            disabled={historyCount < 2}
            max={100}
            min={0}
            onChange={(event) => {
              onReplayModeChange(true)
              onReplayPercentChange(Number(event.target.value) / 100)
            }}
            step={1}
            type="range"
            value={Math.round(replayPercent * 100)}
          />
        </label>
      </div>
    </section>
  )
}
