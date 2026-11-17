import { GraduationCap } from 'lucide-react'

/** Logo + nom du produit, identiques sur les pages publiques. */
export function BrandMark({ className = '' }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-content">
        <GraduationCap size={20} />
      </div>
      <span className="font-display text-xl font-semibold">UniFlow</span>
    </div>
  )
}
