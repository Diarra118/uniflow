/**
 * Nombre suivi du nom accordé. En français, 0 et 1 prennent le singulier :
 * « 0 étudiant », « 1 étudiant », « 2 étudiants ».
 * Pluriel par défaut : singulier + « s » ; à préciser pour les mots
 * invariables ou irréguliers (ex : countLabel(n, 'cours', 'cours')).
 * `more` : liste partielle (pagination), affichée « 50+ étudiants ».
 */
export function countLabel(n: number, singular: string, plural = `${singular}s`, more = false): string {
  return `${n}${more ? '+' : ''} ${n <= 1 ? singular : plural}`
}

/** « 13 étudiants — Université Horizon ». `count` vient de countLabel. */
export function listSubtitle(count: string, universityName?: string | null): string {
  return universityName ? `${count} — ${universityName}` : count
}
