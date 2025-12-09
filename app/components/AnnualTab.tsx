'use client'

import { useEffect, useMemo, useState } from 'react'
import bizkaibusJsonData from '../../files/lineasbizkaibus.json'
import { fullDateFormatter } from '../lib/dateFormatters'
import type { HistoryEntry } from '../lib/historyStore'
import type { TransactionRecord } from '../lib/pdfParser'
import { findMetroPath } from './metro/MetroDiagram'
import { AnnualInsights } from './annual/AnnualInsights'
import { AnnualActivityCalendar } from './annual/AnnualActivityCalendar'
import { AnnualHighlights } from './annual/AnnualHighlights'
import { AnnualTopLists, type TopOperatorCard, type TopStationCard } from './annual/AnnualTopLists'
import { AnnualMonthlyActivityChart } from './annual/AnnualMonthlyActivityChart'
import { AnnualMetroPanel } from './annual/AnnualMetroPanel'
import { AnnualPhotoExports } from './annual/AnnualPhotoExports'
import { resolveMetroStationCode, isKnownMetroStation, getMetroStationMeta } from './metro/metroUtils'
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
  view?: 'overview' | 'photos'
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

export type MetroStationUsage = {
  code: string
  name: string
  entries: number
  passThrough: number
  total: number
}

export type MetroTrip = {
  id: string
  date: Date
  from: string
  to: string
  durationMinutes: number | null
  pathCodes: string[]
}

export type MetroSummary = {
  totalTrips: number
  stationUsage: MetroStationUsage[]
  trips: MetroTrip[]
}

export type AnnualSummary = {
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
  totalStationValidations: number
  totalOperatorValidations: number
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
  totalStationValidations: 0,
  totalOperatorValidations: 0,
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
const DAY_MS = 24 * 60 * 60 * 1000
const WEEKDAY_LABELS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'] as const
const DEFAULT_OPERATOR_COLOR: RgbColor = { r: 239, g: 68, b: 68 }
const DEFAULT_OPERATOR_HEX = '#ef4444'
const BIZKAIBUS_BADGE_COLOR = '#9FCD5F'
const WHITE_RGB: RgbColor = { r: 255, g: 255, b: 255 }
const BLACK_RGB: RgbColor = { r: 0, g: 0, b: 0 }

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

export function AnnualPanel({ history, historyLoading, view = 'overview' }: AnnualPanelProps) {
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

  const stationPalette = useMemo(
    () => buildVariantPalette(summary.topStations, (station) => station.operatorColor),
    [summary.topStations],
  )
  const operatorPalette = useMemo(
    () => buildVariantPalette(summary.topOperators, (operator) => operator.color),
    [summary.topOperators],
  )
  const totalStationCount = summary.totalStationValidations
  const totalOperatorCount = summary.totalOperatorValidations

  const topStationCards = useMemo<TopStationCard[]>(() => {
    if (summary.topStations.length === 0) {
      return []
    }
    return summary.topStations.map((station, index) => {
      const share = totalStationCount > 0 ? station.count / totalStationCount : 0
      const shareLabel = `${decimalFormatter.format(share * 100)}%`
      const widthPercent = Math.max(share * 100, 6)
      const barHex = stationPalette[index] ?? DEFAULT_OPERATOR_HEX
      const barRgb = hexToRgb(barHex) ?? DEFAULT_OPERATOR_COLOR
      const barBackground = rgbaString(barRgb, 0.18)
      return {
        key: station.name,
        name: station.name,
        operatorIcon: station.operatorIcon,
        operatorName: station.operatorName,
        lineCode: station.lineCode,
        lineDescription: station.lineDescription,
        count: station.count,
        shareLabel,
        barHex,
        barBackground,
        widthPercent,
        lineBadgeColor: station.lineCode ? BIZKAIBUS_BADGE_COLOR : null,
      }
    })
  }, [summary.topStations, stationPalette, totalStationCount])

  const topOperatorCards = useMemo<TopOperatorCard[]>(() => {
    if (summary.topOperators.length === 0) {
      return []
    }
    return summary.topOperators.map((operator, index) => {
      const share = totalOperatorCount > 0 ? operator.count / totalOperatorCount : 0
      const shareLabel = `${decimalFormatter.format(share * 100)}%`
      const widthPercent = Math.max(share * 100, 6)
      const barHex = operatorPalette[index] ?? DEFAULT_OPERATOR_HEX
      const barRgb = hexToRgb(barHex) ?? DEFAULT_OPERATOR_COLOR
      const barBackground = rgbaString(barRgb, 0.18)
      return {
        key: operator.name,
        name: operator.name,
        count: operator.count,
        shareLabel,
        barHex,
        barBackground,
        widthPercent,
        icon: operator.icon,
      }
    })
  }, [summary.topOperators, operatorPalette, totalOperatorCount])

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

      {view === 'overview' ? (
        <>
          <AnnualInsights
            summary={summary}
            previousYearSummary={previousYearSummary}
            previousYearKey={previousYearKey}
          />

          <AnnualHighlights
            summary={{
              totalJourneys: summary.totalJourneys,
              totalRecharges: summary.totalRecharges,
              highlightStation: summary.highlightStation,
              highlightTravelDay: summary.highlightTravelDay,
              highlightStreak: summary.highlightStreak,
            }}
          />
          <AnnualActivityCalendar calendarMonths={calendarMonths} />

          <AnnualTopLists stations={topStationCards} operators={topOperatorCards} />
          <AnnualMetroPanel metro={summary.metro} />
          <AnnualMonthlyActivityChart monthly={summary.monthly} />
        </>
      ) : (
        <AnnualPhotoExports
          selectedYear={selectedYear}
          summary={summary}
          previousYearSummary={previousYearSummary}
          previousYearKey={previousYearKey}
        />
      )}
    </section>
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
    const stationMeta = getMetroStationMeta(code)
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

  const stationAggregates = Array.from(stationCounts.values())
  const totalStationValidations = stationAggregates.reduce((sum, aggregate) => sum + aggregate.count, 0)
  const topStations = stationAggregates
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
  const operatorList = Array.from(operatorCounts.values())
  const totalOperatorValidations = operatorList.reduce((sum, operator) => sum + operator.count, 0)
  const topOperators = operatorList
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
          const pathCodes = findMetroPath(startCode, endCode).filter((code) => isKnownMetroStation(code))
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
    totalStationValidations,
    totalOperatorValidations,
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
