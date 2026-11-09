/** L'onglet sur lequel la prochaine fiche de carte s'ouvre (par défaut, la fiche) : le Marché y mène pour vendre */
export type OngletFiche = 'dossier' | 'marche' | 'registre'

let demande: OngletFiche | null = null

export function demanderOngletFiche(o: OngletFiche) {
  demande = o
}

/** Lu une fois, à l'ouverture de la fiche */
export function prendreOngletFiche(): OngletFiche {
  const o = demande ?? 'dossier'
  demande = null
  return o
}
