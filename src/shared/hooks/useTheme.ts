import { useCallback, useEffect, useState } from 'react'

type Theme = 'uniflow-light' | 'uniflow-dark'

const STORAGE_KEY = 'uniflow-theme'

function getInitialTheme(): Theme {
  const stored = localStorage.getItem(STORAGE_KEY) as Theme | null
  if (stored) return stored
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'uniflow-dark'
    : 'uniflow-light'
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem(STORAGE_KEY, theme)
  }, [theme])

  const toggleTheme = useCallback(() => {
    setTheme((t) => (t === 'uniflow-light' ? 'uniflow-dark' : 'uniflow-light'))
  }, [])

  return { theme, toggleTheme, isDark: theme === 'uniflow-dark' }
}
