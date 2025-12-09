import { METRO_STATION_LAYOUT } from './MetroDiagram'

const DEFAULT_METRO_ACCENT = '#E30613'

const METRO_LINE_COLORS: Record<'L1' | 'L2' | 'L3', string> = {
  L1: '#f05a28',
  L2: '#101820',
  L3: '#c02486',
}

const METRO_STATION_BY_CODE = new Map(METRO_STATION_LAYOUT.map((station) => [station.code, station]))

function normalizeMetroComparable(value?: string | null): string {
  if (!value) {
    return ''
  }
  return value
    .normalize('NFD')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toLowerCase()
}

const METRO_STATION_CODE_BY_NAME = (() => {
  const map = new Map<string, string>()
  METRO_STATION_LAYOUT.forEach((station) => {
    const baseKey = normalizeMetroComparable(station.name)
    if (baseKey && !map.has(baseKey)) {
      map.set(baseKey, station.code)
    }
    station.name
      .split('/')
      .map((segment) => normalizeMetroComparable(segment))
      .filter(Boolean)
      .forEach((segmentKey) => {
        if (!map.has(segmentKey)) {
          map.set(segmentKey, station.code)
        }
      })
  })

  const manualAliases: Record<string, string> = {
    sanmames: 'SAM',
    santimami: 'SAM',
    casco: 'CAV',
    cascoviejo: 'CAV',
    zazpikaleak: 'CAV',
    uribarri: 'ZZB',
    indautxu: 'IND',
    sanignazio: 'SIN',
    saninazio: 'SIN',
    gurutzeta: 'GUR',
    cruces: 'GUR',
    kabiezes: 'KAB',
    penota: 'PEN',
    barakaldo: 'BAR',
    santurtzi: 'STZ',
    moyua: 'MOY',
    abando: 'ABA',
  }

  Object.entries(manualAliases).forEach(([key, code]) => {
    const normalizedKey = normalizeMetroComparable(key)
    if (!map.has(normalizedKey) && METRO_STATION_BY_CODE.has(code)) {
      map.set(normalizedKey, code)
    }
  })

  return map
})()

export function getMetroStationMeta(code: string) {
  return METRO_STATION_BY_CODE.get(code) ?? null
}

export function isKnownMetroStation(code: string): boolean {
  return METRO_STATION_BY_CODE.has(code)
}

export function getMetroLineColorForStation(code: string): string {
  const station = METRO_STATION_BY_CODE.get(code)
  if (!station) {
    return DEFAULT_METRO_ACCENT
  }
  if (station.line === 'T') {
    return METRO_LINE_COLORS.L1
  }
  const color = METRO_LINE_COLORS[station.line as keyof typeof METRO_LINE_COLORS]
  return color ?? DEFAULT_METRO_ACCENT
}

export function resolveMetroStationCode(value?: string | null): string | null {
  if (!value) {
    return null
  }
  const normalized = normalizeMetroComparable(value)
  if (!normalized) {
    return null
  }
  const direct = METRO_STATION_CODE_BY_NAME.get(normalized)
  if (direct) {
    return direct
  }
  return null
}

export function getMetroStationName(code: string): string {
  return METRO_STATION_BY_CODE.get(code)?.name ?? code
}

export { DEFAULT_METRO_ACCENT, METRO_LINE_COLORS }
