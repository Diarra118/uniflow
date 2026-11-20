import { Info } from 'lucide-react'
import { LOCAL_ONLY_MESSAGE } from '@/core/config/features'

/** Message affiché à la place d'une action qui exige les Cloud Functions,
 * absentes de la version hébergée (voir core/config/features.ts). */
export function LocalOnlyNotice({ className = '' }: { className?: string }) {
  return (
    <p role="note" data-local-only className={`flex items-start gap-2 text-sm text-base-content/70 ${className}`}>
      <Info size={15} aria-hidden="true" className="mt-0.5 shrink-0" />
      <span>{LOCAL_ONLY_MESSAGE}</span>
    </p>
  )
}

/** Page entière réservée à la version locale (route interne ou publique). */
export function LocalOnlyPanel({ title }: { title: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-box border border-dashed border-base-300 px-6 py-16 text-center">
      <h1 className="font-display text-lg font-semibold">{title}</h1>
      <LocalOnlyNotice className="mt-2 max-w-md justify-center text-left" />
    </div>
  )
}
