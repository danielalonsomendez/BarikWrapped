'use client'

import Image from 'next/image'
import { Flame, Gauge, Pause, Play, PlayCircle, SkipBack, SkipForward } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { MetroDiagram, METRO_STATION_LAYOUT, type MetroStationHighlight } from '../metro/MetroDiagram'
import { formatDuration } from '../history/historyDataTransforms'
import { fullDateFormatter } from '../../lib/dateFormatters'
import { getMetroLineColorForStation, getMetroStationName } from '../metro/metroUtils'
import type { MetroSummary } from '../AnnualTab'

type AnnualMetroPanelProps = {
  metro: MetroSummary
}

type RgbColor = {
  r: number
  g: number
  b: number
}

const DEFAULT_OPERATOR_COLOR: RgbColor = { r: 239, g: 68, b: 68 }
const integerFormatter = new Intl.NumberFormat('es-ES')
const timeFormatter = new Intl.DateTimeFormat('es-ES', {
  timeStyle: 'short',
})

function hexToRgb(hex: string): RgbColor | null {
  if (!hex) {
    return null
  }
  const sanitized = hex.trim().replace('#', '')
  if (sanitized.length === 3) {
    const r = parseInt(sanitized[0] + sanitized[0], 16)
    const g = parseInt(sanitized[1] + sanitized[1], 16)
    const b = parseInt(sanitized[2] + sanitized[2], 16)
    if ([r, g, b].some((component) => Number.isNaN(component))) {
      return null
    }
    return { r, g, b }
  }
  if (sanitized.length !== 6) {
    return null
  }
  const r = parseInt(sanitized.slice(0, 2), 16)
  const g = parseInt(sanitized.slice(2, 4), 16)
  const b = parseInt(sanitized.slice(4, 6), 16)
  if ([r, g, b].some((component) => Number.isNaN(component))) {
    return null
  }
  return { r, g, b }
}

function mixRgb(base: RgbColor, target: RgbColor, amount: number): RgbColor {
  const clamped = Math.min(Math.max(amount, 0), 1)
  return {
    r: Math.round(base.r + (target.r - base.r) * clamped),
    g: Math.round(base.g + (target.g - base.g) * clamped),
    b: Math.round(base.b + (target.b - base.b) * clamped),
  }
}

function rgbToHex(color: RgbColor): string {
  const toHex = (component: number) => component.toString(16).padStart(2, '0')
  return `#${toHex(color.r)}${toHex(color.g)}${toHex(color.b)}`
}

const METRO_HEATMAP_STOPS: Array<{ stop: number; color: string }> = [
  { stop: 0, color: '#FDE68A' },
  { stop: 0.35, color: '#F97316' },
  { stop: 0.7, color: '#DC2626' },
  { stop: 1, color: '#7F1D1D' },
]

function getMetroHeatmapColor(intensity: number): string {
  if (Number.isNaN(intensity) || intensity <= 0) {
    return '#CBD5F5'
  }
  const clamped = Math.min(Math.max(intensity, 0), 1)
  for (let index = 0; index < METRO_HEATMAP_STOPS.length - 1; index += 1) {
    const current = METRO_HEATMAP_STOPS[index]
    const next = METRO_HEATMAP_STOPS[index + 1]
    if (clamped <= next.stop) {
      const span = next.stop - current.stop || 1
      const localRatio = (clamped - current.stop) / span
      const startRgb = hexToRgb(current.color) ?? DEFAULT_OPERATOR_COLOR
      const endRgb = hexToRgb(next.color) ?? DEFAULT_OPERATOR_COLOR
      return rgbToHex(mixRgb(startRgb, endRgb, localRatio))
    }
  }
  return METRO_HEATMAP_STOPS[METRO_HEATMAP_STOPS.length - 1]?.color ?? '#7F1D1D'
}

export function AnnualMetroPanel({ metro }: AnnualMetroPanelProps) {
  const [metroMode, setMetroMode] = useState<'heatmap' | 'playback'>('heatmap')
  const [metroPlaying, setMetroPlaying] = useState(false)
  const [metroTripIndex, setMetroTripIndex] = useState(0)
  const [metroProgress, setMetroProgress] = useState(0)
  const [metroSpeed, setMetroSpeed] = useState<number>(3)
  const metroAnimationRef = useRef<number | null>(null)
  const metroTimerRef = useRef<number | null>(null)

  const metroTrips = metro.trips
  const hasMetroData = metro.totalTrips > 0
  const activeMetroTrip = metroTrips[metroTripIndex] ?? null

  const metroUsageMap = useMemo(() => {
    const map = new Map<string, MetroSummary['stationUsage'][number]>()
    metro.stationUsage.forEach((station) => {
      map.set(station.code, station)
    })
    return map
  }, [metro.stationUsage])

  const maxHeatmapTotal = useMemo(
    () => metro.stationUsage.reduce((max: number, station) => Math.max(max, station.total), 0),
    [metro.stationUsage],
  )

  const metroHeatmapHighlights = useMemo<Record<string, MetroStationHighlight>>(() => {
    const map: Record<string, MetroStationHighlight> = {}
    METRO_STATION_LAYOUT.forEach((station) => {
      const usage = metroUsageMap.get(station.code)
      const total = usage?.total ?? 0
      const entries = usage?.entries ?? 0
      const passThrough = usage?.passThrough ?? 0
      const intensity = total > 0 && maxHeatmapTotal > 0 ? total / maxHeatmapTotal : 0
      const highlightColor = total > 0 ? getMetroHeatmapColor(intensity) : '#CBD5F5'
      const details: string[] = []
      details.push(
        `${integerFormatter.format(entries)} ${entries === 1 ? 'acceso' : 'accesos'}`,
      )
      details.push(`${integerFormatter.format(passThrough)} paso${passThrough === 1 ? '' : 's'}`)
      map[station.code] = {
        color: highlightColor,
        intensity,
        label: `${station.name} · ${integerFormatter.format(total)} ${total === 1 ? 'validación' : 'validaciones'} · ${details.join(' · ')}`,
      }
    })
    return map
  }, [maxHeatmapTotal, metroUsageMap])

  const metroPlaybackBaseHighlights = useMemo<Record<string, MetroStationHighlight>>(() => {
    const map: Record<string, MetroStationHighlight> = {}
    METRO_STATION_LAYOUT.forEach((station) => {
      const usage = metroUsageMap.get(station.code)
      const total = usage?.total ?? 0
      const entries = usage?.entries ?? 0
      const passThrough = usage?.passThrough ?? 0
      const details: string[] = []
      details.push(
        `${integerFormatter.format(entries)} ${entries === 1 ? 'acceso' : 'accesos'}`,
      )
      details.push(`${integerFormatter.format(passThrough)} paso${passThrough === 1 ? '' : 's'}`)
      map[station.code] = {
        color: '#CBD5F5',
        intensity: 0,
        label: `${station.name} · ${integerFormatter.format(total)} ${total === 1 ? 'validación' : 'validaciones'} · ${details.join(' · ')}`,
      }
    })
    return map
  }, [metroUsageMap])

  const metroPlaybackActiveHighlights = useMemo<Record<string, MetroStationHighlight>>(() => {
    if (!activeMetroTrip || metroMode !== 'playback') {
      return {}
    }
    const map: Record<string, MetroStationHighlight> = {}
    const lastIndex = activeMetroTrip.pathCodes.length - 1
    activeMetroTrip.pathCodes.forEach((code, index) => {
      const usage = metroUsageMap.get(code)
      const total = usage?.total ?? 0
      const entries = usage?.entries ?? 0
      const passThrough = usage?.passThrough ?? 0
      const details: string[] = []
      details.push(
        `${integerFormatter.format(entries)} ${entries === 1 ? 'acceso' : 'accesos'}`,
      )
      details.push(`${integerFormatter.format(passThrough)} paso${passThrough === 1 ? '' : 's'}`)
      const name = getMetroStationName(code)
      const accentColor = getMetroLineColorForStation(code)
      map[code] = {
        color: accentColor,
        intensity: 0,
        isActive: true,
        label: `${name} · ${integerFormatter.format(total)} ${total === 1 ? 'validación' : 'validaciones'} · Recorrido en reproducción · ${details.join(' · ')}`,
      }
    })
    return map
  }, [activeMetroTrip, metroMode, metroUsageMap])

  const metroStationHighlights = useMemo<Record<string, MetroStationHighlight>>(() => {
    if (metroMode === 'heatmap') {
      return metroHeatmapHighlights
    }
    return {
      ...metroPlaybackBaseHighlights,
      ...metroPlaybackActiveHighlights,
    }
  }, [metroMode, metroHeatmapHighlights, metroPlaybackBaseHighlights, metroPlaybackActiveHighlights])

  const playbackState = metroMode === 'playback' && activeMetroTrip
    ? {
        from: activeMetroTrip.from,
        to: activeMetroTrip.to,
        progress: metroProgress,
        color: getMetroLineColorForStation(activeMetroTrip.pathCodes[0] ?? activeMetroTrip.from),
        pathCodes: activeMetroTrip.pathCodes,
      }
    : null

  useEffect(() => {
    return () => {
      if (metroAnimationRef.current) {
        cancelAnimationFrame(metroAnimationRef.current)
        metroAnimationRef.current = null
      }
      if (metroTimerRef.current) {
        clearTimeout(metroTimerRef.current)
        metroTimerRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    if (metroMode !== 'playback') {
      if (metroAnimationRef.current) {
        cancelAnimationFrame(metroAnimationRef.current)
        metroAnimationRef.current = null
      }
      if (metroTimerRef.current) {
        clearTimeout(metroTimerRef.current)
        metroTimerRef.current = null
      }
      setMetroPlaying(false)
      setMetroProgress(0)
    }
  }, [metroMode])

  useEffect(() => {
    if (metroTripIndex >= metroTrips.length && metroTrips.length > 0) {
      setMetroTripIndex(0)
      setMetroProgress(0)
    }
    if (metroTrips.length === 0) {
      setMetroPlaying(false)
      setMetroProgress(0)
    }
  }, [metroTrips.length, metroTripIndex])

  useEffect(() => {
    if (metroMode !== 'playback' || !metroPlaying) {
      return
    }
    const trip = activeMetroTrip
    if (!trip) {
      setMetroPlaying(false)
      return
    }
    let startTime: number | null = null
    const baseDuration = Math.min(Math.max((trip.durationMinutes ?? 4) * 160, 1200), 3600)
    const durationMs = Math.max(600, baseDuration / Math.max(metroSpeed, 1))

    const step = (timestamp: number) => {
      if (startTime === null) {
        startTime = timestamp
      }
      const elapsed = timestamp - startTime
      const progressValue = Math.min(1, elapsed / durationMs)
      setMetroProgress(progressValue)
      if (progressValue >= 1) {
        if (metroAnimationRef.current) {
          cancelAnimationFrame(metroAnimationRef.current)
          metroAnimationRef.current = null
        }
        metroTimerRef.current = window.setTimeout(() => {
          setMetroProgress(0)
          setMetroTripIndex((previous) => (metroTrips.length > 0 ? (previous + 1) % metroTrips.length : 0))
        }, 300)
        return
      }
      metroAnimationRef.current = requestAnimationFrame(step)
    }

    metroAnimationRef.current = requestAnimationFrame(step)

    return () => {
      if (metroAnimationRef.current) {
        cancelAnimationFrame(metroAnimationRef.current)
        metroAnimationRef.current = null
      }
      if (metroTimerRef.current) {
        clearTimeout(metroTimerRef.current)
        metroTimerRef.current = null
      }
    }
  }, [metroMode, metroPlaying, activeMetroTrip, metroSpeed, metroTrips])

  const handleMetroPrev = useCallback(() => {
    if (metroTrips.length === 0) {
      return
    }
    setMetroTripIndex((previous) => (previous - 1 + metroTrips.length) % metroTrips.length)
    setMetroProgress(0)
  }, [metroTrips.length])

  const handleMetroNext = useCallback(() => {
    if (metroTrips.length === 0) {
      return
    }
    setMetroTripIndex((previous) => (previous + 1) % metroTrips.length)
    setMetroProgress(0)
  }, [metroTrips.length])

  const handleMetroTogglePlay = useCallback(() => {
    if (metroTrips.length === 0) {
      return
    }
    setMetroPlaying((previous) => !previous)
    if (metroProgress >= 1) {
      setMetroProgress(0)
    }
  }, [metroTrips.length, metroProgress])

  const handleMetroSpeedChange = useCallback((speed: number) => {
    setMetroSpeed(speed)
    setMetroProgress(0)
  }, [])

  const topMetroStations = useMemo(() => metro.stationUsage.slice(0, 3), [metro.stationUsage])
  const speedOptions = useMemo(() => [2, 3, 10], [])

  const metroModeButtonClass = useCallback(
    (mode: 'heatmap' | 'playback', disabled?: boolean) => {
      const isActive = metroMode === mode
      const base = ['flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition']
      if (isActive) {
        base.push('bg-slate-900 text-white shadow-sm')
      } else {
        base.push('border border-slate-200 bg-white text-slate-600')
        if (!disabled) {
          base.push('hover:text-slate-900')
        }
      }
      if (disabled) {
        base.push('cursor-not-allowed opacity-50')
      }
      return base.join(' ')
    },
    [metroMode],
  )

  const handleMetroModeChange = useCallback(
    (mode: 'heatmap' | 'playback') => {
      if (mode === metroMode) {
        return
      }
      setMetroMode(mode)
      if (mode !== 'playback') {
        setMetroPlaying(false)
        setMetroProgress(0)
      }
    },
    [metroMode],
  )

  const metroHeader = useMemo(() => {
    const totalTripsLabel = `${integerFormatter.format(metro.totalTrips)} ${
      metro.totalTrips === 1 ? 'viaje en metro' : 'viajes en metro'
    }`
    const detectedStationsLabel = `${metro.stationUsage.length} estaciones detectadas`
    const playbackDisabled = !hasMetroData || metroTrips.length === 0
    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Image src="/operadores/mb.svg" alt="Metro Bilbao" width={32} height={32} className="h-8 w-8" />
            <div className="flex flex-col">
              <span className="text-base font-semibold text-slate-900">Metro Bilbao</span>
              <span className="text-xs text-slate-500">
                {totalTripsLabel} · {detectedStationsLabel}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-full bg-slate-100 p-1">
            <button
              type="button"
              className={metroModeButtonClass('heatmap')}
              onClick={() => handleMetroModeChange('heatmap')}
            >
              <Flame className="h-3.5 w-3.5" />
              <span>Mapa de calor</span>
            </button>
            <button
              type="button"
              className={metroModeButtonClass('playback', playbackDisabled)}
              onClick={() => handleMetroModeChange('playback')}
              disabled={playbackDisabled}
            >
              <PlayCircle className="h-3.5 w-3.5" />
              <span>Reproducción</span>
            </button>
          </div>
        </div>
        {metroMode === 'playback' && (
          <div className="flex flex-wrap items-center justify-end gap-3">
            {!activeMetroTrip && (
              <span className="text-xs text-slate-500">Añade viajes de Metro Bilbao para activar la reproducción.</span>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-600">
                <Gauge className="h-3.5 w-3.5" />
                {speedOptions.map((speed) => (
                  <button
                    key={speed}
                    type="button"
                    onClick={() => handleMetroSpeedChange(speed)}
                    className={`rounded-full px-2 py-0.5 font-semibold transition ${
                      metroSpeed === speed
                        ? 'bg-slate-900 text-white'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                    disabled={playbackDisabled}
                  >
                    x{speed}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleMetroPrev}
                  className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={playbackDisabled}
                >
                  <SkipBack className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={handleMetroTogglePlay}
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-900 text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={playbackDisabled}
                >
                  {metroPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                </button>
                <button
                  type="button"
                  onClick={handleMetroNext}
                  className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={playbackDisabled}
                >
                  <SkipForward className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }, [metro.totalTrips, metro.stationUsage.length, hasMetroData, metroTrips.length, metroMode, metroModeButtonClass, handleMetroModeChange, activeMetroTrip, speedOptions, handleMetroSpeedChange, metroSpeed, handleMetroPrev, handleMetroTogglePlay, handleMetroNext, metroPlaying])

  const metroFooter = useMemo(() => {
    if (!hasMetroData) {
      return (
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>Sube validaciones de Metro Bilbao para activar el mapa.</span>
        </div>
      )
    }
    const playbackDisabled = metroTrips.length === 0
    if (metroMode === 'playback') {
      if (!activeMetroTrip || playbackDisabled) {
        return (
          <div className="flex justify-center text-xs text-slate-500">
            Añade viajes de Metro Bilbao para activar la reproducción.
          </div>
        )
      }
      const baseTimeMs = activeMetroTrip.date.getTime()
      const durationMs = typeof activeMetroTrip.durationMinutes === 'number' && activeMetroTrip.durationMinutes > 0
        ? activeMetroTrip.durationMinutes * 60 * 1000
        : 0
      const animatedTime = (() => {
        if (!durationMs) {
          return new Date(baseTimeMs)
        }
        const clamped = Math.min(Math.max(metroProgress, 0), 1)
        return new Date(baseTimeMs + durationMs * clamped)
      })()
      const dateLabel = fullDateFormatter.format(activeMetroTrip.date)
      const timeLabel = timeFormatter.format(animatedTime)
      const routeLabel = `${getMetroStationName(activeMetroTrip.from)} → ${getMetroStationName(activeMetroTrip.to)}`
      const durationLabel = typeof activeMetroTrip.durationMinutes === 'number' && activeMetroTrip.durationMinutes > 0
        ? formatDuration(activeMetroTrip.durationMinutes)
        : null
      const tripPositionLabel = `${metroTripIndex + 1} de ${metroTrips.length}`
      return (
        <div className="flex flex-col gap-2">
          <div className="flex justify-center">
            <div className="w-full max-w-2xl rounded-3xl border border-slate-200 bg-white px-8 py-4 text-center text-base font-semibold text-slate-800 shadow-lg shadow-slate-200/70">
              <div className="flex flex-wrap items-center justify-center gap-2 text-lg font-semibold text-slate-900">
                <span>{dateLabel}</span>
                <span className="text-slate-400 font-normal">·</span>
                <span className="font-medium text-slate-600">{timeLabel}</span>
                <span className="text-slate-400 font-normal">·</span>
                <span>{routeLabel}</span>
                {durationLabel && (
                  <>
                    <span className="text-slate-400 font-normal">·</span>
                    <span className="font-medium text-slate-600">{durationLabel}</span>
                  </>
                )}
              </div>
            </div>
          </div>
          <span className="text-xs text-slate-500 text-center">Viaje {tripPositionLabel}</span>
        </div>
      )
    }
    if (metroMode === 'heatmap') {
      return (
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
          <span className="flex items-center gap-2">
            <span className="flex items-center gap-1">
              <span
                className="h-3 w-20 rounded-full"
                style={{ background: 'linear-gradient(90deg, #FDE68A 0%, #F97316 38%, #DC2626 70%, #7F1D1D 100%)' }}
              />
              <span>Intensidad de actividad</span>
            </span>
          </span>
          <div className="flex flex-wrap gap-2">
            {topMetroStations.map((station) => (
              <span key={station.code} className="rounded-full bg-slate-100 px-2 py-1 text-[11px] text-slate-600">
                {station.name} · {integerFormatter.format(station.total)}
              </span>
            ))}
          </div>
        </div>
      )
    }
    return null
  }, [hasMetroData, metroMode, topMetroStations, activeMetroTrip, metroTrips.length, metroTripIndex, metroProgress])

  return (
    <div className="mt-8">
      <MetroDiagram
        stationHighlights={metroStationHighlights}
        playbackState={playbackState}
        hideLegends
        header={metroHeader}
        footer={metroFooter}
      />
    </div>
  )
}
