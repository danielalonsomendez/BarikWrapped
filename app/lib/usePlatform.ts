'use client'

import { useEffect, useState } from 'react'
import { isNativeApp, isWeb, getPlatform } from './platformDetection'

export function usePlatform() {
  const [platform, setPlatform] = useState<'ios' | 'android' | 'web'>('web')
  const [isNative, setIsNative] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setPlatform(getPlatform())
    setIsNative(isNativeApp())
    setMounted(true)
  }, [])

  return {
    platform,
    isNative,
    isWeb: !isNative,
    isIOS: platform === 'ios',
    isAndroid: platform === 'android',
    mounted, // útil para evitar hidratación incorrecta
  }
}
