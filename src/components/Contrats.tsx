import { useCallback, useEffect, useState } from 'react'
import { RARETES, designation, type Base } from '../data/catalogue'
import { EDITION_MYTHIQUE } from '../engine/boosters'
import { appeler, appliquerProfil, useEditionsMythiques, type ProfilServeur } from '../state/enLigne'
import { modifier, notifier } from '../state/sauvegarde'
import { jouer } from '../state/sons'
import { Caviarde, Indisponible, useTampon } from './Anime'
import { Carte } from './Carte'
import { BoutonConfirme } from './Confirmer'

/**
 * Les contrats de l'Intendance (public.contrats) : chaque semaine, trois fiches précises (deux rares, une épique),
 * les mêmes pour tous. En remettre un exemplaire standard le détruit et rapporte un dossier Keter, une fois par fiche.
 */
interface Contrat {
  carte: string
  rempli: boolean
  libres: number
}

export function Contrats({ base }: { base: Base }) {
  const [etat, setEtat] = useState<{ fin: string; contrats: Contrat[] } | null | undefined>(undefined)
  const [envoi, setEnvoi] = useState<string | null>(null)
  const [recent, tamponner] = useTampon()
  const charger = useCallback(() => void appeler<{ fin: string; contrats: Contrat[] }>('contrats').then(setEtat), [])
  useEffect(charger, [charger])

  async function remplir(id: string) {
    setEnvoi(id)
    const r = await appeler<{ contrats: { fin: string; contrats: Contrat[] }; profil: ProfilServeur }>('remplir_contrat', { p_carte: id })
    setEnvoi(null)
    if (!r) return
    setEtat(r.contrats)
    modifier((x) => appliquerProfil(x, r.profil))
    tamponner(id)
    jouer.retourner(3)
    notifier('Contrat rempli : un dossier Keter vous attend dans la réserve', 'succes')
  }

  if (etat === undefined) return <Caviarde lignes={3} />
  if (!etat) return <Indisponible reessayer={charger} />
  const jours = Math.max(0, Math.ceil((Date.parse(etat.fin) - Date.now()) / 86_400_000))
  return (
    <section className="contrats">
      <p className="dossier-entete">
        Contrats de l’Intendance · renouvelés dans {jours} jour{jours > 1 ? 's' : ''}
      </p>
      <p className="discret">
        L’Intendance rachète chaque semaine ces trois fiches, une fois chacune : l’exemplaire remis est détruit, un dossier Keter vous est offert.
      </p>
      <ul className="contrats-liste">
        {etat.contrats.map((k) => {
          const c = base.parId.get(k.carte)
          if (!c) return null
          return (
            <li key={k.carte} className={`contrat ${k.rempli ? 'rempli' : ''} ${recent === k.carte ? 'tamponne' : ''}`}>
              <Carte carte={c} base={base} taille="p" inclinable={false} />
              <div className="contrat-texte">
                <strong>{designation(c)}</strong>
                <small style={{ color: RARETES[c.ra].couleur }}>{RARETES[c.ra].nom}</small>
                <small className="discret">
                  {k.libres} exemplaire{k.libres > 1 ? 's' : ''} libre{k.libres > 1 ? 's' : ''}
                </small>
                {k.rempli ? (
                  <span className="mission-etat">✓ Rempli</span>
                ) : (
                  <BoutonConfirme
                    className="btn btn-principal"
                    disabled={!k.libres || envoi === k.carte}
                    question={`Remettre un exemplaire de ${designation(c)} ? Il sera détruit${k.libres === 1 ? ', et c’est votre dernier' : ''}.`}
                    confirmer="Remettre (+1 dossier Keter)"
                    onConfirme={() => void remplir(k.carte)}
                  >
                    {k.libres ? 'Remettre · +1 Keter' : 'Aucun exemplaire libre'}
                  </BoutonConfirme>
                )}
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/** Combien d'exemplaires numérotés de chaque Mythique sont déjà sortis : la rareté qui monte, à vue */
export function EditionsMythiques({ base }: { base: Base }) {
  const editions = useEditionsMythiques()
  if (!editions) return null
  const lignes = Object.entries(editions)
    .map(([id, e]) => ({ carte: base.parId.get(id), ...e }))
    .filter((l) => l.carte)
    .sort((a, b) => b.emis / b.total - a.emis / a.total)
  const emis = lignes.reduce((n, l) => n + Math.min(l.emis, l.total), 0)
  const total = lignes.reduce((n, l) => n + l.total, 0)
  const epuisees = lignes.filter((l) => l.emis >= l.total).length
  return (
    <section className="editions-mythiques">
      <p className="dossier-entete">Mythiques en circulation</p>
      <p>
        <strong>
          {emis.toLocaleString('fr-FR')} / {total.toLocaleString('fr-FR')}
        </strong>{' '}
        exemplaires numérotés déjà sortis des archives
        {epuisees > 0 && ` · ${epuisees} Mythique${epuisees > 1 ? 's' : ''} épuisée${epuisees > 1 ? 's' : ''}, au marché seulement`}.
      </p>
      <div className="mission-jauge editions-jauge" aria-label={`${emis} sur ${total}`}>
        <div style={{ width: `${total ? (emis / total) * 100 : 0}%` }} />
      </div>
      <ul className="editions-liste">
        {lignes.map((l) => (
          <li key={l.carte!.id} className={l.emis >= l.total ? 'epuisee' : ''}>
            <span>{designation(l.carte!)}</span>
            <span className="mission-jauge">
              <span style={{ width: `${(Math.min(l.emis, l.total) / l.total) * 100}%` }} />
            </span>
            <small>{l.emis >= l.total ? 'épuisée' : `${l.total - l.emis} restants sur ${l.total ?? EDITION_MYTHIQUE}`}</small>
          </li>
        ))}
      </ul>
    </section>
  )
}
