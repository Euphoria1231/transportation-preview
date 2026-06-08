import type { Lane, LaneMetrics, NetworkConfig, SimulationSnapshot, SimulationState, VehicleState } from '../types/simulation'

export const HISTORY_WINDOW_MS = 60_000

export function appendSnapshot(
  history: SimulationSnapshot[],
  state: SimulationState,
  capturedAt = Date.now(),
) {
  const cutoff = capturedAt - HISTORY_WINDOW_MS
  return [
    ...history.filter((snapshot) => snapshot.capturedAt >= cutoff),
    {
      capturedAt,
      state,
    },
  ]
}

export function findSnapshotAt(
  history: SimulationSnapshot[],
  offsetPercent: number,
): SimulationSnapshot | null {
  if (history.length === 0) {
    return null
  }

  const first = history[0]
  const last = history[history.length - 1]
  const duration = Math.max(last.capturedAt - first.capturedAt, 1)
  const targetTime = first.capturedAt + duration * offsetPercent

  return history.reduce((closest, snapshot) => {
    const closestDelta = Math.abs(closest.capturedAt - targetTime)
    const nextDelta = Math.abs(snapshot.capturedAt - targetTime)
    return nextDelta < closestDelta ? snapshot : closest
  }, first)
}

export function getVehicleTrail(
  history: SimulationSnapshot[],
  vehicleId: string | null,
  seconds: number,
  anchorTime: number | null = null,
) {
  if (!vehicleId || history.length === 0) {
    return []
  }

  const latestTime = anchorTime ?? history[history.length - 1].capturedAt
  const cutoff = latestTime - seconds * 1000
  return history
    .filter((snapshot) => snapshot.capturedAt >= cutoff && snapshot.capturedAt <= latestTime)
    .map((snapshot) => {
      const vehicle = snapshot.state.vehicles.find((candidate) => candidate.id === vehicleId)
      return vehicle
        ? {
            time: snapshot.state.simTime,
            x: vehicle.x,
            y: vehicle.y,
            speed: vehicle.speed,
            acceleration: vehicle.acceleration,
          }
        : null
    })
    .filter((point): point is NonNullable<typeof point> => point !== null)
}

export function getRoutePath(config: NetworkConfig | null, vehicle: VehicleState | null) {
  if (!config || !vehicle || vehicle.route.length === 0) {
    return []
  }

  const points: Array<[number, number]> = []
  vehicle.route.forEach((edgeId) => {
    const lanes = config.lanes.filter((lane) => lane.edgeId === edgeId)
    const preferredLane = lanes.find((lane) => lane.index === vehicle.laneIndex) ?? lanes[0]
    if (!preferredLane) {
      return
    }

    preferredLane.shape.forEach((point, pointIndex) => {
      const previous = points[points.length - 1]
      if (pointIndex === 0 && previous && previous[0] === point[0] && previous[1] === point[1]) {
        return
      }
      points.push(point)
    })
  })

  return points
}

export function deriveLaneMetrics(
  config: NetworkConfig | null,
  vehicles: VehicleState[],
): LaneMetrics[] {
  if (!config) {
    return []
  }

  return config.lanes.map((lane) => {
    const laneVehicles = vehicles.filter((vehicle) => vehicle.laneId === lane.id)
    const laneLengthMeters = getLaneLength(lane)
    const averageSpeed =
      laneVehicles.length > 0
        ? laneVehicles.reduce((sum, vehicle) => sum + vehicle.speed, 0) / laneVehicles.length
        : 0
    const densityPerKm = laneLengthMeters > 0 ? laneVehicles.length / (laneLengthMeters / 1000) : 0
    const occupiedLength = laneVehicles.reduce((sum, vehicle) => sum + vehicle.length + 2, 0)
    const occupancy = laneLengthMeters > 0 ? Math.min(occupiedLength / laneLengthMeters, 1) : 0
    const queueLength = estimateQueueLength(laneVehicles)

    return {
      laneId: lane.id,
      edgeId: lane.edgeId,
      laneIndex: lane.index,
      vehicleCount: laneVehicles.length,
      averageSpeed,
      densityPerKm,
      occupancy,
      queueLength,
      congestionLevel: getCongestionLevel(laneVehicles.length, averageSpeed, densityPerKm, occupancy),
    }
  })
}

export function exportVehicleCsv(
  history: SimulationSnapshot[],
  vehicleId: string,
) {
  const rows = [
    ['time_s', 'vehicle_id', 'x_m', 'y_m', 'speed_kmh', 'acceleration_ms2', 'edge_id', 'lane_id'],
  ]

  history.forEach((snapshot) => {
    const vehicle = snapshot.state.vehicles.find((candidate) => candidate.id === vehicleId)
    if (!vehicle) {
      return
    }

    rows.push([
      snapshot.state.simTime.toFixed(2),
      vehicle.id,
      vehicle.x.toFixed(2),
      vehicle.y.toFixed(2),
      (vehicle.speed * 3.6).toFixed(2),
      vehicle.acceleration.toFixed(3),
      vehicle.edgeId,
      vehicle.laneId,
    ])
  })

  const csv = rows.map((row) => row.map(escapeCsvCell).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `${vehicleId}-trajectory.csv`
  anchor.click()
  URL.revokeObjectURL(url)
}

export function getLaneLength(lane: Lane) {
  return lane.shape.reduce((sum, point, index) => {
    if (index === 0) {
      return 0
    }

    const previous = lane.shape[index - 1]
    return sum + Math.hypot(point[0] - previous[0], point[1] - previous[1])
  }, 0)
}

function estimateQueueLength(vehicles: VehicleState[]) {
  const queuedVehicles = vehicles
    .filter((vehicle) => vehicle.speed < 1.5)
    .sort((first, second) => first.lanePosition - second.lanePosition)

  if (queuedVehicles.length === 0) {
    return 0
  }

  const first = queuedVehicles[0]
  const last = queuedVehicles[queuedVehicles.length - 1]
  return Math.max(last.lanePosition - first.lanePosition + last.length, 0)
}

function getCongestionLevel(
  vehicleCount: number,
  averageSpeed: number,
  densityPerKm: number,
  occupancy: number,
): LaneMetrics['congestionLevel'] {
  if (vehicleCount === 0) {
    return 'free'
  }

  const speedKmh = averageSpeed * 3.6
  if (occupancy > 0.82 || densityPerKm > 70) {
    return 'risk'
  }
  if (speedKmh < 25 || densityPerKm > 48 || occupancy > 0.62) {
    return 'heavy'
  }
  if (speedKmh < 55 || densityPerKm > 28 || occupancy > 0.34) {
    return 'moderate'
  }
  return 'free'
}

function escapeCsvCell(value: string) {
  if (!/[",\n]/.test(value)) {
    return value
  }

  return `"${value.replaceAll('"', '""')}"`
}
