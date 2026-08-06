'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState, useEffect } from 'react'

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30 * 1000,
            refetchOnWindowFocus: false,
          },
        },
      })
  )

  // v21·0622: Restore dark mode preference from localStorage on app load.
  // This runs once on mount — before any component renders — so the dark
  // class is set on <html> before paint, preventing a flash of light mode.
  useEffect(() => {
    if (typeof localStorage === 'undefined') return
    try {
      const stored = localStorage.getItem('laxree-dark-mode')
      if (stored === '1' && typeof document !== 'undefined') {
        document.documentElement.classList.add('dark')
      }
    } catch {}
  }, [])

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  )
}
