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
  edgeId: string
  laneId: string
  laneIndex: number
  length: number
  width: number
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

export type ConnectionStatus = 'connecting' | 'open' | 'error'
