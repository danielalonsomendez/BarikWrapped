import Image from 'next/image'
import { ExternalLink, Upload, Mail, LogIn, FileDown, AlertCircle } from 'lucide-react'

type HelpInstructionsProps = {
  onImportPdf: () => void
}

export function HelpInstructions({ onImportPdf }: HelpInstructionsProps) {
  return (
    <section className="rounded-none border-0 bg-white p-4 text-slate-800 shadow-none sm:rounded-3xl sm:border sm:border-slate-200 sm:p-8 sm:shadow-lg">
      <div className="space-y-8">
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Guía rápida</p>
          <h2 className="text-2xl font-semibold text-slate-900">¿Cómo consigo el PDF de mis movimientos?</h2>
          <p className="max-w-2xl text-sm text-slate-600">
            Sigue estos tres pasos para localizar tus credenciales, entrar en la plataforma de CTB y descargar el documento que
            puedes importar en Barik Wrapped.
          </p>
        </div>

        <div className="space-y-8">
          <div className="flex items-start gap-3 rounded-[28px] border border-amber-200 bg-amber-50 p-4 text-amber-900 shadow-sm">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
              <AlertCircle className="h-5 w-5" aria-hidden />
            </span>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-amber-600">Importante</p>
              <p className="mt-2 text-sm text-amber-800">Solo se pueden exportar los movimientos de tarjetas Barik personalizadas.</p>
            </div>
          </div>

          <div className="rounded-[36px] border border-slate-200/70 bg-white/80 p-6 shadow-xl backdrop-blur-sm sm:p-8">
            <div className="flex flex-col gap-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
                <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-red-600 text-white shadow-md">
                  <Mail className="h-6 w-6" aria-hidden />
                </span>
                <div className="space-y-1">
                  <p className="text-xs font-semibold uppercase tracking-[0.32em] text-red-600/90">Paso 1</p>
                  <h3 className="text-xl font-semibold text-slate-900">Comprueba que tienes tus datos de acceso</h3>
                </div>
              </div>
              <p className="text-sm text-slate-600">
                Cuando creaste tu Barik personalizada te pidieron un correo electrónico. Después, debiste recibir un email con el asunto "BARIK. Datu pertsonaletarako sarbidea - Acceso datos personales". En ese correo aparecen tu nombre de usuario y contraseña.
              </p>
              <div className="space-y-2 text-sm text-slate-600">
                <p className="font-semibold text-slate-700">Si no encuentras ese correo, puedes:</p>
                <ul className="ml-4 list-disc space-y-1">
                  <li>Restablecer tu contraseña desde la plataforma.</li>
                  <li>
                    Solicitar tus datos por correo:
                    <a className="ml-1 font-semibold text-slate-900 underline" href="mailto:barikctb@cotrabi.eus">barikctb@cotrabi.eus</a>
                  </li>
                  <li>
                    Solicitarlos por teléfono: <span className="font-semibold text-slate-900">94 685 5000</span> (lunes a viernes de 08:00 a 20:00 y sábados por la mañana).
                  </li>
                  <li>Acudir a cualquier oficina presencial.</li>
                </ul>
              </div>
              <a
                href="/ayuda/paso1.jpg"
                target="_blank"
                rel="noopener noreferrer"
                className="block overflow-hidden rounded-3xl border border-slate-200/70 shadow-lg"
              >
                <Image
                  src="/ayuda/paso1.jpg"
                  alt="Captura indicando dónde encontrar el correo con tus credenciales"
                  width={960}
                  height={600}
                  className="h-auto w-full"
                  priority
                />
              </a>
            </div>
          </div>

          <div className="rounded-[36px] border border-slate-200/70 bg-white/80 p-6 shadow-xl backdrop-blur-sm sm:p-8">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:gap-8">
              <div className="flex-1 space-y-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
                  <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-600 text-white shadow-md">
                    <LogIn className="h-6 w-6" aria-hidden />
                  </span>
                  <div className="space-y-1">
                    <p className="text-xs font-semibold uppercase tracking-[0.32em] text-indigo-600/90">Paso 2</p>
                    <h3 className="text-xl font-semibold text-slate-900">Inicia sesión en CTB Mi Barik</h3>
                  </div>
                </div>
                <p className="text-sm text-slate-600">
                  Entra en la plataforma CTB Mi Barik y accede con tu correo electrónico y la contraseña que aparece en el email.
                </p>
                <a
                  href="https://login.ctb.eus/auth/?client_id=mibarik&response_type=code&ui_locales=es&redirect_uri=https%3A%2F%2Fwww.ctb.eus%2Fmibarik%2Foauth.php&state=es"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-red-600 px-5 py-3 text-xs font-semibold uppercase tracking-wide text-white shadow-sm transition hover:bg-red-500"
                >
                  Abrir CTB Mi Barik
                  <ExternalLink className="h-4 w-4" aria-hidden />
                </a>
              </div>
              <a
                href="https://login.ctb.eus/auth/?client_id=mibarik&response_type=code&ui_locales=es&redirect_uri=https%3A%2F%2Fwww.ctb.eus%2Fmibarik%2Foauth.php&state=es"
                target="_blank"
                rel="noopener noreferrer"
                className="block overflow-hidden rounded-3xl border border-slate-200/70 shadow-lg"
                aria-label="Abrir CTB Mi Barik"
              >
                <Image
                  src="/ayuda/paso2.jpg"
                  alt="Captura de la pantalla de inicio de sesión de CTB Mi Barik"
                  width={640}
                  height={960}
                  className="h-auto w-full max-h-[220px] object-contain sm:max-h-[260px]"
                />
              </a>
            </div>
          </div>

          <div className="rounded-[36px] border border-slate-200/70 bg-white/80 p-6 shadow-xl backdrop-blur-sm sm:p-8">
            <div className="flex flex-col gap-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
                <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-md">
                  <FileDown className="h-6 w-6" aria-hidden />
                </span>
                <div className="space-y-1">
                  <p className="text-xs font-semibold uppercase tracking-[0.32em] text-emerald-600/90">Paso 3</p>
                  <h3 className="text-xl font-semibold text-slate-900">Exporta tus movimientos</h3>
                </div>
              </div>
              <p className="text-sm text-slate-600">
                Dentro de "Movimientos realizados", selecciona tu tarjeta Barik, pulsa "Imprimir" y se descargará un PDF. Ese documento es el que debes importar en Barik Wrapped.
              </p>
              <button
                type="button"
                onClick={onImportPdf}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-red-600 px-5 py-3 text-xs font-semibold uppercase tracking-wide text-white shadow-sm transition hover:bg-red-500"
              >
                <Upload className="h-4 w-4" aria-hidden />
                Importar PDF en Barik Wrapped
              </button>
              <a
                href="/ayuda/paso3.jpg"
                target="_blank"
                rel="noopener noreferrer"
                className="block overflow-hidden rounded-3xl border border-slate-200/70 shadow-lg"
              >
                <Image
                  src="/ayuda/paso3.jpg"
                  alt="Captura de la opción de imprimir movimientos en Mi Barik"
                  width={960}
                  height={600}
                  className="h-auto w-full max-h-[420px] object-contain sm:max-h-[520px]"
                />
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
