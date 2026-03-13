import { useEffect, useMemo, useRef, useState } from 'react'

import { useCanvasViewport } from '../hooks/useCanvasViewport'
import type { NetworkConfig, VehicleState } from '../types/simulation'

interface CanvasSceneProps {
  config: NetworkConfig | null
  vehicles: VehicleState[]
  snapshotTick: number
}

interface CanvasSize {
  width: number
  height: number
}

export function CanvasScene({ config, vehicles, snapshotTick }: CanvasSceneProps) {
  const wrapperRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [size, setSize] = useState<CanvasSize>({ width: 0, height: 0 })
  const previousVehiclesRef = useRef<Map<string, VehicleState>>(new Map())
  const currentVehiclesRef = useRef<Map<string, VehicleState>>(new Map())
  const snapshotAtRef = useRef(performance.now())

  const { viewport, resetViewport, canvasHandlers } = useCanvasViewport(config?.bounds ?? null, size)

  useEffect(() => {
    if (!wrapperRef.current) {
      return
    }

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) {
        return
      }

      setSize({
        width: Math.floor(entry.contentRect.width),
        height: Math.floor(entry.contentRect.height),
      })
    })

    observer.observe(wrapperRef.current)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    previousVehiclesRef.current = new Map(currentVehiclesRef.current)
    currentVehiclesRef.current = new Map(vehicles.map((vehicle) => [vehicle.id, vehicle]))
    snapshotAtRef.current = performance.now()
  }, [snapshotTick, vehicles])

  const stepLengthMs = useMemo(() => (config?.stepLength ?? 0.1) * 1000, [config?.stepLength])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !config || size.width === 0 || size.height === 0) {
      return
    }

    canvas.width = size.width * window.devicePixelRatio
    canvas.height = size.height * window.devicePixelRatio
    canvas.style.width = `${size.width}px`
    canvas.style.height = `${size.height}px`

    const context = canvas.getContext('2d')
    if (!context) {
      return
    }

    let frameId = 0
    const drawFrame = () => {
      const progress = Math.min((performance.now() - snapshotAtRef.current) / stepLengthMs, 1)
      context.setTransform(window.devicePixelRatio, 0, 0, window.devicePixelRatio, 0, 0)
      context.clearRect(0, 0, size.width, size.height)

      drawLanes(context, config, viewport)
      drawVehicles(context, currentVehiclesRef.current, previousVehiclesRef.current, viewport, progress)

      frameId = window.requestAnimationFrame(drawFrame)
    }

    frameId = window.requestAnimationFrame(drawFrame)
    return () => window.cancelAnimationFrame(frameId)
  }, [config, size.height, size.width, stepLengthMs, viewport])

  return (
    <div className="relative h-full w-full rounded-[28px] border border-slate-800/70 bg-slate-950/80 shadow-2xl shadow-black/30">
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between px-5 py-4">
        <div>
          <p className="text-xs uppercase tracking-[0.28em] text-slate-500">Scenario</p>
          <h1 className="text-xl font-semibold text-white">Mixed Traffic SUMO Browser View</h1>
        </div>
        <button
          className="pointer-events-auto rounded-full border border-slate-700 bg-slate-900/80 px-4 py-2 text-xs font-semibold text-slate-200 transition hover:border-slate-500 hover:bg-slate-800"
          onClick={resetViewport}
          type="button"
        >
          Fit To View
        </button>
      </div>

      <div className="h-full w-full p-3 pt-16" ref={wrapperRef}>
        <canvas
          {...canvasHandlers}
          className="h-full w-full cursor-grab rounded-[24px] bg-[radial-gradient(circle_at_top,_rgba(14,165,233,0.08),_transparent_40%),linear-gradient(180deg,_rgba(15,23,42,0.95),_rgba(2,6,23,0.96))] active:cursor-grabbing"
          ref={canvasRef}
        />
      </div>
    </div>
  )
}

function drawLanes(
  context: CanvasRenderingContext2D,
  config: NetworkConfig,
  viewport: { scale: number; offsetX: number; offsetY: number },
) {
  for (const lane of config.lanes) {
    context.beginPath()
    lane.shape.forEach(([x, y], index) => {
      const screenX = x * viewport.scale + viewport.offsetX
      const screenY = viewport.offsetY - y * viewport.scale
      if (index === 0) {
        context.moveTo(screenX, screenY)
      } else {
        context.lineTo(screenX, screenY)
      }
    })

    context.lineCap = 'round'
    context.strokeStyle = lane.edgeId.startsWith('E') ? 'rgba(148, 163, 184, 0.85)' : 'rgba(51, 65, 85, 0.95)'
    context.lineWidth = lane.edgeId.startsWith('E') ? 8 : 6
    context.stroke()
  }
}

function drawVehicles(
  context: CanvasRenderingContext2D,
  currentVehicles: Map<string, VehicleState>,
  previousVehicles: Map<string, VehicleState>,
  viewport: { scale: number; offsetX: number; offsetY: number },
  progress: number,
) {
  currentVehicles.forEach((vehicle, id) => {
    const previous = previousVehicles.get(id) ?? vehicle
    const x = lerp(previous.x, vehicle.x, progress)
    const y = lerp(previous.y, vehicle.y, progress)
    const angle = lerp(previous.angle, vehicle.angle, progress)
    const screenX = x * viewport.scale + viewport.offsetX
    const screenY = viewport.offsetY - y * viewport.scale
    const width = Math.max(vehicle.length * viewport.scale, 10)
    const height = Math.max(vehicle.width * viewport.scale, 5)

    context.save()
    context.translate(screenX, screenY)
    context.rotate((-angle * Math.PI) / 180)
    context.fillStyle = vehicle.color
    context.shadowColor = vehicle.color
    context.shadowBlur = 14
    roundRect(context, -width / 2, -height / 2, width, height, height / 2)
    context.fill()

    context.fillStyle = 'rgba(255,255,255,0.95)'
    roundRect(context, width * 0.05, -height * 0.3, width * 0.22, height * 0.6, height * 0.2)
    context.fill()
    context.restore()
  })
}

function roundRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  context.beginPath()
  context.moveTo(x + radius, y)
  context.lineTo(x + width - radius, y)
  context.quadraticCurveTo(x + width, y, x + width, y + radius)
  context.lineTo(x + width, y + height - radius)
  context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height)
  context.lineTo(x + radius, y + height)
  context.quadraticCurveTo(x, y + height, x, y + height - radius)
  context.lineTo(x, y + radius)
  context.quadraticCurveTo(x, y, x + radius, y)
  context.closePath()
}

function lerp(start: number, end: number, progress: number) {
  return start + (end - start) * progress
}
