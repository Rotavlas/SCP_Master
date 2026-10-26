import { useCallback, useEffect, useState } from 'react'
import { DUREES, netVendeur } from '../engine/marche'
import { PAR_ID, VARIANTES, type IdVariante } from '../engine/variantes'
import { bruler, chargerCours, mettreAuxEncheres, type Cours } from '../state/marche'
import type { Carte } from '../types'
import { CoursGraphique } from './CoursGraphique'

const credits = (n: number | null) => (n === null ? '—' : `${n.toLocaleString('fr-FR')} ₵`)

/** Dans la fiche d'une carte : son cours, la mise aux enchères et le brûlage d'un exemplaire. */
export function MarcheCarte({ carte, variante: varianteAffichee, voirMarche }: { carte: Carte; variante: IdVariante; voirMarche: () => void }) {
  const [cours, setCours] = useState<Cours | null>(null)
  const [variante, setVariante] = useState<IdVariante>(varianteAffichee)
  const [vente, setVente] = useState(false)
  const [occupe, setOccupe] = useState(false)

  const recharger = useCallback(() => {
    void chargerCours(carte.id).then(setCours)
  }, [carte.id])
  useEffect(recharger, [recharger])

  if (!cours) return <section className="marche-carte"><h4>Marché</h4><p className="discret">Consultation des cours…</p></section>

  const c = cours.variantes[variante]
  // Variantes qui ont un intérêt ici : possédées, en vente ou déjà échangées
  const utiles = VARIANTES.filter((v) => {
    const x = cours.variantes[v.id]
    return v.id === 'std' || x.libres + x.reserves + x.enVente + x.volume30 > 0 || x.dernier !== null
  })

  async function incinerer() {
    if (!confirm(`Brûler un exemplaire ${PAR_ID[variante].nom.toLowerCase()} de ${carte.num ?? carte.nm} contre ${c.brulage} ₵ ? Il sera détruit définitivement.`)) return
    setOccupe(true)
    await bruler(carte.id, variante)
    setOccupe(false)
    recharger()
  }

  return (
    <section className="marche-carte">
      <h4>Marché</h4>
      {utiles.length > 1 && (
        <div className="selecteur-variantes" role="radiogroup" aria-label="Variante">
          {utiles.map((v) => (
            <button
              key={v.id}
              role="radio"
              aria-checked={variante === v.id}
              className={`puce-variante ${variante === v.id ? 'active' : ''}`}
              style={{ ['--v' as string]: v.couleur }}
              onClick={() => {
                setVariante(v.id)
                setVente(false)
              }}
            >
              {v.nom}
            </button>
          ))}
        </div>
      )}

      <dl className="fiche cours-chiffres">
        <div>
          <dt>Dernière vente</dt>
          <dd>{credits(c.dernier)}</dd>
        </div>
        <div>
          <dt>Médiane 7 jours</dt>
          <dd>{credits(c.mediane7)}</dd>
        </div>
        <div>
          <dt>Fourchette 30 jours</dt>
          <dd>{c.min30 === null ? '—' : `${credits(c.min30)} – ${credits(c.max30)}`}</dd>
        </div>
        <div>
          <dt>Ventes 30 jours</dt>
          <dd>{c.volume30}</dd>
        </div>
      </dl>
      <CoursGraphique points={c.points} titre={`Cours · ${PAR_ID[variante].nom}`} />

      <p className="discret">
        {c.enVente > 0 ? (
          <button className="btn-lien" onClick={voirMarche}>
            {c.enVente} en vente aux enchères
          </button>
        ) : (
          'Aucune vente en cours.'
        )}
        {c.reserves > 0 && ` · ${c.reserves} de vos exemplaires réservé${c.reserves > 1 ? 's' : ''} (vente ou échange en cours)`}
      </p>

      {c.libres > 0 && !vente && (
        <div className="actions">
          <button className="btn" disabled={occupe} onClick={() => setVente(true)}>
            Mettre aux enchères
          </button>
          <button className="btn btn-danger" disabled={occupe} onClick={() => void incinerer()} title="L'exemplaire est détruit : il quitte le jeu pour de bon.">
            Brûler un exemplaire (+{c.brulage.toLocaleString('fr-FR')} ₵)
          </button>
        </div>
      )}
      {vente && (
        <FormulaireVente
          carte={carte}
          variante={variante}
          suggestion={c.mediane7 ?? c.dernier ?? c.brulage * 2}
          annuler={() => setVente(false)}
          fait={() => {
            setVente(false)
            recharger()
          }}
        />
      )}
    </section>
  )
}

function FormulaireVente({ carte, variante, suggestion, annuler, fait }: { carte: Carte; variante: IdVariante; suggestion: number; annuler: () => void; fait: () => void }) {
  const [prix, setPrix] = useState(String(Math.max(1, Math.round(suggestion))))
  const [immediat, setImmediat] = useState('')
  const [duree, setDuree] = useState(1440)
  const [occupe, setOccupe] = useState(false)
  const p = Number(prix)
  const ai = immediat.trim() === '' ? null : Number(immediat)
  const valide = Number.isInteger(p) && p >= 1 && (ai === null || (Number.isInteger(ai) && ai > p))

  return (
    <form
      className="formulaire-vente"
      onSubmit={async (e) => {
        e.preventDefault()
        if (!valide) return
        setOccupe(true)
        const ok = await mettreAuxEncheres(carte.id, variante, p, duree, ai)
        setOccupe(false)
        if (ok) fait()
      }}
    >
      <label>
        Mise de départ (₵)
        <input type="number" min={1} step={1} required value={prix} onChange={(e) => setPrix(e.target.value)} />
      </label>
      <label>
        Achat immédiat (₵, facultatif)
        <input type="number" min={p + 1} step={1} placeholder="Aucun" value={immediat} onChange={(e) => setImmediat(e.target.value)} />
      </label>
      <label>
        Durée
        <select value={duree} onChange={(e) => setDuree(Number(e.target.value))}>
          {DUREES.map((d) => (
            <option key={d.minutes} value={d.minutes}>
              {d.nom}
            </option>
          ))}
        </select>
      </label>
      <p className="discret">
        L'exemplaire est réservé pendant la vente. Frais de 5 % prélevés à la vente : vous toucherez au moins {valide ? `${netVendeur(p).toLocaleString('fr-FR')} ₵` : '—'}. Une vente sans mise
        peut être retirée.
      </p>
      <div className="actions">
        <button className="btn btn-principal" disabled={!valide || occupe}>
          Mettre en vente
        </button>
        <button type="button" className="btn btn-discret" onClick={annuler}>
          Annuler
        </button>
      </div>
    </form>
  )
}
