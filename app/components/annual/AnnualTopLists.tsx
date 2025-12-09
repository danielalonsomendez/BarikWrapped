'use client'

import Image from 'next/image'

const integerFormatter = new Intl.NumberFormat('es-ES')

export type TopStationCard = {
  key: string
  name: string
  operatorIcon: string | null
  operatorName: string | null
  lineCode: string | null
  lineDescription: string | null
  count: number
  shareLabel: string
  barHex: string
  barBackground: string
  widthPercent: number
  lineBadgeColor: string | null
}

export type TopOperatorCard = {
  key: string
  name: string
  count: number
  shareLabel: string
  barHex: string
  barBackground: string
  widthPercent: number
  icon: string | null
}

type AnnualTopListsProps = {
  stations: TopStationCard[]
  operators: TopOperatorCard[]
}

export function AnnualTopLists({ stations, operators }: AnnualTopListsProps) {
  const decimalFormatter = new Intl.NumberFormat('es-ES', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })

  return (
    <div className="mt-8 grid gap-6 lg:grid-cols-2">
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">Top estaciones</h3>
        </div>
        {stations.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
            Aún no hay suficientes validaciones para calcular estaciones destacadas.
          </p>
        ) : (
          <div className="space-y-3">
            {stations.map((station) => {
              const shareLabel = station.shareLabel || `${decimalFormatter.format(0)}%`
              const badgeColor = station.lineBadgeColor ?? 'transparent'
              return (
                <div key={station.key} className="space-y-1">
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
                          style={{ backgroundColor: station.barHex }}
                          aria-hidden
                        />
                      )}
                      {station.lineCode && (
                        <span
                          className="rounded-full px-2 py-0.5 text-xs font-semibold text-slate-900"
                          style={{ backgroundColor: badgeColor }}
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
                  <div className="h-2 w-full rounded-full" style={{ backgroundColor: station.barBackground }}>
                    <div
                      className="h-2 rounded-full"
                      style={{ width: `${station.widthPercent}%`, backgroundColor: station.barHex }}
                    />
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
        {operators.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
            Necesitamos más validaciones para detectar operadores recurrentes.
          </p>
        ) : (
          <div className="space-y-3">
            {operators.map((operator) => {
              const shareLabel = operator.shareLabel || `${decimalFormatter.format(0)}%`
              return (
                <div key={operator.key} className="space-y-1">
                  <div className="flex items-center justify-between text-sm font-semibold text-slate-700">
                    <span className="flex min-w-0 items-center gap-2 truncate pr-4">
                      <span
                        className="h-2.5 w-2.5 rounded-full border border-white/70"
                        style={{ backgroundColor: operator.barHex }}
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
                      {integerFormatter.format(operator.count)} {operator.count === 1 ? 'validación' : 'validaciones'} · {shareLabel}
                    </span>
                  </div>
                  <div className="h-2 w-full rounded-full" style={{ backgroundColor: operator.barBackground }}>
                    <div
                      className="h-2 rounded-full"
                      style={{ width: `${operator.widthPercent}%`, backgroundColor: operator.barHex }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
