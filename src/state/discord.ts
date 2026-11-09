/**
 * Les notes de version sur le Discord : le serveur les publie une seule fois (public.publier_version, réservée au
 * créateur), sur le webhook rangé dans prive.discord. Le créateur les envoie en chargeant la nouvelle version.
 */
import { useEffect } from 'react'
import { JOURNAL } from '../data/journal'
import { supabase } from './enLigne'

const cle = () => `scp-masters:version-publiee:${JOURNAL[0].date}:${JOURNAL[0].titre}`

/** Publie la dernière entrée du journal ; vrai si le message est parti (faux : déjà publiée, ou pas de webhook) */
export async function publierVersion(): Promise<boolean> {
  if (!supabase) return false
  const j = JOURNAL[0]
  const { data, error } = await supabase.rpc('publier_version', { p_date: j.date, p_titre: j.titre, p_points: j.points })
  if (error || data !== true) return false
  try {
    localStorage.setItem(cle(), '1')
  } catch {
    // Sans importance : le serveur ne publie jamais deux fois
  }
  return true
}

/** Le créateur charge une nouvelle version : ses notes partent sur le Discord (une fois) */
export function usePublierVersion(createur: boolean) {
  useEffect(() => {
    if (!createur) return
    try {
      if (localStorage.getItem(cle()) === '1') return
    } catch {
      // On tente quand même : le serveur évite les doublons
    }
    void publierVersion()
  }, [createur])
}
