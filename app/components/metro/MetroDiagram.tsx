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

const LINE_COLORS: Record<Exclude<LineCode, 'T'>, string> = {
  L1: '#f05a28',
  L2: '#101820',
  L3: '#c02486',
}

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
const CANVAS_HEIGHT = 350
const BASELINE_MARGIN = 48
const LINE_STROKE_WIDTH = 8
const STATION_RADIUS = 6
const CONNECTION_RADIUS = STATION_RADIUS
const STATION_STROKE_WIDTH = 3
const CONNECTION_STROKE_WIDTH = 4

const computeX = (weight: number) => PADDING_X + (weight - MIN_WEIGHT) * STATION_SPACING
const DIAGRAM_WIDTH = computeX(MAX_WEIGHT) + PADDING_X

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
const L3_PATH_POINTS: DiagramPoint[] = L3_HORIZONTAL_POINTS.map((station) => ({ x: station.x, y: station.y }))
const L3_PIVOT_POINT = L3_HORIZONTAL_POINTS.find((station) => station.isPivot) ?? L3_HORIZONTAL_POINTS[0]
const L3_BRANCH_START_X = L3_PIVOT_POINT?.x ?? L3_HORIZONTAL_POINTS[0]?.x ?? L3_ANCHOR_X
const L3_CONNECTOR_POINTS: DiagramPoint[] = [
  { x: L3_ANCHOR_X, y: LINE_Y.trunkMid },
  { x: L3_ANCHOR_X, y: L3_BRANCH_HEIGHT },
  { x: L3_BRANCH_START_X, y: L3_BRANCH_HEIGHT },
]

const LINE2_BEFORE_TRUNK = L2_STATIONS.filter((station) => station.weight < (TRUNK_START?.weight ?? Infinity))
const LINE2_AFTER_TRUNK = L2_STATIONS.filter((station) => station.weight > (TRUNK_END?.weight ?? -Infinity))

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

const L1_PATH_POINTS: DiagramPoint[] = [
  ...L1_STATIONS.map((station) => ({ x: station.x, y: LINE_Y.l1 })),
]

if (TRUNK_START) {
  const lastL1Station = L1_STATIONS[L1_STATIONS.length - 1]
  const l1DiagonalStartX = Math.max(TRUNK_START.x - SAN_IGNAZIO_DIAGONAL_GAP_L1, lastL1Station?.x ?? TRUNK_START.x)
  if (!L1_PATH_POINTS.some((point) => point.x === l1DiagonalStartX && point.y === LINE_Y.l1)) {
    L1_PATH_POINTS.push({ x: l1DiagonalStartX, y: LINE_Y.l1 })
  }
  L1_PATH_POINTS.push({ x: TRUNK_START.x, y: LINE_Y.trunkTop })
  TRUNK_STATIONS.forEach((station) => {
    L1_PATH_POINTS.push({ x: station.x, y: LINE_Y.trunkTop })
  })
}

const L2_PATH_POINTS: DiagramPoint[] = [
  ...LINE2_BEFORE_TRUNK.map((station) => ({ x: station.x, y: LINE_Y.l2 })),
]

if (TRUNK_START) {
  const lastL2Station = LINE2_BEFORE_TRUNK[LINE2_BEFORE_TRUNK.length - 1]
  const l2DiagonalStartX = Math.max(TRUNK_START.x - SAN_IGNAZIO_DIAGONAL_GAP_L2, lastL2Station?.x ?? TRUNK_START.x)
  if (!L2_PATH_POINTS.some((point) => point.x === l2DiagonalStartX && point.y === LINE_Y.l2)) {
    L2_PATH_POINTS.push({ x: l2DiagonalStartX, y: LINE_Y.l2 })
  }
  L2_PATH_POINTS.push({ x: TRUNK_START.x, y: LINE_Y.trunkBottom })
  TRUNK_STATIONS.forEach((station) => {
    L2_PATH_POINTS.push({ x: station.x, y: LINE_Y.trunkBottom })
  })
}

if (LINE2_AFTER_TRUNK.length) {
  const firstAfter = LINE2_AFTER_TRUNK[0]
  L2_PATH_POINTS.push({ x: firstAfter.x, y: LINE_Y.l2 })
  LINE2_AFTER_TRUNK.slice(1).forEach((station) => {
    L2_PATH_POINTS.push({ x: station.x, y: LINE_Y.l2 })
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
}: StationNodeProps) {
  const segments = getLabelSegments(station)
  const maxSegmentLength = segments.reduce((max, segment) => Math.max(max, segment.length), 0)
  const radius = station.connection ? CONNECTION_RADIUS : STATION_RADIUS
  const strokeWidth = station.connection ? CONNECTION_STROKE_WIDTH : STATION_STROKE_WIDTH
  const thickness = lineThickness ?? LINE_STROKE_WIDTH
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

  return (
    <g key={station.code}>
      <circle cx={cx} cy={cy} r={radius} fill="#fff" stroke={color} strokeWidth={strokeWidth} />
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

export function MetroDiagram() {
  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-lg">
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
        <div className="mt-6 overflow-x-auto">
          <div className="min-w-[820px]">
            <svg viewBox={`0 0 ${DIAGRAM_WIDTH} ${CANVAS_HEIGHT + BASELINE_MARGIN}`} className="h-auto w-full">
              <defs>
                <filter id="glow" height="200%" width="200%" x="-50%" y="-50%">
                  <feGaussianBlur in="SourceGraphic" stdDeviation="2" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>

              {ZONE_SEGMENTS.map((segment) => (
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

              <path d={createPath(L1_PATH_POINTS)} stroke={LINE_COLORS.L1} strokeWidth={LINE_STROKE_WIDTH} fill="none" strokeLinecap="round" />
              <path d={createPath(L2_PATH_POINTS)} stroke={LINE_COLORS.L2} strokeWidth={LINE_STROKE_WIDTH} fill="none" strokeLinecap="round" />
              <path d={createPath(L3_PATH_POINTS)} stroke={LINE_COLORS.L3} strokeWidth={LINE_STROKE_WIDTH} fill="none" strokeLinecap="round" />
              <path d={createPath(L3_CONNECTOR_POINTS)} stroke={LINE_COLORS.L3} strokeWidth={LINE_STROKE_WIDTH} fill="none" strokeLinecap="round" />

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
                  />
                )
              })}

              {L3_HORIZONTAL_POINTS.map((station) => {
                const fontSize = station.code === 'ZZC' ? 8: 11
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
                  />
                )
              })}
            </svg>
          </div>
        </div>
      </div>
    </div>
  )
}
