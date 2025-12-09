'use client'

import { fullDateFormatter } from '../../lib/dateFormatters'
import { formatDuration } from '../history/historyDataTransforms'

type OperatorDailySummary = {
  name: string
  count: number
  color: string | null
}

type CalendarCell = {
  id: string
  day: number
  date: Date
  trips: number
  recharges: number
  operators: OperatorDailySummary[]
  dominantOperator: OperatorDailySummary | null
  color: { r: number; g: number; b: number } | null
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

type AnnualActivityCalendarProps = {
  calendarMonths: CalendarMonth[]
}

const integerFormatter = new Intl.NumberFormat('es-ES')
const WEEKDAY_LABELS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'] as const
const DEFAULT_OPERATOR_COLOR = { r: 239, g: 68, b: 68 }

const rgbaString = (color: { r: number; g: number; b: number }, alpha: number): string => {
  const clamped = Math.max(0, Math.min(1, alpha))
  return `rgba(${color.r}, ${color.g}, ${color.b}, ${clamped.toFixed(3)})`
}

const hexToRgb = (hex: string): { r: number; g: number; b: number } | null => {
  const normalized = hex.replace(/^#/, '')
  if (normalized.length !== 6) {
    return null
  }
  const r = Number.parseInt(normalized.slice(0, 2), 16)
  const g = Number.parseInt(normalized.slice(2, 4), 16)
  const b = Number.parseInt(normalized.slice(4, 6), 16)
  if ([r, g, b].some((value) => Number.isNaN(value))) {
    return null
  }
  return { r, g, b }
}

export function AnnualActivityCalendar({ calendarMonths }: AnnualActivityCalendarProps) {
  return (
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
                                            backgroundColor: operator.color ?? 'rgba(239, 68, 68, 0.75)',
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
  )
}
