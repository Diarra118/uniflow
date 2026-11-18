import type { ReactNode } from 'react'
import { BrandMark } from './BrandMark'

const HIGHLIGHTS = ['Étudiants & inscriptions', 'Notes & examens', 'Paiements & documents']

/** Mise en page des pages publiques d'accès (connexion, inscription) :
 * panneau de marque à gauche (grand écran), formulaire à droite. */
export function AuthLayout({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="brand-panel relative hidden flex-col justify-between overflow-hidden p-10 lg:flex">
        <p className="text-sm font-medium tracking-wide opacity-80">
          Plateforme de gestion universitaire
        </p>

        <div>
          <p className="font-display max-w-md text-3xl font-medium leading-snug">
            Un registre unique, piloté par l'IA, pour accompagner chaque
            établissement du premier semestre au diplôme.
          </p>
          <div className="mt-8 space-y-2">
            {HIGHLIGHTS.map((line, i) => (
              <div key={line} className="flex items-center gap-3 text-sm">
                <span className="brand-panel-accent font-mono-data w-6">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span className="h-px flex-1 bg-current opacity-20" />
                <span className="opacity-85">{line}</span>
              </div>
            ))}
          </div>
        </div>

        <p className="text-xs opacity-75">
          © {new Date().getFullYear()} UniFlow — Tous droits réservés
        </p>
      </div>

      <div className="flex items-center justify-center bg-base-100 p-6">
        <div className={`w-full ${wide ? 'max-w-md' : 'max-w-sm'} py-6`}>
          <BrandMark className="mb-8" />
          {children}
        </div>
      </div>
    </div>
  )
}
