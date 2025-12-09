'use client'

import dynamic from 'next/dynamic'
import Image from 'next/image'
import {
  ArrowDownRight,
  ArrowUpRight,
  Flame,
  Gauge,
  Minus,
  Pause,
  Play,
  PlayCircle,
  SkipBack,
  SkipForward,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState, useId, useRef } from 'react'
import type { ApexOptions } from 'apexcharts'
import bizkaibusJsonData from '../../files/lineasbizkaibus.json'
import { fullDateFormatter } from '../lib/dateFormatters'
import type { HistoryEntry } from '../lib/historyStore'
import type { TransactionRecord } from '../lib/pdfParser'
import { MetroDiagram, METRO_STATION_LAYOUT, findMetroPath, type MetroStationHighlight } from './metro/MetroDiagram'
import {
  buildFareInsights,
  buildJourneyBlocks,
  collapseSpacesComparable,
  computeJourneyStats,
  formatAmount,
  formatDuration,
  formatMonthLabel,
  getDayKey,
  getMonthKey,
  getOperatorBrand,
  getRecordDate,
  getYearKey,
  isMeaningfulRecord,
  isRecargaTransaction,
  normalizeBizkaibusComparable,
  normalizeOperatorLabel,
  normalizeStopName,
  parseBizkaibusJson,
  scoreBizkaibusMatch,
  tokenizeBizkaibusText,
} from './history/historyDataTransforms'
import type { BizkaibusJsonRoot, BizkaibusLineMatch } from './history/historyTypes'

type AnnualPanelProps = {
  history: HistoryEntry | null
  historyLoading: boolean
}

type RankedItem = {
  name: string
  count: number
}

type RankedStation = RankedItem & {
  operatorName: string | null
  operatorIcon: string | null
  operatorColor: string | null
  lineCode: string | null
  lineDescription: string | null
}

type RankedOperator = RankedItem & {
  icon: string | null
  color: string | null
}

type OperatorDailySummary = {
  name: string
  count: number
  color: string | null
}

type TravelDayHighlight = {
  date: Date
  travelMinutes: number
  rides: number
}

type StreakHighlight = {
  length: number
  startDate: Date
  endDate: Date
}

type MonthlyInsight = {
  key: string
  label: string
  rides: number
  recharges: number
  spent: number
}

type DayTotal = {
  key: string
  date: Date
  rides: number
  recharges: number
  operators: OperatorDailySummary[]
  travelMinutes: number
}

type RgbColor = {
  r: number
  g: number
  b: number
}

type DayAccumulator = {
  key: string
  date: Date
  rides: number
  recharges: number
  operatorUsage: Map<string, OperatorDailySummary>
  travelMinutes: number
}

type StationOperatorUsage = {
  name: string
  count: number
  icon: string | null
  color: string | null
}

type StationLineUsage = {
  code: string
  description: string
  count: number
}

type StationAggregate = {
  name: string
  count: number
  operatorUsage: Map<string, StationOperatorUsage>
  lineUsage: Map<string, StationLineUsage>
}

type CalendarCell = {
  id: string
  day: number
  date: Date
  trips: number
  recharges: number
  operators: OperatorDailySummary[]
  dominantOperator: OperatorDailySummary | null
  color: RgbColor | null
  travelMinutes: number
}

type CalendarMonth = {
  key: string
  label: string
  weeks: Array<Array<CalendarCell | null>>
  totalTrips: number
  activeDays: number
  rechargeDays: number
  monthMaxTrips: number
  hasAnyData: boolean
}

type MetroStationUsage = {
  code: string
  name: string
  entries: number
  passThrough: number
  total: number
}

type MetroTrip = {
  id: string
  date: Date
  from: string
  to: string
  durationMinutes: number | null
  pathCodes: string[]
}

type MetroSummary = {
  totalTrips: number
  stationUsage: MetroStationUsage[]
  trips: MetroTrip[]
}

type AnnualSummary = {
  totalRecords: number
  totalJourneys: number
  totalSpent: number
  rideSpent: number
  totalSavings: number
  walletRecharges: number
  titlePurchases: number
  totalRecharges: number
  travelMinutes: number
  activeDays: number
  averageRideCost: number
  averageTripsPerActiveDay: number
  averageTripsPerDayOverall: number
  averageTravelMinutesPerDay: number
  topStations: RankedStation[]
  topOperators: RankedOperator[]
  monthly: MonthlyInsight[]
  dailyTotals: DayTotal[]
  highlightStation: RankedStation | null
  highlightOperator: RankedOperator | null
  highlightTravelDay: TravelDayHighlight | null
  highlightStreak: StreakHighlight | null
  firstDate: Date | null
  lastDate: Date | null
  metro: MetroSummary
}

type YoYComparison = {
  direction: 'up' | 'down' | 'flat'
  text: string
}

type MetricCard = {
  label: string
  value: string
  hint: string
  comparison: YoYComparison | null
}

const EMPTY_SUMMARY: AnnualSummary = {
  totalRecords: 0,
  totalJourneys: 0,
  totalSpent: 0,
  rideSpent: 0,
  totalSavings: 0,
  walletRecharges: 0,
  titlePurchases: 0,
  totalRecharges: 0,
  travelMinutes: 0,
  activeDays: 0,
  averageRideCost: 0,
  averageTripsPerActiveDay: 0,
  averageTripsPerDayOverall: 0,
  averageTravelMinutesPerDay: 0,
  topStations: [],
  topOperators: [],
  monthly: [],
  dailyTotals: [],
  highlightStation: null,
  highlightOperator: null,
  highlightTravelDay: null,
  highlightStreak: null,
  firstDate: null,
  lastDate: null,
  metro: { totalTrips: 0, stationUsage: [], trips: [] },
}

const integerFormatter = new Intl.NumberFormat('es-ES')
const decimalFormatter = new Intl.NumberFormat('es-ES', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
})
const timeFormatter = new Intl.DateTimeFormat('es-ES', {
  timeStyle: 'short',
})

const DAY_MS = 24 * 60 * 60 * 1000
const WEEKDAY_LABELS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'] as const
const DEFAULT_OPERATOR_COLOR: RgbColor = { r: 239, g: 68, b: 68 }
const DEFAULT_OPERATOR_HEX = '#ef4444'
const BIZKAIBUS_BADGE_COLOR = '#9FCD5F'
const WHITE_RGB: RgbColor = { r: 255, g: 255, b: 255 }
const BLACK_RGB: RgbColor = { r: 0, g: 0, b: 0 }
const DEFAULT_METRO_ACCENT = '#E30613'
const METRO_LINE_COLORS: Record<'L1' | 'L2' | 'L3', string> = {
  L1: '#f05a28',
  L2: '#101820',
  L3: '#c02486',
}

const METRO_STATION_BY_CODE = new Map(METRO_STATION_LAYOUT.map((station) => [station.code, station]))

function getMetroLineColorForStation(code: string): string {
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

function resolveMetroStationCode(value?: string | null): string | null {
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
  for (const [key, code] of METRO_STATION_CODE_BY_NAME.entries()) {
    if (normalized.includes(key) || key.includes(normalized)) {
      return code
    }
  }
  return null
}

function getMetroStationName(code: string): string {
  return METRO_STATION_BY_CODE.get(code)?.name ?? code
}

const ApexChart = dynamic(() => import('react-apexcharts'), {
  ssr: false,
}) as unknown as typeof import('react-apexcharts')['default']

const BIZKAIBUS_LINES = parseBizkaibusJson(bizkaibusJsonData as BizkaibusJsonRoot)
const bizkaibusLineCache = new Map<string, BizkaibusLineMatch | null>()

function resolveBizkaibusLine(stopName?: string | null): BizkaibusLineMatch | null {
  if (!stopName || BIZKAIBUS_LINES.length === 0) {
    return null
  }
  if (bizkaibusLineCache.has(stopName)) {
    return bizkaibusLineCache.get(stopName) ?? null
  }
  const comparable = normalizeBizkaibusComparable(stopName)
  const collapsed = collapseSpacesComparable(stopName)
  if (!comparable) {
    bizkaibusLineCache.set(stopName, null)
    return null
  }
  const tokens = tokenizeBizkaibusText(stopName)
  let bestScore = 0
  let bestMatch: BizkaibusLineMatch | null = null
  BIZKAIBUS_LINES.forEach((line) => {
    const score = scoreBizkaibusMatch(comparable, collapsed, tokens, line)
    if (score > bestScore) {
      bestScore = score
      bestMatch = {
        code: line.code,
        description: line.description,
      }
    }
  })
  bizkaibusLineCache.set(stopName, bestMatch)
  return bestMatch
}

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
  if (sanitized.length === 6) {
    const r = parseInt(sanitized.slice(0, 2), 16)
    const g = parseInt(sanitized.slice(2, 4), 16)
    const b = parseInt(sanitized.slice(4, 6), 16)
    if ([r, g, b].some((component) => Number.isNaN(component))) {
      return null
    }
    return { r, g, b }
  }
  return null
}

function rgbToHex(color: RgbColor): string {
  const toHex = (value: number) => {
    const clamped = Math.min(255, Math.max(0, Math.round(value)))
    return clamped.toString(16).padStart(2, '0')
  }
  return `#${toHex(color.r)}${toHex(color.g)}${toHex(color.b)}`
}

function mixRgb(source: RgbColor, target: RgbColor, ratio: number): RgbColor {
  const clampedRatio = Math.min(Math.max(ratio, 0), 1)
  return {
    r: Math.round(source.r * (1 - clampedRatio) + target.r * clampedRatio),
    g: Math.round(source.g * (1 - clampedRatio) + target.g * clampedRatio),
    b: Math.round(source.b * (1 - clampedRatio) + target.b * clampedRatio),
  }
}

function resolveVariantColor(baseHex: string | null, variantIndex: number, totalVariants: number): string {
  const fallbackBase = hexToRgb(baseHex ?? DEFAULT_OPERATOR_HEX) ?? DEFAULT_OPERATOR_COLOR
  if (totalVariants <= 1 || variantIndex <= 0) {
    return rgbToHex(fallbackBase)
  }
  const step = 0.18
  const bucket = Math.floor((variantIndex + 1) / 2)
  const amount = Math.min(0.45, step * bucket)
  const isLight = variantIndex % 2 === 1
  const mixed = mixRgb(fallbackBase, isLight ? WHITE_RGB : BLACK_RGB, amount)
  return rgbToHex(mixed)
}

function buildVariantPalette<T>(items: T[], getBaseHex: (item: T) => string | null): string[] {
  const counts = new Map<string, number>()
  items.forEach((item) => {
    const base = (getBaseHex(item) ?? DEFAULT_OPERATOR_HEX).toLowerCase()
    counts.set(base, (counts.get(base) ?? 0) + 1)
  })

  const usages = new Map<string, number>()
  return items.map((item) => {
    const baseHex = (getBaseHex(item) ?? DEFAULT_OPERATOR_HEX).toLowerCase()
    const total = counts.get(baseHex) ?? 1
    const variantIndex = usages.get(baseHex) ?? 0
    usages.set(baseHex, variantIndex + 1)
    return resolveVariantColor(baseHex, variantIndex, total)
  })
}

function mixOperatorColors(operators: OperatorDailySummary[]): RgbColor | null {
  const buckets = operators
    .filter((operator) => operator.count > 0 && operator.color)
    .map((operator) => {
      const parsed = operator.color ? hexToRgb(operator.color) : null
      return parsed ? { color: parsed, weight: operator.count } : null
    })
    .filter((entry): entry is { color: RgbColor; weight: number } => Boolean(entry))

  if (!buckets.length) {
    return null
  }
  const totalWeight = buckets.reduce((sum, entry) => sum + entry.weight, 0)
  if (!totalWeight) {
    return null
  }

  const { r, g, b } = buckets.reduce(
    (acc, entry) => {
      return {
        r: acc.r + entry.color.r * entry.weight,
        g: acc.g + entry.color.g * entry.weight,
        b: acc.b + entry.color.b * entry.weight,
      }
    },
    { r: 0, g: 0, b: 0 },
  )

  return {
    r: Math.round(r / totalWeight),
    g: Math.round(g / totalWeight),
    b: Math.round(b / totalWeight),
  }
}

function rgbaString(color: RgbColor, alpha: number): string {
  const clampedAlpha = Math.min(Math.max(alpha, 0), 1)
  return `rgba(${color.r}, ${color.g}, ${color.b}, ${clampedAlpha.toFixed(2)})`
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


export function AnnualPanel({ history, historyLoading }: AnnualPanelProps) {
  const { recordsByYear, yearOptions } = useMemo(() => {
    if (!history) {
      return { recordsByYear: {}, yearOptions: [] }
    }
    const map: Record<string, TransactionRecord[]> = {}
    history.records.forEach((record) => {
      const date = getRecordDate(record)
      if (Number.isNaN(date.getTime())) {
        return
      }
      if (date.getFullYear() < 2000) {
        return
      }
      const yearKey = getYearKey(date)
      if (!map[yearKey]) {
        map[yearKey] = []
      }
      map[yearKey].push(record)
    })
    const options = Object.keys(map)
      .sort((a, b) => Number(b) - Number(a))
      .map((year) => ({ value: year, label: year, total: map[year].length }))
    return { recordsByYear: map, yearOptions: options }
  }, [history])

  const [selectedYear, setSelectedYear] = useState<string>(() => yearOptions[0]?.value ?? '')

  useEffect(() => {
    if (!yearOptions.length) {
      if (selectedYear) {
        setSelectedYear('')
      }
      return
    }
    if (!selectedYear || !recordsByYear[selectedYear]) {
      setSelectedYear(yearOptions[0].value)
    }
  }, [recordsByYear, selectedYear, yearOptions])

  const selectedRecords = useMemo<TransactionRecord[]>(() => {
    if (!selectedYear) {
      return []
    }
    return recordsByYear[selectedYear] ? [...recordsByYear[selectedYear]] : []
  }, [recordsByYear, selectedYear])

  const summary = useMemo(() => computeAnnualSummary(selectedRecords), [selectedRecords])

  const periodLabel = useMemo(() => {
    if (summary.firstDate && summary.lastDate) {
      return `${fullDateFormatter.format(summary.firstDate)} – ${fullDateFormatter.format(summary.lastDate)}`
    }
    if (summary.firstDate) {
      return fullDateFormatter.format(summary.firstDate)
    }
    return null
  }, [summary.firstDate, summary.lastDate])

  const previousYearKey = useMemo(() => {
    if (!selectedYear) {
      return null
    }
    const parsed = Number(selectedYear)
    if (!Number.isFinite(parsed)) {
      return null
    }
    return `${parsed - 1}`
  }, [selectedYear])

  const previousYearSummary = useMemo(() => {
    if (!previousYearKey) {
      return null
    }
    const records = recordsByYear[previousYearKey]
    if (!records || records.length === 0) {
      return null
    }
    const computed = computeAnnualSummary(records)
    return computed.totalRecords > 0 ? computed : null
  }, [previousYearKey, recordsByYear])

  const [metroMode, setMetroMode] = useState<'heatmap' | 'playback'>('heatmap')
  const [metroPlaying, setMetroPlaying] = useState(false)
  const [metroTripIndex, setMetroTripIndex] = useState(0)
  const [metroProgress, setMetroProgress] = useState(0)
  const [metroSpeed, setMetroSpeed] = useState<number>(3)
  const metroAnimationRef = useRef<number | null>(null)
  const metroTimerRef = useRef<number | null>(null)

  const buildYoYComparison = useCallback(
    (current: number, previous: number | null | undefined, formatDelta: (value: number) => string): YoYComparison | null => {
      if (!previousYearKey || previous === null || typeof previous === 'undefined') {
        return null
      }
      if (!Number.isFinite(previous) || !Number.isFinite(current)) {
        return null
      }
      const delta = current - previous
      if (previous <= 0 && current <= 0) {
        return { direction: 'flat', text: `Sin datos frente a ${previousYearKey}` }
      }
      if (previous <= 0 && current > 0) {
        return { direction: 'up', text: `+${formatDelta(Math.abs(current))} vs ${previousYearKey}` }
      }
      if (previous > 0 && current <= 0) {
        return { direction: 'down', text: `-${formatDelta(Math.abs(previous))} vs ${previousYearKey}` }
      }
      if (Math.abs(delta) < 1e-6) {
        return { direction: 'flat', text: `Igual que ${previousYearKey}` }
      }
      if (delta > 0) {
        return { direction: 'up', text: `+${formatDelta(Math.abs(delta))} vs ${previousYearKey}` }
      }
      return { direction: 'down', text: `-${formatDelta(Math.abs(delta))} vs ${previousYearKey}` }
    },
    [previousYearKey],
  )

  const metrics = useMemo<MetricCard[]>(() => {
    const journeysComparison = buildYoYComparison(
      summary.totalJourneys,
      previousYearSummary?.totalJourneys ?? null,
      (value: number) => integerFormatter.format(Math.round(value)),
    )
    const spentComparison = buildYoYComparison(
      summary.totalSpent,
      previousYearSummary?.totalSpent ?? null,
      (value: number) => formatAmount(value),
    )
    const savingsComparison = buildYoYComparison(
      summary.totalSavings,
      previousYearSummary?.totalSavings ?? null,
      (value: number) => formatAmount(value),
    )
    const travelComparison = buildYoYComparison(
      summary.travelMinutes,
      previousYearSummary?.travelMinutes ?? null,
      (value: number) => formatDuration(Math.round(value)),
    )
    const activeDaysComparison = buildYoYComparison(
      summary.activeDays,
      previousYearSummary?.activeDays ?? null,
      (value: number) => integerFormatter.format(Math.round(value)),
    )

    return [
      {
        label: 'Viajes completados',
        value: integerFormatter.format(summary.totalJourneys),
        hint: summary.totalJourneys
          ? `${integerFormatter.format(summary.totalRecords)} validaciones registradas`
          : 'Sin viajes registrados',
        comparison: journeysComparison,
      },
      {
        label: 'Dinero recargado',
        value: formatAmount(summary.totalSpent),
        hint:
          summary.totalRecharges > 0
            ? `${integerFormatter.format(summary.totalRecharges)} operaciones registradas · ${integerFormatter.format(summary.walletRecharges)} recargas · ${integerFormatter.format(summary.titlePurchases)} títulos`
            : 'Añade recargas para ver esta métrica',
        comparison: spentComparison,
      },
      {
        label: 'Ahorro con títulos',
        value: formatAmount(summary.totalSavings),
        hint:
          summary.totalSavings > 0
            ? 'Estimación frente a viajes sueltos'
            : 'Sin ahorro identificado',
        comparison: savingsComparison,
      },
      {
        label: 'Tiempo en movimiento',
        value: summary.travelMinutes > 0 ? formatDuration(summary.travelMinutes) : '—',
        hint:
          summary.travelMinutes > 0
            ? `Tiempo medio diario ${formatDuration(Math.round(summary.averageTravelMinutesPerDay))}`
            : 'Se calcula a partir de emparejar entradas y salidas',
        comparison: travelComparison,
      },
      {
        label: 'Días con viajes',
        value: integerFormatter.format(summary.activeDays),
        hint:
          summary.activeDays > 0
            ? `${decimalFormatter.format(summary.totalJourneys / Math.max(summary.activeDays, 1))} viajes/día activo`
            : 'Analiza tus validaciones para ver días activos',
        comparison: activeDaysComparison,
      },
    ]
  }, [buildYoYComparison, previousYearSummary, summary])

  const stationPalette = useMemo(
    () => buildVariantPalette(summary.topStations, (station) => station.operatorColor),
    [summary.topStations],
  )
  const operatorPalette = useMemo(
    () => buildVariantPalette(summary.topOperators, (operator) => operator.color),
    [summary.topOperators],
  )
  const totalStationCount = useMemo(
    () => summary.topStations.reduce((sum, station) => sum + station.count, 0),
    [summary.topStations],
  )
  const totalOperatorCount = useMemo(
    () => summary.topOperators.reduce((sum, operator) => sum + operator.count, 0),
    [summary.topOperators],
  )

  const monthlyCategories = useMemo(() => summary.monthly.map((month) => month.label), [summary.monthly])
  const monthlyChartSeries = useMemo(
    () => [
      {
        name: 'Viajes',
        data: summary.monthly.map((month) => month.rides),
      },
      {
        name: 'Recargas',
        data: summary.monthly.map((month) => month.recharges),
      },
    ],
    [summary.monthly],
  )
  const monthlyChartOptions = useMemo<ApexOptions>(() => {
    return {
      chart: { type: 'bar', stacked: false, toolbar: { show: false } },
      colors: ['#0F172A', '#38BDF8'],
      plotOptions: {
        bar: {
          columnWidth: '48%',
          borderRadius: 8,
          borderRadiusApplication: 'end',
        },
      },
      dataLabels: { enabled: false },
      grid: { borderColor: '#E2E8F0', strokeDashArray: 4 },
      legend: {
        position: 'top',
        horizontalAlign: 'left',
        fontSize: '12px',
        labels: { colors: '#475569' },
        itemMargin: { horizontal: 12, vertical: 4 },
      },
      stroke: { show: true, width: 6, colors: ['transparent'] },
      xaxis: {
        categories: monthlyCategories,
        axisBorder: { color: '#CBD5F5' },
        axisTicks: { color: '#CBD5F5' },
        labels: {
          style: { colors: '#475569', fontSize: '12px' },
          rotate: -45,
        },
      },
      yaxis: {
        labels: {
          formatter: (value: number) => integerFormatter.format(Math.round(value)),
          style: { colors: '#475569', fontSize: '12px' },
        },
        title: {
          text: 'Eventos',
          style: { color: '#475569', fontSize: '12px', fontWeight: 600 },
        },
        min: 0,
        forceNiceScale: true,
      },
      tooltip: {
        shared: true,
        intersect: false,
        y: {
          formatter: (value?: number) =>
            typeof value === 'number' && Number.isFinite(value) ? integerFormatter.format(Math.round(value)) : '0',
        },
      },
      states: {
        hover: { filter: { type: 'darken', value: 0.8 } },
        active: { filter: { type: 'darken', value: 0.8 } },
      },
      responsive: [
        {
          breakpoint: 640,
          options: {
            plotOptions: { bar: { columnWidth: '60%' } },
            xaxis: { labels: { rotate: -35 } },
          },
        },
      ],
    }
  }, [monthlyCategories])

  const calendarMonths = useMemo<CalendarMonth[]>(() => {
    if (!selectedYear || summary.dailyTotals.length === 0) {
      return []
    }
    const yearNumber = Number(selectedYear)
    if (!Number.isFinite(yearNumber)) {
      return []
    }

    const totalsByDay = new Map(summary.dailyTotals.map((day) => [day.key, day]))
    const monthIndices = new Set<number>()
    summary.dailyTotals.forEach((day) => {
      if (day.date.getFullYear() === yearNumber) {
        monthIndices.add(day.date.getMonth())
      }
    })

    if (!monthIndices.size) {
      return []
    }

    const months: CalendarMonth[] = []
    Array.from(monthIndices)
      .sort((a, b) => a - b)
      .forEach((monthIndex) => {
        const monthStart = new Date(yearNumber, monthIndex, 1)
        const monthKey = `${yearNumber}-${monthIndex + 1}`
        const label = formatMonthLabel(monthStart)
        const daysInMonth = new Date(yearNumber, monthIndex + 1, 0).getDate()
        const firstWeekday = (monthStart.getDay() + 6) % 7

        const cells: Array<CalendarCell | null> = []
        for (let i = 0; i < firstWeekday; i += 1) {
          cells.push(null)
        }

        const dayCells: CalendarCell[] = []
        for (let dayNumber = 1; dayNumber <= daysInMonth; dayNumber += 1) {
          const currentDate = new Date(yearNumber, monthIndex, dayNumber)
          const dayKey = getDayKey(currentDate)
          const totals = totalsByDay.get(dayKey)
          const operators = totals?.operators ?? []
          const dominantOperator = operators.length > 0 ? operators[0] : null
          const blendedColor = mixOperatorColors(operators)
          const cell: CalendarCell = {
            id: dayKey,
            day: dayNumber,
            date: currentDate,
            trips: totals?.rides ?? 0,
            recharges: totals?.recharges ?? 0,
            operators,
            dominantOperator,
            color: blendedColor,
            travelMinutes: totals?.travelMinutes ?? 0,
          }
          dayCells.push(cell)
          cells.push(cell)
        }

        const remainder = cells.length % 7
        if (remainder !== 0) {
          const blanks = 7 - remainder
          for (let i = 0; i < blanks; i += 1) {
            cells.push(null)
          }
        }

        const weeks: Array<Array<CalendarCell | null>> = []
        for (let offset = 0; offset < cells.length; offset += 7) {
          weeks.push(cells.slice(offset, offset + 7))
        }

        const totalTrips = dayCells.reduce((sum, cell) => sum + cell.trips, 0)
        const activeDays = dayCells.reduce((sum, cell) => (cell.trips > 0 ? sum + 1 : sum), 0)
        const rechargeDays = dayCells.reduce((sum, cell) => (cell.recharges > 0 ? sum + 1 : sum), 0)
        const monthMaxTrips = dayCells.reduce((max, cell) => Math.max(max, cell.trips), 0)
        const hasAnyData = totalTrips > 0 || rechargeDays > 0

        months.push({
          key: monthKey,
          label,
          weeks,
          totalTrips,
          activeDays,
          rechargeDays,
          monthMaxTrips,
          hasAnyData,
        })
      })

    return months
  }, [selectedYear, summary.dailyTotals])

  const metroTrips = summary.metro.trips
  const hasMetroData = summary.metro.totalTrips > 0
  const activeMetroTrip = metroTrips[metroTripIndex] ?? null

  const metroUsageMap = useMemo(() => {
    const map = new Map<string, MetroStationUsage>()
    summary.metro.stationUsage.forEach((station) => {
      map.set(station.code, station)
    })
    return map
  }, [summary.metro.stationUsage])

  const maxHeatmapTotal = useMemo(
    () => summary.metro.stationUsage.reduce((max, station) => Math.max(max, station.total), 0),
    [summary.metro.stationUsage],
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
      const isEndpoint = index === 0 || index === lastIndex
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

  const topMetroStations = useMemo(() => summary.metro.stationUsage.slice(0, 3), [summary.metro.stationUsage])
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
    const totalTripsLabel = `${integerFormatter.format(summary.metro.totalTrips)} ${
      summary.metro.totalTrips === 1 ? 'viaje en metro' : 'viajes en metro'
    }`
    const detectedStationsLabel = `${summary.metro.stationUsage.length} estaciones detectadas`
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
  }, [summary.metro.totalTrips, summary.metro.stationUsage.length, hasMetroData, metroTrips.length, metroMode, handleMetroModeChange, activeMetroTrip, speedOptions, handleMetroSpeedChange, metroSpeed, handleMetroPrev, handleMetroTogglePlay, handleMetroNext, metroPlaying])

  const metroFooter = useMemo(() => {
    if (!hasMetroData) {
      return (
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>Sube validaciones de Metro Bilbao para activar el mapa.</span>
        </div>
      )
    }
    if (metroMode === 'playback') {
      if (!activeMetroTrip) {
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
  }, [hasMetroData, metroMode, topMetroStations, activeMetroTrip, metroTrips.length, metroTripIndex, metroProgress, metroPlaying, metroSpeed])


  const highlightStation = summary.highlightStation
  const highlightTravelDay = summary.highlightTravelDay
  const highlightStreak = summary.highlightStreak
  const travelDayLabel = highlightTravelDay ? fullDateFormatter.format(highlightTravelDay.date) : null
  const travelDurationLabel = highlightTravelDay ? formatDuration(highlightTravelDay.travelMinutes) : null
  const travelRideLabel = highlightTravelDay
    ? `${integerFormatter.format(highlightTravelDay.rides)} ${highlightTravelDay.rides === 1 ? 'viaje' : 'viajes'}`
    : null
  const streakDaysLabel = highlightStreak
    ? `${integerFormatter.format(highlightStreak.length)} ${highlightStreak.length === 1 ? 'día' : 'días'}`
    : null
  const streakRangeLabel = highlightStreak
    ? highlightStreak.startDate.getTime() === highlightStreak.endDate.getTime()
      ? fullDateFormatter.format(highlightStreak.startDate)
      : `${fullDateFormatter.format(highlightStreak.startDate)} – ${fullDateFormatter.format(highlightStreak.endDate)}`
    : null
  const stationAccentColor = highlightStation?.operatorColor ?? rgbaString(DEFAULT_OPERATOR_COLOR, 0.85)
  const showAwards = summary.totalJourneys > 0 || summary.totalRecharges > 0
  if (historyLoading) {
    return (
      <section className="w-full rounded-none border-0 bg-white p-4 text-sm text-slate-500 shadow-none sm:mt-0 sm:rounded-3xl sm:border sm:border-slate-200 sm:p-6 sm:shadow-lg">
        Cargando datos…
      </section>
    )
  }

  if (!yearOptions.length) {
    return (
      <section className="w-full rounded-none border-0 bg-white p-4 text-sm text-slate-500 shadow-none sm:mt-0 sm:rounded-3xl sm:border sm:border-slate-200 sm:p-6 sm:shadow-lg">
        <h2 className="text-2xl font-semibold text-slate-900">Resumen anual</h2>
        <p className="mt-2 text-sm text-slate-500">
          Sube al menos un PDF con tu historial para desbloquear las métricas agregadas por año.
        </p>
      </section>
    )
  }
  return (
    <section className="w-full rounded-none border-0 bg-white p-4 shadow-none sm:mt-0 sm:rounded-3xl sm:border sm:border-slate-200 sm:p-6 sm:shadow-lg">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900">Resumen anual</h2>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
            {periodLabel && <span>{periodLabel}</span>}
          </div>
        </div>
        <div className="w-full max-w-[220px]">
          <div className="relative">
            <span className="pointer-events-none absolute left-4 top-1 flex items-center gap-1 text-[10px] font-semibold uppercase text-slate-400">
              Año
            </span>
            <select
              value={selectedYear}
              onChange={(event) => setSelectedYear(event.target.value)}
              className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 pb-2 pt-5 text-xs font-semibold text-slate-700 shadow-sm"
            >
              {yearOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label} · {integerFormatter.format(option.total)} movimientos
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {metrics.map((metric) => {
          const comparison = metric.comparison
          const comparisonColor = comparison
            ? comparison.direction === 'up'
              ? 'text-emerald-600'
              : comparison.direction === 'down'
                ? 'text-rose-600'
                : 'text-slate-500'
            : 'text-slate-500'
          const ComparisonIcon = comparison
            ? comparison.direction === 'up'
              ? ArrowUpRight
              : comparison.direction === 'down'
                ? ArrowDownRight
                : Minus
            : null
          return (
            <div
              key={metric.label}
              className="flex flex-col gap-1 rounded-2xl border border-slate-200 bg-slate-50 p-4 shadow-sm"
            >
              <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">{metric.label}</span>
              <span className="text-3xl font-semibold text-slate-900">{metric.value}</span>
              {comparison && ComparisonIcon && (
                <div className={`mt-0.5 flex items-center gap-1 text-xs font-semibold ${comparisonColor}`}>
                  <ComparisonIcon className="h-3.5 w-3.5" aria-hidden />
                  <span>{comparison.text}</span>
                </div>
              )}
              <span className="text-xs text-slate-500">{metric.hint}</span>
            </div>
          )
        })}
      </div>

      {showAwards && (
        <div className="mt-8">
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-[#F9E9B0] via-[#F4C56F] to-[#F29E4C] p-6 text-slate-900 shadow-2xl">
            <span className="pointer-events-none absolute -left-10 top-0 h-40 w-40 rounded-full bg-white/30 blur-3xl" aria-hidden />
            <span className="pointer-events-none absolute -right-6 bottom-2 h-32 w-32 rounded-full bg-white/20 blur-2xl" aria-hidden />
            <div className="relative z-10 flex flex-col gap-6">
              <div className="grid gap-4 lg:grid-cols-3">
                <div className="group flex h-full flex-col rounded-2xl bg-white/90 p-5 text-slate-800 shadow-xl ring-1 ring-white/60 backdrop-blur transition-all duration-500 hover:-translate-y-1 hover:shadow-2xl">
                  <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[#F6D98E] via-[#F2B86A] to-[#ED9446] shadow-lg">
                    <TrophyIcon className="h-8 w-8" />
                  </div>
                  <span className="text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-500">Estación más visitada</span>
                  {highlightStation ? (
                    <>
                      <span className="mt-1 text-lg font-semibold leading-tight text-slate-900">
                        {highlightStation.name}
                      </span>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-600">
                        {highlightStation.operatorIcon ? (
                          <Image
                            src={highlightStation.operatorIcon}
                            alt={highlightStation.operatorName ?? 'Operador'}
                            width={26}
                            height={26}
                            className="h-6 w-auto"
                          />
                        ) : (
                          <span
                            className="h-2.5 w-2.5 rounded-full border border-white/70"
                            style={{ backgroundColor: stationAccentColor }}
                            aria-hidden
                          />
                        )}
                        {highlightStation.lineCode && (
                          <span
                            className="rounded-full bg-slate-900/80 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-white"
                            title={highlightStation.lineDescription ?? undefined}
                          >
                            {highlightStation.lineCode}
                          </span>
                        )}
                        <span>{integerFormatter.format(highlightStation.count)} validaciones</span>
                      </div>
                    </>
                  ) : (
                    <span className="mt-2 text-xs text-slate-500">Añade más validaciones para desbloquear este premio.</span>
                  )}
                </div>

                <div className="group flex h-full flex-col rounded-2xl bg-white/90 p-5 text-slate-800 shadow-xl ring-1 ring-white/60 backdrop-blur transition-all duration-500 hover:-translate-y-1 hover:shadow-2xl">
                  <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[#F6D98E] via-[#F2B86A] to-[#ED9446] shadow-lg">
                    <ClockIcon className="h-8 w-8" />
                  </div>
                  <span className="text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-500">Jornada épica</span>
                  {highlightTravelDay ? (
                    <>
                      <span className="mt-1 text-lg font-semibold leading-tight text-slate-900">{travelDayLabel}</span>
                      <span className="mt-2 text-xs text-slate-600">
                        {travelDurationLabel} en transporte · {travelRideLabel}
                      </span>
                    </>
                  ) : (
                    <span className="mt-2 text-xs text-slate-500">
                      Necesitamos emparejar entradas y salidas para estimar tu tiempo en marcha.
                    </span>
                  )}
                </div>

                <div className="group flex h-full flex-col rounded-2xl bg-white/90 p-5 text-slate-800 shadow-xl ring-1 ring-white/60 backdrop-blur transition-all duration-500 hover:-translate-y-1 hover:shadow-2xl">
                  <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[#F6D98E] via-[#F2B86A] to-[#ED9446] shadow-lg">
                    <StreakIcon className="h-8 w-8" />
                  </div>
                  <span className="text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-500">Racha más larga</span>
                  {highlightStreak ? (
                    <>
                      <span className="mt-1 text-lg font-semibold leading-tight text-slate-900">{streakDaysLabel}</span>
                      <span className="mt-2 text-xs text-slate-600">{streakRangeLabel}</span>
                    </>
                  ) : (
                    <span className="mt-2 text-xs text-slate-500">
                      Sigue viajando varios días seguidos para batir tu marca.
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="mt-8 space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Calendario de actividad</h3>
          </div>
          {calendarMonths.length > 0 && (
            <div className="flex items-center gap-3 text-[11px] text-slate-500">
              <span className="flex items-center gap-1">
                <span className="h-3 w-3 rounded-md bg-slate-200" />
                <span>Sin viajes</span>
              </span>
              <span className="flex items-center gap-1">
                <span
                  className="h-3 w-3 rounded-md"
                  style={{
                    background:
                      'linear-gradient(90deg, rgba(148, 163, 184, 0.25) 0%, rgba(148, 163, 184, 0.6) 100%)',
                  }}
                />
                <span>Color operador · intensidad viajes</span>
              </span>
            </div>
          )}
        </div>
        {calendarMonths.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
            Cargaremos el calendario cuando registres viajes en este año.
          </p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {calendarMonths.map((month) => (
              <div key={month.key} className="space-y-2">
                <div className="flex items-center justify-between px-1">
                  <span className="text-sm font-semibold text-slate-700">{month.label}</span>
                  <span className="text-xs text-slate-400">
                    {month.totalTrips > 0
                      ? `${integerFormatter.format(month.totalTrips)} viajes · ${integerFormatter.format(month.activeDays)} días`
                      : month.rechargeDays > 0
                        ? `${integerFormatter.format(month.rechargeDays)} días con recargas`
                        : 'Sin actividad'}
                  </span>
                </div>
                <div className="grid grid-cols-7 gap-1 text-[10px] uppercase tracking-[0.2em] text-slate-400 px-1">
                  {WEEKDAY_LABELS.map((dayLabel) => (
                    <span key={`${month.key}-weekday-${dayLabel}`} className="text-center">
                      {dayLabel}
                    </span>
                  ))}
                </div>
                <div className="space-y-1">
                  {month.weeks.map((week, weekIndex) => (
                    <div key={`${month.key}-week-${weekIndex}`} className="grid grid-cols-7 gap-1 px-1">
                      {week.map((cell, cellIndex) => {
                        if (!cell) {
                          return (
                            <div
                              key={`${month.key}-blank-${weekIndex}-${cellIndex}`}
                              className="h-8 rounded-md border border-transparent"
                            />
                          )
                        }
                        const normalized = month.monthMaxTrips > 0 ? Math.min(1, cell.trips / month.monthMaxTrips) : 0
                        const fallbackColor = cell.dominantOperator?.color ? hexToRgb(cell.dominantOperator.color) : null
                        const rgbColor = cell.color ?? fallbackColor ?? DEFAULT_OPERATOR_COLOR
                        const baseAlpha = 0.12
                        const dynamicAlpha = normalized > 0 ? baseAlpha + normalized * 0.6 : 0
                        const backgroundColor = normalized > 0 ? rgbaString(rgbColor, dynamicAlpha) : '#F1F5F9'
                        const borderAlpha = normalized > 0 ? Math.max(0.2, dynamicAlpha * 0.7) : 0
                        const borderColor = normalized > 0 ? rgbaString(rgbColor, borderAlpha) : 'transparent'
                        const textColor =
                          normalized > 0.6 ? 'text-white' : normalized > 0 ? 'text-slate-900' : 'text-slate-400'
                        const tripLabel = `${integerFormatter.format(cell.trips)} ${cell.trips === 1 ? 'viaje' : 'viajes'}`
                        const rechargeLabel = cell.recharges > 0
                          ? ` · ${integerFormatter.format(cell.recharges)} ${cell.recharges === 1 ? 'recarga' : 'recargas'}`
                          : ''
                        const durationLabel = cell.travelMinutes > 0 ? formatDuration(cell.travelMinutes) : null
                        const operatorSummaryText = cell.operators
                          .slice(0, 2)
                          .map((operator) => `${operator.name} ${integerFormatter.format(operator.count)}`)
                          .join(', ')
                        const titleLabel = `${fullDateFormatter.format(cell.date)} · ${tripLabel}${rechargeLabel}${
                          durationLabel ? ` · ${durationLabel}` : ''
                        }${
                          operatorSummaryText ? ` · ${operatorSummaryText}` : ''
                        }`
                        const hasContent = cell.trips > 0 || cell.recharges > 0
                        const tooltipOperators = cell.operators.slice(0, 3)
                        return (
                          <div
                            key={cell.id}
                            title={titleLabel}
                            aria-label={titleLabel}
                            tabIndex={hasContent ? 0 : -1}
                            className={`group relative flex h-8 items-center justify-center rounded-md border text-xs font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-slate-400 ${textColor}`}
                            style={{ backgroundColor, borderColor }}
                          >
                            <span>{cell.day}</span>
                            {hasContent && (
                              <div className="pointer-events-none absolute bottom-full left-1/2 z-20 hidden min-w-[220px] max-w-[320px] -translate-x-1/2 -translate-y-2 rounded-md bg-slate-900 px-3 py-2 text-[10px] text-white shadow-lg group-hover:flex group-focus-visible:flex">
                                <div className="flex w-full flex-col gap-1 text-left">
                                  <span className="uppercase tracking-[0.2em] text-[9px] text-slate-300">
                                    {fullDateFormatter.format(cell.date)}
                                  </span>
                                  <span className="font-semibold text-white">
                                    {tripLabel}
                                    {rechargeLabel}
                                  </span>
                                  {durationLabel && (
                                    <span className="text-[9px] text-slate-300">Tiempo: {durationLabel}</span>
                                  )}
                                  {tooltipOperators.length > 0 && (
                                    <div className="flex flex-col gap-1 text-[9px] text-slate-200">
                                      {tooltipOperators.map((operator) => (
                                        <span key={`${cell.id}-operator-${operator.name}`} className="flex items-center gap-1">
                                          <span
                                            className="h-2 w-2 rounded-full"
                                            style={{
                                              backgroundColor: operator.color ?? rgbaString(DEFAULT_OPERATOR_COLOR, 0.75),
                                            }}
                                          />
                                          <span className="truncate">{operator.name}</span>
                                          <span className="font-semibold text-white">
                                            {integerFormatter.format(operator.count)}
                                          </span>
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Top estaciones</h3>
          </div>
          {summary.topStations.length === 0 && (
            <p className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
              Aún no hay suficientes validaciones para calcular estaciones destacadas.
            </p>
          )}
          {summary.topStations.length > 0 && (
            <div className="space-y-3">
              {summary.topStations.map((station, index) => {
                const share = totalStationCount > 0 ? station.count / totalStationCount : 0
                const shareLabel = `${decimalFormatter.format(share * 100)}%`
                const width = Math.max(share * 100, 6)
                const barHex = stationPalette[index] ?? DEFAULT_OPERATOR_HEX
                const barRgb = hexToRgb(barHex) ?? DEFAULT_OPERATOR_COLOR
                const barBackground = rgbaString(barRgb, 0.18)
                return (
                  <div key={station.name} className="space-y-1">
                    <div className="flex items-center justify-between text-sm font-semibold text-slate-700">
                      <span className="flex min-w-0 items-center gap-2 truncate pr-4">
                        {station.operatorIcon ? (
                          <Image
                            src={station.operatorIcon}
                            alt={station.operatorName ?? 'Operador'}
                            width={20}
                            height={20}
                            className="h-4 w-auto"
                          />
                        ) : (
                          <span
                            className="h-2.5 w-2.5 rounded-full border border-white/70"
                            style={{ backgroundColor: barHex }}
                            aria-hidden
                          />
                        )}
                        {station.lineCode && (
                          <span
                            className="rounded-full px-2 py-0.5 text-xs font-semibold text-slate-900"
                            style={{ backgroundColor: BIZKAIBUS_BADGE_COLOR }}
                            title={station.lineDescription ?? undefined}
                          >
                            {station.lineCode}
                          </span>
                        )}
                        <span className="truncate">{station.name}</span>
                      </span>
                      <span className="text-xs font-normal text-slate-500">
                        {integerFormatter.format(station.count)} {station.count === 1 ? 'validación' : 'validaciones'} · {shareLabel}
                      </span>
                    </div>
                    <div className="h-2 w-full rounded-full" style={{ backgroundColor: barBackground }}>
                      <div className="h-2 rounded-full" style={{ width: `${width}%`, backgroundColor: barHex }} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Top operadores</h3>
          </div>
          {summary.topOperators.length === 0 && (
            <p className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
              Necesitamos más validaciones para detectar operadores recurrentes.
            </p>
          )}
          {summary.topOperators.length > 0 && (
            <div className="space-y-3">
              {summary.topOperators.map((operator, index) => {
                const share = totalOperatorCount > 0 ? operator.count / totalOperatorCount : 0
                const shareLabel = `${decimalFormatter.format(share * 100)}%`
                const width = Math.max(share * 100, 6)
                const barHex = operatorPalette[index] ?? DEFAULT_OPERATOR_HEX
                const barRgb = hexToRgb(barHex) ?? DEFAULT_OPERATOR_COLOR
                const barBackground = rgbaString(barRgb, 0.18)
                return (
                  <div key={operator.name} className="space-y-1">
                    <div className="flex items-center justify-between text-sm font-semibold text-slate-700">
                      <span className="flex min-w-0 items-center gap-2 truncate pr-4">
                        <span
                          className="h-2.5 w-2.5 rounded-full border border-white/70"
                          style={{ backgroundColor: barHex }}
                          aria-hidden
                        />
                        {operator.icon && (
                          <Image
                            src={operator.icon}
                            alt={operator.name}
                            width={24}
                            height={24}
                            className="h-5 w-auto"
                          />
                        )}
                        <span className="truncate">{operator.name}</span>
                      </span>
                      <span className="text-xs font-normal text-slate-500">
                        {integerFormatter.format(operator.count)} {operator.count === 1 ? 'registro' : 'registros'} · {shareLabel}
                      </span>
                    </div>
                    <div className="h-2 w-full rounded-full" style={{ backgroundColor: barBackground }}>
                      <div className="h-2 rounded-full" style={{ width: `${width}%`, backgroundColor: barHex }} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
      <div className="mt-8">
        <MetroDiagram
          stationHighlights={metroStationHighlights}
          playbackState={playbackState}
          hideLegends
          header={metroHeader}
          footer={metroFooter}
        />
      </div>

      <div className="mt-8 space-y-4">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">Actividad mensual</h3>
        </div>
        {summary.monthly.length === 0 && (
          <p className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
            Cargaremos aquí los meses en cuanto registres validaciones con fecha.
          </p>
        )}
        {summary.monthly.length > 0 && (
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <ApexChart options={monthlyChartOptions} series={monthlyChartSeries} type="bar" height={360} />
          </div>
        )}
      </div>
    </section>
  )
}

function TrophyIcon({ className }: { className?: string }) {
  const gradientId = useId()
  const shineId = `${gradientId}-shine`
  return (
    <svg viewBox="0 0 64 64" className={className} role="img" aria-hidden>
      <defs>
        <linearGradient id={gradientId} x1="50%" x2="50%" y1="0%" y2="100%">
          <stop offset="0%" stopColor="#FFE8A6" />
          <stop offset="45%" stopColor="#F6C86B" />
          <stop offset="100%" stopColor="#EAA04D" />
        </linearGradient>
        <radialGradient id={shineId} cx="30%" cy="25%" r="55%">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.8" />
          <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
        </radialGradient>
      </defs>
      <path
        d="M18 10h28v6h6a7 7 0 0 1 0 14h-4.7C45.2 39 37.9 47 32 47s-13.2-8-15.3-17H12a7 7 0 0 1 0-14h6v-6Z"
        fill={`url(#${gradientId})`}
        stroke="#C0852C"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M24 10V6h16v4"
        stroke="#C0852C"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path d="M26 47h12v6H26z" fill="#D39A3A" stroke="#B27720" strokeWidth="1.4" />
      <path d="M22 53h20v5H22z" fill="#B06C1F" stroke="#8F5414" strokeWidth="1.4" />
      <ellipse cx="32" cy="24" rx="10" ry="6" fill={`url(#${shineId})`} />
      <path
        d="M22.5 30c1.4 6.3 6.3 11 9.5 11s8.1-4.7 9.5-11c-4 1.6-7.2 2-9.5 2s-5.5-.4-9.5-2Z"
        fill="#FBEEC7"
        opacity="0.45"
      />
    </svg>
  )
}

function ClockIcon({ className }: { className?: string }) {
  const gradientId = useId()
  const glowId = `${gradientId}-glow`
  return (
    <svg viewBox="0 0 64 64" className={className} role="img" aria-hidden>
      <defs>
        <linearGradient id={gradientId} x1="50%" x2="50%" y1="0%" y2="100%">
          <stop offset="0%" stopColor="#FFF1C4" />
          <stop offset="50%" stopColor="#F7C974" />
          <stop offset="100%" stopColor="#E99A4B" />
        </linearGradient>
        <radialGradient id={glowId} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.7" />
          <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="32" cy="34" r="20" fill={`url(#${gradientId})`} stroke="#B16E27" strokeWidth="2" />
      <circle cx="32" cy="34" r="10" fill={`url(#${glowId})`} />
      <path
        d="M32 16V8m0 52v-8M16 34h-8m52 0h-8"
        stroke="#B16E27"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path d="M32 34V22" stroke="#7C4314" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M32 34l9 5" stroke="#7C4314" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="32" cy="34" r="2.4" fill="#7C4314" />
    </svg>
  )
}

function StreakIcon({ className }: { className?: string }) {
  const gradientId = useId()
  const innerId = `${gradientId}-inner`
  return (
    <svg viewBox="0 0 64 64" className={className} role="img" aria-hidden>
      <defs>
        <linearGradient id={gradientId} x1="50%" x2="50%" y1="0%" y2="100%">
          <stop offset="0%" stopColor="#FFE6AD" />
          <stop offset="40%" stopColor="#F7B462" />
          <stop offset="100%" stopColor="#EB6A3C" />
        </linearGradient>
        <linearGradient id={innerId} x1="50%" x2="50%" y1="0%" y2="100%">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.7" />
          <stop offset="100%" stopColor="#F6A35A" stopOpacity="0.2" />
        </linearGradient>
      </defs>
      <path
        d="M32 8c-5.5 5.7-12 13.4-12 22.5C20 41 25.6 48 32 48s12-7 12-17.5C44 21.4 37.5 13.7 32 8Z"
        fill={`url(#${gradientId})`}
        stroke="#BA5A1F"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M32 21.5c2.6 3.2 4.2 6 4.2 9 0 4.2-2.8 7.5-6.2 7.5s-6.2-3.3-6.2-7.5c0-3 1.6-5.8 4.2-9Z"
        fill={`url(#${innerId})`}
      />
      <path
        d="M28.5 44.5c1.1 3.7 2.7 7.5 3.5 11.5 0 0 3.4-5.6 5.6-9.9"
        stroke="#D97B33"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  )
}

function computeAnnualSummary(records: TransactionRecord[]): AnnualSummary {
  if (!records.length) {
    return EMPTY_SUMMARY
  }

  const meaningfulRecords = records.filter(isMeaningfulRecord)
  if (!meaningfulRecords.length) {
    return EMPTY_SUMMARY
  }

  const orderedRecords = [...meaningfulRecords].sort(
    (a, b) => getRecordDate(a).getTime() - getRecordDate(b).getTime(),
  )
  const fareInsights = buildFareInsights(orderedRecords)
  const journeys = buildJourneyBlocks(orderedRecords)
  const stats = computeJourneyStats(journeys, fareInsights)

  const rideRecords = orderedRecords.filter((record) => !isRecargaTransaction(record))
  const stationCounts = new Map<string, StationAggregate>()
  const operatorCounts = new Map<string, RankedOperator>()
  const daySet = new Set<string>()
  const dayTotalsMap = new Map<string, DayAccumulator>()
  let minDate: Date | null = null
  let maxDate: Date | null = null
  let minTimestamp: number | null = null
  let maxTimestamp: number | null = null
  let rideSpentAmount = 0
  const metroStationUsage = new Map<string, { code: string; name: string; entries: number; passThrough: number }>()
  const metroTrips: MetroTrip[] = []

  const getOrCreateMetroStation = (code: string) => {
    const stationMeta = METRO_STATION_BY_CODE.get(code)
    if (!stationMeta) {
      return null
    }
    let bucket = metroStationUsage.get(code)
    if (!bucket) {
      bucket = { code, name: stationMeta.name, entries: 0, passThrough: 0 }
      metroStationUsage.set(code, bucket)
    }
    return bucket
  }

  rideRecords.forEach((record) => {
    const recordDate = getRecordDate(record)
    const timestamp = recordDate.getTime()
    if (Number.isNaN(timestamp)) {
      return
    }
    const currentBrand = getOperatorBrand(record.operador)
    const dayKey = getDayKey(recordDate)
    daySet.add(dayKey)
    if (minTimestamp === null || timestamp < minTimestamp) {
      minTimestamp = timestamp
      minDate = recordDate
    }
    if (maxTimestamp === null || timestamp > maxTimestamp) {
      maxTimestamp = timestamp
      maxDate = recordDate
    }

    if (typeof record.importe === 'number' && record.importe !== 0) {
      rideSpentAmount += Math.abs(record.importe)
    }

    if (record.equipo) {
      const stationKey = normalizeStopName(record.equipo)
      if (stationKey) {
        const stationName = record.equipo.trim()
        let aggregate = stationCounts.get(stationKey)
        if (!aggregate) {
          aggregate = {
            name: stationName,
            count: 0,
            operatorUsage: new Map<string, StationOperatorUsage>(),
            lineUsage: new Map<string, StationLineUsage>(),
          }
          stationCounts.set(stationKey, aggregate)
        }
        aggregate.count += 1

        if (record.operador) {
          const normalizedOperator = normalizeOperatorLabel(record.operador).trim()
          if (normalizedOperator && normalizedOperator !== '—') {
            const brand = currentBrand
            const displayName = brand?.label ?? normalizedOperator
            const operatorKey = displayName.toLowerCase()
            let usage = aggregate.operatorUsage.get(operatorKey)
            if (!usage) {
              usage = {
                name: displayName,
                count: 0,
                icon: brand?.icon ?? null,
                color: brand?.color ?? null,
              }
              aggregate.operatorUsage.set(operatorKey, usage)
            }
            usage.count += 1
            if (!usage.icon && brand?.icon) {
              usage.icon = brand.icon
            }
            if (!usage.color && brand?.color) {
              usage.color = brand.color
            }
            if (brand?.label === 'Bizkaibus') {
              const line = resolveBizkaibusLine(record.equipo)
              if (line) {
                let lineUsage = aggregate.lineUsage.get(line.code)
                if (!lineUsage) {
                  lineUsage = {
                    code: line.code,
                    description: line.description,
                    count: 0,
                  }
                  aggregate.lineUsage.set(line.code, lineUsage)
                }
                lineUsage.count += 1
              }
            }
          }
        }
      }
    }

    if (record.operador) {
      const normalized = normalizeOperatorLabel(record.operador).trim()
      if (normalized && normalized !== '—') {
        const brand = currentBrand
        const displayName = brand?.label ?? normalized
        const mapKey = displayName.toLowerCase()
        const existing = operatorCounts.get(mapKey)
        if (existing) {
          existing.count += 1
          if (!existing.color && brand?.color) {
            existing.color = brand.color
          }
        } else {
          operatorCounts.set(mapKey, {
            name: displayName,
            count: 1,
            icon: brand?.icon ?? null,
            color: brand?.color ?? null,
          })
        }
      }
    }

    if (currentBrand?.label === 'Metro Bilbao') {
      const metroCode = resolveMetroStationCode(record.equipo)
      if (metroCode) {
        const metroStation = getOrCreateMetroStation(metroCode)
        if (metroStation) {
          metroStation.entries += 1
        }
      }
    }
  })

  const topStations = Array.from(stationCounts.values())
    .map((aggregate) => {
      const operators = Array.from(aggregate.operatorUsage.values()).sort((a, b) => b.count - a.count)
      const primaryOperator = operators[0] ?? null
      const primaryLine = primaryOperator?.name === 'Bizkaibus'
        ? Array.from(aggregate.lineUsage.values()).sort((a, b) => b.count - a.count)[0] ?? null
        : null
      return {
        name: aggregate.name,
        count: aggregate.count,
        operatorName: primaryOperator?.name ?? null,
        operatorIcon: primaryOperator?.icon ?? null,
        operatorColor: primaryOperator?.color ?? null,
        lineCode: primaryOperator?.name === 'Bizkaibus' ? primaryLine?.code ?? null : null,
        lineDescription: primaryOperator?.name === 'Bizkaibus' ? primaryLine?.description ?? null : null,
      }
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)
  const topOperators = Array.from(operatorCounts.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)

  const monthlyMap = new Map<string, MonthlyInsight>()
  journeys.forEach((journey) => {
    const startDate = getRecordDate(journey.start)
    if (Number.isNaN(startDate.getTime())) {
      return
    }

    if (journey.kind === 'viaje') {
      const startBrand = getOperatorBrand(journey.start.operador)
      const endBrand = journey.end ? getOperatorBrand(journey.end.operador) : null
      if (startBrand?.label === 'Metro Bilbao' && endBrand?.label === 'Metro Bilbao') {
        const startCode = resolveMetroStationCode(journey.start.equipo)
        const endCode = resolveMetroStationCode(journey.end?.equipo ?? null)
        if (startCode && endCode) {
          const pathCodes = findMetroPath(startCode, endCode).filter((code) => METRO_STATION_BY_CODE.has(code))
          if (pathCodes.length >= 2) {
            pathCodes.forEach((code, index) => {
              const stationBucket = getOrCreateMetroStation(code)
              if (stationBucket && index > 0 && index < pathCodes.length - 1) {
                stationBucket.passThrough += 1
              }
            })
            metroTrips.push({
              id: journey.id,
              date: startDate,
              from: startCode,
              to: endCode,
              durationMinutes: journey.durationMinutes,
              pathCodes,
            })
          }
        }
      }
    }

    const key = getMonthKey(startDate)
    const label = formatMonthLabel(startDate)
    const bucket = monthlyMap.get(key) ?? { key, label, rides: 0, recharges: 0, spent: 0 }
    const dayKey = getDayKey(startDate)
    const dayBucket =
      dayTotalsMap.get(dayKey) ?? {
        key: dayKey,
        date: startDate,
        rides: 0,
        recharges: 0,
        operatorUsage: new Map<string, OperatorDailySummary>(),
        travelMinutes: 0,
      }
    if (journey.kind === 'viaje' || journey.kind === 'viaje-unico') {
      bucket.rides += 1
      dayBucket.rides += 1

      const rawOperator = journey.start.operador ?? journey.end?.operador ?? null
      if (rawOperator) {
        const normalized = normalizeOperatorLabel(rawOperator).trim()
        if (normalized && normalized !== '—') {
          const brand = getOperatorBrand(rawOperator)
          const displayName = brand?.label ?? normalized
          const operatorKey = displayName.toLowerCase()
          let operatorSummary = dayBucket.operatorUsage.get(operatorKey)
          if (!operatorSummary) {
            operatorSummary = {
              name: displayName,
              count: 0,
              color: brand?.color ?? null,
            }
            dayBucket.operatorUsage.set(operatorKey, operatorSummary)
          }
          operatorSummary.count += 1
          if (!operatorSummary.color && brand?.color) {
            operatorSummary.color = brand.color
          }
        }
      }
      if (typeof journey.durationMinutes === 'number' && !Number.isNaN(journey.durationMinutes)) {
        dayBucket.travelMinutes += Math.max(0, journey.durationMinutes)
      }
    }

    if (journey.kind === 'recarga') {
      bucket.recharges += 1
      if (typeof journey.start.importe === 'number' && journey.start.importe !== 0) {
        bucket.spent += Math.abs(journey.start.importe)
      }
      dayBucket.recharges += 1
    }

    monthlyMap.set(key, bucket)
    dayTotalsMap.set(dayKey, dayBucket)
  })

  const monthly = Array.from(monthlyMap.values()).sort((a, b) => a.key.localeCompare(b.key))
  const dailyTotals = Array.from(dayTotalsMap.values())
    .map((day) => {
      const operators = Array.from(day.operatorUsage.values()).sort((a, b) => b.count - a.count)
      return {
        key: day.key,
        date: day.date,
        rides: day.rides,
        recharges: day.recharges,
        operators,
        travelMinutes: day.travelMinutes,
      }
    })
    .sort((a, b) => a.key.localeCompare(b.key))

  const travelHighlight = dailyTotals.reduce<TravelDayHighlight | null>((best, day) => {
    if (day.travelMinutes <= 0) {
      return best
    }
    if (!best || day.travelMinutes > best.travelMinutes) {
      return {
        date: day.date,
        travelMinutes: day.travelMinutes,
        rides: day.rides,
      }
    }
    return best
  }, null)

  const rideDays = dailyTotals.filter((day) => day.rides > 0)
  let bestStreak: StreakHighlight | null = null
  let currentStreak: StreakHighlight | null = null

  rideDays.forEach((day) => {
    if (!currentStreak) {
      currentStreak = {
        length: 1,
        startDate: day.date,
        endDate: day.date,
      }
    } else {
      const diffDays = Math.round((day.date.getTime() - currentStreak.endDate.getTime()) / DAY_MS)
      if (diffDays === 1) {
        currentStreak = {
          length: currentStreak.length + 1,
          startDate: currentStreak.startDate,
          endDate: day.date,
        }
      } else if (diffDays > 1) {
        if (!bestStreak || currentStreak.length > bestStreak.length) {
          bestStreak = currentStreak
        }
        currentStreak = {
          length: 1,
          startDate: day.date,
          endDate: day.date,
        }
      } else {
        currentStreak = {
          length: currentStreak.length,
          startDate: currentStreak.startDate,
          endDate: day.date,
        }
      }
    }

    if (!bestStreak || currentStreak.length > bestStreak.length) {
      bestStreak = currentStreak
    }
  })

  const sortedMetroTrips = metroTrips.slice().sort((a, b) => a.date.getTime() - b.date.getTime())
  const metroStationUsageList = Array.from(metroStationUsage.values())
    .map((station) => ({
      code: station.code,
      name: station.name,
      entries: station.entries,
      passThrough: station.passThrough,
      total: station.entries + station.passThrough,
    }))
    .filter((station) => station.total > 0)
    .sort((a, b) => b.total - a.total)

  const metroSummary: MetroSummary = {
    totalTrips: sortedMetroTrips.length,
    stationUsage: metroStationUsageList,
    trips: sortedMetroTrips,
  }

  const totalRangeDays =
    minTimestamp !== null && maxTimestamp !== null
      ? Math.max(1, Math.round((maxTimestamp - minTimestamp) / DAY_MS) + 1)
      : daySet.size
  const averageTripsPerActiveDay = daySet.size > 0 ? stats.rides / daySet.size : 0
  const averageTripsPerDayOverall = totalRangeDays > 0 ? stats.rides / totalRangeDays : 0
  const averageTravelMinutesPerDay = totalRangeDays > 0 ? stats.travelMinutes / totalRangeDays : 0
  const totalRecharges = stats.walletRecharges + stats.titlePurchases

  const firstDateResolved = dailyTotals.length ? dailyTotals[0].date : minDate
  const lastDateResolved = dailyTotals.length ? dailyTotals[dailyTotals.length - 1].date : maxDate

  return {
    totalRecords: meaningfulRecords.length,
    totalJourneys: stats.rides,
    totalSpent: stats.spent,
    rideSpent: rideSpentAmount,
    totalSavings: stats.savings,
    walletRecharges: stats.walletRecharges,
    titlePurchases: stats.titlePurchases,
    totalRecharges,
    travelMinutes: stats.travelMinutes,
    activeDays: daySet.size,
    averageRideCost: stats.rides > 0 ? rideSpentAmount / stats.rides : 0,
    averageTripsPerActiveDay,
    averageTripsPerDayOverall,
    averageTravelMinutesPerDay,
    topStations,
    topOperators,
    monthly,
    dailyTotals,
    highlightStation: topStations[0] ?? null,
    highlightOperator: topOperators[0] ?? null,
    highlightTravelDay: travelHighlight,
    highlightStreak: bestStreak,
    firstDate: firstDateResolved,
    lastDate: lastDateResolved,
    metro: metroSummary,
  }
}
