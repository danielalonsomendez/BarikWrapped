'use client'

import Image from 'next/image'
import { useId } from 'react'
import { fullDateFormatter } from '../../lib/dateFormatters'
import { formatDuration } from '../history/historyDataTransforms'

const integerFormatter = new Intl.NumberFormat('es-ES')

const FALLBACK_ACCENT = 'rgba(239, 68, 68, 0.85)'

type RankedStation = {
  name: string
  count: number
  operatorName: string | null
  operatorIcon: string | null
  operatorColor: string | null
  lineCode: string | null
  lineDescription: string | null
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

type AnnualHighlightsSummary = {
  totalJourneys: number
  totalRecharges: number
  highlightStation: RankedStation | null
  highlightTravelDay: TravelDayHighlight | null
  highlightStreak: StreakHighlight | null
}

type AnnualHighlightsProps = {
  summary: AnnualHighlightsSummary
}

export function AnnualHighlights({ summary }: AnnualHighlightsProps) {
  const { totalJourneys, totalRecharges, highlightStation, highlightTravelDay, highlightStreak } = summary
  const showAwards = totalJourneys > 0 || totalRecharges > 0
  if (!showAwards) {
    return null
  }

  const stationAccentColor = highlightStation?.operatorColor ?? FALLBACK_ACCENT
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

  return (
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
                  <span className="mt-1 text-lg font-semibold leading-tight text-slate-900">{highlightStation.name}</span>
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
      <path d="M24 10V6h16v4" stroke="#C0852C" strokeWidth="1.8" strokeLinecap="round" />
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
      <path d="M32 16V8m0 52v-8M16 34h-8m52 0h-8" stroke="#B16E27" strokeWidth="2" strokeLinecap="round" />
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
      <path d="M28.5 44.5c1.1 3.7 2.7 7.5 3.5 11.5 0 0 3.4-5.6 5.6-9.9" stroke="#D97B33" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}
