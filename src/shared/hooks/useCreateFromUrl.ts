import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

/** Paramètre d'URL qui ouvre le formulaire de création d'une page de liste
 * (actions rapides du tableau de bord : /app/students?nouveau=1). */
export const CREATE_PARAM = 'nouveau'

/**
 * État d'ouverture du formulaire de création, ouvert d'emblée quand l'URL
 * contient ?nouveau=1 ET que l'utilisateur a le droit de créer. Le paramètre
 * est retiré aussitôt : fermer le formulaire puis recharger la page ne le
 * rouvre pas.
 */
export function useCreateFromUrl(canCreate: boolean) {
  const [searchParams, setSearchParams] = useSearchParams()
  const [open, setOpen] = useState(() => canCreate && searchParams.get(CREATE_PARAM) === '1')

  useEffect(() => {
    if (!searchParams.has(CREATE_PARAM)) return
    const next = new URLSearchParams(searchParams)
    next.delete(CREATE_PARAM)
    setSearchParams(next, { replace: true })
  }, [searchParams, setSearchParams])

  return [open, setOpen] as const
}
