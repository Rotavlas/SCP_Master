import type { IdVariante } from './variantes'
import { VALEUR_RECYCLAGE } from './boosters'

/*
 * Règles du marché, pour l'affichage. Le serveur les applique lui-même
 * (supabase/migrations/20261027120000_marche.sql) : les deux doivent rester synchronisés.
 */

/** Durées de vente proposées, en minutes */
export const DUREES: { minutes: number; nom: string }[] = [
  { minutes: 15, nom: '15 minutes' },
  { minutes: 60, nom: '1 heure' },
  { minutes: 360, nom: '6 heures' },
  { minutes: 1440, nom: '24 heures' },
  { minutes: 4320, nom: '3 jours' },
  { minutes: 10080, nom: '7 jours' },
]

/** Frais prélevés au vendeur sur le prix de vente */
export const FRAIS_VENTE = 0.05

/** Une mise dépasse la précédente d'au moins 5 % (et d'au moins 1 crédit) */
export function miseMinimale(mise: number | null, prixDepart: number): number {
  return mise === null ? prixDepart : mise + Math.max(1, Math.ceil(mise * 0.05))
}

export function netVendeur(prix: number): number {
  return prix - Math.ceil(prix * FRAIS_VENTE)
}

const MULTIPLICATEUR_BRULAGE: Record<IdVariante, number> = { std: 1, holo: 3, exp: 4, arch: 6, breche: 12, o5: 30 }

/** Crédits rendus en brûlant un exemplaire : la valeur de recyclage, multipliée par la rareté de la variante */
export function valeurBrulage(rarete: number, variante: IdVariante): number {
  return VALEUR_RECYCLAGE[rarete] * MULTIPLICATEUR_BRULAGE[variante]
}

/** « 2 h 05 », « 3 j 4 h », « 42 s » */
export function tempsRestant(fin: number, maintenant: number): string {
  const s = Math.max(0, Math.round((fin - maintenant) / 1000))
  if (s < 60) return `${s} s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m} min ${String(s % 60).padStart(2, '0')}`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} h ${String(m % 60).padStart(2, '0')}`
  return `${Math.floor(h / 24)} j ${h % 24} h`
}
