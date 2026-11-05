import { useCallback, useEffect, useState } from 'react'

type Theme = 'uniflow-light' | 'uniflow-dark'

const STORAGE_KEY = 'uniflow-theme'

/** Même logique que le script de index.html, qui applique le thème dès le
 * chargement (pages publiques comprises). */
function getInitialTheme(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'uniflow-light' || stored === 'uniflow-dark') return stored
  } catch {
    // Stockage indisponible : préférence du système.
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'uniflow-dark'
    : 'uniflow-light'
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    try {
      localStorage.setItem(STORAGE_KEY, theme)
    } catch {
      // Stockage indisponible : thème appliqué, non mémorisé.
    }
  }, [theme])

  const toggleTheme = useCallback(() => {
    setTheme((t) => (t === 'uniflow-light' ? 'uniflow-dark' : 'uniflow-light'))
  }, [])

  return { theme, toggleTheme, isDark: theme === 'uniflow-dark' }
}
