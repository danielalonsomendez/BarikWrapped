'use client'

import { Suspense } from 'react'
import dynamic from 'next/dynamic'

const MainApp = dynamic(() => import('./MainApp'), { 
  ssr: false,
  loading: () => (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-slate-600">Cargando...</div>
    </div>
  )
})

export default function Home() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-slate-600">Cargando...</div>
      </div>
    }>
      <MainApp />
    </Suspense>
  )
}
