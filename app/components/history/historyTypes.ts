import type { TransactionRecord } from '../../lib/pdfParser'

export type RawTariffRate = {
  type: string
  zones: number
  price: string | number
}

export type RawTariffDefinition = {
  code: string
  name: string
  category: string
  limitTravel: number
  rates: RawTariffRate[][]
}

export type TariffRate = {
  type: string
  zones: number
  price: number
}

export type TariffKind = 'wallet' | 'limited-pass' | 'unlimited-pass'

export type TariffDefinition = {
  code: string
  name: string
  normalizedName: string
  category: string
  limitTravel: number
  kind: TariffKind
  rates: TariffRate[]
}

export type PassSnapshot = {
  tariff: TariffDefinition
  kind: Exclude<TariffKind, 'wallet'>
  totalTrips: number | null
  remainingTrips: number | null
  purchaseAmount: number
  purchaseDate: Date
  validDays: number | null
  expiresAt: Date | null
  purchaseRecordKey: string
}

export type PassState = PassSnapshot & {
  ignoreNextEntry?: boolean
}

export type FareInsight = {
  usageKind: 'wallet-recharge' | 'title-recharge' | 'ride'
  tariff: TariffDefinition
  passContext?: PassSnapshot
  savingsAmount?: number | null
  daysRemaining?: number | null
  limitedContext?: {
    remainingTrips: number | null
    totalTrips: number | null
    pricePerTrip: number | null
    savingsAmount: number | null
  }
}

export type FareInsightsMap = Map<string, FareInsight>

export type NavigateToRechargeHandler = (
  recordKey?: string | null,
  options?: { targetView?: 'table' | 'cards' },
) => void

export type JourneyBlock = {
  id: string
  kind: 'viaje' | 'viaje-unico' | 'recarga' | 'otros'
  start: TransactionRecord
  end: TransactionRecord | null
  durationMinutes: number | null
  records: TransactionRecord[]
}

export type JourneyStats = {
  rides: number
  walletRecharges: number
  titlePurchases: number
  savings: number
  spent: number
  travelMinutes: number
}

export type JourneyDayGroup = {
  key: string
  label: string
  journeys: JourneyBlock[]
  stats: JourneyStats
}

export type JourneyMonthGroup = {
  key: string
  label: string
  dayGroups: JourneyDayGroup[]
  stats: JourneyStats
}

export type JourneyMonthGroupWithYear = JourneyMonthGroup & {
  parentYear: {
    key: string
    label: string
  }
}

export type JourneyYearGroup = {
  key: string
  label: string
  monthGroups: JourneyMonthGroup[]
  stats: JourneyStats
}

export type GroupingMode = 'year' | 'month' | 'none'

export type TableGroupSection = {
  key: string
  label: string
  rows: TransactionRecord[]
}

export type HistoryFilterOption = {
  value: string
  label: string
  icon: string | null
}

export type FilterMetadata = {
  filterOptions: HistoryFilterOption[]
  defaultFilter: string
  brandLabels: Set<string>
}

export type OperatorBrand = {
  label: string
  icon: string
  keywords: string[]
}

export type BizkaibusLineDefinition = {
  code: string
  description: string
  normalizedComparable: string
  collapsedComparable: string
  tokenSet: Set<string>
}

export type BizkaibusLineMatch = {
  code: string
  description: string
}

export type BizkaibusJsonLine = {
  'KODEA-CODIGO'?: unknown
  'DESKRIPZIOA-DESCRIPCION'?: unknown
}

export type BizkaibusJsonRoot = {
  'LINEAK-LINEAS'?: {
    'LINEA-LINEA'?: BizkaibusJsonLine | BizkaibusJsonLine[]
  }
}
