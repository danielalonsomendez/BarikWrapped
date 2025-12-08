import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs'
import type { DocumentInitParameters, TextContent, TextItem } from 'pdfjs-dist/types/src/display/api'

type ColumnKey = 'cont' | 'fecha' | 'transaccion' | 'operador' | 'equipo' | 'importe' | 'saldo' | 'titulo' | 'perfil' | 'etapa'

type ColumnBoundary = {
  key: ColumnKey
  start: number
  end: number
}

type LineSegment = {
  x: number
  text: string
}

type Line = {
  y: number
  segments: LineSegment[]
}

export type TransactionRecord = {
  cont: number
  fecha: string
  hora: string
  timestamp: string
  transaccion: string
  operador: string
  equipo: string
  importe: number
  saldo: number
  titulo: string
  perfil: string
  etapa: string
  page: number
}

export type ExtractionResult = {
  pages: number
  records: TransactionRecord[]
}

const COLUMN_DEFS: Array<{ key: ColumnKey; label: RegExp }> = [
  { key: 'cont', label: /CONT/i },
  { key: 'fecha', label: /FECHA/i },
  { key: 'transaccion', label: /TRANSACC/i },
  { key: 'operador', label: /OPERAD/i },
  { key: 'equipo', label: /EQUIPO/i },
  { key: 'importe', label: /IMPORTE/i },
  { key: 'saldo', label: /SALDO/i },
  { key: 'titulo', label: /TITULO/i },
  { key: 'perfil', label: /PERFIL/i },
  { key: 'etapa', label: /ETAPA/i },
]

const UPPERCASE_JOIN_EXCEPTIONS = new Set([
  'DE',
  'DEL',
  'LA',
  'LAS',
  'LOS',
  'LO',
  'EL',
  'DA',
  'DO',
  'Y',
  'AL',
])

const NUMBER_ONLY = /^\d+$/
const DATE_SECTION = /(\d{2})\/(\d{2})\/(\d{4})/
const TIME_SECTION = /(\d{2}:\d{2}:\d{2})/

let workerInitialized = false

async function ensureWorker(): Promise<void> {
  if (workerInitialized || typeof window === 'undefined') {
    return
  }

  const workerUrl = new URL('pdfjs-dist/legacy/build/pdf.worker.min.mjs', import.meta.url)
  GlobalWorkerOptions.workerSrc = workerUrl.toString()
  workerInitialized = true
}

export async function extractTransactionsFromFile(file: File): Promise<ExtractionResult> {
  const buffer = await file.arrayBuffer()
  return extractTransactionsFromData(buffer)
}

export async function extractTransactionsFromData(data: ArrayBuffer): Promise<ExtractionResult> {
  await ensureWorker()
  const doc = await getDocument({ data } satisfies DocumentInitParameters).promise
  const records: TransactionRecord[] = []

  for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
    const page = await doc.getPage(pageNumber)
    const textContent = await page.getTextContent()
    const lines = groupLines(textContent)
    const headerIndex = findHeaderIndex(lines)
    if (headerIndex === -1) {
      continue
    }

    const columnBoundaries = deriveColumnBoundaries(lines[headerIndex])
    const bodyLines = lines.slice(skipHeaderBlock(lines, headerIndex))
    const rawRows = collectRawRows(bodyLines, columnBoundaries)

    rawRows.forEach((row) => {
      const parsed = normalizeRow(row, pageNumber)
      if (parsed) {
        records.push(parsed)
      }
    })
  }

  return { pages: doc.numPages, records }
}

function groupLines(textContent: TextContent): Line[] {
  const groups = new Map<number, Line>()

  textContent.items.forEach((item) => {
    const textItem = item as TextItem
    const cleaned = textItem.str.replace(/\s+/g, ' ').trim()
    if (!cleaned) {
      return
    }

    const transform = textItem.transform || [0, 0, 0, 0, 0, 0]
    const x = transform[4]
    const y = transform[5]
    const key = Math.round(y)
    const existing = groups.get(key)
    const segment: LineSegment = { x, text: cleaned }

    if (existing) {
      existing.segments.push(segment)
    } else {
      groups.set(key, { y, segments: [segment] })
    }
  })

  return Array.from(groups.values())
    .map((line) => ({
      y: line.y,
      segments: [...line.segments].sort((a, b) => a.x - b.x),
    }))
    .sort((a, b) => b.y - a.y)
}

function findHeaderIndex(lines: Line[]): number {
  return lines.findIndex((line) => {
    const text = lineToString(line)
    return text.includes('CONT') && text.includes('FECHA') && text.includes('IMPORTE')
  })
}

function skipHeaderBlock(lines: Line[], headerIndex: number): number {
  let idx = headerIndex + 1
  while (idx < lines.length) {
    const text = lineToString(lines[idx])
    if (text && /TRANS$/i.test(text) && !/\d/.test(text)) {
      idx += 1
      continue
    }
    break
  }
  return idx
}

function deriveColumnBoundaries(headerLine: Line): ColumnBoundary[] {
  const orderedSegments = [...headerLine.segments].sort((a, b) => a.x - b.x)
  const boundaries: ColumnBoundary[] = []
  const DEFAULT_WIDTH = 60
  const COLUMN_GAP = 8

  COLUMN_DEFS.forEach((column, index) => {
    const match = orderedSegments.find((segment) => column.label.test(segment.text))
    const previous = boundaries[index - 1]
    const fallbackStart = previous ? previous.start + DEFAULT_WIDTH : 0
    const start = match ? match.x : fallbackStart
    boundaries.push({ key: column.key, start, end: Number.POSITIVE_INFINITY })
  })

  for (let i = 0; i < boundaries.length - 1; i += 1) {
    const current = boundaries[i]
    const next = boundaries[i + 1]
    const tentativeEnd = next.start - COLUMN_GAP
    current.end = tentativeEnd > current.start ? tentativeEnd : current.start + DEFAULT_WIDTH
  }

  const last = boundaries[boundaries.length - 1]
  last.end = Number.POSITIVE_INFINITY
  return boundaries
}

function collectRawRows(lines: Line[], boundaries: ColumnBoundary[]): Array<Record<ColumnKey, string>> {
  const rows: Array<Record<ColumnKey, string>> = []
  let current: Record<ColumnKey, string> | null = null

  for (const line of lines) {
    const bucket = bucketize(line, boundaries)
    const contText = (bucket.cont || '').replace(/\D/g, '')
    const startsNewRow = contText.length > 0 && NUMBER_ONLY.test(contText)

    if (startsNewRow) {
      if (current && hasData(current)) {
        rows.push(current)
      }
      current = initRow()
    }

    if (!current) {
      continue
    }

    for (const key of Object.keys(bucket) as ColumnKey[]) {
      const addition = bucket[key]
      if (!addition) {
        continue
      }
      current[key] = current[key]
        ? appendSegment(current[key], addition)
        : addition
    }
  }

  if (current && hasData(current)) {
    rows.push(current)
  }

  return rows
}

function bucketize(line: Line, boundaries: ColumnBoundary[]): Partial<Record<ColumnKey, string>> {
  const result: Partial<Record<ColumnKey, string>> = {}

  line.segments.forEach((segment) => {
    const normalized = segment.text.trim()
    if (!normalized) {
      return
    }

    const column =
      boundaries.find((boundary, index) => {
        const lower = index === 0 ? Number.NEGATIVE_INFINITY : boundary.start
        return segment.x >= lower && segment.x < boundary.end
      }) || boundaries[boundaries.length - 1]

    result[column.key] = result[column.key]
      ? `${result[column.key]} ${normalized}`
      : normalized
  })

  return result
}

function appendSegment(base: string, addition: string): string {
  if (!base) {
    return addition
  }
  if (!addition) {
    return base
  }
  const trimmedBase = base.trimEnd()
  const trimmedAddition = addition.trimStart()
  const glue = shouldSkipSpace(trimmedBase, trimmedAddition) ? '' : ' '
  return `${trimmedBase}${glue}${trimmedAddition}`.replace(/\s+/g, ' ').trim()
}

function shouldSkipSpace(base: string, addition: string): boolean {
  if (!base || !addition) {
    return false
  }

  const lastChar = base.charAt(base.length - 1)
  const firstChar = addition.charAt(0)

  if (isLetter(lastChar) && firstChar === '/') {
    return true
  }
  if (lastChar === '/' && isLetter(firstChar)) {
    return true
  }
  if (isLetter(lastChar) && firstChar === '-') {
    return true
  }
  if (isLetter(lastChar) && isLower(firstChar)) {
    return true
  }

  if (isLetter(lastChar) && isUpper(firstChar)) {
    const firstToken = addition.trimStart().split(/\s+/)[0]
    const normalizedToken = firstToken.replace(/[^A-ZÁÉÍÓÚÑ]/g, '')
    if (
      normalizedToken &&
      normalizedToken.length <= 2 &&
      !UPPERCASE_JOIN_EXCEPTIONS.has(normalizedToken)
    ) {
      return true
    }
  }

  return false
}

function isLetter(char: string): boolean {
  return /[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/.test(char)
}

function isLower(char: string): boolean {
  return /[a-záéíóúüñ]/.test(char)
}

function isUpper(char: string): boolean {
  return /[A-ZÁÉÍÓÚÜÑ]/.test(char)
}

function normalizeRow(row: Record<ColumnKey, string>, page: number): TransactionRecord | null {
  const cont = parseInt((row.cont || '').replace(/\D/g, ''), 10)
  if (Number.isNaN(cont)) {
    return null
  }

  const fechaRaw = (row.fecha || '').replace(/\s+/g, ' ').trim()
  const fechaMatch = fechaRaw.match(DATE_SECTION)
  const timeMatch = fechaRaw.match(TIME_SECTION)
  const fecha = fechaMatch ? fechaMatch[0] : ''
  const hora = timeMatch ? timeMatch[0] : ''
  const timestamp = fecha && hora ? toIso(fecha, hora) : ''

  return {
    cont,
    fecha,
    hora,
    timestamp,
    transaccion: clean(row.transaccion),
    operador: clean(row.operador),
    equipo: clean(row.equipo),
    importe: parseAmount(row.importe),
    saldo: parseAmount(row.saldo),
    titulo: clean(row.titulo),
    perfil: clean(row.perfil),
    etapa: clean(row.etapa),
    page,
  }
}

function parseAmount(value: string | undefined): number {
  if (!value) {
    return 0
  }
  const normalized = value.replace(/\s+/g, '').replace(/\./g, '').replace(',', '.')
  const numeric = Number.parseFloat(normalized)
  return Number.isFinite(numeric) ? numeric : 0
}

function clean(value: string | undefined): string {
  return (value || '').replace(/\s+/g, ' ').trim()
}

function lineToString(line: Line): string {
  return line.segments.map((segment) => segment.text).join(' ').trim()
}

function initRow(): Record<ColumnKey, string> {
  return COLUMN_DEFS.reduce<Record<ColumnKey, string>>((acc, column) => {
    acc[column.key] = ''
    return acc
  }, {} as Record<ColumnKey, string>)
}

function hasData(row: Record<ColumnKey, string>): boolean {
  return COLUMN_DEFS.some((column) => Boolean(row[column.key]?.trim()))
}

function toIso(date: string, time: string): string {
  const [day, month, year] = date.split('/')
  if (!day || !month || !year) {
    return ''
  }
  return `${year}-${month}-${day}T${time}`
}
