'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { HeaderSection, type HistoryOption } from './components/HeaderSection'
import { HistoryExperience } from './components/HistoryTab'
import { MetroDiagram } from './components/metro/MetroDiagram'
import { extractTransactionsFromFile } from './lib/pdfParser'
import { listHistory, saveHistory, type HistoryEntry } from './lib/historyStore'
import { dateFormatter, fullDateTimeFormatter } from './lib/dateFormatters'

type TabId = 'historial' | 'panel' | 'metro'

const TABS: Array<{ id: TabId; label: string }> = [
  { id: 'historial', label: 'Historial' },
  { id: 'panel', label: 'Panel anual' },
  { id: 'metro', label: 'Mapa metro' },
]

export default function Home() {
  const [file, setFile] = useState<File | null>(null)
  const [isParsing, setIsParsing] = useState(false)
  const [statusMessage, setStatusMessage] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [selectedHistoryId, setSelectedHistoryId] = useState<string>('')
  const [historyLoading, setHistoryLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<TabId>('historial')
  const [isConfigOpen, setIsConfigOpen] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const historyOptions = useMemo<HistoryOption[]>(() => {
    return history.map((entry) => ({
      id: entry.id,
      label: fullDateTimeFormatter.format(new Date(entry.createdAt)),
    }))
  }, [history])

  useEffect(() => {
    void refreshHistory()
  }, [])

  async function refreshHistory(newSelectedId?: string) {
    setHistoryLoading(true)
    try {
      const entries = await listHistory()
      setHistory(entries)
      if (entries.length && !newSelectedId) {
        setSelectedHistoryId(entries[0].id)
      }
      if (newSelectedId) {
        setSelectedHistoryId(newSelectedId)
      }
    } finally {
      setHistoryLoading(false)
    }
  }

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextFile = event.target.files?.[0] ?? null
    setFile(nextFile)
    setStatusMessage('')
    setError(null)
    if (nextFile) {
      void handleProcess(nextFile)
    }
  }

  const handleProcess = async (inputFile?: File | null) => {
    const targetFile = inputFile ?? file
    if (!targetFile) {
      setError('Selecciona un PDF antes de procesar')
      return
    }

    setIsParsing(true)
    setError(null)
    setStatusMessage('Procesando archivo…')

    try {
      const result = await extractTransactionsFromFile(targetFile)
      const stored = await saveHistory({
        filename: targetFile.name,
        pages: result.pages,
        records: result.records,
        total: result.records.length,
      })
      await refreshHistory(stored.id)
      setStatusMessage(`Guardados ${result.records.length} movimientos en tu historial`)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo procesar el PDF'
      setError(message)
      setStatusMessage('')
    } finally {
      setIsParsing(false)
      setFile(null)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const handleUploadAndProcess = () => {
    if (isParsing) {
      return
    }
    fileInputRef.current?.click()
  }

  return (
    <div className="min-h-screen bg-slate-50 px-0 py-6 text-slate-900 sm:px-4 sm:py-10">
      <main className="mx-0 flex w-full max-w-full flex-col gap-8 sm:mx-auto sm:max-w-6xl sm:mx-0">
        <HeaderSection
          historyOptions={historyOptions}
          historyLoading={historyLoading}
          selectedHistoryId={selectedHistoryId}
          onSelectHistory={setSelectedHistoryId}
          fileInputRef={fileInputRef}
          onFileChange={handleFileChange}
          onUploadAndProcess={handleUploadAndProcess}
          isParsing={isParsing}
          statusMessage={statusMessage}
          error={error}
          onOpenConfig={() => setIsConfigOpen(true)}
        />

        <div className="flex flex-col gap-4">
          <nav className="flex gap-2 rounded-none border border-slate-200 bg-white p-1 shadow-none sm:rounded-full sm:shadow-sm">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 rounded-full px-4 py-2 text-sm font-semibold transition ${
                  activeTab === tab.id ? 'bg-slate-900 text-white' : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>

          <HistoryExperience
            history={history}
            historyLoading={historyLoading}
            selectedHistoryId={selectedHistoryId}
            isVisible={activeTab === 'historial'}
          />

          {activeTab === 'panel' && (
            <section className="w-full rounded-none border-0 bg-white p-4 text-slate-500 shadow-none sm:mt-0 sm:rounded-3xl sm:border sm:border-slate-200 sm:p-6 sm:shadow-lg">
              <h2 className="text-2xl font-semibold text-slate-900">Panel anual</h2>
              <p className="mt-2 text-sm">Pronto podrás ver gráficos y métricas agregadas de todas tus lecturas.</p>
            </section>
          )}

          {activeTab === 'metro' && (
            <section className="w-full rounded-none border-0 bg-white p-4 shadow-none sm:mt-0 sm:rounded-3xl sm:border sm:border-slate-200 sm:p-6 sm:shadow-lg">
              <MetroDiagram />
            </section>
          )}

          {isConfigOpen && (
            <ConfigModal
              onClose={() => setIsConfigOpen(false)}
              history={history}
              selectedHistoryId={selectedHistoryId}
            />
          )}
        </div>
      </main>
    </div>
  )
}

type ConfigModalProps = {
  onClose: () => void
  history: HistoryEntry[]
  selectedHistoryId: string
}

function ConfigModal({ onClose, history, selectedHistoryId }: ConfigModalProps) {
  const selectedHistory = history.find((entry) => entry.id === selectedHistoryId) ?? null

  const handleDownloadSelectedHistory = useCallback(() => {
    if (!selectedHistory) {
      return
    }
    const json = JSON.stringify(selectedHistory.records, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    const stamp = dateFormatter.format(new Date(selectedHistory.createdAt)).replace(/\s+/g, '_')
    anchor.href = url
    anchor.download = `barik-${stamp}.json`
    anchor.click()
    URL.revokeObjectURL(url)
  }, [selectedHistory])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 px-4 py-8">
      <div className="w-full max-w-md space-y-4 rounded-3xl border border-white/10 bg-white p-6 text-slate-700 shadow-2xl">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-400">Configuración</p>
            <h3 className="text-xl font-semibold text-slate-900">Descarga y copia de seguridad</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-500 hover:text-slate-900"
          >
            Cerrar
          </button>
        </div>
        <p className="text-sm text-slate-500">
          Exporta todos los datos guardados en tu navegador para conservar una copia o moverla a otro dispositivo.
        </p>
        <button
          type="button"
          onClick={() => {
            handleDownloadSelectedHistory()
            onClose()
          }}
          className="w-full rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-slate-800"
          disabled={!selectedHistory}
        >
          Descargar todos los datos
        </button>
      </div>
    </div>
  )
}
