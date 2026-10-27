import { useCallback, useEffect, useState } from 'react'
import type { Base } from '../data/catalogue'
import { defier } from '../state/jcj'
import { accreditation, useSauvegarde } from '../state/sauvegarde'
import { BADGES, MAX_BADGES_AFFICHES } from '../data/badges'
import {
  bloquer,
  choisirBadges,
  debloquer,
  demanderAmi,
  majVitrine,
  profilPublic,
  repondreAmi,
  retirerAmi,
  type ProfilPublic,
} from '../state/social'
import type { Carte as TCarte } from '../types'
import { BadgesAffiches, PastilleBadge } from './Badges'
import { Carte } from './Carte'

const ROLES = { chef: 'Chef', officier: 'Officier', membre: 'Membre' }
const ISSUES = { victoire: 'Victoire', defaite: 'Défaite', nul: 'Nul' }

interface Props {
  pseudo: string
  base: Base
  onFermer: () => void
  ouvrirCarte: (id: string) => void
  /** Ouvre la conversation privée avec cet agent */
  ecrire: (pseudo: string) => void
}

/** Profil public d'un agent : Elo, collection, vitrine, clan, derniers duels, et ce qu'on peut faire avec lui. */
export function Profil({ pseudo, base, onFermer, ouvrirCarte, ecrire }: Props) {
  const s = useSauvegarde()
  const [p, setP] = useState<ProfilPublic | null>(null)
  const [occupe, setOccupe] = useState(false)

  const charger = useCallback(() => void profilPublic(pseudo).then(setP), [pseudo])
  useEffect(charger, [charger])

  useEffect(() => {
    const touche = (e: KeyboardEvent) => e.key === 'Escape' && onFermer()
    window.addEventListener('keydown', touche)
    return () => window.removeEventListener('keydown', touche)
  }, [onFermer])

  async function agir(f: () => Promise<unknown>) {
    setOccupe(true)
    await f()
    setOccupe(false)
    charger()
  }

  const acc = p ? accreditation(p.xp) : null
  const totalJcj = p ? p.jcj.victoires + p.jcj.defaites + p.jcj.nuls : 0

  return (
    <div className="modale-fond" onClick={onFermer}>
      <div className="modale profil" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={`Profil de ${pseudo}`}>
        <button className="fermer" onClick={onFermer} aria-label="Fermer">
          ✕
        </button>
        {!p ? (
          <p className="discret">Consultation du dossier personnel…</p>
        ) : (
          <>
            <p className="dossier-entete">Dossier du personnel{p.clan && ` · [${p.clan.tag}] ${p.clan.nom}`}</p>
            <h2 className="profil-nom">
              <span className={`point-presence ${p.enLigne ? 'en-ligne' : ''}`} title={p.enLigne ? 'En ligne' : `Vu le ${new Date(p.vuLe).toLocaleString('fr-FR')}`} />
              {p.pseudo}
              {p.clan && <span className="tag-clan">{p.clan.tag}</span>}
              <BadgesAffiches ids={p.badgesAffiches ?? []} />
            </h2>
            <p className="discret">
              {acc?.nom} · agent depuis le {new Date(p.creeLe).toLocaleDateString('fr-FR')}
              {p.clan && ` · ${ROLES[p.clan.role]} de ${p.clan.nom}`}
            </p>

            <dl className="fiche profil-fiche">
              <div>
                <dt>Elo</dt>
                <dd>
                  {p.elo} <small>#{p.rangElo}</small>
                </dd>
              </div>
              <div>
                <dt>Duels entre joueurs</dt>
                <dd>{totalJcj ? `${p.jcj.victoires} V · ${p.jcj.defaites} D · ${p.jcj.nuls} N` : 'Aucun'}</dd>
              </div>
              <div>
                <dt>Collection</dt>
                <dd>
                  {p.collection.toLocaleString('fr-FR')} fiches · {p.legendaires} légendaire{p.legendaires > 1 ? 's' : ''} ou mythique{p.legendaires > 1 ? 's' : ''}
                </dd>
              </div>
              <div>
                <dt>Fortune</dt>
                <dd>{Number(p.credits).toLocaleString('fr-FR')} ₵</dd>
              </div>
            </dl>

            <h3>
              Badges <small className="discret">{(p.badges ?? []).length}/{Object.keys(BADGES).length - (p.badges?.includes('createur') ? 0 : 1)}</small>
            </h3>
            {p.moi && <p className="discret">Choisissez jusqu'à {MAX_BADGES_AFFICHES} badges à afficher à côté de votre pseudo.</p>}
            <ul className="grille-badges">
              {Object.entries(BADGES)
                // Le badge du créateur n'apparaît que chez lui : ce n'est pas un objectif
                .filter(([id]) => id !== 'createur' || p.badges?.includes(id))
                .map(([id, b]) => {
                  const obtenu = (p.badges ?? []).includes(id)
                  const affiche = (p.badgesAffiches ?? []).includes(id)
                  const choisissable = p.moi && obtenu && (affiche || (p.badgesAffiches ?? []).length < MAX_BADGES_AFFICHES)
                  return (
                    <li key={id} className={`${obtenu ? '' : 'inactif'} ${affiche ? 'affiche' : ''}`}>
                      <button
                        className="badge-ligne"
                        disabled={!choisissable || occupe}
                        aria-pressed={p.moi ? affiche : undefined}
                        onClick={() =>
                          void agir(() =>
                            choisirBadges(affiche ? p.badgesAffiches.filter((x) => x !== id) : [...(p.badgesAffiches ?? []), id]),
                          )
                        }
                      >
                        <PastilleBadge id={id} inactif={!obtenu} />
                        <span>
                          <strong>{b.nom}</strong>
                          <small>{b.description}</small>
                        </span>
                        {affiche && <span className="badge-coche">Affiché</span>}
                      </button>
                    </li>
                  )
                })}
            </ul>

            <h3>Vitrine</h3>
            {p.vitrine.length ? (
              <div className="rangee-cartes vitrine-profil">
                {p.vitrine
                  .map((v) => ({ carte: base.parId.get(v.carte), variante: v.variante }))
                  .filter((v): v is { carte: TCarte; variante: typeof v.variante } => !!v.carte)
                  .map((v) => (
                    <Carte key={v.carte.id} carte={v.carte} base={base} taille="p" variante={v.variante} onClick={() => ouvrirCarte(v.carte.id)} />
                  ))}
              </div>
            ) : (
              <p className="discret">{p.moi ? 'Votre vitrine est vide.' : 'Cet agent n\'expose aucune carte.'}</p>
            )}
            {p.moi && (
              <div className="actions">
                <button className="btn" disabled={occupe || s.deck.length === 0} onClick={() => void agir(() => majVitrine(s.deck.slice(0, 5)))}>
                  Exposer mon équipe
                </button>
                <button className="btn" disabled={occupe || s.favoris.length === 0} onClick={() => void agir(() => majVitrine(s.favoris.slice(0, 5)))}>
                  Exposer mes 5 premiers favoris
                </button>
              </div>
            )}

            {p.duels.length > 0 && (
              <>
                <h3>Derniers duels</h3>
                <ul className="liste-duels">
                  {p.duels.map((d, i) => (
                    <li key={i} className={`issue-${d.issue}`}>
                      <strong>{ISSUES[d.issue]}</strong> contre {d.adversaire}
                      <span className="discret">
                        {d.classe ? 'classé' : 'amical'} · {new Date(d.le).toLocaleDateString('fr-FR')}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}

            {!p.moi && (
              <div className="actions">
                {p.relation === 'aucune' && (
                  <button className="btn btn-principal" disabled={occupe} onClick={() => void agir(() => demanderAmi(p.pseudo))}>
                    Ajouter en ami
                  </button>
                )}
                {p.relation === 'demande_recue' && (
                  <button className="btn btn-principal" disabled={occupe} onClick={() => void agir(() => repondreAmi(p.pseudo, true))}>
                    Accepter sa demande d'ami
                  </button>
                )}
                {p.relation === 'demande_envoyee' && (
                  <button className="btn" disabled={occupe} onClick={() => void agir(() => retirerAmi(p.pseudo))}>
                    Annuler ma demande
                  </button>
                )}
                {p.relation === 'ami' && (
                  <>
                    <button className="btn btn-principal" disabled={occupe || !p.enLigne} title={p.enLigne ? '' : 'Hors ligne'} onClick={() => void agir(() => defier(p.pseudo))}>
                      Défier
                    </button>
                    <button className="btn" onClick={() => ecrire(p.pseudo)}>
                      Message
                    </button>
                    <button className="btn btn-discret" disabled={occupe} onClick={() => void agir(() => retirerAmi(p.pseudo))}>
                      Retirer des amis
                    </button>
                  </>
                )}
                {p.relation === 'bloque' ? (
                  <button className="btn" disabled={occupe} onClick={() => void agir(() => debloquer(p.pseudo))}>
                    Débloquer
                  </button>
                ) : (
                  <button className="btn btn-discret" disabled={occupe} onClick={() => void agir(() => bloquer(p.pseudo))}>
                    Bloquer
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
