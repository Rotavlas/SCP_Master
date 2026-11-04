/**
 * Les cosmétiques du joueur (public.cosmetiques) : le catalogue avec ce qu'il possède, et ce qu'il porte. Gardés en
 * mémoire pour la session, relus après un achat, un changement ou une collection réclamée.
 */
import { useEffect, useSyncExternalStore } from 'react'
import type { TypeCosmetique } from '../data/cosmetiques'
import { appeler, appliquerProfil, type ProfilServeur } from './enLigne'
import { modifier } from './sauvegarde'

export interface EtatCosmetiques {
  catalogue: { id: string; type: TypeCosmetique; prix: number | null; possede: boolean }[]
  portes: Partial<Record<TypeCosmetique, string>>
}

let etat: EtatCosmetiques | null = null
let enCours: Promise<void> | null = null
const abonnes = new Set<() => void>()
export const majCosmetiques = (e: EtatCosmetiques | null) => {
  if (!e) return
  etat = e
  abonnes.forEach((a) => a())
}

function charger() {
  enCours ??= appeler<EtatCosmetiques>('cosmetiques')
    .then(majCosmetiques)
    .finally(() => {
      enCours = null
    })
  return enCours
}

export function useCosmetiques(): EtatCosmetiques | null {
  const e = useSyncExternalStore(
    (a) => {
      abonnes.add(a)
      return () => abonnes.delete(a)
    },
    () => etat,
  )
  useEffect(() => {
    if (!etat) void charger()
  }, [])
  return e
}

export async function acheterCosmetique(id: string): Promise<boolean> {
  const r = await appeler<{ cosmetiques: EtatCosmetiques; profil: ProfilServeur }>('acheter_cosmetique', { p_id: id })
  if (!r) return false
  majCosmetiques(r.cosmetiques)
  modifier((x) => appliquerProfil(x, r.profil))
  return true
}

export async function porterCosmetique(type: TypeCosmetique, id: string | null): Promise<void> {
  majCosmetiques(await appeler<EtatCosmetiques>('porter_cosmetique', { p_type: type, p_id: id }))
}
