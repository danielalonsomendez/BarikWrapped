import { useCallback, useEffect, useState, type ReactNode } from 'react'

import metroLines from '../../../files/lineasmetro.json'

type LineCode = 'L1' | 'L2' | 'L3' | 'T'
type ZoneCode = 'Z1' | 'Z2' | 'Z3'

type RawStation = {
  zone: ZoneCode
  code: string
  name: string
  weight: number
  line: LineCode
  connection?: boolean
}

type RawMetroData = Record<string, { zone: ZoneCode; stations: RawStation[] }>

type DiagramStation = RawStation & { x: number; y?: number }
type PositionedStation = DiagramStation & { y: number }
type DiagramPoint = { x: number; y: number }
type ZoneSegment = {
  zone: ZoneCode
  label: string
  color: string
  startX: number
  endX: number
}

type LabelPlacement = 'top' | 'bottom' | 'right'

export type MetroStationLayout = {
  code: string
  name: string
  line: LineCode
  zone: ZoneCode
  x: number
  y: number
  connection: boolean
}

export type MetroStationHighlight = {
  intensity?: number
  color?: string
  isActive?: boolean
  label?: string
}

export type MetroPlaybackState = {
  from: string
  to: string
  progress: number
  color?: string
  pathCodes?: string[]
}

type MetroDiagramProps = {
  stationHighlights?: Record<string, MetroStationHighlight>
  playbackState?: MetroPlaybackState | null
  hideLegends?: boolean
  className?: string
  header?: ReactNode
  footer?: ReactNode
}

const LINE_COLORS: Record<Exclude<LineCode, 'T'>, string> = {
  L1: '#f05a28',
  L2: '#101820',
  L3: '#c02486',
}

const DISABLED_SEGMENT_COLOR = '#CBD5F5'
const DISABLED_SEGMENT_COLOR_NORMALIZED = DISABLED_SEGMENT_COLOR.toLowerCase()

const ZONE_META: Record<ZoneCode, { label: string; color: string }> = {
  Z1: { label: 'Zona 1', color: '#f5b44c' },
  Z2: { label: 'Zona 2', color: '#48a054' },
  Z3: { label: 'Zona 3', color: '#2563eb' },
}

const RAW_DATA = metroLines as RawMetroData
const RAW_STATIONS: RawStation[] = Object.values(RAW_DATA).flatMap((entry) => entry.stations)
const MIN_WEIGHT = Math.min(...RAW_STATIONS.map((station) => station.weight))
const MAX_WEIGHT = Math.max(...RAW_STATIONS.map((station) => station.weight))

const STATION_SPACING = 28
const PADDING_X = 32
const CANVAS_HEIGHT = 280
const BASELINE_MARGIN = 40
const LINE_STROKE_WIDTH = 8
const STATION_RADIUS = 6
const CONNECTION_RADIUS = STATION_RADIUS
const STATION_STROKE_WIDTH = 3
const CONNECTION_STROKE_WIDTH = 4

const computeX = (weight: number) => PADDING_X + (weight - MIN_WEIGHT) * STATION_SPACING
const DIAGRAM_WIDTH = computeX(MAX_WEIGHT) + PADDING_X

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

const DEFAULT_PLAYBACK_COLOR = '#E30613'

function hexToRgbComponents(hex: string): { r: number; g: number; b: number } | null {
  if (!hex) {
    return null
  }
  const sanitized = hex.trim().replace('#', '')
  const normalized = sanitized.length === 3
    ? sanitized
        .split('')
        .map((digit) => `${digit}${digit}`)
        .join('')
    : sanitized
  if (normalized.length !== 6) {
    return null
  }
  const r = Number.parseInt(normalized.slice(0, 2), 16)
  const g = Number.parseInt(normalized.slice(2, 4), 16)
  const b = Number.parseInt(normalized.slice(4, 6), 16)
  if ([r, g, b].some((component) => Number.isNaN(component))) {
    return null
  }
  return { r, g, b }
}

function toRgba(hex: string, alpha: number): string {
  const color = hexToRgbComponents(hex)
  if (!color) {
    return `rgba(227, 6, 19, ${clamp(alpha, 0, 1).toFixed(2)})`
  }
  const clampedAlpha = clamp(alpha, 0, 1)
  return `rgba(${color.r}, ${color.g}, ${color.b}, ${clampedAlpha.toFixed(2)})`
}

// Deduplicate repeated rows (e.g., Etxebarri appears twice in the raw JSON dump).
const SEEN_STATION_KEYS = new Set<string>()
const GROUPED_BY_LINE = RAW_STATIONS.reduce<Record<LineCode, DiagramStation[]>>((acc, station) => {
  const key = `${station.line}-${station.code}`
  if (SEEN_STATION_KEYS.has(key)) {
    return acc
  }
  SEEN_STATION_KEYS.add(key)
  const lineStations = acc[station.line] ?? []
  lineStations.push({ ...station, x: computeX(station.weight) })
  acc[station.line] = lineStations
  return acc
}, { L1: [], L2: [], L3: [], T: [] })

Object.values(GROUPED_BY_LINE).forEach((stations) => {
  stations.sort((a, b) => a.weight - b.weight)
})

const L1_STATIONS = GROUPED_BY_LINE.L1
const L2_STATIONS = GROUPED_BY_LINE.L2
const L3_STATIONS = GROUPED_BY_LINE.L3
const TRUNK_STATIONS = GROUPED_BY_LINE.T
const SAN_IGNAZIO_INDEX = TRUNK_STATIONS.findIndex((station) => station.code === 'SIN')

const TRUNK_START = TRUNK_STATIONS[0]
const TRUNK_END = TRUNK_STATIONS[TRUNK_STATIONS.length - 1]

const L1_BASELINE = 152

const LINE_Y = {
  l3: 130,
  l1: L1_BASELINE,
  trunkTop: L1_BASELINE - LINE_STROKE_WIDTH / 2,
  trunkBottom: L1_BASELINE + LINE_STROKE_WIDTH / 2,
  trunkMid: L1_BASELINE,
  l2: 180,
}

const L3_ANCHOR_X = (() => {
  const match = TRUNK_STATIONS.find((station) => {
    const normalized = normalize(station.name)
    return normalized.includes('casco') || normalized.includes('zazpikaleak')
  })
  return match?.x ?? computeX(25)
})()

const L3_PIVOT_INDEX = L3_STATIONS.findIndex((station) => {
  const normalized = normalize(station.name)
  return normalized.includes('casco') || normalized.includes('zazpikaleak')
})
const L3_PIVOT_SAFE_INDEX = L3_PIVOT_INDEX === -1 ? Math.floor(L3_STATIONS.length / 2) : L3_PIVOT_INDEX
const L3_BRANCH_HEIGHT = LINE_Y.l3
const L3_BRANCH_SPACING = 28
const L3_BRANCH_OFFSET_X = 0
const L3_HORIZONTAL_POINTS: (PositionedStation & { isPivot: boolean })[] = L3_STATIONS.map((station, index) => ({
  ...station,
  x: L3_ANCHOR_X + (index - L3_PIVOT_SAFE_INDEX) * L3_BRANCH_SPACING + L3_BRANCH_OFFSET_X,
  y: L3_BRANCH_HEIGHT,
  isPivot: index === L3_PIVOT_SAFE_INDEX,
}))
const L3_PIVOT_POINT = L3_HORIZONTAL_POINTS.find((station) => station.isPivot) ?? L3_HORIZONTAL_POINTS[0]
const L3_BRANCH_START_X = L3_PIVOT_POINT?.x ?? L3_HORIZONTAL_POINTS[0]?.x ?? L3_ANCHOR_X

type MetroLineSegment = {
  id: string
  from: string
  to: string
  points: DiagramPoint[]
  color: string
  strokeWidth: number
}

type SegmentPoint = {
  code: string
  x: number
  y: number
}

const BASE_LINE_SEGMENTS: MetroLineSegment[] = []

const addSegment = (segment: MetroLineSegment | null | undefined) => {
  if (!segment || !segment.from || !segment.to) {
    return
  }
  BASE_LINE_SEGMENTS.push(segment)
}

const addSegmentsFromPoints = (points: SegmentPoint[], color: string, strokeWidth: number, idPrefix: string) => {
  if (points.length < 2) {
    return
  }
  for (let index = 0; index < points.length - 1; index += 1) {
    const current = points[index]
    const next = points[index + 1]
    addSegment({
      id: `${idPrefix}-${current.code}-${next.code}-${index}`,
      from: current.code,
      to: next.code,
      points: [
        { x: current.x, y: current.y },
        { x: next.x, y: next.y },
      ],
      color,
      strokeWidth,
    })
  }
}


const LINE2_BEFORE_TRUNK = L2_STATIONS.filter((station) => station.weight < (TRUNK_START?.weight ?? Infinity))
const LINE2_AFTER_TRUNK = L2_STATIONS.filter((station) => station.weight > (TRUNK_END?.weight ?? -Infinity))

const POSITIONED_L1: PositionedStation[] = L1_STATIONS.map((station) => ({ ...station, y: LINE_Y.l1 }))
const POSITIONED_LINE2_BEFORE: PositionedStation[] = LINE2_BEFORE_TRUNK.map((station) => ({ ...station, y: LINE_Y.l2 }))
const POSITIONED_LINE2_AFTER: PositionedStation[] = LINE2_AFTER_TRUNK.map((station) => ({ ...station, y: LINE_Y.l2 }))
const POSITIONED_TRUNK: PositionedStation[] = TRUNK_STATIONS.map((station) => ({ ...station, y: LINE_Y.trunkMid }))
const POSITIONED_L3: PositionedStation[] = L3_HORIZONTAL_POINTS.map((station) => ({ ...station }))

const ALL_POSITIONED_STATIONS: PositionedStation[] = [
  ...POSITIONED_L1,
  ...POSITIONED_TRUNK,
  ...POSITIONED_LINE2_BEFORE,
  ...POSITIONED_LINE2_AFTER,
  ...POSITIONED_L3,
]

const STATION_BY_CODE = new Map<string, PositionedStation>()
ALL_POSITIONED_STATIONS.forEach((station) => {
  if (!STATION_BY_CODE.has(station.code)) {
    STATION_BY_CODE.set(station.code, station)
  }
})

const STATION_GRAPH = new Map<string, Set<string>>()

const ensureGraphNode = (code?: string) => {
  if (!code || !STATION_BY_CODE.has(code)) {
    return
  }
  if (!STATION_GRAPH.has(code)) {
    STATION_GRAPH.set(code, new Set())
  }
}

const addEdge = (from?: string, to?: string) => {
  if (!from || !to || from === to) {
    return
  }
  if (!STATION_BY_CODE.has(from) || !STATION_BY_CODE.has(to)) {
    return
  }
  ensureGraphNode(from)
  ensureGraphNode(to)
  STATION_GRAPH.get(from)!.add(to)
  STATION_GRAPH.get(to)!.add(from)
}

const connectSequence = (stations: PositionedStation[]) => {
  for (let index = 0; index < stations.length - 1; index += 1) {
    const current = stations[index]
    const next = stations[index + 1]
    addEdge(current.code, next.code)
  }
}

connectSequence(POSITIONED_L1)
connectSequence(POSITIONED_TRUNK)
connectSequence(POSITIONED_LINE2_BEFORE)
connectSequence(POSITIONED_LINE2_AFTER)
connectSequence(POSITIONED_L3)

addEdge(POSITIONED_L1[POSITIONED_L1.length - 1]?.code, POSITIONED_TRUNK[0]?.code)
addEdge(POSITIONED_LINE2_BEFORE[POSITIONED_LINE2_BEFORE.length - 1]?.code, POSITIONED_TRUNK[0]?.code)
addEdge(POSITIONED_TRUNK[POSITIONED_TRUNK.length - 1]?.code, POSITIONED_LINE2_AFTER[0]?.code)

const TRUNK_CASCO = POSITIONED_TRUNK.find((station) => station.code === 'CAV')
const L3_PIVOT_CODE = L3_PIVOT_POINT?.code ?? null
if (TRUNK_CASCO && L3_PIVOT_CODE) {
  addEdge(L3_PIVOT_CODE, TRUNK_CASCO.code)
}

export const METRO_STATION_LAYOUT: MetroStationLayout[] = ALL_POSITIONED_STATIONS.map((station) => ({
  code: station.code,
  name: station.name,
  line: station.line,
  zone: station.zone,
  x: station.x,
  y: station.y,
  connection: Boolean(station.connection),
}))

const METRO_GRAPH_RECORD: Record<string, string[]> = {}
STATION_GRAPH.forEach((neighbors, code) => {
  METRO_GRAPH_RECORD[code] = Array.from(neighbors)
})

export const METRO_STATION_GRAPH = METRO_GRAPH_RECORD

export function findMetroPath(from: string, to: string): string[] {
  if (!from || !to) {
    return []
  }
  if (!STATION_BY_CODE.has(from) || !STATION_BY_CODE.has(to)) {
    return STATION_BY_CODE.has(from) ? [from] : []
  }
  if (from === to) {
    return [from]
  }
  const visited = new Set<string>([from])
  const queue: Array<{ code: string; path: string[] }> = [{ code: from, path: [from] }]
  while (queue.length) {
    const current = queue.shift()!
    if (current.code === to) {
      return current.path
    }
    const neighbors = STATION_GRAPH.get(current.code)
    neighbors?.forEach((neighbor) => {
      if (!visited.has(neighbor)) {
        visited.add(neighbor)
        queue.push({ code: neighbor, path: [...current.path, neighbor] })
      }
    })
  }
  return [from]
}

const findSegmentColor = (from: string, to: string, fallback?: string): string => {
  const match = BASE_LINE_SEGMENTS.find(
    (segment) =>
      (segment.from === from && segment.to === to) ||
      (segment.from === to && segment.to === from),
  )
  if (match) {
    return match.color
  }
  const fromStation = STATION_BY_CODE.get(from)
  if (fromStation && fromStation.line !== 'T') {
    const lineColor = LINE_COLORS[fromStation.line as Exclude<LineCode, 'T'>]
    if (lineColor) {
      return lineColor
    }
  }
  const toStation = STATION_BY_CODE.get(to)
  if (toStation && toStation.line !== 'T') {
    const lineColor = LINE_COLORS[toStation.line as Exclude<LineCode, 'T'>]
    if (lineColor) {
      return lineColor
    }
  }
  if (fallback) {
    return fallback
  }
  return DEFAULT_PLAYBACK_COLOR
}

const MAINLINE_FOR_ZONES = [...L1_STATIONS, ...TRUNK_STATIONS].sort((a, b) => a.weight - b.weight)
const ZONE_SEGMENTS: ZoneSegment[] = MAINLINE_FOR_ZONES.reduce<ZoneSegment[]>((segments, station) => {
  const meta = ZONE_META[station.zone]
  if (!meta) {
    return segments
  }
  const last = segments[segments.length - 1]
  const startX = station.x - STATION_SPACING / 2
  const endX = station.x + STATION_SPACING / 2
  if (!last || last.zone !== station.zone) {
    segments.push({ zone: station.zone, label: meta.label, color: meta.color, startX, endX })
    return segments
  }
  last.endX = endX
  return segments
}, []).map((segment) => ({
  ...segment,
  startX: Math.max(PADDING_X / 2, segment.startX),
  endX: Math.min(DIAGRAM_WIDTH - PADDING_X / 2, segment.endX),
}))

const createPath = (points: DiagramPoint[]) =>
  points.reduce((path, point, index) => `${path}${index === 0 ? 'M' : 'L'} ${point.x} ${point.y} `, '').trim()

const SAN_IGNAZIO_DIAGONAL_GAP_L1 = STATION_SPACING * 0.65
const SAN_IGNAZIO_DIAGONAL_GAP_L2 = STATION_SPACING * 1.5

const L1_DIAGONAL_START_X = TRUNK_START
  ? Math.max(TRUNK_START.x - SAN_IGNAZIO_DIAGONAL_GAP_L1, L1_STATIONS[L1_STATIONS.length - 1]?.x ?? TRUNK_START.x)
  : null

const L2_DIAGONAL_START_X = TRUNK_START
  ? Math.max(TRUNK_START.x - SAN_IGNAZIO_DIAGONAL_GAP_L2, LINE2_BEFORE_TRUNK[LINE2_BEFORE_TRUNK.length - 1]?.x ?? TRUNK_START.x)
  : null

addSegmentsFromPoints(POSITIONED_L1, LINE_COLORS.L1, LINE_STROKE_WIDTH, 'L1')
addSegmentsFromPoints(POSITIONED_LINE2_BEFORE, LINE_COLORS.L2, LINE_STROKE_WIDTH, 'L2-before')
addSegmentsFromPoints(POSITIONED_LINE2_AFTER, LINE_COLORS.L2, LINE_STROKE_WIDTH, 'L2-after')
addSegmentsFromPoints(POSITIONED_L3, LINE_COLORS.L3, LINE_STROKE_WIDTH, 'L3')

addSegmentsFromPoints(
  TRUNK_STATIONS.map((station) => ({ code: station.code, x: station.x, y: LINE_Y.trunkTop })),
  LINE_COLORS.L1,
  LINE_STROKE_WIDTH,
  'L1-trunk',
)

addSegmentsFromPoints(
  TRUNK_STATIONS.map((station) => ({ code: station.code, x: station.x, y: LINE_Y.trunkBottom })),
  LINE_COLORS.L2,
  LINE_STROKE_WIDTH,
  'L2-trunk',
)

if (TRUNK_START && L1_DIAGONAL_START_X !== null && POSITIONED_L1.length) {
  const lastL1 = POSITIONED_L1[POSITIONED_L1.length - 1]
  const diagonalPoints: DiagramPoint[] = [{ x: lastL1.x, y: lastL1.y }]
  if (Math.abs(L1_DIAGONAL_START_X - lastL1.x) > 1) {
    diagonalPoints.push({ x: L1_DIAGONAL_START_X, y: lastL1.y })
  }
  diagonalPoints.push({ x: TRUNK_START.x, y: LINE_Y.trunkTop })
  addSegment({
    id: `L1-diagonal-${lastL1.code}-${TRUNK_START.code}`,
    from: lastL1.code,
    to: TRUNK_START.code,
    points: diagonalPoints,
    color: LINE_COLORS.L1,
    strokeWidth: LINE_STROKE_WIDTH,
  })
}

if (TRUNK_START && L2_DIAGONAL_START_X !== null && POSITIONED_LINE2_BEFORE.length) {
  const lastL2Before = POSITIONED_LINE2_BEFORE[POSITIONED_LINE2_BEFORE.length - 1]
  const diagonalPoints: DiagramPoint[] = [{ x: lastL2Before.x, y: lastL2Before.y }]
  if (Math.abs(L2_DIAGONAL_START_X - lastL2Before.x) > 1) {
    diagonalPoints.push({ x: L2_DIAGONAL_START_X, y: lastL2Before.y })
  }
  diagonalPoints.push({ x: TRUNK_START.x, y: LINE_Y.trunkBottom })
  addSegment({
    id: `L2-diagonal-${lastL2Before.code}-${TRUNK_START.code}`,
    from: lastL2Before.code,
    to: TRUNK_START.code,
    points: diagonalPoints,
    color: LINE_COLORS.L2,
    strokeWidth: LINE_STROKE_WIDTH,
  })
}

if (TRUNK_END && POSITIONED_LINE2_AFTER.length) {
  const firstAfterSegment = POSITIONED_LINE2_AFTER[0]
  addSegment({
    id: `L2-after-connector-${TRUNK_END.code}-${firstAfterSegment.code}`,
    from: TRUNK_END.code,
    to: firstAfterSegment.code,
    points: [
      { x: TRUNK_END.x, y: LINE_Y.trunkBottom },
      { x: firstAfterSegment.x, y: firstAfterSegment.y },
    ],
    color: LINE_COLORS.L2,
    strokeWidth: LINE_STROKE_WIDTH,
  })
}

if (TRUNK_CASCO && L3_PIVOT_POINT) {
  const connectorPoints: DiagramPoint[] = [
    { x: TRUNK_CASCO.x, y: LINE_Y.trunkMid },
    { x: L3_ANCHOR_X, y: L3_BRANCH_HEIGHT },
    { x: L3_BRANCH_START_X, y: L3_BRANCH_HEIGHT },
  ]
  addSegment({
    id: `L3-connector-${TRUNK_CASCO.code}-${L3_PIVOT_POINT.code}`,
    from: TRUNK_CASCO.code,
    to: L3_PIVOT_POINT.code,
    points: connectorPoints,
    color: LINE_COLORS.L3,
    strokeWidth: LINE_STROKE_WIDTH,
  })
}

const LINE_LEGEND = [
  { id: 'L1', label: 'Línea 1 Plentzia - Etxebarri', color: LINE_COLORS.L1 },
  { id: 'L2', label: 'Línea 2 Kabiezes - Basauri', color: LINE_COLORS.L2 },
  { id: 'L3', label: 'Línea 3 Kukullaga - Matiko', color: LINE_COLORS.L3 },
]

function normalize(value: string) {
  return value.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '')
}

function getLabelSegments(station: DiagramStation) {
  const normalized = normalize(station.name)
  const sanitized = station.name.replace(/casco viejo/gi, 'Casco Viejo').trim()
  const keepSingleLine = station.code === 'CAV' || station.code === 'SAM' || normalized.includes('zazpikaleak')|| normalized.includes('cruces')
  if (keepSingleLine) {
    return [sanitized.replace(/\s*\/\s*/g, ' / ')]
  }
  return sanitized
    .split('/')
    .map((segment) => segment.trim())
    .filter(Boolean)
}

type StationNodeProps = {
  station: DiagramStation
  color: string
  cx: number
  cy: number
  placement: LabelPlacement
  fontSize?: number
  textAnchorOverride?: 'start' | 'middle' | 'end'
  lineThickness?: number
  highlight?: MetroStationHighlight | null
  onHover?: (payload: StationHoverPayload) => void
  onLeave?: () => void
  isHovered?: boolean
}

type StationHoverPayload = {
  code: string
  name: string
  label: string
  x: number
  y: number
  color: string
}

function StationNode({
  station,
  color,
  cx,
  cy,
  placement,
  fontSize = 11,
  textAnchorOverride,
  lineThickness,
  highlight,
  onHover,
  onLeave,
  isHovered,
}: StationNodeProps) {
  const segments = getLabelSegments(station)
  const maxSegmentLength = segments.reduce((max, segment) => Math.max(max, segment.length), 0)
  const radius = station.connection ? CONNECTION_RADIUS : STATION_RADIUS
  const baseStrokeWidth = station.connection ? CONNECTION_STROKE_WIDTH : STATION_STROKE_WIDTH
  const thickness = lineThickness ?? LINE_STROKE_WIDTH
  const normalizedIntensity = clamp(highlight?.intensity ?? 0, 0, 1)
  const highlightColor = highlight?.color ?? color
  const hasTint = normalizedIntensity > 0
  const strokeWidth = hasTint ? baseStrokeWidth + 1 : baseStrokeWidth
  const fillColor = hasTint ? toRgba(highlightColor, 0.25 + normalizedIntensity * 0.55) : '#fff'
  const haloRadius = radius + strokeWidth + 3
  const haloOpacity = normalizedIntensity > 0 ? 0.18 + normalizedIntensity * 0.35 : 0
  const labelAngleDeg = placement === 'top' ? -70 : placement === 'bottom' ? 70 : 0
  const angleRad = (labelAngleDeg * Math.PI) / 180
  const approxCharWidth = fontSize * 0.55
  const textSpan = maxSegmentLength * approxCharWidth
  const multiLineDepth = segments.length > 1 ? (segments.length - 1) * (fontSize * 1.05) : 0
  const textLengthAdjustment = textSpan * (placement === 'top' ? 0.90 : 0) + multiLineDepth * 0.1
  const baseGap = placement === 'top' ? fontSize * 0.45 + 1 : fontSize * 0.3 + 0
  const thicknessPadding = placement === 'bottom' ? thickness * 0.5 : thickness * 0.5
  const radialDistance = radius + strokeWidth / 2 + thicknessPadding + baseGap + textLengthAdjustment
  const offsetX = Math.cos(angleRad) * radialDistance- (placement === 'top' ? 0 : 7)
  const offsetY = Math.sin(angleRad) * radialDistance
  const defaultAnchor = (() => {
    if (placement === 'top') {
      return 'end' as const
    }
    if (placement === 'bottom') {
      return 'start' as const
    }
    return 'start' as const
  })()
  const textAnchor = textAnchorOverride ?? defaultAnchor
  const anchorX = cx + offsetX
  const anchorY = cy + offsetY
  const lineHeight = fontSize * 0.92 + 4
  const transform = labelAngleDeg !== 0 ? `rotate(${labelAngleDeg} ${anchorX} ${anchorY})` : undefined
  const tooltipLabel = highlight?.label ?? station.name

  const handleEnter = useCallback(() => {
    onHover?.({
      code: station.code,
      name: station.name,
      label: tooltipLabel,
      x: cx,
      y: cy,
      color: highlightColor,
    })
  }, [cx, cy, highlightColor, onHover, station.code, station.name, tooltipLabel])

  const handleLeave = useCallback(() => {
    onLeave?.()
  }, [onLeave])

  useEffect(() => {
    if (isHovered) {
      handleEnter()
    }
  }, [handleEnter, isHovered])

  return (
    <g
      aria-label={tooltipLabel}
      className="cursor-pointer"
      onMouseEnter={handleEnter}
      onMouseMove={handleEnter}
      onMouseLeave={handleLeave}
      onFocus={handleEnter}
      onBlur={handleLeave}
      role="img"
      tabIndex={0}
    >
      {haloOpacity > 0 && (
        <circle cx={cx} cy={cy} r={haloRadius} fill={toRgba(highlightColor, haloOpacity)} />
      )}
      <circle cx={cx} cy={cy} r={radius} fill={fillColor} stroke={highlightColor} strokeWidth={strokeWidth} />
      <text
        x={anchorX}
        y={anchorY}
        fill="#0f172a"
        fontSize={fontSize}
        fontWeight={600}
        textAnchor={textAnchor}
        transform={transform}
      >
        {segments.map((segment, index) => (
          <tspan key={`${station.code}-${segment}-${index}`} x={anchorX} dy={index === 0 ? 0 : lineHeight}>
            {segment}
          </tspan>
        ))}
      </text>
    </g>
  )
}

export function MetroDiagram({
  stationHighlights,
  playbackState,
  hideLegends = false,
  className,
  header,
  footer,
}: MetroDiagramProps = {}) {
  const wrapperClassName = ['space-y-6', className].filter(Boolean).join(' ')
  const getStationHighlight = (code: string) => (stationHighlights ? stationHighlights[code] ?? null : null)
  const [hoveredStation, setHoveredStation] = useState<StationHoverPayload | null>(null)
  const handleStationHover = useCallback((payload: StationHoverPayload) => {
    setHoveredStation((current) => {
      if (
        current &&
        current.code === payload.code &&
        current.label === payload.label &&
        current.x === payload.x &&
        current.y === payload.y &&
        current.color === payload.color
      ) {
        return current
      }
      return payload
    })
  }, [])
  const handleStationLeave = useCallback(() => {
    setHoveredStation(null)
  }, [])
  const isStationDisabled = (highlight?: MetroStationHighlight | null) => {
    if (!highlight || highlight.isActive) {
      return false
    }
    const intensity = highlight.intensity ?? 0
    if (intensity > 0.0001) {
      return false
    }
    const color = highlight.color?.toLowerCase()
    return color === DISABLED_SEGMENT_COLOR_NORMALIZED
  }

  const playbackGeometry = (() => {
    if (!playbackState) {
      return null
    }
    const candidatePath = playbackState.pathCodes && playbackState.pathCodes.length >= 2
      ? playbackState.pathCodes
      : findMetroPath(playbackState.from, playbackState.to)
    const validCodes = candidatePath.filter((code) => STATION_BY_CODE.has(code))
    if (validCodes.length < 2) {
      return null
    }
    const points = validCodes.map((code) => {
      const station = STATION_BY_CODE.get(code)!
      return { x: station.x, y: station.y }
    })
    let totalLength = 0
    const rawSegments: Array<{
      id: string
      fromCode: string
      toCode: string
      fromPoint: DiagramPoint
      toPoint: DiagramPoint
      length: number
      color: string
    }> = []
    for (let index = 0; index < points.length - 1; index += 1) {
      const fromPoint = points[index]
      const toPoint = points[index + 1]
      const fromCode = validCodes[index]
      const toCode = validCodes[index + 1]
      const segmentLength = Math.hypot(toPoint.x - fromPoint.x, toPoint.y - fromPoint.y)
      const color = findSegmentColor(fromCode, toCode, playbackState.color)
      rawSegments.push({
        id: `${fromCode}-${toCode}-${index}`,
        fromCode,
        toCode,
        fromPoint,
        toPoint,
        length: segmentLength,
        color,
      })
      totalLength += segmentLength
    }
    if (totalLength <= 0) {
      return null
    }
    const progress = clamp(playbackState.progress ?? 0, 0, 1)
    const segments = rawSegments.map((segment) => ({
      id: segment.id,
      path: createPath([segment.fromPoint, segment.toPoint]),
      length: segment.length,
      color: segment.color,
      fromPoint: segment.fromPoint,
      toPoint: segment.toPoint,
      progress: 0,
    }))
    let remaining = totalLength * progress
    for (const segment of segments) {
      if (segment.length <= 0) {
        segment.progress = remaining > 0 ? 1 : 0
        continue
      }
      const ratio = clamp(remaining / segment.length, 0, 1)
      segment.progress = ratio
      remaining = Math.max(remaining - segment.length, 0)
    }
    let markerPoint = points[points.length - 1]
    let markerRemaining = totalLength * progress
    for (const segment of segments) {
      if (markerRemaining <= segment.length) {
        const ratio = segment.length === 0 ? 0 : markerRemaining / segment.length
        markerPoint = {
          x: segment.fromPoint.x + (segment.toPoint.x - segment.fromPoint.x) * ratio,
          y: segment.fromPoint.y + (segment.toPoint.y - segment.fromPoint.y) * ratio,
        }
        break
      }
      markerRemaining -= segment.length
    }
    let markerColor = playbackState.color ?? segments[0]?.color ?? DEFAULT_PLAYBACK_COLOR
    for (const segment of segments) {
      if (segment.progress < 1) {
        markerColor = segment.color
        break
      }
      markerColor = segment.color
    }
    return {
      segments,
      marker: markerPoint,
      markerColor,
    }
  })()

  const diagramSpacingClass = !hideLegends ? 'mt-6' : header ? 'mt-4' : 'mt-2'

  return (
    <div className={wrapperClassName}>
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-lg">
        {header && <div className="mb-4">{header}</div>}
        {!hideLegends && (
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex flex-wrap gap-3 text-xs font-semibold text-slate-700">
              {LINE_LEGEND.map((line) => (
                <span key={line.id} className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-3 py-1">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full text-white" style={{ backgroundColor: line.color }}>
                    {line.id}
                  </span>
                  <span>{line.label}</span>
                </span>
              ))}
            </div>
          </div>
        )}
        <div className={`${diagramSpacingClass} overflow-x-auto`}>
          <div className="min-w-[820px]">
            <svg
              viewBox={`0 0 ${DIAGRAM_WIDTH} ${CANVAS_HEIGHT + BASELINE_MARGIN}`}
              className="h-auto w-full"
              onMouseLeave={handleStationLeave}
            >
              <defs>
                <filter id="glow" height="200%" width="200%" x="-50%" y="-50%">
                  <feGaussianBlur in="SourceGraphic" stdDeviation="2" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>

              {!hideLegends &&
                ZONE_SEGMENTS.map((segment) => (
                  <g key={`${segment.zone}-${segment.startX}`}>
                    <rect
                      x={segment.startX}
                      y={CANVAS_HEIGHT - 40}
                      width={Math.max(0, segment.endX - segment.startX)}
                      height={32}
                      fill={segment.color}
                      opacity={0.2}
                      rx={12}
                    />
                    <text
                      x={segment.startX + (segment.endX - segment.startX) / 2}
                      y={CANVAS_HEIGHT - 18}
                      textAnchor="middle"
                      fontSize={12}
                      fontWeight={600}
                      fill={segment.color}
                    >
                      {ZONE_META[segment.zone].label}
                    </text>
                  </g>
                ))}
              {BASE_LINE_SEGMENTS.map((segment) => {
                const fromHighlight = getStationHighlight(segment.from)
                const toHighlight = getStationHighlight(segment.to)
                const segmentDisabled = isStationDisabled(fromHighlight) || isStationDisabled(toHighlight)
                const strokeColor = segmentDisabled ? DISABLED_SEGMENT_COLOR : segment.color
                return (
                  <path
                    key={segment.id}
                    d={createPath(segment.points)}
                    stroke={strokeColor}
                    strokeWidth={segment.strokeWidth}
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                )
              })}

              {playbackGeometry?.segments.map((segment) => {
                const dashArray = `${segment.length} ${segment.length}`
                const dashOffset = segment.length * (1 - segment.progress)
                const hasProgress = segment.progress > 0
                return (
                  <path
                    key={`playback-${segment.id}`}
                    d={segment.path}
                    stroke={segment.color}
                    strokeWidth={LINE_STROKE_WIDTH - 2}
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeDasharray={dashArray}
                    strokeDashoffset={dashOffset}
                    opacity={hasProgress ? 0.9 : 0}
                  />
                )
              })}

              {L1_STATIONS.map((station) => (
                <StationNode
                  key={station.code}
                  station={station}
                  color={LINE_COLORS.L1}
                  cx={station.x}
                  cy={LINE_Y.l1}
                  placement="top"
                  fontSize={11}
                  lineThickness={LINE_STROKE_WIDTH}
                  highlight={getStationHighlight(station.code)}
                  onHover={handleStationHover}
                  onLeave={handleStationLeave}
                  isHovered={hoveredStation?.code === station.code}
                />
              ))}

              {LINE2_BEFORE_TRUNK.map((station) => (
                <StationNode
                  key={station.code}
                  station={station}
                  color={LINE_COLORS.L2}
                  cx={station.x}
                  cy={LINE_Y.l2}
                  placement="bottom"
                  fontSize={11}
                  lineThickness={LINE_STROKE_WIDTH}
                  highlight={getStationHighlight(station.code)}
                  onHover={handleStationHover}
                  onLeave={handleStationLeave}
                  isHovered={hoveredStation?.code === station.code}
                />
              ))}

              {LINE2_AFTER_TRUNK.map((station) => (
                <StationNode
                  key={station.code}
                  station={station}
                  color={LINE_COLORS.L2}
                  cx={station.x}
                  cy={LINE_Y.l2}
                  placement="bottom"
                  fontSize={11}
                  lineThickness={LINE_STROKE_WIDTH}
                  highlight={getStationHighlight(station.code)}
                  onHover={handleStationHover}
                  onLeave={handleStationLeave}
                  isHovered={hoveredStation?.code === station.code}
                />
              ))}

              {TRUNK_STATIONS.map((station, index) => {
                const isAfterSanIgnazio = SAN_IGNAZIO_INDEX !== -1 && index >= SAN_IGNAZIO_INDEX
                const placement: LabelPlacement = isAfterSanIgnazio ? 'bottom' : 'top'
                const fontSize = 11.5
                const thickness = isAfterSanIgnazio ? LINE_STROKE_WIDTH * 2 : LINE_STROKE_WIDTH
                return (
                  <StationNode
                    key={station.code}
                    station={station}
                    color={LINE_COLORS.L1}
                    cx={station.x}
                    cy={LINE_Y.trunkMid}
                    placement={placement}
                    fontSize={fontSize}
                    lineThickness={thickness}
                    highlight={getStationHighlight(station.code)}
                    onHover={handleStationHover}
                    onLeave={handleStationLeave}
                    isHovered={hoveredStation?.code === station.code}
                  />
                )
              })}

              {L3_HORIZONTAL_POINTS.map((station) => {
                const fontSize = station.code === 'ZZC' ? 8 : 11
                return (
                  <StationNode
                    key={station.code}
                    station={station}
                    color={LINE_COLORS.L3}
                    cx={station.x}
                    cy={station.y}
                    placement="top"
                    fontSize={fontSize}
                    lineThickness={LINE_STROKE_WIDTH}
                    highlight={getStationHighlight(station.code)}
                    onHover={handleStationHover}
                    onLeave={handleStationLeave}
                    isHovered={hoveredStation?.code === station.code}
                  />
                )
              })}

              {hoveredStation && (() => {
                const segments = hoveredStation.label
                  .split(' · ')
                  .map((segment) => segment.trim())
                  .filter(Boolean)
                const [title, ...details] = segments.length ? [segments[0], ...segments.slice(1)] : [hoveredStation.name]
                const allLines = segments.length ? segments : [hoveredStation.name]
                const maxChars = allLines.reduce((acc, segment) => Math.max(acc, segment.length), 0)
                const tooltipWidth = Math.min(260, Math.max(160, maxChars * 7 + 32))
                const tooltipHeight = allLines.length * 18 + 20
                const proposedX = hoveredStation.x + 14
                const proposedY = hoveredStation.y - tooltipHeight - 14
                const x = Math.min(proposedX, DIAGRAM_WIDTH - tooltipWidth - 12)
                const y = Math.max(8, proposedY)
                const accentColor = hoveredStation.color
                return (
                  <g key="hover-tooltip" pointerEvents="none">
                    <foreignObject x={x} y={y} width={tooltipWidth} height={tooltipHeight} pointerEvents="none">
                      <div className="rounded-xl border border-slate-200 bg-white/95 px-3 py-2 text-xs leading-relaxed text-slate-700 shadow-lg backdrop-blur-sm">
                        <div className="mb-1 flex items-center gap-2 text-[13px] font-semibold text-slate-900">
                          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: accentColor }} />
                          <span>{title}</span>
                        </div>
                        {details.map((line, index) => (
                          <div key={`${hoveredStation.code}-detail-${index}`} className="text-[11px]">
                            {line}
                          </div>
                        ))}
                      </div>
                    </foreignObject>
                  </g>
                )
              })()}

              {playbackGeometry?.marker && (
                <g pointerEvents="none">
                  <circle
                    cx={playbackGeometry.marker.x}
                    cy={playbackGeometry.marker.y}
                    r={STATION_RADIUS + 1.5}
                    fill={playbackGeometry.markerColor}
                    stroke="#fff"
                    strokeWidth={2}
                  />
                </g>
              )}
            </svg>
          </div>
        </div>
        {footer && <div className="mt-6">{footer}</div>}
      </div>
    </div>
  )
}
