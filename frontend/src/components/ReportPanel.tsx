import { useEffect, useState } from 'react'

import {
  compareWithBaseline,
  fetchAnalysisSummary,
  fetchBaselineResult,
  generateSimulationReport,
  saveBaselineResult,
} from '../services/api'
import type { AnalysisSummary, ComparisonReport, SimulationReport } from '../types/simulation'

interface ReportPanelProps {
  refreshKey: number
}

export function ReportPanel({ refreshKey }: ReportPanelProps) {
  const [summary, setSummary] = useState<AnalysisSummary | null>(null)
  const [baseline, setBaseline] = useState<AnalysisSummary | null>(null)
  const [simulationReport, setSimulationReport] = useState<SimulationReport | null>(null)
  const [comparisonReport, setComparisonReport] = useState<ComparisonReport | null>(null)
  const [busyAction, setBusyAction] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    const load = async () => {
      try {
        const [nextSummary, baselineResponse] = await Promise.all([
          fetchAnalysisSummary(),
          fetchBaselineResult(),
        ])
        if (!mounted) {
          return
        }
        setSummary(nextSummary)
        setBaseline(baselineResponse.baseline)
        setError(null)
      } catch (nextError) {
        if (!mounted) {
          return
        }
        setError(nextError instanceof Error ? nextError.message : '报告状态加载失败。')
      }
    }

    void load()
    return () => {
      mounted = false
    }
  }, [refreshKey])

  const handleGenerateCurrent = async () => {
    setBusyAction('current')
    try {
      const report = await generateSimulationReport()
      setSimulationReport(report)
      setComparisonReport(null)
      setError(null)
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : '单次报告生成失败。')
    } finally {
      setBusyAction(null)
    }
  }

  const handleSaveBaseline = async () => {
    setBusyAction('baseline')
    try {
      const nextBaseline = await saveBaselineResult()
      setBaseline(nextBaseline)
      setError(null)
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : '基线保存失败。')
    } finally {
      setBusyAction(null)
    }
  }

  const handleCompare = async () => {
    setBusyAction('compare')
    try {
      const report = await compareWithBaseline()
      setComparisonReport(report)
      setSimulationReport(null)
      setError(null)
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : '对比报告生成失败。')
    } finally {
      setBusyAction(null)
    }
  }

  const activeReport = comparisonReport ?? simulationReport
  const canCompare = baseline !== null
  const hasSamples = summary !== null && summary.simulationDuration > 0

  return (
    <section className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-xl shadow-slate-200/70 backdrop-blur">
        <div className="mb-4">
          <p className="text-xs tracking-[0.28em] text-slate-500">REPORT</p>
          <h2 className="text-lg font-semibold text-slate-950">仿真报告</h2>
        </div>

        {error ? (
          <div className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </div>
        ) : null}

        <div className="mb-4 grid grid-cols-2 gap-2">
          <SummaryMetric label="当前时长" value={summary ? `${summary.simulationDuration.toFixed(1)} s` : '--'} />
          <SummaryMetric label="车辆数" value={summary ? `${summary.totalVehiclesSeen}` : '--'} />
          <SummaryMetric label="平均速度" value={summary ? `${summary.averageSpeedKmh.toFixed(1)} km/h` : '--'} />
          <SummaryMetric label="高风险" value={summary ? `${summary.totalHighRiskEvents} 次` : '--'} />
        </div>

        <JudgeComparisonCard baseline={baseline} summary={summary} />

        <div className="grid grid-cols-1 gap-2">
          <ReportButton
            disabled={!hasSamples || busyAction !== null}
            label={busyAction === 'current' ? '生成中...' : '生成单次报告'}
            onClick={handleGenerateCurrent}
          />
          <ReportButton
            disabled={!hasSamples || busyAction !== null}
            label={
              busyAction === 'baseline'
                ? '保存中...'
                : isNoControlScenario(summary?.scenarioConfig)
                  ? '保存对照基线'
                  : '保存为基线'
            }
            onClick={handleSaveBaseline}
          />
          <ReportButton
            disabled={!canCompare || !hasSamples || busyAction !== null}
            label={busyAction === 'compare' ? '对比中...' : '生成对比报告'}
            onClick={handleCompare}
          />
        </div>

        {!baseline ? (
          <p className="mt-3 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-500">
            暂无基线。
          </p>
        ) : (
          <p className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs leading-5 text-emerald-800">
            已保存基线：{formatScenarioMode(baseline.scenarioConfig)}，{baseline.simulationDuration.toFixed(1)} s，CAV {(baseline.cavPenetrationRate * 100).toFixed(0)}%。
          </p>
        )}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white/88 p-4 shadow-xl shadow-slate-200/70 backdrop-blur">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs tracking-[0.2em] text-slate-500">OUTPUT</p>
            <h3 className="text-sm font-semibold text-slate-950">报告内容</h3>
          </div>
          <div className="flex gap-2">
            <button
              className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!activeReport}
              onClick={() => activeReport && exportReport(activeReport, 'json')}
              type="button"
            >
              JSON
            </button>
            <button
              className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!activeReport}
              onClick={() => activeReport && exportReport(activeReport, 'markdown')}
              type="button"
            >
              Markdown
            </button>
          </div>
        </div>

        {comparisonReport ? (
          <ComparisonReportView report={comparisonReport} />
        ) : simulationReport ? (
          <SimulationReportView report={simulationReport} />
        ) : (
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
            暂无报告。
          </div>
        )}
      </div>
    </section>
  )
}

function JudgeComparisonCard({
  baseline,
  summary,
}: {
  baseline: AnalysisSummary | null
  summary: AnalysisSummary | null
}) {
  const hasBaseline = baseline !== null && baseline.simulationDuration > 0
  const hasCurrent = summary !== null && summary.simulationDuration > 0
  const baselineIsNoControl = isNoControlScenario(baseline?.scenarioConfig)
  const currentIsAlgorithm = isAlgorithmScenario(summary?.scenarioConfig)

  return (
    <section className="mb-4 rounded-2xl border border-slate-200 bg-slate-50/90 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs tracking-[0.18em] text-slate-500">对照</p>
          <h3 className="mt-1 text-base font-semibold text-slate-950">无控对照 vs 协同调控</h3>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${
          baselineIsNoControl && currentIsAlgorithm
            ? 'bg-emerald-100 text-emerald-700'
            : 'bg-amber-100 text-amber-700'
        }`}>
          {baselineIsNoControl && currentIsAlgorithm ? '对照完整' : '等待完整对照'}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <RunSummaryCard
          label="对照基线"
          mode={baseline ? formatScenarioMode(baseline.scenarioConfig) : '未保存'}
          speed={baseline?.averageSpeedKmh ?? null}
          delay={baseline?.averageDelay ?? null}
          risk={baseline?.totalHighRiskEvents ?? null}
          tone="baseline"
        />
        <RunSummaryCard
          label="当前运行"
          mode={summary ? formatScenarioMode(summary.scenarioConfig) : '无数据'}
          speed={summary?.averageSpeedKmh ?? null}
          delay={summary?.averageDelay ?? null}
          risk={summary?.totalHighRiskEvents ?? null}
          tone="current"
        />
      </div>

      {hasBaseline && hasCurrent ? (
        <div className="mt-3 space-y-2">
          <ComparisonMetricRow
            baseline={baseline.averageSpeedKmh}
            current={summary.averageSpeedKmh}
            label="平均速度"
            positiveDirection="higher"
            unit="km/h"
          />
          <ComparisonMetricRow
            baseline={baseline.averageDelay}
            current={summary.averageDelay}
            label="平均延误"
            positiveDirection="lower"
            unit="s"
          />
          <ComparisonMetricRow
            baseline={baseline.totalHardBrakes}
            current={summary.totalHardBrakes}
            label="急刹事件"
            positiveDirection="lower"
            unit="次"
          />
          <ComparisonMetricRow
            baseline={baseline.totalHighRiskEvents}
            current={summary.totalHighRiskEvents}
            label="高风险事件"
            positiveDirection="lower"
            unit="次"
          />
        </div>
      ) : (
        <p className="mt-3 rounded-xl border border-slate-200 bg-white px-3 py-3 text-xs leading-5 text-slate-500">
          先保存“无控对照”基线，再运行“协同调控”。
        </p>
      )}
    </section>
  )
}

function RunSummaryCard({
  label,
  mode,
  speed,
  delay,
  risk,
  tone,
}: {
  label: string
  mode: string
  speed: number | null
  delay: number | null
  risk: number | null
  tone: 'baseline' | 'current'
}) {
  return (
    <div className={`rounded-xl border px-3 py-3 ${
      tone === 'baseline'
        ? 'border-rose-200 bg-rose-50'
        : 'border-emerald-200 bg-emerald-50'
    }`}>
      <p className="text-xs font-semibold text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-slate-950">{mode}</p>
      <div className="mt-3 space-y-1 text-xs text-slate-600">
        <p>速度 {speed === null ? '--' : `${speed.toFixed(1)} km/h`}</p>
        <p>延误 {delay === null ? '--' : `${delay.toFixed(2)} s`}</p>
        <p>高风险 {risk === null ? '--' : `${risk} 次`}</p>
      </div>
    </div>
  )
}

function ComparisonMetricRow({
  label,
  baseline,
  current,
  unit,
  positiveDirection,
}: {
  label: string
  baseline: number
  current: number
  unit: string
  positiveDirection: 'higher' | 'lower'
}) {
  const absolute = current - baseline
  const improvement = positiveDirection === 'higher' ? absolute : -absolute
  const percent = baseline === 0 ? null : (improvement / Math.abs(baseline)) * 100
  const width = Math.min(Math.abs(percent ?? improvement * 10), 100)
  const improved = improvement >= 0

  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
      <div className="mb-2 flex items-center justify-between gap-3 text-xs">
        <span className="font-semibold text-slate-700">{label}</span>
        <span className={improved ? 'text-emerald-600' : 'text-rose-600'}>
          {improved ? '改善' : '恶化'} {formatImpact(percent, improvement, unit)}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-200">
        <div
          className={`h-full rounded-full ${improved ? 'bg-emerald-400' : 'bg-rose-400'}`}
          style={{ width: `${Math.max(width, 4)}%` }}
        />
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-slate-500">
        <span>基线 {formatValue(baseline, unit)}</span>
        <span>当前 {formatValue(current, unit)}</span>
      </div>
    </div>
  )
}

function SimulationReportView({ report }: { report: SimulationReport }) {
  return (
    <div className="space-y-3 text-sm text-slate-700">
      <ReportLine label="生成时间" value={formatDate(report.generatedAt)} />
      <ReportLine label="场景" value={report.scenarioName} />
      <ReportLine label="平均速度" value={`${report.averageSpeedKmh.toFixed(1)} km/h`} />
      <ReportLine label="平均延误" value={`${report.averageDelay.toFixed(2)} s`} />
      <ReportLine label="急刹 / 高风险" value={`${report.totalHardBrakes} / ${report.totalHighRiskEvents} 次`} />
      <ReportLine label="拥堵摘要" value={report.congestionSummary} />
      <ReportLine label="风险摘要" value={report.riskSummary} />
      <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 leading-6 text-slate-800">
        {report.conclusion}
      </p>
    </div>
  )
}

function ComparisonReportView({ report }: { report: ComparisonReport }) {
  return (
    <div className="space-y-3 text-sm text-slate-700">
      <ReportLine label="生成时间" value={formatDate(report.generatedAt)} />
      <ReportLine label="基线模式" value={formatScenarioMode(report.baselineSummary.scenarioConfig)} />
      <ReportLine label="当前模式" value={formatScenarioMode(report.experimentSummary.scenarioConfig)} />
      <ReportLine
        label="CAV"
        value={`${(report.baselineSummary.cavPenetrationRate * 100).toFixed(0)}% → ${(report.experimentSummary.cavPenetrationRate * 100).toFixed(0)}%`}
      />
      <ReportLine label="速度变化" value={formatDelta(report.deltas.averageSpeedChangePercent, report.deltas.averageSpeedAbsoluteChange, 'km/h')} />
      <ReportLine label="延误变化" value={formatDelta(report.deltas.averageDelayChangePercent, report.deltas.averageDelayAbsoluteChange, 's')} />
      <ReportLine label="急刹变化" value={formatDelta(report.deltas.hardBrakeChangePercent, report.deltas.hardBrakeAbsoluteChange, '次')} />
      <ReportLine label="高风险变化" value={formatDelta(report.deltas.highRiskEventChangePercent, report.deltas.highRiskEventAbsoluteChange, '次')} />
      <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 leading-6 text-slate-800">
        {report.conclusion}
      </p>
    </div>
  )
}

function SummaryMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/90 px-3 py-2">
      <p className="text-[11px] tracking-[0.14em] text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-slate-950">{value}</p>
    </div>
  )
}

function ReportButton({
  label,
  disabled,
  onClick,
}: {
  label: string
  disabled: boolean
  onClick: () => Promise<void>
}) {
  return (
    <button
      className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
      disabled={disabled}
      onClick={() => void onClick()}
      type="button"
    >
      {label}
    </button>
  )
}

function ReportLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-xl border border-slate-200 bg-white/80 px-3 py-2">
      <span className="shrink-0 text-slate-500">{label}</span>
      <span className="text-right font-medium text-slate-900">{value}</span>
    </div>
  )
}

function formatDelta(percent: number | null, absolute: number, unit: string) {
  if (percent === null) {
    return `${absolute >= 0 ? '+' : ''}${absolute.toFixed(2)} ${unit}（绝对变化）`
  }
  return `${percent >= 0 ? '+' : ''}${percent.toFixed(1)}%`
}

function formatDate(value: string) {
  return new Date(value).toLocaleString()
}

function isNoControlScenario(config: AnalysisSummary['scenarioConfig'] | undefined) {
  return Boolean(
    config &&
      !config.enableCavLaneChangeControl &&
      !config.disableSumoLaneChangeControl,
  )
}

function isAlgorithmScenario(config: AnalysisSummary['scenarioConfig'] | undefined) {
  return Boolean(
    config &&
      config.enableCavLaneChangeControl &&
      !config.disableSumoLaneChangeControl,
  )
}

function formatScenarioMode(config: AnalysisSummary['scenarioConfig']) {
  if (!config) {
    return '未知模式'
  }
  if (isNoControlScenario(config)) {
    return '无控对照'
  }
  if (isAlgorithmScenario(config)) {
    return '协同调控'
  }
  if (config.enableCavLaneChangeControl) {
    return '协同调控'
  }
  return '换道关闭'
}

function formatImpact(percent: number | null, absolute: number, unit: string) {
  if (percent === null) {
    return `${Math.abs(absolute).toFixed(2)} ${unit}`
  }
  return `${Math.abs(percent).toFixed(1)}%`
}

function formatValue(value: number, unit: string) {
  const digits = Math.abs(value) >= 10 || unit === '次' ? 0 : 2
  return `${value.toFixed(digits)} ${unit}`
}

function exportReport(report: SimulationReport | ComparisonReport, format: 'json' | 'markdown') {
  const isComparison = 'baselineSummary' in report
  const content =
    format === 'json'
      ? JSON.stringify(report, null, 2)
      : isComparison
        ? comparisonToMarkdown(report)
        : simulationToMarkdown(report)
  const blob = new Blob([content], {
    type: format === 'json' ? 'application/json;charset=utf-8' : 'text/markdown;charset=utf-8',
  })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `${isComparison ? 'comparison-report' : 'simulation-report'}.${format === 'json' ? 'json' : 'md'}`
  anchor.click()
  URL.revokeObjectURL(url)
}

function simulationToMarkdown(report: SimulationReport) {
  return [
    '# 单次仿真报告',
    '',
    `- 生成时间: ${report.generatedAt}`,
    `- 场景: ${report.scenarioName}`,
    `- 仿真时长: ${report.simulationDuration} s`,
    `- 平均速度: ${report.averageSpeedKmh} km/h`,
    `- 平均延误: ${report.averageDelay} s`,
    `- 急刹事件: ${report.totalHardBrakes} 次`,
    `- 高风险事件: ${report.totalHighRiskEvents} 次`,
    `- 最小 TTC: ${report.minTtc ?? '--'} s`,
    '',
    `拥堵摘要: ${report.congestionSummary}`,
    `风险摘要: ${report.riskSummary}`,
    '',
    `结论: ${report.conclusion}`,
  ].join('\n')
}

function comparisonToMarkdown(report: ComparisonReport) {
  return [
    '# 基线对比报告',
    '',
    `- 生成时间: ${report.generatedAt}`,
    `- 基线模式: ${formatScenarioMode(report.baselineSummary.scenarioConfig)}`,
    `- 当前模式: ${formatScenarioMode(report.experimentSummary.scenarioConfig)}`,
    `- 平均速度变化: ${formatDelta(report.deltas.averageSpeedChangePercent, report.deltas.averageSpeedAbsoluteChange, 'km/h')}`,
    `- 平均延误变化: ${formatDelta(report.deltas.averageDelayChangePercent, report.deltas.averageDelayAbsoluteChange, 's')}`,
    `- 急刹事件变化: ${formatDelta(report.deltas.hardBrakeChangePercent, report.deltas.hardBrakeAbsoluteChange, '次')}`,
    `- 高风险事件变化: ${formatDelta(report.deltas.highRiskEventChangePercent, report.deltas.highRiskEventAbsoluteChange, '次')}`,
    '',
    `结论: ${report.conclusion}`,
  ].join('\n')
}
