import { useEffect, useState } from 'react'
import type { Base } from '../data/catalogue'
import { classement, classementClans, type Classement as TClassement, type LigneClan, type Tableau } from '../state/social'
import { Carte } from './Carte'

const TABLEAUX: { id: Tableau | 'clans'; nom: string; unite: (v: number) => string }[] = [
  { id: 'elo', nom: 'Elo', unite: (v) => `${v}` },
  { id: 'victoires', nom: 'Victoires en duel', unite: (v) => `${v} victoire${v > 1 ? 's' : ''}` },
  { id: 'collection', nom: 'Collection', unite: (v) => `${v.toLocaleString('fr-FR')} fiches` },
  { id: 'legendaires', nom: 'Légendaires', unite: (v) => `${v} légendaire${v > 1 ? 's' : ''}` },
  { id: 'richesse', nom: 'Fortune', unite: (v) => `${Number(v).toLocaleString('fr-FR')} ₵` },
  { id: 'xp', nom: 'Expérience', unite: (v) => `${Number(v).toLocaleString('fr-FR')} XP` },
  { id: 'clans', nom: 'Clans', unite: (v) => `${v} victoire${v > 1 ? 's' : ''}` },
]

const MEDAILLES = ['🥇', '🥈', '🥉']

export function Classement({ base, ouvrirProfil }: { base: Base; ouvrirProfil: (pseudo: string) => void }) {
  const [tableau, setTableau] = useState<Tableau | 'clans'>('elo')
  const [joueurs, setJoueurs] = useState<TClassement | null>(null)
  const [clans, setClans] = useState<LigneClan[] | null>(null)

  useEffect(() => {
    setJoueurs(null)
    setClans(null)
    if (tableau === 'clans') void classementClans().then(setClans)
    else void classement(tableau).then(setJoueurs)
  }, [tableau])

  const t = TABLEAUX.find((x) => x.id === tableau)!

  return (
    <section className="classement">
      <div className="marche-entete">
        <div>
          <p className="dossier-entete">Registre du personnel · tous sites</p>
          <h1>Classements</h1>
        </div>
        <nav className="onglets-marche" role="tablist">
          {TABLEAUX.map((x) => (
            <button key={x.id} role="tab" aria-selected={tableau === x.id} className={tableau === x.id ? 'actif' : ''} onClick={() => setTableau(x.id)}>
              {x.nom}
            </button>
          ))}
        </nav>
      </div>

      {tableau !== 'clans' && joueurs?.moi && (
        <p className="ma-place">
          Votre place : <strong>#{joueurs.moi.rang}</strong> sur {joueurs.joueurs} agents · {t.unite(joueurs.moi.valeur)}
        </p>
      )}

      {tableau === 'clans' ? (
        !clans ? (
          <p className="discret">Chargement…</p>
        ) : clans.length === 0 ? (
          <p className="discret">Aucun clan n'a encore été fondé. Lancez le premier depuis l'onglet Social.</p>
        ) : (
          <ol className="table-classement">
            {clans.map((c) => {
              const embleme = c.embleme ? base.parId.get(c.embleme) : undefined
              return (
                <li key={c.tag} className={`${c.moi ? 'moi' : ''} ${c.rang <= 3 ? 'podium' : ''}`}>
                  <span className="rang">{MEDAILLES[c.rang - 1] ?? `#${c.rang}`}</span>
                  <span className="nom">
                    {embleme && (
                      <span className="mini-embleme">
                        <Carte carte={embleme} base={base} taille="p" inclinable={false} />
                      </span>
                    )}
                    <span className="tag-clan">{c.tag}</span> {c.nom}
                    <span className="discret"> · {c.membres} membre{c.membres > 1 ? 's' : ''}</span>
                  </span>
                  <span className="valeur">{t.unite(Number(c.score))}</span>
                </li>
              )
            })}
          </ol>
        )
      ) : !joueurs ? (
        <p className="discret">Chargement…</p>
      ) : (
        <ol className="table-classement">
          {joueurs.lignes.map((l) => (
            <li key={l.pseudo} className={`${l.moi ? 'moi' : ''} ${l.rang <= 3 ? 'podium' : ''}`}>
              <span className="rang">{MEDAILLES[l.rang - 1] ?? `#${l.rang}`}</span>
              <button className="nom btn-lien" onClick={() => ouvrirProfil(l.pseudo)}>
                {l.clan && <span className="tag-clan">{l.clan}</span>} {l.pseudo}
              </button>
              <span className="valeur">{t.unite(Number(l.valeur))}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
