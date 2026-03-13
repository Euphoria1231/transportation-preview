import { useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, WheelEvent as ReactWheelEvent } from 'react'

import type { Bounds } from '../types/simulation'

const PADDING = 48
const MIN_SCALE = 0.2
const MAX_SCALE = 30

interface CanvasSize {
  width: number
  height: number
}

interface ViewportState {
  scale: number
  offsetX: number
  offsetY: number
}

function getLocalPoint(
  target: HTMLCanvasElement,
  event: ReactPointerEvent<HTMLCanvasElement> | ReactWheelEvent<HTMLCanvasElement>,
) {
  const rect = target.getBoundingClientRect()
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  }
}

export function useCanvasViewport(bounds: Bounds | null, size: CanvasSize) {
  const [resetRevision, setResetRevision] = useState(0)
  const [viewport, setViewport] = useState<ViewportState>({
    scale: 1,
    offsetX: 0,
    offsetY: 0,
  })
  const hasInteractedRef = useRef(false)
  const dragOriginRef = useRef<{ x: number; y: number } | null>(null)

  useEffect(() => {
    if (!bounds || size.width === 0 || size.height === 0 || hasInteractedRef.current) {
      return
    }

    const worldWidth = Math.max(bounds.maxX - bounds.minX, 1)
    const worldHeight = Math.max(bounds.maxY - bounds.minY, 1)
    const usableWidth = Math.max(size.width - PADDING * 2, 1)
    const usableHeight = Math.max(size.height - PADDING * 2, 1)
    const scale = Math.min(usableWidth / worldWidth, usableHeight / worldHeight)
    const extraX = (usableWidth - worldWidth * scale) / 2
    const extraY = (usableHeight - worldHeight * scale) / 2

    setViewport({
      scale,
      offsetX: PADDING + extraX - bounds.minX * scale,
      offsetY: PADDING + extraY + bounds.maxY * scale,
    })
  }, [bounds, resetRevision, size.height, size.width])

  const controls = useMemo(
    () => ({
      onWheel: (event: ReactWheelEvent<HTMLCanvasElement>) => {
        if (!bounds) {
          return
        }

        hasInteractedRef.current = true

        const point = getLocalPoint(event.currentTarget, event)
        const zoomFactor = event.deltaY < 0 ? 1.12 : 0.9
        const nextScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, viewport.scale * zoomFactor))
        const worldX = (point.x - viewport.offsetX) / viewport.scale
        const worldY = (viewport.offsetY - point.y) / viewport.scale

        setViewport({
          scale: nextScale,
          offsetX: point.x - worldX * nextScale,
          offsetY: point.y + worldY * nextScale,
        })
      },
      onPointerDown: (event: ReactPointerEvent<HTMLCanvasElement>) => {
        hasInteractedRef.current = true
        const point = getLocalPoint(event.currentTarget, event)
        dragOriginRef.current = {
          x: point.x - viewport.offsetX,
          y: point.y - viewport.offsetY,
        }
        event.currentTarget.setPointerCapture(event.pointerId)
      },
      onPointerMove: (event: ReactPointerEvent<HTMLCanvasElement>) => {
        if (!dragOriginRef.current) {
          return
        }

        const point = getLocalPoint(event.currentTarget, event)
        setViewport((current) => ({
          ...current,
          offsetX: point.x - dragOriginRef.current!.x,
          offsetY: point.y - dragOriginRef.current!.y,
        }))
      },
      onPointerUp: (event: ReactPointerEvent<HTMLCanvasElement>) => {
        dragOriginRef.current = null
        event.currentTarget.releasePointerCapture(event.pointerId)
      },
      onPointerLeave: () => {
        dragOriginRef.current = null
      },
      resetView: () => {
        hasInteractedRef.current = false
        setResetRevision((value) => value + 1)
      },
    }),
    [bounds, viewport.offsetX, viewport.offsetY, viewport.scale],
  )

  return {
    viewport,
    resetViewport: controls.resetView,
    canvasHandlers: {
      onWheel: controls.onWheel,
      onPointerDown: controls.onPointerDown,
      onPointerMove: controls.onPointerMove,
      onPointerUp: controls.onPointerUp,
      onPointerLeave: controls.onPointerLeave,
    },
  }
}
