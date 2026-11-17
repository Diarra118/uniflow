import { useEffect } from 'react'

export const APP_NAME = 'UniFlow'

/** Titre de l'onglet : « UniFlow », suivi du nom de la page s'il est donné. */
export function useDocumentTitle(page?: string) {
  useEffect(() => {
    document.title = page ? `${APP_NAME} — ${page}` : APP_NAME
  }, [page])
}
