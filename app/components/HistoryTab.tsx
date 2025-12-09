"use client"

import Image from 'next/image'
import {
  ArrowDownLeft,
  ArrowUpRight,
  ChevronDown,
  Clock3,
  CreditCard,
  LayoutGrid,
  MapPin,
  Smartphone,
  Table,
  Wallet,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import bizkaibusJsonData from '../../files/lineasbizkaibus.json'
import type { HistoryEntry } from '../lib/historyStore'
import type { TransactionRecord } from '../lib/pdfParser'
import {
  OPERATOR_BRANDS,
  RECHARGE_FILTER_VALUE,
  buildBaseFareLabel,
  buildFareInsights,
  buildFilterMetadata,
  buildJourneyBlocks,
  buildRidePriceSubtitle,
  collapseSpacesComparable,
  computeJourneyStats,
  filterRecordsByOperator,
  formatAmount,
  formatDateValue,
  formatDateLong,
  formatDayLabel,
  formatDuration,
  formatMonthLabel,
  formatSignedAmount,
  formatStatsAmountSummary,
  formatStatsCountSummary,
  formatStatsDurationSummary,
  formatYearLabel,
  getDayKey,
  getMonthKey,
  getOperatorBrand,
  getRecordKey,
  getRecordDate,
  getYearKey,
  groupRecordsForTable,
  isEntryValidation,
  isExitValidation,
  isMeaningfulRecord,
  isRecargaTransaction,
  isSingleValidation,
  isTitleRechargeRecord,
  isWalletRechargeRecord,
  normalizeBizkaibusComparable,
  normalizeOperatorLabel,
  normalizeStopName,
  parseBizkaibusJson,
  scoreBizkaibusMatch,
  sumJourneyStats,
  tokenizeBizkaibusText,
} from './history/historyDataTransforms'
import type {
  BizkaibusJsonLine,
  BizkaibusJsonRoot,
  BizkaibusLineDefinition,
  BizkaibusLineMatch,
  FareInsight,
  FareInsightsMap,
  FilterMetadata,
  GroupingMode,
  HistoryFilterOption,
  JourneyBlock,
  JourneyDayGroup,
  JourneyMonthGroup,
  JourneyMonthGroupWithYear,
  JourneyStats,
  JourneyYearGroup,
  NavigateToRechargeHandler,
  OperatorBrand,
  PassSnapshot,
  TableGroupSection,
} from './history/historyTypes'

export type HistoryExperienceProps = {
  history: HistoryEntry[]
  historyLoading: boolean
  selectedHistoryId: string
  isVisible?: boolean
}

const GROUPING_OPTIONS: Array<{ value: GroupingMode; label: string }> = [
  { value: 'year', label: 'Agrupar por año' },
  { value: 'month', label: 'Agrupar por mes' },
  { value: 'none', label: 'Sin agrupar' },
]

export function HistoryExperience({
  history,
  historyLoading,
  selectedHistoryId,
  isVisible = true,
}: HistoryExperienceProps) {
  const [historyViewMode, setHistoryViewMode] = useState<'table' | 'cards'>('cards')
  const [groupingMode, setGroupingMode] = useState<GroupingMode>('year')
  const [operatorFilter, setOperatorFilter] = useState<string>('Todos')
  const [pendingAnchorId, setPendingAnchorId] = useState<string | null>(null)
  const [highlightedAnchorId, setHighlightedAnchorId] = useState<string | null>(null)
  const bizkaibusLines = useMemo<BizkaibusLineDefinition[]>(
    () => parseBizkaibusJson(bizkaibusJsonData as BizkaibusJsonRoot),
    [],
  )
  const bizkaibusLineCache = useRef<Map<string, BizkaibusLineMatch | null>>(new Map())

  const selectedHistory = history.find((entry) => entry.id === selectedHistoryId) ?? null
  const historyRecords = useMemo(() => {
    const records = selectedHistory?.records ?? []
    return records.filter(isMeaningfulRecord)
  }, [selectedHistory])

  const filterMetadata = useMemo(() => buildFilterMetadata(historyRecords), [historyRecords])

  useEffect(() => {
    setOperatorFilter(filterMetadata.defaultFilter)
  }, [filterMetadata.defaultFilter])

  const filteredRecords = useMemo(() => {
    return filterRecordsByOperator(historyRecords, operatorFilter, filterMetadata.brandLabels)
  }, [historyRecords, operatorFilter, filterMetadata.brandLabels])

  const journeyBlocks = useMemo(() => {
    return buildJourneyBlocks(filteredRecords)
  }, [filteredRecords])

  const visibleJourneyCount = useMemo(() => {
    return journeyBlocks.filter((journey) => journey.kind !== 'otros').length
  }, [journeyBlocks])

  const fareInsights = useMemo(() => {
    return buildFareInsights(historyRecords)
  }, [historyRecords])

  useEffect(() => {
    bizkaibusLineCache.current.clear()
  }, [bizkaibusLines])

  const resolveBizkaibusLine = useCallback(
    (stopName?: string | null) => {
      if (!stopName || bizkaibusLines.length === 0) {
        return null
      }
      if (bizkaibusLineCache.current.has(stopName)) {
        return bizkaibusLineCache.current.get(stopName) ?? null
      }
      const comparable = normalizeBizkaibusComparable(stopName)
      const collapsed = collapseSpacesComparable(stopName)
      if (!comparable) {
        bizkaibusLineCache.current.set(stopName, null)
        return null
      }
      const tokens = tokenizeBizkaibusText(stopName)
      let bestScore = 0
      let result: BizkaibusLineMatch | null = null
      bizkaibusLines.forEach((line) => {
        const score = scoreBizkaibusMatch(comparable, collapsed, tokens, line)
        if (score > bestScore) {
          bestScore = score
          result = { code: line.code, description: line.description }
        }
      })
      bizkaibusLineCache.current.set(stopName, result)
      return result
    },
    [bizkaibusLines],
  )

  const handleNavigateToRecharge = (
    recordKey?: string | null,
    options?: {
      targetView?: 'table' | 'cards'
    },
  ) => {
    if (!recordKey) {
      return
    }
    const desiredView = options?.targetView ?? 'cards'
    const anchorId = desiredView === 'table' ? getTableRowAnchorIdFromKey(recordKey) : `recarga-${recordKey}`
    if (desiredView === 'cards') {
      setHistoryViewMode('cards')
    }
    const element = document.getElementById(anchorId)
    if (!element && operatorFilter !== RECHARGE_FILTER_VALUE) {
      setOperatorFilter(RECHARGE_FILTER_VALUE)
    }
    setPendingAnchorId(anchorId)
  }

  useEffect(() => {
    if (!pendingAnchorId) {
      return
    }
    const element = document.getElementById(pendingAnchorId)
    if (!element) {
      return
    }
    element.scrollIntoView({ behavior: 'smooth', block: 'center' })
    setHighlightedAnchorId(pendingAnchorId)
    setPendingAnchorId(null)
  }, [pendingAnchorId, journeyBlocks, historyViewMode, filteredRecords])

  useEffect(() => {
    if (!highlightedAnchorId) {
      return
    }
    const timeout = window.setTimeout(() => {
      setHighlightedAnchorId((current) => (current === highlightedAnchorId ? null : current))
    }, 2500)
    return () => {
      window.clearTimeout(timeout)
    }
  }, [highlightedAnchorId])

  const hasSelectedHistory = Boolean(selectedHistory)

  const tableContent = hasSelectedHistory ? (
    <HistoryTable
      records={filteredRecords}
      fareInsights={fareInsights}
      onNavigateToRecharge={handleNavigateToRecharge}
      highlightedAnchorId={highlightedAnchorId}
      resolveBizkaibusLine={resolveBizkaibusLine}
      groupingMode={groupingMode}
      onGroupingModeChange={setGroupingMode}
    />
  ) : null

  const cardContent = hasSelectedHistory ? (
    <JourneyCards
      journeys={journeyBlocks}
      fareInsights={fareInsights}
      onNavigateToRecharge={handleNavigateToRecharge}
      highlightedAnchorId={highlightedAnchorId}
      resolveBizkaibusLine={resolveBizkaibusLine}
      groupingMode={groupingMode}
      onGroupingModeChange={setGroupingMode}
    />
  ) : null

  const emptyHistoryState = (
    <p className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-slate-500">
      Aún no has guardado lecturas. Usa la zona superior para subir tu primer PDF.
    </p>
  )

  const summaryLabel =
    historyViewMode === 'table'
      ? `${filteredRecords.length} resultados`
      : `${visibleJourneyCount} resultados`
  const showFilterSuffix = operatorFilter !== 'Todos'
  const fullSummaryLabel = showFilterSuffix ? `${summaryLabel} · ${operatorFilter}` : summaryLabel
  const filterOptions = filterMetadata.filterOptions

  const historySection = !isVisible ? null : (
    <section className="w-full space-y-4 rounded-none border-0 bg-white p-4 shadow-none sm:mt-0 sm:rounded-3xl sm:border sm:border-slate-200 sm:p-6 sm:shadow-lg">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900">Historial</h2>
        </div>
        {hasSelectedHistory && (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
              <div className="flex rounded-full border border-slate-200 bg-slate-50 p-1">
                <button
                  type="button"
                  onClick={() => setHistoryViewMode('table')}
                  className={`flex items-center gap-2 rounded-full px-4 py-1 transition ${
                    historyViewMode === 'table'
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-500 hover:text-slate-900'
                  }`}
                >
                  <Table className="h-3.5 w-3.5" aria-hidden />
                  <span>Tabla</span>
                </button>
                <button
                  type="button"
                  onClick={() => setHistoryViewMode('cards')}
                  className={`flex items-center gap-2 rounded-full px-4 py-1 transition ${
                    historyViewMode === 'cards'
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-500 hover:text-slate-900'
                  }`}
                >
                  <LayoutGrid className="h-3.5 w-3.5" aria-hidden />
                  <span>Tarjetas</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {hasSelectedHistory && (
        <div className="space-y-3">
          <p className="text-sm text-slate-500">{fullSummaryLabel}</p>
          <div className="flex flex-wrap gap-2">
            {filterOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setOperatorFilter(option.value)}
                className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold transition ${
                  operatorFilter === option.value
                    ? 'border-slate-900 bg-slate-900 text-white'
                    : 'border-slate-200 text-slate-500 hover:text-slate-900'
                }`}
              >
                {option.icon && (
                  <Image
                    src={option.icon}
                    alt=""
                    width={20}
                    height={20}
                    aria-hidden
                    className="h-5 w-auto max-w-[24px] object-contain"
                  />
                )}
                <span>{option.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {historyLoading && <p className="text-sm text-slate-500">Cargando historial…</p>}

      {!historyLoading && !hasSelectedHistory && emptyHistoryState}

      {hasSelectedHistory && (historyViewMode === 'table' ? tableContent : cardContent)}
    </section>
  )

  return (
    <>
      {historySection}
    </>
  )
}

function HistoryTable({
  records,
  fareInsights,
  onNavigateToRecharge,
  highlightedAnchorId,
  resolveBizkaibusLine,
  groupingMode,
  onGroupingModeChange,
}: {
  records: TransactionRecord[]
  fareInsights: FareInsightsMap
  onNavigateToRecharge?: NavigateToRechargeHandler
  highlightedAnchorId?: string | null
  resolveBizkaibusLine?: (stopName?: string | null) => BizkaibusLineMatch | null
  groupingMode: GroupingMode
  onGroupingModeChange: (mode: GroupingMode) => void
}) {
  const groupedSections = useMemo<TableGroupSection[]>(
    () => groupRecordsForTable(records, groupingMode),
    [records, groupingMode],
  )
  const columnCount = 8

  if (!records.length) {
    return (
      <p className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500">
        No hay filas con este filtro.
      </p>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end gap-2">
        <select
          value={groupingMode}
          onChange={(event) => onGroupingModeChange(event.target.value as GroupingMode)}
          className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600"
        >
          {GROUPING_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      <div className="overflow-auto rounded-2xl border border-slate-200">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-100 text-xs uppercase tracking-[0.2em] text-slate-600">
            <tr>
              <th className="px-4 py-3">Fecha</th>
              <th className="px-4 py-3">Hora</th>
              <th className="px-4 py-3">Transacción</th>
              <th className="px-4 py-3">Operador</th>
              <th className="px-4 py-3">Equipo</th>
              <th className="px-4 py-3">Título</th>
              <th className="px-4 py-3">Importe</th>
              <th className="px-4 py-3">Saldo</th>
            </tr>
          </thead>
          <tbody>
            {groupedSections.map((section) => (
              <Fragment key={section.key}>
                {groupingMode !== 'none' && (
                  <tr>
                    <td
                      colSpan={columnCount}
                      className="bg-slate-50 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-slate-500"
                    >
                      {section.label}
                    </td>
                  </tr>
                )}
                {section.rows.map((record) => {
                  const operatorLabel = normalizeOperatorLabel(record.operador)
                  const operatorBrand = getOperatorBrand(record.operador)
                  const OperatorFallbackIcon = getOperatorFallbackIcon(operatorLabel)
                  const bizkaibusLineInfo =
                    operatorBrand?.label === 'Bizkaibus' ? resolveBizkaibusLine?.(record.equipo) : null
                  const operatorSuffixLabel =
                    operatorBrand && operatorBrand.label.startsWith('Euskotren ')
                      ? operatorBrand.label.replace('Euskotren ', '').trim()
                      : null
                  const equipmentLabel = record.equipo?.trim() || '—'
                  const amountDisplay = buildAmountDisplay(record, fareInsights)
                  const transactionDisplay = buildTransactionLabel(record, fareInsights)
                  const rowKey = getRecordKey(record)
                  const tableRowAnchorId = getTableRowAnchorId(record)
                  const fare = fareInsights.get(rowKey)
                  const isTitlePurchase =
                    fareInsights.get(rowKey)?.usageKind === 'title-recharge' || isTitleRechargeRecord(record)
                  const daysLabel = formatDaysRemainingLabel(fare?.daysRemaining)
                  const titlePrimary = fare?.passContext?.tariff.name ?? record.titulo
                  const titleAnchorKey = fare?.passContext?.purchaseRecordKey
                  const canNavigateToAnchor =
                    Boolean(titleAnchorKey && titleAnchorKey !== rowKey && onNavigateToRecharge)
                  const handleTitleClick = canNavigateToAnchor
                    ? () => onNavigateToRecharge?.(titleAnchorKey, { targetView: 'table' })
                    : null
                  const isHighlighted = highlightedAnchorId === tableRowAnchorId
                  return (
                    <tr
                      key={rowKey}
                      id={tableRowAnchorId}
                      className={`border-t border-slate-100 transition ${
                        isHighlighted ? 'bg-amber-50 ring-2 ring-amber-200' : ''
                      }`}
                    >
                      <td className="px-4 py-2 text-slate-600">{formatDateLong(record.fecha)}</td>
                      <td className="px-4 py-2 text-slate-600">{record.hora}</td>
                      <td className="px-4 py-2 text-slate-600">
                        <div className="flex items-center gap-2">
                          {transactionDisplay.icon && (
                            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-slate-600">
                              <transactionDisplay.icon className="h-3.5 w-3.5" aria-hidden />
                              <span className="sr-only">Tipo de validación</span>
                            </span>
                          )}
                          <span className="font-semibold text-slate-900">{transactionDisplay.label}</span>
                        </div>
                      </td>
                      <td className="px-4 py-2 text-slate-600">
                        {operatorBrand ? (
                          <span className="inline-flex items-center" aria-label={operatorBrand.label}>
                            <Image
                              src={operatorBrand.icon}
                              alt=""
                              width={28}
                              height={28}
                              aria-hidden
                              className="h-7 w-auto max-w-[32px] object-contain"
                            />
                            {operatorSuffixLabel ? (
                              <span className="text-sm font-semibold text-slate-600">{operatorSuffixLabel}</span>
                            ) : (
                              <span className="sr-only">{operatorBrand.label}</span>
                            )}
                          </span>
                        ) : OperatorFallbackIcon ? (
                          <span className="inline-flex items-center gap-2">
                            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-slate-600">
                              <OperatorFallbackIcon className="h-3.5 w-3.5" aria-hidden />
                            </span>
                            <span>{operatorLabel}</span>
                          </span>
                        ) : (
                          <span>{operatorLabel}</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-slate-600">
                        {bizkaibusLineInfo ? (
                          <span className="inline-flex items-center gap-2">
                            <span
                              className="rounded-full px-2 py-0.5 text-xs font-semibold text-slate-900"
                              title={bizkaibusLineInfo.description}
                              style={{ backgroundColor: '#9FCD5F' }}
                            >
                              {bizkaibusLineInfo.code}
                            </span>
                            <span>{equipmentLabel}</span>
                          </span>
                        ) : (
                          <span>{equipmentLabel}</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-slate-600">
                        <div className="flex flex-col gap-0.5">
                          {handleTitleClick ? (
                            <button
                              type="button"
                              onClick={handleTitleClick}
                              className="text-left font-semibold text-slate-900 underline-offset-2 hover:text-slate-900 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2"
                            >
                              {titlePrimary}
                            </button>
                          ) : (
                            <span className="font-semibold text-slate-900">{titlePrimary}</span>
                          )}
                          {daysLabel && <span className="text-xs text-slate-500">{daysLabel}</span>}
                        </div>
                      </td>
                      <td className="px-4 py-2 text-slate-800">{amountDisplay}</td>
                      <td className="px-4 py-2 text-slate-800">
                        {isTitlePurchase ? <span className="text-slate-400">—</span> : formatAmount(record.saldo)}
                      </td>
                    </tr>
                  )
                })}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function JourneyCards({
  journeys,
  fareInsights,
  onNavigateToRecharge,
  highlightedAnchorId,
  resolveBizkaibusLine,
  groupingMode,
  onGroupingModeChange,
}: {
  journeys: JourneyBlock[]
  fareInsights: FareInsightsMap
  onNavigateToRecharge?: NavigateToRechargeHandler
  highlightedAnchorId?: string | null
  resolveBizkaibusLine?: (stopName?: string | null) => BizkaibusLineMatch | null
  groupingMode: GroupingMode
  onGroupingModeChange: (mode: GroupingMode) => void
}) {
  const visibleJourneys = journeys.filter((journey) => journey.kind !== 'otros')
  const journeyYearGroups = useMemo(() => {
    type DayAccumulator = { key: string; label: string; journeys: JourneyBlock[] }
    type MonthAccumulator = {
      key: string
      label: string
      dayOrder: string[]
      dayMap: Map<string, DayAccumulator>
    }
    type YearAccumulator = {
      key: string
      label: string
      monthOrder: string[]
      monthMap: Map<string, MonthAccumulator>
    }
    const years = new Map<string, YearAccumulator>()
    const yearOrder: string[] = []
    visibleJourneys.forEach((journey) => {
      const startDate = getRecordDate(journey.start)
      const yearKey = getYearKey(startDate)
      if (!years.has(yearKey)) {
        years.set(yearKey, {
          key: yearKey,
          label: formatYearLabel(startDate),
          monthOrder: [],
          monthMap: new Map(),
        })
        yearOrder.push(yearKey)
      }
      const yearGroup = years.get(yearKey)!
      const monthKey = getMonthKey(startDate)
      if (!yearGroup.monthMap.has(monthKey)) {
        yearGroup.monthMap.set(monthKey, {
          key: monthKey,
          label: formatMonthLabel(startDate),
          dayOrder: [],
          dayMap: new Map(),
        })
        yearGroup.monthOrder.push(monthKey)
      }
      const monthGroup = yearGroup.monthMap.get(monthKey)!
      const dayKey = getDayKey(startDate)
      if (!monthGroup.dayMap.has(dayKey)) {
        monthGroup.dayMap.set(dayKey, {
          key: dayKey,
          label: formatDayLabel(startDate),
          journeys: [],
        })
        monthGroup.dayOrder.push(dayKey)
      }
      monthGroup.dayMap.get(dayKey)!.journeys.push(journey)
    })
    return yearOrder.map((yearKey) => {
      const yearGroup = years.get(yearKey)!
      const monthGroups = yearGroup.monthOrder.map((monthKey) => {
        const monthGroup = yearGroup.monthMap.get(monthKey)!
        const dayGroups = monthGroup.dayOrder.map((dayKey) => {
          const dayGroup = monthGroup.dayMap.get(dayKey)!
          const stats = computeJourneyStats(dayGroup.journeys, fareInsights)
          return { ...dayGroup, stats }
        })
        const monthStats = sumJourneyStats(dayGroups.map((day) => day.stats))
        return {
          key: monthGroup.key,
          label: monthGroup.label,
          dayGroups,
          stats: monthStats,
        }
      })
      const yearStats = sumJourneyStats(monthGroups.map((month) => month.stats))
      return {
        key: yearGroup.key,
        label: yearGroup.label,
        monthGroups,
        stats: yearStats,
      }
    })
  }, [visibleJourneys, fareInsights])

  const journeyMonthGroups = useMemo<JourneyMonthGroupWithYear[]>(() => {
    return journeyYearGroups.flatMap((year) =>
      year.monthGroups.map((month) => ({
        ...month,
        parentYear: {
          key: year.key,
          label: year.label,
        },
      })),
    )
  }, [journeyYearGroups])

  const [expandedYears, setExpandedYears] = useState<Record<string, boolean>>({})
  const [expandedMonths, setExpandedMonths] = useState<Record<string, boolean>>({})
  const [expandedDays, setExpandedDays] = useState<Record<string, boolean>>({})

  useEffect(() => {
    setExpandedYears((prev) => {
      const next: Record<string, boolean> = {}
      journeyYearGroups.forEach((year) => {
        const wasSet = Object.prototype.hasOwnProperty.call(prev, year.key)
        next[year.key] = wasSet ? prev[year.key] : true
      })
      return next
    })
  }, [journeyYearGroups])

  useEffect(() => {
    setExpandedMonths((prev) => {
      const next: Record<string, boolean> = {}
      journeyYearGroups.forEach((year) => {
        year.monthGroups.forEach((month) => {
          const wasSet = Object.prototype.hasOwnProperty.call(prev, month.key)
          next[month.key] = wasSet ? prev[month.key] : true
        })
      })
      return next
    })
  }, [journeyYearGroups])

  useEffect(() => {
    setExpandedDays((prev) => {
      const next: Record<string, boolean> = {}
      journeyYearGroups.forEach((year) => {
        year.monthGroups.forEach((month) => {
          month.dayGroups.forEach((day) => {
            const wasSet = Object.prototype.hasOwnProperty.call(prev, day.key)
            next[day.key] = wasSet ? prev[day.key] : true
          })
        })
      })
      return next
    })
  }, [journeyYearGroups])

  useEffect(() => {
    if (!highlightedAnchorId) {
      return
    }
    let targetYearKey: string | null = null
    let targetMonthKey: string | null = null
    let targetDayKey: string | null = null
    journeyYearGroups.forEach((year) => {
      year.monthGroups.forEach((month) => {
        month.dayGroups.forEach((day) => {
          if (day.journeys.some((journey) => getRecargaAnchorId(journey) === highlightedAnchorId)) {
            targetYearKey = year.key
            targetMonthKey = month.key
            targetDayKey = day.key
          }
        })
      })
    })
    if (!targetYearKey) {
      return
    }
    setExpandedYears((prev) => ({ ...prev, [targetYearKey as string]: true }))
    if (targetMonthKey) {
      setExpandedMonths((prev) => ({ ...prev, [targetMonthKey as string]: true }))
    }
    if (targetDayKey) {
      setExpandedDays((prev) => ({ ...prev, [targetDayKey as string]: true }))
    }
  }, [highlightedAnchorId, journeyYearGroups])

  useEffect(() => {
    if (!highlightedAnchorId) {
      return
    }
    const element = document.getElementById(highlightedAnchorId)
    if (!element) {
      return
    }
    const isVisible = journeyYearGroups.some((year) => {
      const yearOpen = expandedYears[year.key] ?? true
      if (!yearOpen) {
        return false
      }
      return year.monthGroups.some((month) => {
        const monthOpen = expandedMonths[month.key] ?? true
        if (!monthOpen) {
          return false
        }
        return month.dayGroups.some((day) => {
          if (!day.journeys.some((journey) => getRecargaAnchorId(journey) === highlightedAnchorId)) {
            return false
          }
          const dayOpen = expandedDays[day.key] ?? true
          return dayOpen
        })
      })
    })
    if (!isVisible) {
      return
    }
    const timer = window.setTimeout(() => {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 150)
    return () => window.clearTimeout(timer)
  }, [highlightedAnchorId, journeyYearGroups, expandedYears, expandedMonths, expandedDays])

  const renderJourneyCard = (journey: JourneyBlock) => {
    const operatorLabel = normalizeOperatorLabel(journey.start.operador)
    const operatorBrand = getOperatorBrand(journey.start.operador)
    const endOperatorBrand = journey.end ? getOperatorBrand(journey.end.operador) : null
    const operatorTitle = operatorBrand ? operatorBrand.label : operatorLabel
    const operatorIcon = operatorBrand?.icon ?? null
    const bizkaibusLineInfo =
      operatorBrand?.label === 'Bizkaibus' ? resolveBizkaibusLine?.(journey.start.equipo) : null
    const endBizkaibusLineInfo =
      journey.end && endOperatorBrand?.label === 'Bizkaibus'
        ? resolveBizkaibusLine?.(journey.end.equipo)
        : null
    const isSingleTravel = journey.kind === 'viaje-unico'
    const isRecarga = journey.kind === 'recarga'
    const startStopName = journey.start.equipo?.trim() || operatorTitle
    const endStopName = journey.end?.equipo?.trim() || startStopName
    const recargaLugar = startStopName
    const startFare = fareInsights.get(getRecordKey(journey.start))
    const isTitleRecharge = startFare?.usageKind === 'title-recharge'
    const isBarikNfcRecarga = isRecarga && normalizeStopName(recargaLugar) === 'barik nfc'
    const recargaAnchorId = getRecargaAnchorId(journey)
    const isSameStopJourney =
      !isRecarga &&
      !isSingleTravel &&
      journey.end !== null &&
      normalizeStopName(startStopName) === normalizeStopName(endStopName)
    const hideOperatorForRecarga = isBarikNfcRecarga
    const recargaDescriptor = isRecarga
      ? isTitleRecharge
        ? 'Compra de título'
        : 'Recarga de monedero'
      : null
    const isHighlighted = recargaAnchorId ? highlightedAnchorId === recargaAnchorId : false
    const totalCost = journey.records.reduce((sum, record) => sum + (record.importe ?? 0), 0)
    const recargaLugarIcon = isBarikNfcRecarga ? Smartphone : MapPin
    const recargaAmountDisplay = isRecarga && !isTitleRecharge ? formatSignedAmount(journey.start.importe, true) : null
    const startHelper = buildJourneyHelper(journey.start, fareInsights)
    const endHelper = journey.end ? buildJourneyHelper(journey.end, fareInsights) : '—'
    const planContext = startFare?.passContext
    const limitedContext = startFare?.limitedContext
    const isUnlimitedPlan = planContext?.kind === 'unlimited-pass'
    const isLimitedPlan = planContext?.kind === 'limited-pass'
    const pricePerTrip =
      planContext?.kind === 'limited-pass' && planContext.totalTrips
        ? planContext.purchaseAmount / planContext.totalTrips
        : null
    const aggregatedSavings = journey.records.reduce((sum, record) => {
      const insight = fareInsights.get(getRecordKey(record))
      if (typeof insight?.savingsAmount === 'number') {
        return sum + Math.max(0, insight.savingsAmount)
      }
      return sum
    }, 0)
    const savingsValue = aggregatedSavings > 0 ? aggregatedSavings : null
    const passStatusHelper = buildPassStatusHelper(planContext, startFare?.daysRemaining, limitedContext)
    const walletBalanceHelper = buildWalletBalanceHelper(journey.start.saldo)
    const headingOnClick =
      !isRecarga && planContext?.purchaseRecordKey && onNavigateToRecharge
        ? () => onNavigateToRecharge(planContext.purchaseRecordKey)
        : undefined

    const recargaAmountNode = (() => {
      if (!isRecarga) {
        return formatAmount(journey.start.importe)
      }
      if (isTitleRecharge) {
        const absoluteValue = typeof journey.start.importe === 'number' ? Math.abs(journey.start.importe) : null
        return <span className="text-slate-500">{absoluteValue !== null ? formatAmount(absoluteValue) : '—'}</span>
      }
      if (recargaAmountDisplay) {
        return <span className={recargaAmountDisplay.className}>{recargaAmountDisplay.text}</span>
      }
      return formatAmount(journey.start.importe)
    })()

    let costLabel = 'Coste total'
    let costValue: ReactNode = (() => {
      const totalCostDisplay = formatSignedAmount(totalCost, false)
      return <span className={totalCostDisplay.className}>{totalCostDisplay.text}</span>
    })()
    let costHelper: ReactNode | null = null

    if (!isRecarga && planContext && (isUnlimitedPlan || isLimitedPlan)) {
      costLabel = planContext.kind === 'limited-pass' ? 'Viajes restantes' : 'Días de cobertura'
      costValue = passStatusHelper ?? planContext.tariff.name
      const savingsHelper = savingsValue !== null ? `Ahorro títulos ${formatAmount(savingsValue)}` : null
      costHelper = savingsHelper ?? (passStatusHelper ? null : 'Título activo')
    } else if (!isRecarga && !planContext && walletBalanceHelper) {
      costHelper = walletBalanceHelper
    }

    const renderBizkaibusStop = (stopLabel: ReactNode, lineInfo: BizkaibusLineMatch | null | undefined) => {
      if (!lineInfo) {
        return stopLabel
      }
      return (
        <span className="inline-flex items-center gap-2">
          <span
            className="rounded-full px-2 py-0.5 text-[11px] font-semibold text-slate-900"
            title={lineInfo.description}
            style={{ backgroundColor: '#9FCD5F' }}
          >
            {lineInfo.code}
          </span>
          <span>{stopLabel}</span>
        </span>
      )
    }

    const startStopDisplay = renderBizkaibusStop(startStopName, bizkaibusLineInfo)
    const recargaLugarDisplay = renderBizkaibusStop(recargaLugar, bizkaibusLineInfo)
    const endStopDisplay = renderBizkaibusStop(journey.end?.equipo ?? 'Sin salida', endBizkaibusLineInfo)

    return (
      <article
        key={journey.id}
        id={recargaAnchorId ?? undefined}
        className={`space-y-2 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600 transition ${
          isHighlighted ? 'animate-pulse ring-2 ring-amber-400 shadow-amber-200' : ''
        }`}
      >
        <header className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
          {isRecarga && (
            <span className="rounded-full bg-white/70 px-2.5 py-0.5 text-[10px]">
              {isTitleRecharge ? 'Compra título' : 'Recarga'}
            </span>
          )}
          <span className="normal-case tracking-normal text-slate-600">{formatDateLong(journey.start.fecha)}</span>
          {recargaDescriptor && (
            <span className="normal-case tracking-normal text-slate-400">{recargaDescriptor}</span>
          )}
          {!isRecarga && journey.durationMinutes !== null && journey.durationMinutes > 0 && (
            <span className="normal-case tracking-normal text-slate-400">
              {formatDuration(journey.durationMinutes)}
            </span>
          )}
          {!hideOperatorForRecarga && (
            <span className="ml-auto inline-flex items-center gap-1.5 normal-case tracking-normal text-slate-500">
              {operatorIcon && (
                <Image
                  src={operatorIcon}
                  alt=""
                  width={18}
                  height={18}
                  aria-hidden
                  className="h-5 w-auto max-w-[24px] object-contain"
                />
              )}
              <span>{operatorTitle}</span>
            </span>
          )}
        </header>

        {isRecarga ? (
          <div className={`grid gap-2 ${isTitleRecharge ? 'sm:grid-cols-2 md:grid-cols-3' : 'sm:grid-cols-3'}`}>
            <CardStat icon={recargaLugarIcon} label="Lugar" value={recargaLugarDisplay} />

            {isTitleRecharge ? (
              planContext?.kind === 'limited-pass' ? (
                <CardStat
                  icon={Clock3}
                  label="Viajes incluidos"
                  value={
                    typeof planContext.totalTrips === 'number'
                      ? `${planContext.totalTrips} viajes`
                      : '—'
                  }
                  helper={buildLimitedPurchaseHelper(planContext, pricePerTrip)}
                />
              ) : (
                <CardStat
                  icon={Clock3}
                  label="Cobertura"
                  value="Viajes ilimitados"
                  helper={buildPassValidityHelper(planContext)}
                />
              )
            ) : (
              <CardStat
                icon={CreditCard}
                label="Saldo tras recarga"
                value={formatAmount(journey.start.saldo)}
                heading="Saldo tras recarga"
              />
            )}
            <CardStat
              icon={Wallet}
              label={isTitleRecharge ? 'Precio del título' : 'Importe'}
              value={recargaAmountNode}
              heading={isTitleRecharge ? planContext?.tariff.name ?? journey.start.titulo : journey.start.titulo}
              helper={isTitleRecharge ? null : undefined}
            />
          </div>
        ) : (
          <div
            className={`grid gap-2 ${
              isSingleTravel || isSameStopJourney ? 'sm:grid-cols-2' : 'sm:grid-cols-3'
            }`}
          >
            <CardStat
              icon={ArrowUpRight}
              label={isSingleTravel || isSameStopJourney ? 'Punto' : 'Salida'}
              value={startStopDisplay}
              showIcon={!isSameStopJourney}
              helper={
                isSameStopJourney && journey.end
                  ? buildSameStopHelper(journey.start, journey.end, fareInsights)
                  : startHelper
              }
            />
            {!isSingleTravel && !isSameStopJourney && (
              <CardStat
                icon={ArrowDownLeft}
                label="Llegada"
                value={endStopDisplay}
                helper={endHelper}
              />
            )}
            <CardStat
              icon={Wallet}
              label={costLabel}
              value={costValue}
              helper={costHelper}
              heading={planContext ? planContext.tariff.name : journey.start.titulo}
              headingOnClick={headingOnClick}
            />
          </div>
        )}
      </article>
    )
  }

  const toggleYear = (key: string) => {
    setExpandedYears((prev) => ({
      ...prev,
      [key]: !(prev[key] ?? true),
    }))
  }

  const toggleMonth = (key: string) => {
    setExpandedMonths((prev) => ({
      ...prev,
      [key]: !(prev[key] ?? true),
    }))
  }

  const toggleDay = (key: string) => {
    setExpandedDays((prev) => ({
      ...prev,
      [key]: !(prev[key] ?? true),
    }))
  }

  const handleExpandAll = () => {
    if (groupingMode === 'none') {
      return
    }
    const allYears = Object.fromEntries(journeyYearGroups.map((year) => [year.key, true]))
    const allMonths = Object.fromEntries(
      journeyYearGroups.flatMap((year) => year.monthGroups.map((month) => [month.key, true])),
    )
    const allDays = Object.fromEntries(
      journeyYearGroups.flatMap((year) =>
        year.monthGroups.flatMap((month) => month.dayGroups.map((day) => [day.key, true])),
      ),
    )
    setExpandedYears(allYears)
    setExpandedMonths(allMonths)
    setExpandedDays(allDays)
  }

  const handleCollapseAll = () => {
    if (groupingMode === 'none') {
      return
    }
    const allYears = Object.fromEntries(journeyYearGroups.map((year) => [year.key, false]))
    const allMonths = Object.fromEntries(
      journeyYearGroups.flatMap((year) => year.monthGroups.map((month) => [month.key, false])),
    )
    const allDays = Object.fromEntries(
      journeyYearGroups.flatMap((year) =>
        year.monthGroups.flatMap((month) => month.dayGroups.map((day) => [day.key, false])),
      ),
    )
    setExpandedYears(allYears)
    setExpandedMonths(allMonths)
    setExpandedDays(allDays)
  }

  if (!journeyYearGroups.length) {
    return (
      <p className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500">
        No hay viajes ni recargas que mostrar con estos filtros.
      </p>
    )
  }

  const renderGroupedContent = () => {
    if (groupingMode === 'none') {
      return (
        <div className="space-y-3">
          {visibleJourneys.map((journey) => (
            <div key={journey.id}>{renderJourneyCard(journey)}</div>
          ))}
        </div>
      )
    }

    if (groupingMode === 'month') {
      return journeyMonthGroups.map((month) => {
        const isMonthExpanded = expandedMonths[month.key] ?? true
        return (
          <section key={month.key} className="space-y-3" aria-label={`${month.label} (${month.parentYear.label})`}>
            <button
              type="button"
              onClick={() => toggleMonth(month.key)}
              className="flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left shadow-sm"
              aria-expanded={isMonthExpanded}
            >
              <div className="flex flex-col text-slate-700">
                <span className="text-base font-semibold leading-tight">{month.label}</span>
                <span className="text-xs text-slate-500">{month.parentYear.label}</span>
                <span className="text-xs text-slate-500">{formatStatsCountSummary(month.stats)}</span>
                <span className="text-xs text-slate-400">{formatStatsAmountSummary(month.stats)}</span>
                {formatStatsDurationSummary(month.stats) && (
                  <span className="text-xs text-slate-400">{formatStatsDurationSummary(month.stats)}</span>
                )}
              </div>
              <ChevronDown
                className={`h-4 w-4 text-slate-500 transition-transform ${isMonthExpanded ? 'rotate-0' : '-rotate-90'}`}
                aria-hidden
              />
            </button>
            <div
              className={`space-y-2 transition-all duration-300 ease-in-out ${
                isMonthExpanded ? 'opacity-100' : 'max-h-0 overflow-hidden opacity-0'
              }`}
              aria-hidden={!isMonthExpanded}
            >
              {month.dayGroups.map((day) => {
                const isDayExpanded = expandedDays[day.key] ?? true
                return (
                  <div key={day.key} className="space-y-2">
                    <button
                      type="button"
                      onClick={() => toggleDay(day.key)}
                      className="flex w-full items-center justify-between rounded-2xl border border-slate-100 bg-slate-50 px-3 py-2 text-left"
                      aria-expanded={isDayExpanded}
                    >
                      <div className="flex flex-col text-slate-600">
                        <span className="text-sm font-semibold">{day.label}</span>
                        <span className="text-xs text-slate-500">{formatStatsCountSummary(day.stats)}</span>
                        <span className="text-xs text-slate-400">{formatStatsAmountSummary(day.stats)}</span>
                        {formatStatsDurationSummary(day.stats) && (
                          <span className="text-xs text-slate-400">{formatStatsDurationSummary(day.stats)}</span>
                        )}
                      </div>
                      <div className="text-right text-[11px] font-semibold text-slate-500">
                        <span>{day.journeys.length} mov.</span>
                        <ChevronDown
                          className={`ml-2 inline-block h-3.5 w-3.5 text-slate-400 transition-transform ${
                            isDayExpanded ? 'rotate-0' : '-rotate-90'
                          }`}
                          aria-hidden
                        />
                      </div>
                    </button>
                    <div
                      className={`border-l border-slate-200 pl-3 transition-all duration-300 ease-in-out ${
                        isDayExpanded ? 'space-y-2 opacity-100' : 'max-h-0 overflow-hidden opacity-0'
                      }`}
                      aria-hidden={!isDayExpanded}
                    >
                      {day.journeys.map((journey) => renderJourneyCard(journey))}
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        )
      })
    }

    return journeyYearGroups.map((year) => {
      const isYearExpanded = expandedYears[year.key] ?? true
      const yearDurationSummary = formatStatsDurationSummary(year.stats)
      return (
        <section key={year.key} className="space-y-4" aria-label={`Año ${year.label}`}>
          <button
            type="button"
            onClick={() => toggleYear(year.key)}
            className="flex w-full items-center justify-between rounded-3xl border border-slate-300 bg-white px-5 py-3 text-left shadow-sm"
            aria-expanded={isYearExpanded}
          >
            <div className="flex flex-col text-slate-800">
              <span className="text-lg font-semibold leading-tight">{year.label}</span>
              <span className="text-xs text-slate-500">{formatStatsCountSummary(year.stats)}</span>
              <span className="text-xs text-slate-400">{formatStatsAmountSummary(year.stats)}</span>
              {yearDurationSummary && <span className="text-xs text-slate-400">{yearDurationSummary}</span>}
            </div>
            <ChevronDown
              className={`h-5 w-5 text-slate-500 transition-transform ${isYearExpanded ? 'rotate-0' : '-rotate-90'}`}
              aria-hidden
            />
          </button>
          <div
            className={`space-y-4 transition-all duration-300 ease-in-out ${
              isYearExpanded ? 'opacity-100' : 'max-h-0 overflow-hidden opacity-0'
            }`}
            aria-hidden={!isYearExpanded}
          >
            {year.monthGroups.map((month) => {
              const isMonthExpanded = expandedMonths[month.key] ?? true
              const monthDurationSummary = formatStatsDurationSummary(month.stats)
              return (
                <section key={month.key} className="space-y-3" aria-label={month.label}>
                  <button
                    type="button"
                    onClick={() => toggleMonth(month.key)}
                    className="flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left shadow-sm"
                    aria-expanded={isMonthExpanded}
                  >
                    <div className="flex flex-col text-slate-700">
                      <span className="text-base font-semibold leading-tight">{month.label}</span>
                      <span className="text-xs text-slate-500">{formatStatsCountSummary(month.stats)}</span>
                      <span className="text-xs text-slate-400">{formatStatsAmountSummary(month.stats)}</span>
                      {monthDurationSummary && <span className="text-xs text-slate-400">{monthDurationSummary}</span>}
                    </div>
                    <ChevronDown
                      className={`h-4 w-4 text-slate-500 transition-transform ${isMonthExpanded ? 'rotate-0' : '-rotate-90'}`}
                      aria-hidden
                    />
                  </button>
                  <div
                    className={`space-y-2 transition-all duration-300 ease-in-out ${
                      isMonthExpanded ? 'opacity-100' : 'max-h-0 overflow-hidden opacity-0'
                    }`}
                    aria-hidden={!isMonthExpanded}
                  >
                    {month.dayGroups.map((day) => {
                      const isDayExpanded = expandedDays[day.key] ?? true
                      const dayDurationSummary = formatStatsDurationSummary(day.stats)
                      return (
                        <div key={day.key} className="space-y-2">
                          <button
                            type="button"
                            onClick={() => toggleDay(day.key)}
                            className="flex w-full items-center justify-between rounded-2xl border border-slate-100 bg-slate-50 px-3 py-2 text-left"
                            aria-expanded={isDayExpanded}
                          >
                            <div className="flex flex-col text-slate-600">
                              <span className="text-sm font-semibold">{day.label}</span>
                              <span className="text-xs text-slate-500">{formatStatsCountSummary(day.stats)}</span>
                              <span className="text-xs text-slate-400">{formatStatsAmountSummary(day.stats)}</span>
                              {dayDurationSummary && <span className="text-xs text-slate-400">{dayDurationSummary}</span>}
                            </div>
                            <div className="text-right text-[11px] font-semibold text-slate-500">
                              <span>{day.journeys.length} mov.</span>
                              <ChevronDown
                                className={`ml-2 inline-block h-3.5 w-3.5 text-slate-400 transition-transform ${
                                  isDayExpanded ? 'rotate-0' : '-rotate-90'
                                }`}
                                aria-hidden
                              />
                            </div>
                          </button>
                          <div
                            className={`border-l border-slate-200 pl-3 transition-all duration-300 ease-in-out ${
                              isDayExpanded ? 'space-y-2 opacity-100' : 'max-h-0 overflow-hidden opacity-0'
                            }`}
                            aria-hidden={!isDayExpanded}
                          >
                            {day.journeys.map((journey) => renderJourneyCard(journey))}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </section>
              )
            })}
          </div>
        </section>
      )
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-end gap-2">
        {groupingMode !== 'none' && (
          <>
            <button
              type="button"
              onClick={handleExpandAll}
              className="rounded-full border border-slate-200 px-4 py-1 text-xs font-semibold text-slate-600 hover:text-slate-900"
            >
              Expandir todo
            </button>
            <button
              type="button"
              onClick={handleCollapseAll}
              className="rounded-full border border-slate-200 px-4 py-1 text-xs font-semibold text-slate-600 hover:text-slate-900"
            >
              Ocultar todo
            </button>
          </>
        )}
        <select
          value={groupingMode}
          onChange={(event) => onGroupingModeChange(event.target.value as GroupingMode)}
          className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600"
        >
          {GROUPING_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      {renderGroupedContent()}
    </div>
  )
}

type CardStatProps = {
  icon: typeof ArrowUpRight
  label: string
  value: ReactNode
  helper?: ReactNode | null
  heading?: ReactNode | null
  showIcon?: boolean
  headingOnClick?: (() => void) | null
}

function CardStat({
  icon: Icon,
  label,
  value,
  helper,
  heading,
  showIcon = true,
  headingOnClick,
}: CardStatProps) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/70 bg-white p-2.5 text-sm text-slate-600">
      {showIcon && (
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-600">
          <Icon className="h-4 w-4" aria-hidden />
          <span className="sr-only">{label}</span>
        </div>
      )}
      <div className="flex flex-col">
        {heading &&
          (headingOnClick ? (
            <button
              type="button"
              onClick={headingOnClick}
              className="text-left text-xs font-semibold text-slate-500 underline-offset-2 hover:text-slate-900 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2"
            >
              {heading}
            </button>
          ) : (
            <p className="text-xs font-semibold text-slate-500">{heading}</p>
          ))}
        <p className="text-base font-semibold text-slate-900">{value}</p>
        {helper && <p className="text-xs text-slate-400">{helper}</p>}
      </div>
    </div>
  )
}

function getRecargaAnchorId(journey: JourneyBlock): string | null {
  if (journey.kind !== 'recarga') {
    return null
  }
  return `recarga-${getRecordKey(journey.start)}`
}

function getTableRowAnchorId(record: TransactionRecord): string {
  return getTableRowAnchorIdFromKey(getRecordKey(record))
}

function getTableRowAnchorIdFromKey(recordKey: string): string {
  return `table-${recordKey}`
}

function buildAmountDisplay(record: TransactionRecord, fareInsights: FareInsightsMap): ReactNode {
  const insight = fareInsights.get(getRecordKey(record))
  const renderSigned = (isPositive: boolean) => {
    const display = formatSignedAmount(record.importe, isPositive)
    return <span className={`font-semibold ${display.className}`}>{display.text}</span>
  }

  if (!insight) {
    return renderSigned(isRecargaTransaction(record))
  }

  if (insight.usageKind === 'wallet-recharge') {
    return renderSigned(true)
  }

  if (insight.usageKind === 'title-recharge') {
    const absoluteValue = typeof record.importe === 'number' ? Math.abs(record.importe) : null
    const display = absoluteValue !== null ? formatAmount(absoluteValue) : '—'
    return <span className="font-semibold text-slate-500">{display}</span>
  }

  const passContext = insight.passContext

  if (passContext && insight.usageKind === 'ride') {
    if (passContext.kind === 'limited-pass') {
      const tripsLabel = formatTripsRatioLabel(
        insight.limitedContext?.remainingTrips,
        insight.limitedContext?.totalTrips,
      )
      const priceSubtitle = buildRidePriceSubtitle(record, insight)
      if (tripsLabel) {
        return (
          <span className="flex flex-col leading-tight">
            <span className="font-semibold text-slate-900">{tripsLabel}</span>
            {priceSubtitle && <span className="text-xs text-slate-500">{priceSubtitle}</span>}
          </span>
        )
      }
    }
    if (passContext.kind === 'unlimited-pass') {
      const priceSubtitle = buildRidePriceSubtitle(record, insight)
      return (
        <span className="flex flex-col leading-tight">
          <span className="font-semibold text-slate-900">Ilimitado</span>
          {priceSubtitle && <span className="text-xs text-slate-500">{priceSubtitle}</span>}
        </span>
      )
    }
    const savingsValue = typeof insight.savingsAmount === 'number' ? insight.savingsAmount : null
    const fallbackAmount = typeof record?.importe === 'number' ? Math.abs(record.importe) : null
    const displayValue = savingsValue ?? fallbackAmount
    if (typeof displayValue === 'number') {
      return <span className="font-semibold text-slate-900">{formatAmount(displayValue)}</span>
    }
    return renderSigned(false)
  }

  return renderSigned(isRecargaTransaction(record))
}

type TransactionDisplay = {
  label: string
  detail?: string
  icon?: LucideIcon | null
}

function buildTransactionLabel(record: TransactionRecord, fareInsights: FareInsightsMap): TransactionDisplay {
  const rawTransaccion = record.transaccion?.trim() ?? ''
  const normalizedTransaccion = rawTransaccion.toLowerCase()
  const fallbackLabel = rawTransaccion || 'Movimiento'

  if (isRecargaTransaction(record)) {
    const insight = fareInsights.get(getRecordKey(record))
    const label =
      insight?.usageKind === 'title-recharge' || isTitleRechargeRecord(record)
        ? 'Compra de título'
        : 'Recarga de monedero'
    const detail = record.titulo?.trim() || rawTransaccion || undefined
    return { label, detail }
  }

  if (isSingleValidation(record)) {
    return {
      label: 'Validación única',
      detail: getTransactionDetail(rawTransaccion, 'Validación única'),
    }
  }

  if (isEntryValidation(record)) {
    return {
      label: 'Entrada validada',
      detail: getTransactionDetail(rawTransaccion, 'Entrada validada'),
      icon: ArrowUpRight,
    }
  }

  if (isExitValidation(record)) {
    return {
      label: 'Salida validada',
      detail: getTransactionDetail(rawTransaccion, 'Salida validada'),
      icon: ArrowDownLeft,
    }
  }

  if (fallbackLabel !== 'Movimiento') {
    const pretty = prettifyTransactionText(fallbackLabel)
    const detail = normalizedTransaccion === pretty.toLowerCase() ? undefined : rawTransaccion || undefined
    return { label: pretty, detail }
  }

  return { label: 'Movimiento' }
}

function getTransactionDetail(original: string, label: string): string | undefined {
  if (!original) {
    return undefined
  }
  return original.toLowerCase() === label.toLowerCase() ? undefined : original
}

function prettifyTransactionText(value: string): string {
  if (!value) {
    return 'Movimiento'
  }
  const lower = value.toLowerCase()
  return lower.charAt(0).toUpperCase() + lower.slice(1)
}

function buildJourneyHelper(record: TransactionRecord, fareInsights: FareInsightsMap): ReactNode {
  const baseTime = record.hora ?? '—'
  const insight = fareInsights.get(getRecordKey(record))
  const baseFareLabel = buildBaseFareLabel(insight, record)

  if (insight?.passContext) {
    return (
      <>
        {baseTime}
        {baseFareLabel && (
          <>
            {' '}
            · <span className="font-medium text-slate-500">{baseFareLabel}</span>
          </>
        )}
      </>
    )
  }

  const signed = formatSignedAmount(record.importe, false)
  return (
    <>
      {baseTime} · <span className={`font-medium ${signed.className}`}>{signed.text}</span>
    </>
  )
}

function buildSameStopHelper(
  start: TransactionRecord,
  end: TransactionRecord,
  fareInsights: FareInsightsMap,
): ReactNode {
  const entryTime = start.hora ?? '—'
  const exitTime = end.hora ?? '—'
  const insight = fareInsights.get(getRecordKey(start))
  const baseFareLabel = insight?.passContext ? buildBaseFareLabel(insight, start) : null
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <span className="inline-flex items-center gap-1">
        <ArrowUpRight className="h-3.5 w-3.5" aria-hidden /> Entrada {entryTime}
      </span>
      <span className="text-slate-400">·</span>
      <span className="inline-flex items-center gap-1">
        <ArrowDownLeft className="h-3.5 w-3.5" aria-hidden /> Salida {exitTime}
      </span>
      {baseFareLabel && (
        <span className="inline-flex items-center gap-1 text-slate-500">
          <span className="text-slate-400">·</span> {baseFareLabel}
        </span>
      )}
    </span>
  )
}

function buildPassValidityHelper(passContext?: PassSnapshot | null): ReactNode | null {
  if (!passContext?.expiresAt) {
    return null
  }
  return `Válido hasta ${formatDateValue(passContext.expiresAt)}`
}

function buildLimitedPurchaseHelper(passContext?: PassSnapshot | null, pricePerTrip?: number | null): ReactNode | null {
  if (!passContext) {
    return null
  }
  const validityLabel = buildPassValidityHelper(passContext)
  const priceLabel = typeof pricePerTrip === 'number' ? `Coste medio ${formatAmount(pricePerTrip)}` : null
  const parts = [validityLabel, priceLabel].filter(Boolean)
  return parts.length ? parts.join(' · ') : null
}

function buildPassStatusHelper(
  passContext?: PassSnapshot | null,
  daysRemaining?: number | null,
  limitedContext?: FareInsight['limitedContext'],
): ReactNode | null {
  if (!passContext) {
    return null
  }
  const parts: string[] = []
  const daysLabel = formatDaysRemainingLabel(daysRemaining)
  if (daysLabel) {
    parts.push(daysLabel)
  }
  if (passContext.kind === 'limited-pass') {
    const tripsLabel = formatTripsRemainingLabel(limitedContext?.remainingTrips, limitedContext?.totalTrips)
    if (tripsLabel) {
      parts.push(tripsLabel)
    }
  }
  return parts.length ? parts.join(' · ') : null
}

function formatDaysRemainingLabel(daysRemaining?: number | null): string | null {
  if (typeof daysRemaining !== 'number') {
    return null
  }
  if (daysRemaining <= 0) {
    return 'Caducó'
  }
  if (daysRemaining === 1) {
    return 'Queda 1 día'
  }
  return `Quedan ${daysRemaining} días`
}

function getOperatorFallbackIcon(value?: string | null): LucideIcon | null {
  if (!value) {
    return null
  }
  return value.trim().toLowerCase() === 'barik nfc' ? Smartphone : null
}

function formatTripsRemainingLabel(remaining?: number | null, total?: number | null): string | null {
  if (typeof remaining !== 'number') {
    return null
  }
  if (typeof total === 'number') {
    return `Quedan ${remaining}/${total} viajes`
  }
  return `Quedan ${remaining} viajes`
}

function formatTripsRatioLabel(remaining?: number | null, total?: number | null): string | null {
  if (typeof remaining !== 'number') {
    return null
  }
  if (typeof total === 'number' && total > 0) {
    return `${remaining}/${total} viajes`
  }
  return `${remaining} viajes`
}

function buildWalletBalanceHelper(balance?: number | null): string | null {
  if (typeof balance !== 'number' || Number.isNaN(balance)) {
    return null
  }
  return `Saldo actual ${formatAmount(balance)}`
}
