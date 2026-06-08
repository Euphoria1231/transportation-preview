import type { HeatmapMode } from '../types/simulation'

interface HeatmapControlsProps {
  mode: HeatmapMode | null
  onModeChange: (mode: HeatmapMode | null) => void
}

const HEATMAP_OPTIONS: Array<{ mode: HeatmapMode; label: string; note: string }> = [
  { mode: 'speed', label: '速度', note: '低速更深' },
  { mode: 'density', label: '密度', note: '辆/km' },
  { mode: 'congestion', label: '拥堵', note: '排队/占有率' },
  { mode: 'risk', label: '风险', note: 'TTC/急刹' },
  { mode: 'emission', label: '排放 proxy', note: '估算' },
  { mode: 'laneChangeFrequency', label: '变道频率', note: 'step 内' },
]

export function HeatmapControls({ mode, onModeChange }: HeatmapControlsProps) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white/85 p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs tracking-[0.18em] text-slate-500">HEATMAP</p>
          <h3 className="text-sm font-semibold text-slate-950">车道热力图</h3>
        </div>
        <button
          className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
          disabled={mode === null}
          onClick={() => onModeChange(null)}
          type="button"
        >
          关闭
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {HEATMAP_OPTIONS.map((option) => (
          <button
            className={`rounded-xl border px-3 py-2 text-left transition ${
              mode === option.mode
                ? 'border-sky-300 bg-sky-50 text-sky-800'
                : 'border-slate-200 bg-slate-50/80 text-slate-700 hover:bg-white'
            }`}
            key={option.mode}
            onClick={() => onModeChange(option.mode)}
            type="button"
          >
            <span className="block text-sm font-semibold">{option.label}</span>
            <span className="mt-0.5 block text-[11px] text-slate-500">{option.note}</span>
          </button>
        ))}
      </div>

      <div className="mt-3 grid grid-cols-4 gap-2 text-[11px] text-slate-600">
        <LegendSwatch color="bg-emerald-500" label="通畅" />
        <LegendSwatch color="bg-yellow-400" label="一般" />
        <LegendSwatch color="bg-red-500" label="拥堵" />
        <LegendSwatch color="bg-purple-600" label="高风险" />
      </div>
      <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
        排放模式当前是 speed + acceleration proxy，不等同于真实 CO2/NOx/fuel。
      </p>
    </div>
  )
}

function LegendSwatch({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={`h-2.5 w-2.5 rounded-full ${color}`} />
      <span>{label}</span>
    </div>
  )
}
