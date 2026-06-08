import { useState } from 'react'

import type { ScenarioApplyResponse, ScenarioConfig, ScenarioFlowPlan } from './types/simulation'
import { ScenarioSetupView } from './views/ScenarioSetupView'
import { SimulationView } from './views/SimulationView'

type ActiveView = 'setup' | 'simulation'

function App() {
  const [activeView, setActiveView] = useState<ActiveView>('setup')
  const [scenarioConfig, setScenarioConfig] = useState<ScenarioConfig | null>(null)
  const [scenarioFlowPlan, setScenarioFlowPlan] = useState<ScenarioFlowPlan | null>(null)

  const handleScenarioApplied = (response: ScenarioApplyResponse) => {
    setScenarioConfig(response.config)
    setScenarioFlowPlan(response.flowPlan)
    setActiveView('simulation')
  }

  if (activeView === 'simulation') {
    return (
      <SimulationView
        onBackToSetup={() => setActiveView('setup')}
        scenarioConfig={scenarioConfig}
        scenarioFlowPlan={scenarioFlowPlan}
      />
    )
  }

  return (
    <ScenarioSetupView
      initialConfig={scenarioConfig}
      onScenarioApplied={handleScenarioApplied}
    />
  )
}

export default App
