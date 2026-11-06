import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { appeler } from '../state/enLigne'
import { notifier } from '../state/sauvegarde'
import { Caviarde, Indisponible, Vide } from './Anime'
import { BoutonConfirme } from './Confirmer'
import { useGlisserPourFermer } from './feuille'

/**
 * La console du créateur (réservée au créateur, contrôlée par le serveur) : les messages signalés à modérer,
 * l'activité des joueurs, l'économie des derniers jours. Les codes ont leur propre fenêtre (Gérer les codes).
 */
interface Signalement {
  message: number
  nombre: number
  dernier: string
  texte: string | null
  auteur: string | null
  raisons: string[]
  signaleurs: (string | null)[]
  visible: boolean
  salon: string | null
}

interface Tableau {
  joueurs: Record<'agents' | 'actifs_jour' | 'actifs_semaine' | 'actifs_mois' | 'en_ligne' | 'nouveaux_semaine' | 'appareils' | 'clans', number>
  jour: Record<'duels_ia' | 'duels_jcj' | 'dossiers' | 'messages' | 'signalements', number>
  base: string
  economie: { jour: string; crees: number; detruits: number; net: number; actifs: number; nouveaux: number; dossiers: number; mythiques: number }[]
}

type Onglet = 'signalements' | 'activite' | 'economie'

const salon = (s: string | null) => (!s ? '' : s.startsWith('mp:') ? 'message privé' : s.startsWith('clan:') ? 'clan' : s)

export function ConsoleCreateur({ onFermer }: { onFermer: () => void }) {
  const feuille = useGlisserPourFermer(onFermer)
  const [onglet, setOnglet] = useState<Onglet>('signalements')
  const [signalements, setSignalements] = useState<Signalement[] | null | undefined>(undefined)
  const [tableau, setTableau] = useState<Tableau | null | undefined>(undefined)

  const chargerSignalements = useCallback(() => void appeler<Signalement[]>('signalements_admin').then(setSignalements), [])
  const chargerTableau = useCallback(() => void appeler<Tableau>('tableau_createur', { p_jours: 14 }).then(setTableau), [])
  useEffect(chargerSignalements, [chargerSignalements])
  useEffect(() => {
    if (onglet !== 'signalements' && tableau === undefined) chargerTableau()
  }, [onglet, tableau, chargerTableau])

  async function moderer(message: number, action: 'supprimer' | 'classer') {
    const r = await appeler<Signalement[]>('moderer_signalement', { p_message: message, p_action: action })
    if (!r) return
    setSignalements(r)
    notifier(action === 'supprimer' ? 'Message supprimé' : 'Signalements classés', 'succes')
  }

  return createPortal(
    <div className="modale-fond" onClick={onFermer}>
      <div className="modale console-createur" ref={feuille} onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Console du créateur">
        <button className="fermer" onClick={onFermer} aria-label="Fermer">
          ✕
        </button>
        <p className="dossier-entete">Conseil O5 · Accès créateur</p>
        <h2>Console du créateur</h2>
        <nav className="onglets-page" role="tablist">
          {(
            [
              ['signalements', `Signalements${signalements?.length ? ` (${signalements.length})` : ''}`],
              ['activite', 'Activité'],
              ['economie', 'Économie'],
            ] as const
          ).map(([id, nom]) => (
            <button key={id} role="tab" aria-selected={onglet === id} className={onglet === id ? 'actif' : ''} onClick={() => setOnglet(id)}>
              {nom}
            </button>
          ))}
        </nav>

        {onglet === 'signalements' &&
          (signalements === undefined ? (
            <Caviarde lignes={4} />
          ) : !signalements ? (
            <Indisponible reessayer={chargerSignalements} />
          ) : signalements.length === 0 ? (
            <Vide titre="Aucun message signalé">Les signalements des agents arriveront ici.</Vide>
          ) : (
            <ul className="console-signalements">
              {signalements.map((x) => (
                <li key={x.message} className={x.visible ? '' : 'retire'}>
                  <div className="console-tete">
                    <strong>{x.auteur ?? 'Agent supprimé'}</strong>
                    <span className="discret">
                      {salon(x.salon)} · {x.nombre} signalement{x.nombre > 1 ? 's' : ''} · {new Date(x.dernier).toLocaleString('fr-FR')}
                    </span>
                  </div>
                  <blockquote>{x.texte ?? '—'}</blockquote>
                  <p className="discret">
                    Raisons : {x.raisons.join(' · ')} — par {x.signaleurs.filter(Boolean).join(', ') || 'inconnu'}
                    {!x.visible && ' — message déjà retiré'}
                  </p>
                  <div className="actions">
                    {x.visible && (
                      <BoutonConfirme
                        className="btn btn-danger"
                        danger
                        question="Supprimer ce message pour tout le monde ?"
                        confirmer="Supprimer"
                        onConfirme={() => void moderer(x.message, 'supprimer')}
                      >
                        Supprimer le message
                      </BoutonConfirme>
                    )}
                    <button className="btn" onClick={() => void moderer(x.message, 'classer')}>
                      Classer sans suite
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          ))}

        {onglet !== 'signalements' &&
          (tableau === undefined ? (
            <Caviarde lignes={5} />
          ) : !tableau ? (
            <Indisponible reessayer={chargerTableau} />
          ) : onglet === 'activite' ? (
            <div className="console-chiffres">
              {(
                [
                  ['Agents', tableau.joueurs.agents],
                  ['En ligne', tableau.joueurs.en_ligne],
                  ['Actifs aujourd’hui', tableau.joueurs.actifs_jour],
                  ['Actifs sur 7 jours', tableau.joueurs.actifs_semaine],
                  ['Actifs sur 30 jours', tableau.joueurs.actifs_mois],
                  ['Nouveaux sur 7 jours', tableau.joueurs.nouveaux_semaine],
                  ['Avec notifications', tableau.joueurs.appareils],
                  ['Clans', tableau.joueurs.clans],
                  ['Duels IA (24 h)', tableau.jour.duels_ia],
                  ['Duels entre agents (24 h)', tableau.jour.duels_jcj],
                  ['Dossiers ouverts (24 h)', tableau.jour.dossiers],
                  ['Messages (24 h)', tableau.jour.messages],
                  ['Signalements (24 h)', tableau.jour.signalements],
                ] as const
              ).map(([k, v]) => (
                <div key={k}>
                  <strong>{Number(v).toLocaleString('fr-FR')}</strong>
                  <span>{k}</span>
                </div>
              ))}
              <div>
                <strong>{tableau.base}</strong>
                <span>Base de données (500 Mo offerts)</span>
              </div>
            </div>
          ) : (
            <div className="console-economie">
              <table>
                <thead>
                  <tr>
                    <th>Jour</th>
                    <th>Crédits créés</th>
                    <th>Détruits</th>
                    <th>Solde</th>
                    <th>Actifs</th>
                    <th>Nouveaux</th>
                    <th>Dossiers</th>
                    <th>Mythiques</th>
                  </tr>
                </thead>
                <tbody>
                  {tableau.economie.map((e) => (
                    <tr key={e.jour}>
                      <td>{new Date(e.jour).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}</td>
                      <td>{Number(e.crees).toLocaleString('fr-FR')}</td>
                      <td>{Number(e.detruits).toLocaleString('fr-FR')}</td>
                      <td className={Number(e.net) > 0 ? 'positif' : 'negatif'}>{Number(e.net).toLocaleString('fr-FR')}</td>
                      <td>{e.actifs}</td>
                      <td>{e.nouveaux}</td>
                      <td>{e.dossiers}</td>
                      <td>{e.mythiques}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
      </div>
    </div>,
    document.body,
  )
}
