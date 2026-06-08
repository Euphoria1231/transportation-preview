export type Point = [number, number]

export interface Bounds {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

export interface Lane {
  id: string
  edgeId: string
  index: number
  speed: number
  shape: Point[]
}

export interface NetworkConfig {
  bounds: Bounds
  lanes: Lane[]
  stepLength: number
}

export type ScenarioPreset =
  | 'balanced'
  | 'high-flow'
  | 'high-cav'
  | 'low-cav'
  | 'ramp-heavy'
  | 'exit-heavy'

export interface ScenarioConfig {
  simulationDuration: number
  stepLength: number
  totalFlow: number
  cavPenetrationRate: number
  mainlineRatio: number
  rampRatio: number
  exitRatio: number
  speedLimitKmh: number
  randomSeed: number
  enableCavLaneChangeControl: boolean
  scenarioPreset: ScenarioPreset
}

export interface ScenarioFlowPlan {
  totalFlow: number
  cavFlow: number
  hdvFlow: number
  mainlineFlow: number
  rampFlow: number
  exitFlow: number
  straightFlow: number
  straightFlowA: number
  straightFlowB: number
  straightFlowAConnected: number
  straightFlowAHuman: number
  straightFlowBConnected: number
  straightFlowBHuman: number
  exitFlowConnected: number
  exitFlowHuman: number
  rampFlowConnected: number
  rampFlowHuman: number
  speedLimitMetersPerSecond: number
}

export interface LaneChangeEvent {
  step: number
  vehicleId: string
  fromEdge: string
  fromLane: number
  toLane: number
  destination: string | null
}

export interface VehicleState {
  id: string
  type: string
  x: number
  y: number
  angle: number
  speed: number
  acceleration: number
  edgeId: string
  laneId: string
  laneIndex: number
  lanePosition: number
  length: number
  width: number
  route: string[]
  leaderId: string | null
  leaderGap: number | null
  isChangingLane: boolean
  desiredSpeed: number | null
  desiredHeadway: number | null
  desiredAcceleration: number | null
  color: string
}

export interface SimulationState {
  simTime: number
  step: number
  running: boolean
  vehicleCount: number
  connectedCount: number
  lastLaneChangeEvent: LaneChangeEvent | null
  vehicles: VehicleState[]
  error: string | null
}

export interface ScenarioCurrentResponse {
  config: ScenarioConfig
  flowPlan: ScenarioFlowPlan
}

export interface ScenarioApplyResponse extends ScenarioCurrentResponse {
  state: SimulationState
}

export type ConnectionStatus = 'connecting' | 'open' | 'error'

export interface SimulationSnapshot {
  capturedAt: number
  state: SimulationState
}

export interface LaneMetrics {
  laneId: string
  edgeId: string
  laneIndex: number
  vehicleCount: number
  averageSpeed: number
  densityPerKm: number
  occupancy: number
  queueLength: number
  congestionLevel: 'free' | 'moderate' | 'heavy' | 'risk'
}

export type RiskEventType = 'low_ttc' | 'hard_brake' | 'queue_spillback' | 'stopped_vehicle'
export type RiskSeverity = 'low' | 'medium' | 'high'
export type LaneRiskLevel = 'free' | 'moderate' | 'congested' | 'risk'
export type HeatmapMode =
  | 'speed'
  | 'density'
  | 'congestion'
  | 'risk'
  | 'emission'
  | 'laneChangeFrequency'

export interface HeatmapValues {
  speed: number
  density: number
  congestion: number
  risk: number
  emission: number
  laneChangeFrequency: number
}

export interface LaneMetric {
  laneId: string
  edgeId: string
  laneIndex: number
  vehicleCount: number
  averageSpeed: number
  averageSpeedKmh: number
  densityPerKm: number
  occupancy: number
  queueLength: number
  laneChangeCount: number
  minTtc: number | null
  riskLevel: LaneRiskLevel
  heatmapValues: HeatmapValues
  sampleStep?: number
  sampleTime?: number
}

export interface RiskEvent {
  time: number
  step: number
  type: RiskEventType
  vehicleId?: string
  laneId?: string
  value?: number
  severity: RiskSeverity
}

export interface MetricSample {
  simTime: number
  step: number
  averageSpeed: number
  averageSpeedKmh: number
  vehicleCount: number
  connectedCount: number
  cavPenetrationRate: number
  densityPerKm: number
  averageDelay: number
  queueLength: number
  laneChangeCount: number
  minTtc: number | null
  hardBrakeCount: number
  highRiskEventCount: number
  laneMetrics: LaneMetric[]
  riskEvents: RiskEvent[]
  emission?: {
    isProxy: boolean
    description: string
    networkProxy: number
  }
  metricNotes?: Record<string, string>
}

export interface RankedLaneSummary {
  laneId: string
  edgeId: string
  laneIndex: number
  congestionScore?: number
  riskScore?: number
  queueLength: number
}

export interface AnalysisSummary {
  simulationDuration: number
  totalVehiclesSeen: number
  averageSpeedKmh: number
  averageDelay: number
  totalLaneChanges: number
  totalHardBrakes: number
  totalHighRiskEvents: number
  minTtc: number | null
  cavPenetrationRate: number
  worstLanesByCongestion: RankedLaneSummary[]
  worstLanesByRisk: RankedLaneSummary[]
  scenarioConfig: ScenarioConfig | null
}

export interface SimulationReport {
  generatedAt: string
  scenarioName: string
  scenarioConfig: ScenarioConfig | null
  simulationDuration: number
  totalVehiclesSeen: number
  averageSpeedKmh: number
  averageDelay: number
  totalLaneChanges: number
  totalHardBrakes: number
  totalHighRiskEvents: number
  minTtc: number | null
  cavPenetrationRate: number
  congestionSummary: string
  riskSummary: string
  conclusion: string
  metricNotes?: Record<string, string>
}

export interface ComparisonDeltas {
  averageSpeedChangePercent: number | null
  averageSpeedAbsoluteChange: number
  averageDelayChangePercent: number | null
  averageDelayAbsoluteChange: number
  hardBrakeChangePercent: number | null
  hardBrakeAbsoluteChange: number
  highRiskEventChangePercent: number | null
  highRiskEventAbsoluteChange: number
  laneChangeChangePercent: number | null
  laneChangeAbsoluteChange: number
}

export interface ComparisonReport {
  generatedAt: string
  baselineSummary: AnalysisSummary
  experimentSummary: AnalysisSummary
  deltas: ComparisonDeltas
  conclusion: string
}

export interface BaselineResponse {
  baseline: AnalysisSummary | null
}
