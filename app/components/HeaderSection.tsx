import { CalendarDays, Settings, ShieldCheck, Upload } from 'lucide-react'
import type { ChangeEvent, RefObject } from 'react'

export type HistoryOption = {
  id: string
  label: string
}

export type HeaderSectionProps = {
  historyOptions: HistoryOption[]
  historyLoading: boolean
  selectedHistoryId: string
  onSelectHistory: (historyId: string) => void
  fileInputRef: RefObject<HTMLInputElement | null>
  onFileChange: (event: ChangeEvent<HTMLInputElement>) => void
  onUploadAndProcess: () => void
  isParsing: boolean
  statusMessage: string
  error: string | null
  onOpenConfig: () => void
}

export function HeaderSection({
  historyOptions,
  historyLoading,
  selectedHistoryId,
  onSelectHistory,
  fileInputRef,
  onFileChange,
  onUploadAndProcess,
  isParsing,
  statusMessage,
  error,
  onOpenConfig,
}: HeaderSectionProps) {
  const hasHistory = historyOptions.length > 0

  return (
    <header className="mx-4 flex flex-col gap-4 sm:mx-0">
      <div className="flex w-full flex-col gap-4 text-center sm:flex-row sm:items-center sm:justify-between sm:text-left">
        <div className="flex flex-col gap-2">
          <h1 className="text-5xl font-semibold text-red-600">Barik Wrapped</h1>
          <p className="text-lg text-slate-700">Resumen de tu año en Metro Bilbao</p>
        </div>
        <div className="w-full max-w-2xl rounded-3xl border border-slate-200 bg-white px-4 pt-4 pb-2 shadow-sm sm:max-w-2xl">
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center sm:justify-center sm:gap-6">
            <div className="w-full max-w-sm text-left sm:max-w-md">
              <div className="relative">
                <span className="pointer-events-none absolute left-4 top-1 flex items-center gap-1 text-[10px] font-semibold uppercase text-slate-400">
                  <CalendarDays className="h-3 w-3" aria-hidden />
                  <span>Versión</span>
                </span>
                <select
                  className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 pb-2 pt-5 text-xs font-semibold"
                  value={selectedHistoryId}
                  onChange={(event) => onSelectHistory(event.target.value)}
                  disabled={historyLoading || !hasHistory}
                >
                  {!hasHistory && <option value="">Aún no hay datos</option>}
                  {historyOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="w-full max-w-xs space-y-3 text-left">
              <input
                ref={fileInputRef}
                className="hidden"
                type="file"
                accept="application/pdf"
                onChange={onFileChange}
              />
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onUploadAndProcess}
                  disabled={isParsing}
                  className="h-12 flex-1 rounded-2xl bg-red-600 px-4 text-xs font-semibold uppercase tracking-wide text-white disabled:opacity-40"
                >
                  <span className="flex items-center justify-center gap-2">
                    <Upload className="h-4 w-4" aria-hidden />
                    {isParsing ? 'Procesando…' : 'Subir historial'}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={onOpenConfig}
                  className="flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-200 text-slate-600 hover:text-slate-900"
                  aria-label="Abrir configuración"
                >
                  <Settings className="h-4 w-4" aria-hidden />
                </button>
              </div>
            </div>
          </div>
          <div className="mt-3 flex items-center justify-center gap-2 text-center text-xs font-semibold text-slate-600">
            <ShieldCheck className="h-4 w-4 text-emerald-600" aria-hidden />
            <span>Todos los datos son procesados y guardados en tu navegador</span>
          </div>
          <div className="mt-3 text-sm text-slate-500">
            {isParsing && 'Procesando…'}
            {!isParsing && statusMessage && <span>{statusMessage}</span>}
            {error && <span className="block font-semibold text-red-600">{error}</span>}
          </div>
        </div>
      </div>
    </header>
  )
}
