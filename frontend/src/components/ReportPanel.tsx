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

        <div className="grid grid-cols-1 gap-2">
          <ReportButton
            disabled={!hasSamples || busyAction !== null}
            label={busyAction === 'current' ? '生成中...' : '生成单次报告'}
            onClick={handleGenerateCurrent}
          />
          <ReportButton
            disabled={!hasSamples || busyAction !== null}
            label={busyAction === 'baseline' ? '保存中...' : '保存为基线'}
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
            尚未保存基线，因此对比报告不可用。请先运行一个场景并保存为基线。
          </p>
        ) : (
          <p className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs leading-5 text-emerald-800">
            已保存基线：{baseline.simulationDuration.toFixed(1)} s，CAV {(baseline.cavPenetrationRate * 100).toFixed(0)}%。
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
            生成报告后将在这里显示结构化内容。
          </div>
        )}
      </div>
    </section>
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
    `- 平均速度变化: ${formatDelta(report.deltas.averageSpeedChangePercent, report.deltas.averageSpeedAbsoluteChange, 'km/h')}`,
    `- 平均延误变化: ${formatDelta(report.deltas.averageDelayChangePercent, report.deltas.averageDelayAbsoluteChange, 's')}`,
    `- 急刹事件变化: ${formatDelta(report.deltas.hardBrakeChangePercent, report.deltas.hardBrakeAbsoluteChange, '次')}`,
    `- 高风险事件变化: ${formatDelta(report.deltas.highRiskEventChangePercent, report.deltas.highRiskEventAbsoluteChange, '次')}`,
    '',
    `结论: ${report.conclusion}`,
  ].join('\n')
}
