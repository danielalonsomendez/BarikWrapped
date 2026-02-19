'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent, SyntheticEvent } from 'react'
import {
  AppBar,
  Button,
  BottomNavigation,
  BottomNavigationAction,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  IconButton,
  InputLabel,
  List,
  ListItemIcon,
  ListItemButton,
  ListItemText,
  MenuItem,
  Paper,
  Select,
  Toolbar,
  Typography,
} from '@mui/material'
import { ThemeProvider, createTheme } from '@mui/material/styles'
import { CalendarDays, Clock3, Github, Grid, HelpCircle, History, Settings, ShieldCheck, Upload } from 'lucide-react'
import dynamic from 'next/dynamic'
import { HeaderSection, type HistoryOption } from './components/HeaderSection'
import { HelpInstructions } from './components/HelpInstructions'
import { extractTransactionsFromFile } from './lib/pdfParser'
import { listHistory, saveHistory, type HistoryEntry } from './lib/historyStore'
import { dateFormatter, fullDateFormatter, fullDateTimeFormatter } from './lib/dateFormatters'
import { usePlatform } from './lib/usePlatform'
import { getRecordDate } from './components/history/historyDataTransforms'

const AnnualPanel = dynamic(
  () => import('./components/AnnualTab').then(mod => ({ default: mod.AnnualPanel })),
  { ssr: false }
)

const HistoryExperience = dynamic(
  () => import('./components/HistoryTab').then(mod => ({ default: mod.HistoryExperience })),
  { ssr: false }
)

const MetroDiagram = dynamic(
  () => import('./components/metro/MetroDiagram').then(mod => ({ default: mod.MetroDiagram })),
  { ssr: false }
)

type TabId = 'panel' | 'fotos' | 'historial' | 'metro'
type BottomTabId = Exclude<TabId, 'metro'>
type BottomNavigationValue = BottomTabId
type YearOption = { value: string; label: string; total: number }
const BARIK_RED = '#E30613'
const NATIVE_HEADER_HEIGHT = 64
const NATIVE_HEADER_EXTRA_OFFSET = 16
const APP_FONT_FAMILY = 'var(--font-geist-sans), Arial, Helvetica, sans-serif'
const materialTheme = createTheme({
  typography: {
    fontFamily: APP_FONT_FAMILY,
  },
  components: {
    MuiButtonBase: {
      styleOverrides: {
        root: {
          fontFamily: APP_FONT_FAMILY,
        },
      },
    },
    MuiInputBase: {
      styleOverrides: {
        root: {
          fontFamily: APP_FONT_FAMILY,
        },
      },
    },
    MuiTypography: {
      styleOverrides: {
        root: {
          fontFamily: APP_FONT_FAMILY,
        },
      },
    },
    MuiBottomNavigationAction: {
      styleOverrides: {
        label: {
          fontFamily: APP_FONT_FAMILY,
        },
      },
    },
  },
})

const TABS: Array<{ id: TabId; label: string }> = [
  { id: 'panel', label: 'Resumen' },
  { id: 'fotos', label: 'Fotos' },
  { id: 'historial', label: 'Historial' }
]
const TAB_LABELS: Record<TabId, string> = {
  panel: 'Resumen anual',
  fotos: 'Fotos',
  historial: 'Historial',
  metro: 'Metro',
}

export default function MainApp() {
  const { isNative, mounted } = usePlatform()
  const [file, setFile] = useState<File | null>(null)
  const [isParsing, setIsParsing] = useState(false)
  const [statusMessage, setStatusMessage] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [selectedHistoryId, setSelectedHistoryId] = useState<string>('')
  const [historyLoading, setHistoryLoading] = useState(true)
  const [historyBootstrapped, setHistoryBootstrapped] = useState(false)
  const [activeTab, setActiveTab] = useState<TabId>('panel')
  const [isConfigOpen, setIsConfigOpen] = useState(false)
  const [isHelpVisible, setIsHelpVisible] = useState(false)
  const [isNativeVersionDialogOpen, setIsNativeVersionDialogOpen] = useState(false)
  const [nativeSelectedYear, setNativeSelectedYear] = useState('')
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const historyOptions = useMemo<HistoryOption[]>(() => {
    return history.map((entry) => ({
      id: entry.id,
      label: fullDateTimeFormatter.format(new Date(entry.createdAt)),
    }))
  }, [history])

  const selectedHistory = useMemo(() => {
    return history.find((entry) => entry.id === selectedHistoryId) ?? null
  }, [history, selectedHistoryId])

  const nativeYearOptions = useMemo<YearOption[]>(() => {
    if (!selectedHistory) {
      return []
    }
    const recordsByYear = new Map<string, number>()
    selectedHistory.records.forEach((record) => {
      const date = getRecordDate(record)
      if (Number.isNaN(date.getTime()) || date.getFullYear() < 2000) {
        return
      }
      const year = `${date.getFullYear()}`
      recordsByYear.set(year, (recordsByYear.get(year) ?? 0) + 1)
    })
    return Array.from(recordsByYear.entries())
      .sort(([yearA], [yearB]) => Number(yearB) - Number(yearA))
      .map(([year, total]) => ({ value: year, label: year, total }))
  }, [selectedHistory])

  useEffect(() => {
    void refreshHistory()
  }, [])

  useEffect(() => {
    if (!nativeYearOptions.length) {
      if (nativeSelectedYear) {
        setNativeSelectedYear('')
      }
      return
    }
    if (!nativeSelectedYear || !nativeYearOptions.some((option) => option.value === nativeSelectedYear)) {
      setNativeSelectedYear(nativeYearOptions[0].value)
    }
  }, [nativeSelectedYear, nativeYearOptions])

  async function refreshHistory(newSelectedId?: string) {
    setHistoryLoading(true)
    try {
      const entries = await listHistory()
      setHistory(entries)
      setIsHelpVisible(entries.length === 0)
      if (entries.length && !newSelectedId) {
        setSelectedHistoryId(entries[0].id)
      }
      if (newSelectedId) {
        setSelectedHistoryId(newSelectedId)
      }
    } finally {
      setHistoryLoading(false)
      setHistoryBootstrapped(true)
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

  const hasHistory = history.length > 0
  const isBootLoading = !mounted || !historyBootstrapped
  const shouldShowHelp = (!historyLoading && !hasHistory) || isHelpVisible
  const showNativeHeader = mounted && isNative
  const showNativeBottomNavigation = mounted && isNative && hasHistory && !historyLoading
  const nativeContentPaddingBottom = showNativeBottomNavigation
    ? 'calc(64px + env(safe-area-inset-bottom))'
    : undefined
  const nativeContentPaddingTop = showNativeHeader
    ? `calc(${NATIVE_HEADER_HEIGHT + NATIVE_HEADER_EXTRA_OFFSET}px + env(safe-area-inset-top))`
    : undefined
  const showNativeYearSelect =
    showNativeHeader && !shouldShowHelp && (activeTab === 'panel' || activeTab === 'fotos') && nativeYearOptions.length > 0
  const nativeYearDateRangeLabel = useMemo(() => {
    if (!selectedHistory || !nativeSelectedYear) {
      return null
    }
    let minDate: Date | null = null
    let maxDate: Date | null = null
    selectedHistory.records.forEach((record) => {
      const date = getRecordDate(record)
      if (Number.isNaN(date.getTime()) || date.getFullYear() < 2000) {
        return
      }
      if (`${date.getFullYear()}` !== nativeSelectedYear) {
        return
      }
      if (!minDate || date < minDate) {
        minDate = date
      }
      if (!maxDate || date > maxDate) {
        maxDate = date
      }
    })
    if (!minDate || !maxDate) {
      return null
    }
    return `${fullDateFormatter.format(minDate)} - ${fullDateFormatter.format(maxDate)}`
  }, [nativeSelectedYear, selectedHistory])
  const bottomNavigationValue: BottomNavigationValue = activeTab === 'metro' ? 'panel' : activeTab
  const nativeHeaderSubtitle = shouldShowHelp ? 'Ayuda' : TAB_LABELS[activeTab]
  if (isBootLoading) {
    return <FullScreenLoading />
  }

  const handleBottomNavigationChange = (_event: SyntheticEvent, newValue: BottomNavigationValue) => {
    if (newValue === 'panel' || newValue === 'fotos' || newValue === 'historial') {
      setActiveTab(newValue)
      setIsHelpVisible(false)
    }
  }

  return (
    <ThemeProvider theme={materialTheme}>
      <div
      className={`min-h-screen bg-slate-50 text-slate-900 ${
        showNativeHeader ? 'px-0 py-0 sm:px-0 sm:py-0' : 'px-0 py-6 sm:px-4 sm:py-10'
      }`}
      style={{ paddingBottom: nativeContentPaddingBottom }}
    >
      {showNativeHeader && (
        <NativeCapacitorHeader
          isParsing={isParsing}
          isHelpActive={shouldShowHelp}
          subtitle={nativeHeaderSubtitle}
          onToggleHelp={() => setIsHelpVisible((prev) => !prev)}
          onOpenVersionsDialog={() => setIsNativeVersionDialogOpen(true)}
        />
      )}

      <main
        className={`mx-0 flex w-full max-w-full flex-col ${showNativeHeader ? 'gap-0' : 'gap-8'} sm:mx-auto sm:max-w-6xl sm:mx-0`}
        style={{ paddingTop: nativeContentPaddingTop }}
      >
        {showNativeYearSelect && (
          <div className="mx-4 mb-0 pb-0 sm:mx-0">
            <FormControl fullWidth size="small" sx={{ maxWidth: 360 }}>
              <InputLabel id="native-year-select-label">Año</InputLabel>
              <Select
                labelId="native-year-select-label"
                value={nativeSelectedYear}
                label="Año"
                onChange={(event) => setNativeSelectedYear(event.target.value)}
                sx={{ backgroundColor: '#ffffff' }}
              >
                {nativeYearOptions.map((option) => (
                  <MenuItem key={option.value} value={option.value}>
                    {option.label} · {option.total} movimientos
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            {nativeYearDateRangeLabel && (
              <p className="mt-2 mb-0 text-xs font-semibold text-slate-500">{nativeYearDateRangeLabel}</p>
            )}
          </div>
        )}

        {!showNativeHeader && (
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
            onToggleHelp={() => setIsHelpVisible((prev) => !prev)}
            isHelpActive={shouldShowHelp}
          />
        )}

        <div className="flex flex-col gap-4">
          {shouldShowHelp ? (
            <HelpInstructions onImportPdf={handleUploadAndProcess} />
          ) : (
            <>
              {!showNativeBottomNavigation && (
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
              )}

              <HistoryExperience
                history={history}
                historyLoading={historyLoading}
                selectedHistoryId={selectedHistoryId}
                isVisible={activeTab === 'historial'}
                hideSectionTitle={showNativeHeader}
              />

              {(activeTab === 'panel' || activeTab === 'fotos') && (
                <AnnualPanel
                  history={selectedHistory}
                  historyLoading={historyLoading}
                  view={activeTab === 'fotos' ? 'photos' : 'overview'}
                  hideSectionTitle={showNativeHeader}
                  selectedYear={showNativeHeader ? nativeSelectedYear : undefined}
                  onSelectedYearChange={showNativeHeader ? setNativeSelectedYear : undefined}
                  hideYearSelector={showNativeHeader}
                />
              )}

              {activeTab === 'metro' && (
                <section className="w-full rounded-none border-0 bg-white p-4 shadow-none sm:mt-0 sm:rounded-3xl sm:border sm:border-slate-200 sm:p-6 sm:shadow-lg">
                  <MetroDiagram />
                </section>
              )}
            </>
          )}

          {isConfigOpen &&
            (showNativeHeader ? (
              <NativeConfigDialog
                onClose={() => setIsConfigOpen(false)}
                history={history}
                selectedHistoryId={selectedHistoryId}
              />
            ) : (
              <ConfigModal
                onClose={() => setIsConfigOpen(false)}
                history={history}
                selectedHistoryId={selectedHistoryId}
              />
            ))}
        </div>
      </main>
      {showNativeHeader && (
        <>
          <input
            ref={fileInputRef}
            className="hidden"
            type="file"
            accept="application/pdf"
            onChange={handleFileChange}
          />
          <Dialog
            open={isNativeVersionDialogOpen}
            onClose={() => setIsNativeVersionDialogOpen(false)}
            fullWidth
            maxWidth="xs"
          >
            <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pr: 1 }}>
              <span>Versiones guardadas</span>
              <IconButton
                onClick={() => {
                  setIsNativeVersionDialogOpen(false)
                  setIsConfigOpen(true)
                }}
                aria-label="Abrir configuración"
                sx={{ color: 'text.secondary' }}
              >
                <Settings className="h-5 w-5" />
              </IconButton>
            </DialogTitle>
            <DialogContent sx={{ p: 0 }}>
              <List disablePadding>
                <ListItemButton
                  disabled={isParsing}
                  onClick={() => {
                    setIsNativeVersionDialogOpen(false)
                    handleUploadAndProcess()
                  }}
                >
                  <ListItemIcon sx={{ minWidth: 34, color: BARIK_RED }}>
                    <Upload className="h-5 w-5" strokeWidth={2.3} absoluteStrokeWidth />
                  </ListItemIcon>
                  <ListItemText primary={isParsing ? 'Procesando…' : 'Subir nuevo historial'} />
                </ListItemButton>
                {!historyOptions.length && (
                  <ListItemButton disabled>
                    <ListItemText primary="Aun no hay datos" />
                  </ListItemButton>
                )}
                {historyOptions.map((option) => (
                  <ListItemButton
                    key={option.id}
                    selected={option.id === selectedHistoryId}
                    onClick={() => {
                      setSelectedHistoryId(option.id)
                      setIsHelpVisible(false)
                      setIsNativeVersionDialogOpen(false)
                    }}
                  >
                    <ListItemText primary={option.label} />
                  </ListItemButton>
                ))}
              </List>
              <div className="flex items-center justify-center gap-2 border-t border-slate-200 px-4 py-3 text-center text-xs font-semibold text-slate-600">
                <ShieldCheck className="h-4 w-4 text-emerald-600" strokeWidth={2.3} absoluteStrokeWidth />
                <span>Todos los datos son procesados y guardados en tu dispositivo</span>
              </div>
            </DialogContent>
          </Dialog>
        </>
      )}
      {!showNativeHeader && (
        <footer className="mt-8 flex items-center justify-center gap-2 text-sm text-slate-500 sm:mt-12">
          <a
            href="https://github.com/danielalonsomendez"
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-slate-600 transition hover:text-slate-900"
          >
            Hecho por @danielalonsomendez
          </a>
          <a
            href="https://github.com/danielalonsomendez/BarikWrapped"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-900"
          >
            <Github className="h-4 w-4" aria-hidden />
            <span>Repositorio</span>
          </a>
        </footer>
      )}

        {showNativeBottomNavigation && (
          <Paper
            elevation={10}
            sx={{
              position: 'fixed',
              right: 0,
              bottom: 0,
              left: 0,
              zIndex: 40,
              borderTopLeftRadius: 18,
              borderTopRightRadius: 18,
              overflow: 'hidden',
              backgroundColor: BARIK_RED,
              pb: 'env(safe-area-inset-bottom)',
            }}
          >
            <BottomNavigation
              showLabels
              value={bottomNavigationValue}
              onChange={handleBottomNavigationChange}
              sx={{
                backgroundColor: BARIK_RED,
                px: 1.5,
                '& .MuiBottomNavigationAction-root': {
                  color: 'rgba(255, 255, 255, 0.85)',
                },
                '& .MuiBottomNavigationAction-root.Mui-selected': {
                  color: '#ffffff',
                },
                '& .MuiBottomNavigationAction-root svg': {
                  width: 22,
                  height: 22,
                  strokeWidth: 2.3,
                },
              }}
            >
              <BottomNavigationAction
                label="Resumen"
                value="panel"
                icon={<CalendarDays className="h-5 w-5" strokeWidth={2.3} absoluteStrokeWidth />}
              />
              <BottomNavigationAction
                label="Fotos"
                value="fotos"
                icon={<Grid className="h-5 w-5" strokeWidth={2.3} absoluteStrokeWidth />}
              />
              <BottomNavigationAction
                label="Historial"
                value="historial"
                icon={<Clock3 className="h-5 w-5" strokeWidth={2.3} absoluteStrokeWidth />}
              />
            </BottomNavigation>
          </Paper>
        )}
      </div>
    </ThemeProvider>
  )
}

function FullScreenLoading() {
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-[#E30613]">
      <div className="h-12 w-12 animate-spin rounded-full border-4 border-white/35 border-t-white" aria-label="Cargando" />
    </div>
  )
}

type NativeCapacitorHeaderProps = {
  isParsing: boolean
  isHelpActive: boolean
  subtitle: string
  onToggleHelp: () => void
  onOpenVersionsDialog: () => void
}

function NativeCapacitorHeader({
  isParsing,
  isHelpActive,
  subtitle,
  onToggleHelp,
  onOpenVersionsDialog,
}: NativeCapacitorHeaderProps) {
  return (
    <AppBar
      position="fixed"
      elevation={0}
      sx={{
        backgroundColor: BARIK_RED,
        pt: 'env(safe-area-inset-top)',
      }}
    >
      <Toolbar sx={{ minHeight: `${NATIVE_HEADER_HEIGHT}px !important`, px: 1 }}>
        <div className="flex flex-1 flex-col leading-tight">
          <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, opacity: 0.9 }}>
            Barik Wrapped
          </Typography>
          <Typography variant="h6" sx={{ fontSize: '1.2rem', fontWeight: 700 }}>
            {subtitle}
          </Typography>
        </div>
        <IconButton
          color="inherit"
          onClick={onToggleHelp}
          aria-label="Ayuda"
          sx={{
            mr: 0.5,
            ...(isHelpActive
              ? {
                  backgroundColor: '#ffffff',
                  color: BARIK_RED,
                  borderRadius: '9999px',
                  '&:hover': { backgroundColor: '#f8fafc' },
                }
              : {
                  backgroundColor: 'transparent',
                  '&:hover': { backgroundColor: 'rgba(255,255,255,0.12)' },
                }),
          }}
        >
          <HelpCircle className="h-5 w-5" strokeWidth={2.3} absoluteStrokeWidth />
        </IconButton>
        <IconButton
          color="inherit"
          onClick={onOpenVersionsDialog}
          disabled={isParsing}
          aria-label="Versiones guardadas"
        >
          <History className="h-5 w-5" strokeWidth={2.3} absoluteStrokeWidth />
        </IconButton>
      </Toolbar>
    </AppBar>
  )
}

type ConfigModalProps = {
  onClose: () => void
  history: HistoryEntry[]
  selectedHistoryId: string
}

function NativeConfigDialog({ onClose, history, selectedHistoryId }: ConfigModalProps) {
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
    <Dialog open onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>Configuracion</DialogTitle>
      <DialogContent sx={{ pt: 0 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
          Descarga y copia de seguridad
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          Exporta todos los datos guardados en tu dispositivo para conservar una copia o moverla a otro dispositivo.
        </Typography>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} color="inherit">
          Cerrar
        </Button>
        <Button
          variant="contained"
          onClick={() => {
            handleDownloadSelectedHistory()
            onClose()
          }}
          disabled={!selectedHistory}
          sx={{
            backgroundColor: BARIK_RED,
            '&:hover': {
              backgroundColor: '#b90510',
            },
          }}
        >
          Descargar datos
        </Button>
      </DialogActions>
    </Dialog>
  )
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
