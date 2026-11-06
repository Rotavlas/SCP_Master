import { useEffect, useState } from 'react'
import { supabase } from '../state/enLigne'
import { TAILLES_TEXTE, garderTailleTexte, lireTailleTexte } from '../state/lecture'
import { modifier, notifier, useSauvegarde } from '../state/sauvegarde'
import { basculerSon, regler, useSonActif, volumes } from '../state/sons'
import { preparerTraducteur } from '../state/traduction'
import { activerVibrations, vibrationsActives, vibrer } from '../state/vibrer'
import { Aide } from './Aide'
import { NotificationsAppareil } from './Pwa'

/**
 * Les réglages en un seul endroit : son (volume général, ambiances), vibrations, notifications type par type,
 * lecture (taille du texte des dossiers, langue des fiches).
 */
const TYPES: { id: string; nom: string; detail: string }[] = [
  { id: 'surencheri', nom: 'Surenchères', detail: 'Un agent mise plus que vous' },
  { id: 'enchere_gagnee', nom: 'Enchères remportées', detail: 'Une carte est à vous' },
  { id: 'souhait_en_vente', nom: 'Cartes souhaitées en vente', detail: 'Une carte de votre liste de souhaits est mise aux enchères' },
  { id: 'vente_conclue', nom: 'Ventes conclues', detail: 'Une de vos cartes est vendue' },
  { id: 'vente_invendue', nom: 'Ventes sans preneur', detail: 'Une carte revient dans vos archives' },
  { id: 'echange_recu', nom: 'Offres d’échange', detail: 'Un agent vous propose un échange' },
  { id: 'echange_accepte', nom: 'Échanges acceptés', detail: '' },
  { id: 'echange_refuse', nom: 'Échanges refusés', detail: '' },
  { id: 'message', nom: 'Messages privés', detail: 'Sur l’appareil seulement' },
  { id: 'dossiers_prets', nom: 'Réserve de dossiers', detail: '5 dossiers, puis réserve pleine. Coupée, elle ne s’annonce plus du tout' },
  { id: 'epreuve_resultat', nom: 'Résultats de l’Épreuve', detail: '' },
  { id: 'saison_resultat', nom: 'Fin de saison classée', detail: '' },
  { id: 'raid_vaincu', nom: 'Raids réussis', detail: '' },
]

export function Reglages() {
  const s = useSauvegarde()
  const son = useSonActif()
  const [vol, setVol] = useState(volumes)
  const [vibrations, setVibrations] = useState(vibrationsActives)
  const [taille, setTaille] = useState(lireTailleTexte)
  const [coupees, setCoupees] = useState<string[] | null>(null)

  useEffect(() => {
    void supabase?.rpc('mes_notifications_coupees').then(({ data, error }) => setCoupees(error ? [] : ((data as string[] | null) ?? [])))
  }, [])

  async function basculer(type: string) {
    if (!coupees || !supabase) return
    const suivantes = coupees.includes(type) ? coupees.filter((t) => t !== type) : [...coupees, type]
    setCoupees(suivantes)
    const { data, error } = await supabase.rpc('couper_notifications', { p_types: suivantes })
    if (error) {
      notifier('Réglage non enregistré, réessayez')
      setCoupees(coupees)
    } else setCoupees((data as string[]) ?? suivantes)
  }

  const changerVolume = (general: number, ambiances: number) => {
    regler(general, ambiances)
    setVol({ general, ambiances })
  }

  return (
    <section className="page-reglages">
      <div className="marche-entete">
        <div>
          <p className="dossier-entete">Terminal · Configuration du poste</p>
          <h1>Réglages</h1>
        </div>
      </div>

      <div className="reglages-grille">
        <div className="encart">
          <h3>Son</h3>
          <label className="reglage-ligne">
            <span>Son du jeu</span>
            <input type="checkbox" role="switch" checked={son} onChange={basculerSon} />
          </label>
          <label className="reglage-ligne">
            <span>Volume général</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={vol.general}
              disabled={!son}
              onChange={(e) => changerVolume(Number(e.target.value), vol.ambiances)}
            />
          </label>
          <label className="reglage-ligne">
            <span>
              Ambiances <Aide sujet="ambiances" />
            </span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={vol.ambiances}
              disabled={!son}
              onChange={(e) => changerVolume(vol.general, Number(e.target.value))}
            />
          </label>
          <label className="reglage-ligne">
            <span>
              Vibrations <small className="discret">(Android)</small>
            </span>
            <input
              type="checkbox"
              role="switch"
              checked={vibrations}
              onChange={(e) => {
                activerVibrations(e.target.checked)
                setVibrations(e.target.checked)
                if (e.target.checked) vibrer(30)
              }}
            />
          </label>
        </div>

        <div className="encart">
          <h3>Lecture</h3>
          <div className="reglage-ligne">
            <span>Taille du texte des dossiers</span>
            <span className="segments" role="radiogroup" aria-label="Taille du texte des dossiers">
              {TAILLES_TEXTE.map((t) => (
                <button
                  key={t}
                  role="radio"
                  aria-checked={taille === t}
                  className={taille === t ? 'actif' : ''}
                  style={{ fontSize: `${0.75 * t}rem` }}
                  onClick={() => {
                    garderTailleTexte(t)
                    setTaille(t)
                  }}
                >
                  A
                </button>
              ))}
            </span>
          </div>
          <div className="reglage-ligne">
            <span>Langue des fiches</span>
            <span className="segments" role="radiogroup" aria-label="Langue des fiches">
              {(['vo', 'vf'] as const).map((l) => (
                <button
                  key={l}
                  role="radio"
                  aria-checked={s.langue === l}
                  className={s.langue === l ? 'actif' : ''}
                  onClick={() => {
                    if (l === 'vf') preparerTraducteur(true)
                    modifier((x) => ({ ...x, langue: l }))
                  }}
                >
                  {l === 'vo' ? 'Originale' : 'Française'}
                </button>
              ))}
            </span>
          </div>
        </div>

        <div className="encart reglages-notifications">
          <h3>Notifications</h3>
          <NotificationsAppareil />
          <p className="discret">
            Ce que vous coupez n’arrive plus sur l’appareil ; la cloche du jeu le garde quand même (sauf la réserve de dossiers, qui disparaît tout à fait).
          </p>
          {coupees === null ? (
            <p className="discret">Lecture de vos réglages…</p>
          ) : (
            <ul className="reglages-types">
              {TYPES.map((t) => (
                <li key={t.id}>
                  <label className="reglage-ligne">
                    <span>
                      {t.nom}
                      {t.detail && <small className="discret">{t.detail}</small>}
                    </span>
                    <input type="checkbox" role="switch" checked={!coupees.includes(t.id)} onChange={() => void basculer(t.id)} />
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  )
}
