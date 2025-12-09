'use client'

import { useCallback, useMemo } from 'react'
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react'
import { formatAmount, formatDuration } from '../history/historyDataTransforms'

const integerFormatter = new Intl.NumberFormat('es-ES')
const decimalFormatter = new Intl.NumberFormat('es-ES', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
})

type YoYDirection = 'up' | 'down' | 'flat'

type YoYComparison = {
  direction: YoYDirection
  text: string
}

type MetricCard = {
  label: string
  value: string
  hint: string
  comparison: YoYComparison | null
}

type AnnualSummaryForInsights = {
  totalJourneys: number
  totalRecords: number
  totalSpent: number
  totalRecharges: number
  walletRecharges: number
  titlePurchases: number
  totalSavings: number
  travelMinutes: number
  averageTravelMinutesPerDay: number
  activeDays: number
}

type AnnualInsightsProps = {
  summary: AnnualSummaryForInsights
  previousYearSummary: AnnualSummaryForInsights | null
  previousYearKey: string | null
  variant?: 'default' | 'photo'
  className?: string
  photoColumns?: 1 | 2 | 3
  photoScale?: 'default' | 'compact'
}

export function AnnualInsights({
  summary,
  previousYearSummary,
  previousYearKey,
  variant = 'default',
  className,
  photoColumns = 2,
  photoScale = 'default',
}: AnnualInsightsProps) {
  const buildYoYComparison = useCallback(
    (
      current: number,
      previous: number | null | undefined,
      formatDelta: (value: number) => string,
    ): YoYComparison | null => {
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

  const photoColumnsClass = (() => {
    if (photoColumns === 1) {
      return 'grid-cols-1'
    }
    if (photoColumns === 3) {
      return 'grid-cols-3'
    }
    return 'grid-cols-2'
  })()

  const photoGapClass = photoScale === 'compact' ? 'gap-6' : 'gap-8'

  const containerClasses =
    variant === 'photo'
      ? `grid ${photoGapClass} ${photoColumnsClass}`
      : 'mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3'

  const cardClasses =
    variant === 'photo'
      ? `flex flex-col ${photoScale === 'compact' ? 'gap-2.5 rounded-3xl border border-white/15 bg-white/10 p-6 text-white shadow-lg backdrop-blur' : 'gap-3 rounded-3xl border border-white/15 bg-white/12 p-8 text-white shadow-xl backdrop-blur'}`
      : 'flex flex-col gap-1 rounded-2xl border border-slate-200 bg-slate-50 p-4 shadow-sm'

  const labelClasses =
    variant === 'photo'
      ? photoScale === 'compact'
        ? 'text-xs font-semibold uppercase tracking-[0.3em] text-slate-200'
        : 'text-lg font-semibold uppercase tracking-[0.32em] text-slate-200'
      : 'text-xs font-semibold uppercase tracking-[0.2em] text-slate-400'

  const valueClasses =
    variant === 'photo'
      ? photoScale === 'compact'
        ? 'text-4xl font-semibold text-white'
        : 'text-5xl font-semibold text-white'
      : 'text-3xl font-semibold text-slate-900'

  const hintClasses = variant === 'photo'
    ? photoScale === 'compact'
      ? 'text-sm text-slate-200/75'
      : 'text-xl text-slate-200/85'
    : 'text-xs text-slate-500'

  const comparisonColorForVariant = (direction: YoYDirection) => {
    if (variant === 'photo') {
      return direction === 'up'
        ? 'text-emerald-300'
        : direction === 'down'
          ? 'text-rose-300'
          : 'text-slate-200/80'
    }
    return direction === 'up'
      ? 'text-emerald-600'
      : direction === 'down'
        ? 'text-rose-600'
        : 'text-slate-500'
  }

  return (
    <div className={`${containerClasses}${className ? ` ${className}` : ''}`}>
      {metrics.map((metric) => {
        const comparison = metric.comparison
        const comparisonColor = comparison
          ? comparisonColorForVariant(comparison.direction)
          : variant === 'photo'
            ? 'text-slate-200/80'
            : 'text-slate-500'
        const ComparisonIcon = comparison
          ? comparison.direction === 'up'
            ? ArrowUpRight
            : comparison.direction === 'down'
              ? ArrowDownRight
              : Minus
          : null
        return (
          <div key={metric.label} className={cardClasses}>
            <span className={labelClasses}>{metric.label}</span>
            <span className={valueClasses}>{metric.value}</span>
            {comparison && ComparisonIcon && (
              <div
                className={`mt-2 flex items-center gap-1 ${
                  variant === 'photo' && photoScale !== 'compact' ? 'text-lg' : 'text-sm'
                } font-semibold ${comparisonColor}`}
              >
                <ComparisonIcon className={variant === 'photo' && photoScale !== 'compact' ? 'h-5 w-5' : 'h-4 w-4'} aria-hidden />
                <span>{comparison.text}</span>
              </div>
            )}
            <span className={hintClasses}>{metric.hint}</span>
          </div>
        )
      })}
    </div>
  )
}
