import type {
  NetworkConfig,
  ScenarioApplyResponse,
  ScenarioConfig,
  ScenarioCurrentResponse,
  SimulationState,
} from '../types/simulation'

const API_BASE = '/api'

async function ensureOk(response: Response) {
  if (response.ok) {
    return response
  }

  const message = await response.text()
  throw new Error(message || `Request failed with status ${response.status}`)
}

export async function fetchConfig(): Promise<NetworkConfig> {
  const response = await fetch(`${API_BASE}/config`)
  await ensureOk(response)
  return response.json()
}

export async function fetchDefaultScenarioConfig(): Promise<ScenarioConfig> {
  const response = await fetch(`${API_BASE}/scenario/default`)
  await ensureOk(response)
  return response.json()
}

export async function fetchCurrentScenarioConfig(): Promise<ScenarioCurrentResponse> {
  const response = await fetch(`${API_BASE}/scenario/current`)
  await ensureOk(response)
  return response.json()
}

export async function applyScenarioConfig(config: ScenarioConfig): Promise<ScenarioApplyResponse> {
  const response = await fetch(`${API_BASE}/scenario/apply`, {
    body: JSON.stringify(config),
    headers: {
      'Content-Type': 'application/json',
    },
    method: 'POST',
  })
  await ensureOk(response)
  return response.json()
}

export async function sendSimulationCommand(
  action: 'start' | 'pause' | 'reset' | 'step',
): Promise<SimulationState> {
  const response = await fetch(`${API_BASE}/sim/${action}`, {
    method: 'POST',
  })
  await ensureOk(response)
  return response.json()
}
