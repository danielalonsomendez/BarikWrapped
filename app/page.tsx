'use client'

import { Suspense } from 'react'
import dynamic from 'next/dynamic'

function LoadingScreen() {
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-[#E30613]">
      <div className="h-12 w-12 animate-spin rounded-full border-4 border-white/35 border-t-white" aria-label="Cargando" />
    </div>
  )
}

const MainApp = dynamic(() => import('./MainApp'), { 
  ssr: false,
  loading: () => <LoadingScreen />
})

export default function Home() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <MainApp />
    </Suspense>
  )
}
