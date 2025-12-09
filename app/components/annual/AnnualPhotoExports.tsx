'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { toPng } from 'html-to-image'
import { Download, Grid, Instagram, Share2 } from 'lucide-react'
import Image from 'next/image'
import { AnnualInsights } from './AnnualInsights'
import type { AnnualSummary } from '../AnnualTab'

const integerFormatter = new Intl.NumberFormat('es-ES')

type AspectKey = 'square' | 'portrait'

type AspectOption = {
  value: AspectKey
  label: string
  aspectRatio: string
  width: number
  height: number
  icon: 'grid' | 'instagram'
}

const ASPECT_OPTIONS: AspectOption[] = [
  {
    value: 'square',
    label: 'Publicación',
    aspectRatio: '1 / 1',
    width: 1080,
    height: 1080,
    icon: 'grid',
  },
  {
    value: 'portrait',
    label: 'Historia',
    aspectRatio: '9 / 16',
    width: 1080,
    height: 1920,
    icon: 'instagram',
  },
]

const buildDefaultFileName = (year: string, option: AspectOption) => {
  return `barik-wrapped-${year}-${option.value}-resumen.png`
}

type AnnualPhotoExportsProps = {
  selectedYear: string
  summary: AnnualSummary
  previousYearSummary: AnnualSummary | null
  previousYearKey: string | null
}

export function AnnualPhotoExports({ selectedYear, summary, previousYearSummary, previousYearKey }: AnnualPhotoExportsProps) {
  const [selectedAspect, setSelectedAspect] = useState<AspectKey>('square')
  const [isDownloading, setIsDownloading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [shareFeedback, setShareFeedback] = useState<{ type: 'info' | 'error'; text: string } | null>(null)
  const captureRef = useRef<HTMLDivElement | null>(null)
  const previewWrapperRef = useRef<HTMLDivElement | null>(null)

  const hasData = summary.totalJourneys > 0 || summary.totalRecharges > 0

  const selectedOption = useMemo(() => {
    return ASPECT_OPTIONS.find((option) => option.value === selectedAspect) ?? ASPECT_OPTIONS[0]
  }, [selectedAspect])

  const isPortrait = selectedAspect === 'portrait'

  const basePreviewScale = useMemo(() => {
    return isPortrait ? 0.48 : 0.62
  }, [isPortrait])

  const [renderScale, setRenderScale] = useState<number>(basePreviewScale)

  useEffect(() => {
    setRenderScale(basePreviewScale)
  }, [basePreviewScale, selectedOption.width])

  useEffect(() => {
    const node = previewWrapperRef.current
    if (!node) {
      return
    }

    const updateScale = () => {
      const width = node.clientWidth
      if (width > 0) {
        const computedScale = width / selectedOption.width
        const clampedScale = Math.min(computedScale, basePreviewScale)
        setRenderScale(clampedScale)
      }
    }

    updateScale()

    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(updateScale)
      observer.observe(node)
      return () => {
        observer.disconnect()
      }
    }

    window.addEventListener('resize', updateScale)
    return () => {
      window.removeEventListener('resize', updateScale)
    }
  }, [basePreviewScale, selectedOption.width])

  useEffect(() => {
    setShareFeedback(null)
  }, [selectedAspect])

  const previewWrapperStyle = useMemo<CSSProperties>(() => {
    return {
      width: '100%',
      maxWidth: `${selectedOption.width * basePreviewScale}px`,
      height: `${selectedOption.height * renderScale}px`,
      position: 'relative',
      overflow: 'hidden',
    }
  }, [basePreviewScale, renderScale, selectedOption.height, selectedOption.width])

  const scaledContainerStyle = useMemo<CSSProperties>(() => {
    return {
      width: `${selectedOption.width}px`,
      height: `${selectedOption.height}px`,
      transform: `scale(${renderScale})`,
      transformOrigin: 'top left',
      position: 'absolute',
      top: 0,
      left: 0,
    }
  }, [renderScale, selectedOption.height, selectedOption.width])

  const photoColumns = useMemo<1 | 2 | 3>(() => {
    return isPortrait ? 1 : 2
  }, [isPortrait])

  const preferredOperator = summary.highlightOperator ?? summary.topOperators[0] ?? null
  const topOperatorIcon = preferredOperator?.icon ?? null
  const topOperatorDescription = preferredOperator
    ? `Tu operador más habitual fue ${preferredOperator.name}.`
    : null

  const capturePaddingStyle = useMemo<CSSProperties>(() => {
    if (isPortrait) {
      return {
        paddingTop: 110,
        paddingBottom: 130,
        paddingLeft: 90,
        paddingRight: 90,
      }
    }
    return {
      padding: 76,
    }
  }, [isPortrait])

  const summarySentence = `Sumaste ${integerFormatter.format(summary.totalJourneys)} viajes y ${integerFormatter.format(summary.totalRecharges)} recargas este año.`

  const handleDownload = useCallback(async () => {
    if (!captureRef.current || !hasData) {
      return
    }
    setErrorMessage(null)
    setShareFeedback(null)
    setIsDownloading(true)
    try {
      const dataUrl = await toPng(captureRef.current, {
        cacheBust: true,
        width: selectedOption.width,
        height: selectedOption.height,
        pixelRatio: 2,
        backgroundColor: '#0f172a',
      })
      const anchor = document.createElement('a')
      anchor.download = buildDefaultFileName(selectedYear, selectedOption)
      anchor.href = dataUrl
      anchor.click()
    } catch (error) {
      console.error('Foto export failed', error)
      setErrorMessage('No se pudo generar la imagen. Inténtalo de nuevo.')
    } finally {
      setIsDownloading(false)
    }
  }, [hasData, selectedOption, selectedYear])

  const handleShare = useCallback(async () => {
    if (!hasData) {
      return
    }
    setShareFeedback(null)
    setErrorMessage(null)
    const shareText = `Mi resumen Barik Wrapped ${selectedYear}`
    try {
      if (typeof navigator !== 'undefined' && 'share' in navigator) {
        const shareNavigator = navigator as Navigator & { share: (data: ShareData) => Promise<void> }
        await shareNavigator.share({
          title: `Barik Wrapped ${selectedYear}`,
          text: `${shareText}. Descúbrelo en barikwrapped.danialonso.dev`,
          url: typeof window !== 'undefined' ? window.location.href : undefined,
        })
        setShareFeedback({ type: 'info', text: 'Se abrió el menú de compartir de tu dispositivo.' })
      } else if (typeof window !== 'undefined') {
        window.open('https://www.instagram.com/', '_blank', 'noopener,noreferrer')
        setShareFeedback({
          type: 'info',
          text: 'Hemos abierto Instagram en otra pestaña para que publiques tu tarjeta descargada.',
        })
      }
    } catch (error) {
      const abort = error instanceof DOMException && error.name === 'AbortError'
      if (!abort) {
        console.error('Share action failed', error)
        setShareFeedback({ type: 'error', text: 'No se pudo abrir las opciones para compartir.' })
      }
    }
  }, [hasData, selectedYear])

  return (
    <div className="mt-8 space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-slate-900">Fotos para compartir</h3>
        <p className="mt-2 text-sm text-slate-500">
          Personaliza la plantilla y el formato para compartir tus datos de {selectedYear} en redes sociales.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <span className="text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-400">Formato</span>
        {ASPECT_OPTIONS.map((option) => {
          const isActive = option.value === selectedAspect
          const IconComponent = option.icon === 'instagram' ? Instagram : Grid
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => setSelectedAspect(option.value)}
              className={`inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-xs font-semibold transition ${
                isActive
                  ? 'border-slate-900 bg-slate-900 text-white'
                  : 'border-slate-200 text-slate-600 hover:text-slate-900'
              }`}
            >
              <IconComponent className="h-3.5 w-3.5" aria-hidden />
              <span>{option.label}</span>
            </button>
          )
        })}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex flex-col items-center gap-4 rounded-3xl border border-slate-200 bg-slate-50 p-6">
          {!hasData ? (
            <p className="text-sm text-slate-500">
              Necesitas al menos un viaje o una recarga para generar tu foto.
            </p>
          ) : (
            <div
              ref={previewWrapperRef}
              className="overflow-hidden rounded-[32px]"
              style={previewWrapperStyle}
            >
              <div className="origin-top-left" style={scaledContainerStyle}>
                <div
                  ref={captureRef}
                  className={`flex h-full w-full flex-col ${isPortrait ? 'gap-12' : 'gap-8'} overflow-hidden rounded-[32px] bg-gradient-to-br from-slate-950 via-slate-900 to-slate-900 text-white shadow-2xl`}
                  style={capturePaddingStyle}
                >
                  <div className="flex items-baseline justify-between gap-6">
                    <h1 className={`${isPortrait ? 'text-6xl' : 'text-5xl'} font-semibold text-red-400`}>Barik Wrapped</h1>
                    <span className={`${isPortrait ? 'text-5xl' : 'text-4xl'} font-semibold text-white`}>{selectedYear}</span>
                  </div>
                  <div className={`${isPortrait ? 'max-w-3xl text-lg' : 'max-w-2xl text-base'} text-slate-200`}>
                    <p>{summarySentence}</p>
                    {topOperatorDescription && (
                      <div className={`mt-4 flex items-center gap-3 ${isPortrait ? 'text-lg' : 'text-base'} text-slate-200`}>
                        {topOperatorIcon ? (
                          <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-white/10 p-2">
                            <Image
                              src={topOperatorIcon}
                              alt=""
                              width={40}
                              height={40}
                              className="h-8 w-8 object-contain"
                              priority
                            />
                          </span>
                        ) : null}
                        <span>{topOperatorDescription}</span>
                      </div>
                    )}
                  </div>

                  <div className="flex-1 min-h-0">
                    <AnnualInsights
                      summary={summary}
                      previousYearSummary={previousYearSummary}
                      previousYearKey={previousYearKey}
                      variant="photo"
                      className="h-full w-full"
                      photoColumns={photoColumns}
                      photoScale={isPortrait ? 'default' : 'compact'}
                    />
                  </div>

                  <p className="text-xs font-semibold uppercase  text-slate-400">
                   barikwrapped.danialonso.dev
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex h-full flex-col rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="space-y-3 text-sm text-slate-600">
            <p>Descarga un PNG listo para Instagram o comparte el enlace desde tu dispositivo.</p>
            <p>Ajusta el formato para presumir tus métricas.</p>
          </div>
          <div className="mt-auto flex flex-col gap-3">
            <button
              type="button"
              onClick={handleDownload}
              disabled={!hasData || isDownloading}
              className={`inline-flex items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition ${
                !hasData || isDownloading
                  ? 'cursor-not-allowed bg-slate-200 text-slate-400'
                  : 'bg-slate-900 text-white hover:bg-slate-800'
              }`}
            >
              <Download className="h-4 w-4" aria-hidden />
              <span>{isDownloading ? 'Generando…' : 'Descargar PNG'}</span>
            </button>
            <button
              type="button"
              onClick={handleShare}
              disabled={!hasData}
              className={`inline-flex items-center justify-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition ${
                !hasData
                  ? 'cursor-not-allowed border-slate-200 text-slate-400'
                  : 'border-slate-300 text-slate-600 hover:border-slate-400 hover:text-slate-900'
              }`}
            >
              <Share2 className="h-4 w-4" aria-hidden />
              <span>Compartir</span>
            </button>
            {errorMessage && <p className="text-sm text-rose-600">{errorMessage}</p>}
            {shareFeedback && (
              <p
                className={`text-sm ${
                  shareFeedback.type === 'error' ? 'text-rose-600' : 'text-slate-500'
                }`}
              >
                {shareFeedback.text}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
