import tariffsJson from '../../../files/tarifas.json'
import { dayFormatter, fullDateFormatter, monthFormatter } from '../../lib/dateFormatters'
import type { TransactionRecord } from '../../lib/pdfParser'
import type {
  BizkaibusJsonLine,
  BizkaibusJsonRoot,
  BizkaibusLineDefinition,
  BizkaibusLineMatch,
  FareInsight,
  FareInsightsMap,
  FilterMetadata,
  GroupingMode,
  JourneyBlock,
  JourneyStats,
  HistoryFilterOption,
  OperatorBrand,
  PassSnapshot,
  PassState,
  RawTariffDefinition,
  RawTariffRate,
  TariffDefinition,
  TariffKind,
  TariffRate,
  TableGroupSection,
} from './historyTypes'

const DAY_MS = 24 * 60 * 60 * 1000

export const RECHARGE_FILTER_VALUE = 'Recargas y compras de títulos'

export const OPERATOR_BRANDS: OperatorBrand[] = [
  {
    label: 'Metro Bilbao',
    icon: '/operadores/mb.svg',
    keywords: ['metro bilbao', 'metrobilbao', 'mb metro', 'mb general'],
  },
  {
    label: 'Bilbobus',
    icon: '/operadores/bilbobus.svg',
    keywords: ['bilbobus'],
  },
  {
    label: 'Bizkaibus',
    icon: '/operadores/bizkaibus.png',
    keywords: ['bizkaibus', 'ezkerraldea'],
  },
  {
    label: 'Euskotren Trena',
    icon: '/operadores/euskotren.svg',
    keywords: ['euskotren trena', 'euskotren'],
  },
  {
    label: 'Euskotren Tranbia',
    icon: '/operadores/euskotren_tranvia.svg',
    keywords: ['euskotran', 'euskotren tranbia'],
  },
  {
    label: 'Renfe',
    icon: '/operadores/renfe.svg',
    keywords: ['renfe'],
  },
]

const FALLBACK_TARIFF_LABEL = 'Creditrans barik'

const RAW_TARIFFS = (tariffsJson as RawTariffDefinition[]) ?? []
const TARIFFS: TariffDefinition[] = RAW_TARIFFS.map((tariff) => {
  const limitTravel = Number.isFinite(tariff.limitTravel) ? tariff.limitTravel : 0
  const normalizedName = normalizeTitleLabel(tariff.name)
  return {
    code: tariff.code,
    name: tariff.name,
    normalizedName,
    category: tariff.category,
    limitTravel,
    kind: inferTariffKind(tariff.category, limitTravel),
    rates: flattenTariffRates(tariff.rates ?? []),
  }
})

const TARIFF_BY_NAME = new Map<string, TariffDefinition>(
  TARIFFS.map((tariff) => [tariff.normalizedName, tariff]),
)

const DEFAULT_TARIFF_NAME = normalizeTitleLabel(FALLBACK_TARIFF_LABEL)
const FALLBACK_TARIFF: TariffDefinition =
  TARIFFS[0] ??
  {
    code: 'DEFAULT',
    name: FALLBACK_TARIFF_LABEL,
    normalizedName: DEFAULT_TARIFF_NAME,
    category: 'coin_purse',
    limitTravel: 0,
    kind: 'wallet',
    rates: [],
  }
const DEFAULT_TARIFF = TARIFF_BY_NAME.get(DEFAULT_TARIFF_NAME) ?? FALLBACK_TARIFF

const TARIFF_ALIASES: Record<string, string> = {
  'MONEDERO CREDITRANS': DEFAULT_TARIFF_NAME,
  'CREDITRANS': DEFAULT_TARIFF_NAME,
  'CREDITRANS BARIK': DEFAULT_TARIFF_NAME,
  '—': DEFAULT_TARIFF_NAME,
}

const OPERATOR_ALIAS_MAP: Record<string, string> = {
  'recarga barik nfc': 'Barik NFC',
  'mb general': 'Metro Bilbao',
  'mb metro': 'Metro Bilbao',
  'ezkerraldea': 'Bizkaibus',
  'euskotren': 'Euskotren Trena',
  'euskotren trena': 'Euskotren Trena',
  'euskotran': 'Euskotren Tranbia',
  'euskotren tranbia': 'Euskotren Tranbia',
}

const RECARGA_TOKEN = 'recarga'
const TITULO_TOKEN = 'titulo'
const COMPRA_TOKEN = 'compra'

const TEN_HOURS_MS = 10 * 60 * 60 * 1000

export function getRecordDate(record: TransactionRecord): Date {
  if (record.timestamp) {
    return new Date(record.timestamp)
  }
  const [day = '01', month = '01', year = '1970'] = record.fecha.split('/')
  const [hour = '00', minute = '00', second = '00'] = (record.hora ?? '').split(':')
  return new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second))
}

export function addDays(date: Date, days: number): Date {
  const result = new Date(date)
  result.setDate(result.getDate() + days)
  return result
}

export function isSingleValidation(record: TransactionRecord): boolean {
  const text = record.transaccion?.toLowerCase() ?? ''
  return text.includes('unica')
}

export function isEntryValidation(record: TransactionRecord): boolean {
  const text = record.transaccion?.toLowerCase() ?? ''
  return text.includes('entrada') && !text.includes('recarga')
}

export function isExitValidation(record: TransactionRecord): boolean {
  const text = record.transaccion?.toLowerCase() ?? ''
  return text.includes('salida') && !text.includes('recarga')
}

export function isRecargaTransaction(record: TransactionRecord): boolean {
  const text = record.transaccion?.toLowerCase() ?? ''
  if (!text) {
    return false
  }
  if (text.includes(RECARGA_TOKEN)) {
    return true
  }
  return text.includes(COMPRA_TOKEN) && text.includes(TITULO_TOKEN)
}

export function isWalletRechargeRecord(record: TransactionRecord): boolean {
  const text = record.transaccion?.toLowerCase() ?? ''
  return text.includes(RECARGA_TOKEN) && text.includes('monedero')
}

export function isTitleRechargeRecord(record: TransactionRecord): boolean {
  const text = record.transaccion?.toLowerCase() ?? ''
  if (!text) {
    return false
  }
  const isExplicitTitleRecharge = text.includes(RECARGA_TOKEN) && !text.includes('monedero')
  const isCompraTitulo = text.includes(COMPRA_TOKEN) && text.includes(TITULO_TOKEN)
  return isExplicitTitleRecharge || isCompraTitulo
}

export function getRecordKey(record: TransactionRecord): string {
  return `${record.page}-${record.cont}-${record.timestamp}`
}

export function snapshotPassState(state: PassState): PassSnapshot {
  return {
    tariff: state.tariff,
    kind: state.kind,
    totalTrips: state.totalTrips,
    remainingTrips: state.remainingTrips,
    purchaseAmount: state.purchaseAmount,
    purchaseDate: state.purchaseDate,
    validDays: state.validDays,
    expiresAt: state.expiresAt,
    purchaseRecordKey: state.purchaseRecordKey,
  }
}

export function formatDuration(minutes: number | null): string {
  if (minutes === null || Number.isNaN(minutes)) {
    return '—'
  }
  if (minutes < 60) {
    return `${minutes} min`
  }
  const hours = Math.floor(minutes / 60)
  const remaining = minutes % 60
  return remaining ? `${hours} h ${remaining} min` : `${hours} h`
}

export function formatAmount(value: number | null | undefined): string {
  const numeric = typeof value === 'number' && Number.isFinite(value) ? value : 0
  return `${numeric.toLocaleString('es-ES', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} €`
}

export type SignedAmountDisplay = {
  text: string
  className: string
}

export function formatSignedAmount(value: number | null | undefined, isPositive: boolean): SignedAmountDisplay {
  const numeric = typeof value === 'number' && Number.isFinite(value) ? Math.abs(value) : 0
  const formatted = numeric.toLocaleString('es-ES', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  return {
    text: `${isPositive ? '+' : '-'}${formatted} €`,
    className: isPositive ? 'text-emerald-600' : 'text-rose-600',
  }
}

export function buildRidePriceSubtitle(record: TransactionRecord, insight?: FareInsight): string | null {
  const referenceAmount =
    typeof insight?.savingsAmount === 'number'
      ? Math.abs(insight.savingsAmount)
      : typeof record.importe === 'number'
        ? Math.abs(record.importe)
        : null
  if (referenceAmount === null) {
    return null
  }
  return formatAmount(referenceAmount)
}

export function buildBaseFareLabel(insight?: FareInsight, record?: TransactionRecord): string | null {
  const rawValue =
    typeof insight?.savingsAmount === 'number'
      ? insight.savingsAmount
      : typeof record?.importe === 'number'
        ? record.importe
        : null
  if (typeof rawValue !== 'number') {
    return null
  }
  const normalized = Math.abs(rawValue)
  if (!normalized || Number.isNaN(normalized) || normalized <= 0) {
    return null
  }
  return formatAmount(normalized)
}

export function buildFareInsights(records: TransactionRecord[]): FareInsightsMap {
  const sorted = [...records].sort((a, b) => getRecordDate(a).getTime() - getRecordDate(b).getTime())
  const insights: FareInsightsMap = new Map()
  const passStates = new Map<string, PassState>()

  sorted.forEach((record) => {
    const recordKey = getRecordKey(record)
    const tariff = getTariffInfoFromTitle(record.titulo)
    const recordDate = getRecordDate(record)

    if (isWalletRechargeRecord(record)) {
      insights.set(recordKey, { usageKind: 'wallet-recharge', tariff })
      return
    }

    if (isTitleRechargeRecord(record) && tariff.kind !== 'wallet') {
      const totalTrips = tariff.kind === 'limited-pass' ? tariff.limitTravel || null : null
      const validDays = getPassValidityDays(tariff)
      const purchaseDate = recordDate
      const passState: PassState = {
        tariff,
        kind: tariff.kind === 'unlimited-pass' ? 'unlimited-pass' : 'limited-pass',
        totalTrips,
        remainingTrips: totalTrips,
        purchaseAmount: record.importe ?? 0,
        purchaseDate,
        validDays,
        expiresAt: validDays ? addDays(purchaseDate, validDays) : null,
        purchaseRecordKey: recordKey,
        ignoreNextEntry: tariff.kind === 'limited-pass',
      }
      passStates.set(tariff.normalizedName, passState)
      insights.set(recordKey, {
        usageKind: 'title-recharge',
        tariff,
        passContext: snapshotPassState(passState),
      })
      return
    }

    const currentPass = passStates.get(tariff.normalizedName)
    let limitedContext: FareInsight['limitedContext'] | undefined
    const isEntry = isEntryValidation(record) || isSingleValidation(record)
    const rideAmount = typeof record.importe === 'number' ? Math.abs(record.importe) : null
    const rideSavings = currentPass && isEntry ? rideAmount : null
    const daysRemaining = currentPass?.expiresAt
      ? Math.max(Math.ceil((currentPass.expiresAt.getTime() - recordDate.getTime()) / DAY_MS), 0)
      : null

    if (currentPass?.kind === 'limited-pass') {
      const totalTrips = currentPass.totalTrips ?? null
      const pricePerTrip = totalTrips && totalTrips > 0 ? currentPass.purchaseAmount / totalTrips : null
      if (isEntry && typeof currentPass.remainingTrips === 'number') {
        if (currentPass.ignoreNextEntry) {
          currentPass.ignoreNextEntry = false
        } else {
          currentPass.remainingTrips = Math.max(currentPass.remainingTrips - 1, 0)
        }
      }
      limitedContext = {
        remainingTrips: currentPass.remainingTrips,
        totalTrips,
        pricePerTrip,
        savingsAmount: rideSavings,
      }
    }

    insights.set(recordKey, {
      usageKind: 'ride',
      tariff,
      passContext: currentPass ? snapshotPassState(currentPass) : undefined,
      limitedContext,
      savingsAmount: rideSavings,
      daysRemaining,
    })
  })

  return insights
}

export function buildJourneyBlocks(records: TransactionRecord[]): JourneyBlock[] {
  const sorted = [...records].sort((a, b) => getRecordDate(a).getTime() - getRecordDate(b).getTime())
  const journeys: JourneyBlock[] = []
  let pendingEntry: TransactionRecord | null = null

  const pushSingle = (record: TransactionRecord, reason: string) => {
    journeys.push({
      id: `single-${reason}-${record.page}-${record.cont}-${record.timestamp}`,
      kind: 'viaje-unico',
      start: record,
      end: null,
      durationMinutes: null,
      records: [record],
    })
  }

  sorted.forEach((record) => {
    if (isRecargaTransaction(record)) {
      journeys.push({
        id: `recarga-${record.page}-${record.cont}-${record.timestamp}`,
        kind: 'recarga',
        start: record,
        end: null,
        durationMinutes: null,
        records: [record],
      })
      return
    }

    if (isSingleValidation(record)) {
      pushSingle(record, 'unica')
      return
    }

    if (isEntryValidation(record)) {
      if (pendingEntry) {
        pushSingle(pendingEntry, 'entrada-sin-salida')
      }
      pendingEntry = record
      return
    }

    if (isExitValidation(record)) {
      if (pendingEntry) {
        const startDate = getRecordDate(pendingEntry)
        const endDate = getRecordDate(record)
        const diff = endDate.getTime() - startDate.getTime()

        if (diff < 0) {
          pushSingle(pendingEntry, 'entrada-desorden')
          pushSingle(record, 'salida-desorden')
        } else if (diff > TEN_HOURS_MS) {
          pushSingle(pendingEntry, 'entrada-10h')
          pushSingle(record, 'salida-10h')
        } else {
          journeys.push({
            id: `viaje-${pendingEntry.page}-${record.page}-${record.timestamp}`,
            kind: 'viaje',
            start: pendingEntry,
            end: record,
            durationMinutes: Math.max(1, Math.round(diff / 60000)),
            records: [pendingEntry, record],
          })
        }
        pendingEntry = null
      } else {
        pushSingle(record, 'salida-suelta')
      }
      return
    }

    journeys.push({
      id: `otros-${record.page}-${record.cont}-${record.timestamp}`,
      kind: 'otros',
      start: record,
      end: null,
      durationMinutes: null,
      records: [record],
    })
  })

  if (pendingEntry) {
    pushSingle(pendingEntry, 'entrada-final')
  }

  return journeys.sort((a, b) => getRecordDate(b.start).getTime() - getRecordDate(a.start).getTime())
}

export const EMPTY_JOURNEY_STATS: JourneyStats = {
  rides: 0,
  walletRecharges: 0,
  titlePurchases: 0,
  savings: 0,
  spent: 0,
  travelMinutes: 0,
}

export function createJourneyStats(): JourneyStats {
  return { ...EMPTY_JOURNEY_STATS }
}

export function computeJourneyStats(journeys: JourneyBlock[], fareInsights: FareInsightsMap): JourneyStats {
  const stats = createJourneyStats()
  journeys.forEach((journey) => {
    if (journey.kind === 'recarga') {
      const fare = fareInsights.get(getRecordKey(journey.start))
      if (fare?.usageKind === 'title-recharge') {
        stats.titlePurchases += 1
      } else {
        stats.walletRecharges += 1
      }
      if (typeof journey.start.importe === 'number') {
        stats.spent += Math.abs(journey.start.importe)
      }
      return
    }
    if (journey.kind === 'viaje' || journey.kind === 'viaje-unico') {
      stats.rides += 1
      if (journey.kind === 'viaje' && typeof journey.durationMinutes === 'number') {
        stats.travelMinutes += journey.durationMinutes
      }
      journey.records.forEach((record) => {
        const insight = fareInsights.get(getRecordKey(record))
        if (typeof insight?.savingsAmount === 'number') {
          stats.savings += Math.max(0, insight.savingsAmount)
        }
        if (typeof record.importe === 'number' && !insight?.passContext) {
          stats.spent += Math.abs(record.importe)
        }
      })
    }
  })
  return stats
}

export function sumJourneyStats(statsList: JourneyStats[]): JourneyStats {
  return statsList.reduce(
    (acc, stats) => ({
      rides: acc.rides + stats.rides,
      walletRecharges: acc.walletRecharges + stats.walletRecharges,
      titlePurchases: acc.titlePurchases + stats.titlePurchases,
      savings: acc.savings + stats.savings,
      spent: acc.spent + stats.spent,
      travelMinutes: acc.travelMinutes + stats.travelMinutes,
    }),
    createJourneyStats(),
  )
}

export function formatStatsCountSummary(stats: JourneyStats): string {
  const parts: string[] = []
  if (stats.walletRecharges > 0) {
    parts.push(`Recargas ${stats.walletRecharges}`)
  }
  if (stats.titlePurchases > 0) {
    parts.push(`Títulos ${stats.titlePurchases}`)
  }
  if (stats.rides > 0) {
    parts.push(`Viajes ${stats.rides}`)
  }
  return parts.length ? parts.join(' · ') : '—'
}

export function formatStatsAmountSummary(stats: JourneyStats): string {
  const parts: string[] = []
  if (stats.spent > 0) {
    parts.push(`Gasto ${formatAmount(stats.spent)}`)
  }
  if (stats.savings > 0) {
    parts.push(`Ahorro títulos ${formatAmount(stats.savings)}`)
  }
  return parts.length ? parts.join(' · ') : '—'
}

export function formatStatsDurationSummary(stats: JourneyStats): string | null {
  if (stats.travelMinutes <= 0) {
    return null
  }
  return `Tiempo en viaje ${formatDuration(stats.travelMinutes)}`
}

export function getTariffInfoFromTitle(title?: string | null): TariffDefinition {
  const normalized = normalizeTitleLabel(title)
  const alias = TARIFF_ALIASES[normalized]
  const lookup = alias ?? normalized
  return TARIFF_BY_NAME.get(lookup) ?? DEFAULT_TARIFF
}

export function getPassValidityDays(tariff: TariffDefinition): number | null {
  if (tariff.kind === 'wallet') {
    return null
  }
  if (tariff.category === 'monthly' || tariff.category === 'youthMonthly') {
    return 30
  }
  if (tariff.kind === 'limited-pass') {
    return 30
  }
  if (tariff.kind === 'unlimited-pass') {
    return 30
  }
  return null
}

export function normalizeTitleLabel(value?: string | null): string {
  const base = value && value.trim().length ? value : FALLBACK_TARIFF_LABEL
  return base
    .normalize('NFD')
    .replace(/[\u0000-\u001F]/g, '')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase()
}

export function inferTariffKind(category: string, limitTravel: number): TariffKind {
  if (category === 'coin_purse') {
    return 'wallet'
  }
  if (limitTravel > 0) {
    return 'limited-pass'
  }
  if (category === 'monthly' || category === 'youthMonthly') {
    return 'unlimited-pass'
  }
  return limitTravel > 0 ? 'limited-pass' : 'wallet'
}

export function flattenTariffRates(rates: RawTariffRate[][]): TariffRate[] {
  return rates
    .flat()
    .filter(Boolean)
    .map((rate) => ({
      type: rate.type,
      zones: rate.zones,
      price: Number(rate.price) || 0,
    }))
}

export function buildFilterMetadata(records: TransactionRecord[]): FilterMetadata {
  if (!records.length) {
    return {
      filterOptions: [
        { value: 'Todos', label: 'Todos', icon: null },
        { value: RECHARGE_FILTER_VALUE, label: RECHARGE_FILTER_VALUE, icon: null },
      ],
      defaultFilter: 'Todos',
      brandLabels: new Set<string>(),
    }
  }

  const normalizedOperators = new Set<string>()
  records.forEach((record) => {
    const normalized = normalizeOperatorLabel(record.operador)
    if (normalized !== '—') {
      normalizedOperators.add(normalized)
    }
  })

  const availableBrands = OPERATOR_BRANDS.filter((brand) =>
    records.some((record) => getOperatorBrand(record.operador)?.label === brand.label),
  )

  const nonBrandOperators = Array.from(normalizedOperators).filter((op) => !getOperatorBrand(op))

  const defaultFilter = availableBrands.some((brand) => brand.label === 'Metro Bilbao')
    ? 'Metro Bilbao'
    : availableBrands[0]?.label ?? nonBrandOperators[0] ?? 'Todos'

  const filterOptions: HistoryFilterOption[] = [
    { value: 'Todos', label: 'Todos', icon: null },
    ...availableBrands.map((brand) => ({ value: brand.label, label: brand.label, icon: brand.icon })),
    ...nonBrandOperators
      .filter((operator) => operator !== 'Barik NFC')
      .map((operator) => ({ value: operator, label: operator, icon: null })),
    { value: RECHARGE_FILTER_VALUE, label: RECHARGE_FILTER_VALUE, icon: null },
  ]

  return {
    filterOptions,
    defaultFilter,
    brandLabels: new Set(availableBrands.map((brand) => brand.label)),
  }
}

export function filterRecordsByOperator(
  records: TransactionRecord[],
  operatorFilter: string,
  brandLabels: Set<string>,
): TransactionRecord[] {
  return records.filter((record) => {
    const normalizedOperator = normalizeOperatorLabel(record.operador)
    const operatorBrandLabel = getOperatorBrand(record.operador)?.label ?? null
    const isRecharge = isRecargaTransaction(record)

    if (operatorFilter === 'Todos') {
      return true
    }

    if (operatorFilter === RECHARGE_FILTER_VALUE) {
      return isRecharge
    }

    if (brandLabels.has(operatorFilter)) {
      return operatorBrandLabel === operatorFilter
    }

    return normalizedOperator === operatorFilter
  })
}

export function parseBizkaibusJson(payload: BizkaibusJsonRoot | undefined): BizkaibusLineDefinition[] {
  if (!payload || typeof payload !== 'object') {
    return []
  }
  const container = payload['LINEAK-LINEAS']
  if (!container || typeof container !== 'object') {
    return []
  }
  const rawLines = container['LINEA-LINEA']
  if (!rawLines) {
    return []
  }
  const normalizedLines = Array.isArray(rawLines) ? rawLines : [rawLines]
  return normalizedLines
    .map((line) => {
      if (!line || typeof line !== 'object') {
        return null
      }
      const codeValue = (line as BizkaibusJsonLine)['KODEA-CODIGO']
      const descriptionValue = (line as BizkaibusJsonLine)['DESKRIPZIOA-DESCRIPCION']
      if (typeof codeValue !== 'string' || typeof descriptionValue !== 'string') {
        return null
      }
      const code = codeValue.trim()
      const description = descriptionValue.trim()
      if (!code || !description) {
        return null
      }
      return {
        code,
        description,
        normalizedComparable: normalizeBizkaibusComparable(description),
        collapsedComparable: collapseSpacesComparable(description),
        tokenSet: buildBizkaibusTokenSet(description),
      }
    })
    .filter((entry): entry is BizkaibusLineDefinition => Boolean(entry))
}

export function normalizeBizkaibusComparable(value?: string | null): string {
  if (!value) {
    return ''
  }
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toLowerCase()
}

export function collapseSpacesComparable(value?: string | null): string {
  if (!value) {
    return ''
  }
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '')
    .toLowerCase()
}

export function tokenizeBizkaibusText(value?: string | null): string[] {
  if (!value) {
    return []
  }
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]/g, ' ')
    .toLowerCase()
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3)
}

function buildBizkaibusTokenSet(value: string): Set<string> {
  return new Set(tokenizeBizkaibusText(value))
}

export function scoreBizkaibusMatch(
  stopComparable: string,
  stopCollapsed: string,
  stopTokens: string[],
  line: BizkaibusLineDefinition,
): number {
  if (stopCollapsed && line.collapsedComparable && stopCollapsed === line.collapsedComparable) {
    return 1200 + stopCollapsed.length
  }
  if (!stopComparable || !line.normalizedComparable) {
    return 0
  }
  if (stopComparable === line.normalizedComparable) {
    return 1000 + stopComparable.length
  }
  if (stopComparable.includes(line.normalizedComparable) || line.normalizedComparable.includes(stopComparable)) {
    return 500 + Math.min(stopComparable.length, line.normalizedComparable.length)
  }
  if (stopTokens.length === 0 || line.tokenSet.size === 0) {
    return 0
  }
  let sharedCount = 0
  let largestToken = 0
  stopTokens.forEach((token) => {
    if (line.tokenSet.has(token)) {
      sharedCount += 1
      if (token.length > largestToken) {
        largestToken = token.length
      }
    }
  })
  if (sharedCount >= 2) {
    return sharedCount * 10
  }
  if (sharedCount === 1 && largestToken >= 6) {
    return largestToken
  }
  return 0
}

export function normalizeOperatorLabel(value?: string | null): string {
  if (!value) {
    return '—'
  }
  const trimmed = value.trim()
  const lower = trimmed.toLowerCase()
  const collapsed = lower.replace(/[^a-z0-9]/g, '')
  if (collapsed.includes('euskotran')) {
    return 'Euskotren Tranbia'
  }
  if (collapsed.includes('euskotren')) {
    return 'Euskotren Trena'
  }
  const alias = OPERATOR_ALIAS_MAP[lower]
  return alias ?? trimmed
}

export function normalizeStopName(value?: string | null): string {
  return (value ?? '').trim().toLowerCase()
}

export function isMeaningfulRecord(record?: TransactionRecord | null): record is TransactionRecord {
  if (!record) {
    return false
  }
  const hasTransaction = Boolean(record.transaccion && record.transaccion.trim().length)
  const hasOperator = Boolean(record.operador && record.operador.trim().length)
  const hasEquipo = Boolean(record.equipo && record.equipo.trim().length)
  const hasTitle = Boolean(record.titulo && record.titulo.trim().length)
  const hasDate = Boolean(record.fecha && record.fecha.trim().length)
  const hasTimestamp = Boolean(record.timestamp && record.timestamp.trim().length)
  const hasAmount = typeof record.importe === 'number' && !Number.isNaN(record.importe) && record.importe !== 0
  const hasBalance = typeof record.saldo === 'number' && !Number.isNaN(record.saldo) && record.saldo !== 0

  return (
    hasTransaction ||
    hasOperator ||
    hasEquipo ||
    hasTitle ||
    hasDate ||
    hasTimestamp ||
    hasAmount ||
    hasBalance
  )
}

export function formatDateLong(value: string): string {
  const [day, month, year] = value.split('/')
  if (!day || !month || !year) {
    return value
  }
  const date = new Date(Number(year), Number(month) - 1, Number(day))
  return fullDateFormatter.format(date)
}

export function formatDateValue(date?: Date | null): string {
  if (!date) {
    return '—'
  }
  return fullDateFormatter.format(date)
}

export function formatMonthLabel(date: Date): string {
  const raw = monthFormatter.format(date)
  return raw.charAt(0).toUpperCase() + raw.slice(1)
}

export function formatYearLabel(date: Date): string {
  return date.getFullYear().toString()
}

export function formatDayLabel(date: Date): string {
  const raw = dayFormatter.format(date)
  return raw.charAt(0).toUpperCase() + raw.slice(1)
}

export function getMonthKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  return `${year}-${month}`
}

export function getYearKey(date: Date): string {
  return `${date.getFullYear()}`
}

export function getDayKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function groupRecordsForTable(records: TransactionRecord[], mode: GroupingMode): TableGroupSection[] {
  if (!records.length) {
    return []
  }
  if (mode === 'none') {
    return [
      {
        key: 'all-records',
        label: 'Todos',
        rows: [...records],
      },
    ]
  }
  const sections = new Map<string, TableGroupSection>()
  const order: string[] = []
  records.forEach((record) => {
    const recordDate = getRecordDate(record)
    const key = mode === 'year' ? getYearKey(recordDate) : getMonthKey(recordDate)
    const label = mode === 'year' ? formatYearLabel(recordDate) : formatMonthLabel(recordDate)
    if (!sections.has(key)) {
      sections.set(key, { key, label, rows: [] })
      order.push(key)
    }
    sections.get(key)!.rows.push(record)
  })
  return order.map((key) => sections.get(key)!)
}

export function getOperatorBrand(value?: string | null): OperatorBrand | null {
  if (!value) {
    return null
  }
  const normalized = normalizeOperatorLabel(value).toLowerCase()
  const raw = value.trim().toLowerCase()
  let bestBrand: OperatorBrand | null = null
  let bestScore = -1

  OPERATOR_BRANDS.forEach((brand) => {
    brand.keywords.forEach((keyword) => {
      const normalizedKeyword = keyword.toLowerCase()
      if (!normalizedKeyword) {
        return
      }
      const matchesNormalized = normalized.includes(normalizedKeyword)
      const matchesRaw = raw.includes(normalizedKeyword)
      if (!matchesNormalized && !matchesRaw) {
        return
      }
      const keywordScore =
        normalizedKeyword.length +
        (matchesNormalized && normalized === normalizedKeyword ? 100 : 0) +
        (matchesRaw && !matchesNormalized ? 10 : 0)
      if (keywordScore > bestScore) {
        bestBrand = brand
        bestScore = keywordScore
      }
    })
  })

  return bestBrand
}
