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
    <div className="relative h-full w-full rounded-[28px] border border-slate-200 bg-white/85 shadow-xl shadow-slate-200/80">
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between px-5 py-4">
        <div>
          <p className="text-xs tracking-[0.28em] text-slate-500">场景</p>
          <h1 className="text-xl font-semibold text-slate-900">混合交通 SUMO 可视化</h1>
        </div>
        <button
          className="pointer-events-auto rounded-full border border-slate-200 bg-white/90 px-4 py-2 text-xs font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
          onClick={resetViewport}
          type="button"
        >
          适应视图
        </button>
      </div>

      <div className="h-full w-full p-3 pt-16" ref={wrapperRef}>
        <canvas
          {...canvasHandlers}
          className="h-full w-full cursor-grab rounded-[24px] bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.14),_transparent_42%),linear-gradient(180deg,_rgba(248,250,252,0.96),_rgba(226,232,240,0.94))] active:cursor-grabbing"
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
    const lineWidth = lane.edgeId.startsWith('E') ? 13 : 11
    const shoulderWidth = lineWidth + 6
    const isOuterLane = lane.index === 0

    traceLanePath(context, lane.shape, viewport)
    context.lineCap = 'round'
    context.strokeStyle = 'rgba(2, 6, 23, 0.65)'
    context.lineWidth = shoulderWidth + 8
    context.shadowColor = 'rgba(15, 23, 42, 0.45)'
    context.shadowBlur = 22
    context.stroke()

    traceLanePath(context, lane.shape, viewport)
    context.shadowBlur = 0
    context.strokeStyle = lane.edgeId.startsWith('E') ? 'rgba(45, 55, 72, 0.97)' : 'rgba(28, 37, 52, 0.96)'
    context.lineWidth = shoulderWidth
    context.stroke()

    traceLanePath(context, lane.shape, viewport)
    context.strokeStyle = 'rgba(109, 123, 141, 0.18)'
    context.lineWidth = lineWidth * 0.78
    context.stroke()

    traceLanePath(context, lane.shape, viewport)
    context.lineWidth = isOuterLane ? 1.8 : 1.2
    context.strokeStyle = isOuterLane ? 'rgba(248, 250, 252, 0.65)' : 'rgba(226, 232, 240, 0.36)'
    context.setLineDash(isOuterLane ? [] : [10, 12])
    context.stroke()
    context.setLineDash([])
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
    const width = Math.max(vehicle.length * viewport.scale, 18)
    const height = Math.max(vehicle.width * viewport.scale, 8)
    const bodyColor = normalizeVehicleColor(vehicle.color)
    const isHeavyVehicle = /truck|bus|coach|delivery/i.test(vehicle.type)
    const bodyRadius = Math.min(height * 0.42, isHeavyVehicle ? 5 : 7)

    context.save()
    context.translate(screenX, screenY)
    context.rotate(((angle - 90) * Math.PI) / 180)

    if (vehicle.speed > 6) {
      const streak = Math.min(width * 0.4, 20)
      const slipstream = context.createLinearGradient(-width / 2 - streak, 0, -width / 2, 0)
      slipstream.addColorStop(0, 'rgba(125, 211, 252, 0)')
      slipstream.addColorStop(1, 'rgba(125, 211, 252, 0.16)')
      context.fillStyle = slipstream
      context.beginPath()
      context.ellipse(-width / 2 - streak * 0.2, 0, streak, height * 0.36, 0, 0, Math.PI * 2)
      context.fill()
    }

    context.fillStyle = 'rgba(15, 23, 42, 0.35)'
    context.beginPath()
    context.ellipse(0, height * 0.18, width * 0.6, height * 0.55, 0, 0, Math.PI * 2)
    context.fill()

    const bodyGradient = context.createLinearGradient(0, -height / 2, 0, height / 2)
    bodyGradient.addColorStop(0, mixColor(bodyColor, '#f8fafc', 0.22))
    bodyGradient.addColorStop(0.55, bodyColor)
    bodyGradient.addColorStop(1, mixColor(bodyColor, '#020617', 0.3))

    context.fillStyle = bodyGradient
    context.strokeStyle = 'rgba(15, 23, 42, 0.55)'
    context.lineWidth = 1
    context.shadowColor = 'rgba(15, 23, 42, 0.4)'
    context.shadowBlur = 10
    roundRect(context, -width / 2, -height / 2, width, height, bodyRadius)
    context.fill()
    context.stroke()
    context.shadowBlur = 0

    const roofWidth = isHeavyVehicle ? width * 0.58 : width * 0.5
    const roofHeight = isHeavyVehicle ? height * 0.64 : height * 0.56
    const roofStartX = isHeavyVehicle ? -width * 0.04 : -width * 0.02
    const roofGradient = context.createLinearGradient(0, -roofHeight / 2, 0, roofHeight / 2)
    roofGradient.addColorStop(0, 'rgba(226, 232, 240, 0.82)')
    roofGradient.addColorStop(1, 'rgba(71, 85, 105, 0.92)')
    context.fillStyle = roofGradient
    roundRect(
      context,
      roofStartX - roofWidth / 2,
      -roofHeight / 2,
      roofWidth,
      roofHeight,
      roofHeight * 0.28,
    )
    context.fill()

    context.fillStyle = 'rgba(15, 23, 42, 0.9)'
    const wheelLength = Math.max(width * 0.18, 5)
    const wheelWidth = Math.max(height * 0.16, 2)
    const wheelOffsetX = width * 0.24
    const wheelOffsetY = height * 0.5
    drawWheel(context, -wheelOffsetX, -wheelOffsetY, wheelLength, wheelWidth)
    drawWheel(context, wheelOffsetX, -wheelOffsetY, wheelLength, wheelWidth)
    drawWheel(context, -wheelOffsetX, wheelOffsetY - wheelWidth, wheelLength, wheelWidth)
    drawWheel(context, wheelOffsetX, wheelOffsetY - wheelWidth, wheelLength, wheelWidth)

    context.fillStyle = 'rgba(255, 255, 255, 0.9)'
    roundRect(context, width * 0.28, -height * 0.2, width * 0.1, height * 0.14, height * 0.05)
    context.fill()

    context.fillStyle = 'rgba(248, 113, 113, 0.82)'
    roundRect(context, -width * 0.38, -height * 0.22, width * 0.08, height * 0.16, height * 0.05)
    context.fill()
    roundRect(context, -width * 0.38, height * 0.06, width * 0.08, height * 0.16, height * 0.05)
    context.fill()

    context.strokeStyle = 'rgba(255,255,255,0.18)'
    context.lineWidth = 1
    context.beginPath()
    context.moveTo(-width * 0.18, 0)
    context.lineTo(width * 0.28, 0)
    context.stroke()

    context.restore()
  })
}

function traceLanePath(
  context: CanvasRenderingContext2D,
  shape: Array<[number, number]>,
  viewport: { scale: number; offsetX: number; offsetY: number },
) {
  context.beginPath()
  shape.forEach(([x, y], index) => {
    const screenX = x * viewport.scale + viewport.offsetX
    const screenY = viewport.offsetY - y * viewport.scale
    if (index === 0) {
      context.moveTo(screenX, screenY)
    } else {
      context.lineTo(screenX, screenY)
    }
  })
}

function drawWheel(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  roundRect(context, x - width / 2, y, width, height, height / 2)
  context.fill()
}

function normalizeVehicleColor(color: string) {
  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(color)) {
    return color
  }

  if (color.startsWith('rgb') || color.startsWith('hsl')) {
    return color
  }

  return '#38bdf8'
}

function mixColor(baseColor: string, mixTarget: string, amount: number) {
  if (!baseColor.startsWith('#') || !mixTarget.startsWith('#')) {
    return baseColor
  }

  const base = parseHexColor(baseColor)
  const target = parseHexColor(mixTarget)
  if (!base || !target) {
    return baseColor
  }

  const mixed = base.map((channel, index) =>
    Math.round(channel + (target[index] - channel) * amount),
  )

  return `rgb(${mixed[0]}, ${mixed[1]}, ${mixed[2]})`
}

function parseHexColor(color: string) {
  const hex = color.slice(1)
  const normalized =
    hex.length === 3
      ? hex
          .split('')
          .map((value) => value + value)
          .join('')
      : hex

  if (normalized.length !== 6) {
    return null
  }

  return [
    Number.parseInt(normalized.slice(0, 2), 16),
    Number.parseInt(normalized.slice(2, 4), 16),
    Number.parseInt(normalized.slice(4, 6), 16),
  ]
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
