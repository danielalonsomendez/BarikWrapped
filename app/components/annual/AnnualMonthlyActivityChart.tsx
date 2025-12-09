'use client'

import dynamic from 'next/dynamic'
import { useMemo } from 'react'
import type { ApexOptions } from 'apexcharts'

const ApexChart = dynamic(() => import('react-apexcharts'), {
  ssr: false,
}) as unknown as typeof import('react-apexcharts')['default']

const integerFormatter = new Intl.NumberFormat('es-ES')

type MonthlyActivityPoint = {
  key: string
  label: string
  rides: number
  recharges: number
  spent?: number
}

type AnnualMonthlyActivityChartProps = {
  monthly: MonthlyActivityPoint[]
}

export function AnnualMonthlyActivityChart({ monthly }: AnnualMonthlyActivityChartProps) {
  const categories = useMemo(() => monthly.map((month) => month.label), [monthly])

  const series = useMemo(
    () => [
      {
        name: 'Viajes',
        data: monthly.map((month) => month.rides),
      },
      {
        name: 'Recargas',
        data: monthly.map((month) => month.recharges),
      },
    ],
    [monthly],
  )

  const options = useMemo<ApexOptions>(() => {
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
        categories,
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
            typeof value === 'number' && Number.isFinite(value)
              ? integerFormatter.format(Math.round(value))
              : '0',
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
  }, [categories])

  const hasData = monthly.length > 0

  return (
    <div className="mt-8 space-y-4">
      <div>
        <h3 className="text-lg font-semibold text-slate-900">Actividad mensual</h3>
      </div>
      {!hasData ? (
        <p className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
          Cargaremos aquí los meses en cuanto registres validaciones con fecha.
        </p>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <ApexChart options={options} series={series} type="bar" height={360} />
        </div>
      )}
    </div>
  )
}
