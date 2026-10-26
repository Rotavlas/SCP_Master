import type { Base } from '../data/catalogue'
import { RARETES } from '../data/catalogue'
import { BOOSTERS, VALEUR_RECYCLAGE } from '../engine/boosters'
import { VARIANTES } from '../engine/variantes'
import { supprimerCompte, useCompte } from '../state/enLigne'
import { useSauvegarde } from '../state/sauvegarde'
import { tirer, type Tirage } from './Booster'
import { Logo } from './Logo'

export function Boutique({ base, ouvrir }: { base: Base; ouvrir: (t: Tirage) => void }) {
  const s = useSauvegarde()
  const compte = useCompte()

  return (
    <section className="boutique">
      <p className="dossier-entete">Intendance · solde {s.credits.toLocaleString('fr-FR')} ₵</p>
      <div className="offres">
        {BOOSTERS.map((b) => (
          <article key={b.id} className={`offre offre-${b.id}`}>
            <div className="mini-paquet" style={{ ['--paquet' as string]: b.couleur }} aria-hidden="true">
              <span className="paquet-bande">CONFIDENTIEL</span>
              <Logo taille={40} />
            </div>
            <h3>{b.nom}</h3>
            <p>{b.description}</p>
            <ul className="probas">
              {RARETES.map((r, i) => {
                const proba = (b.poids[i] * 4 + b.poidsDerniere[i]) / 5
                return proba > 0 ? (
                  <li key={r.nom}>
                    <span className="puce" style={{ background: r.couleur }} />
                    {r.nom} <strong>{(proba * 100).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %</strong>
                  </li>
                ) : null
              })}
            </ul>
            <button
              className="btn btn-principal"
              disabled={s.credits < b.prix}
              onClick={async () => {
                const t = await tirer(base, b, false)
                if (t) ouvrir(t)
              }}
            >
              Acheter · {b.prix} ₵
            </button>
          </article>
        ))}
      </div>

      <div className="encart">
        <h3>Variantes rares</h3>
        <p className="discret">Chaque fiche tirée peut sortir dans une version rare, à collectionner en plus de la version standard. Les dossiers Keter et O5 multiplient ces chances.</p>
        <ul className="probas probas-variantes">
          {VARIANTES.filter((v) => v.id !== 'std').map((v) => (
            <li key={v.id}>
              <span className="puce" style={{ background: v.couleur }} />
              {v.nom} — <span className="discret">{v.description}</span>
              <strong>{(v.chance * 100).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %</strong>
            </li>
          ))}
        </ul>
      </div>

      <div className="encart">
        <h3>Gagner des crédits</h3>
        <ul>
          <li>Remporter des confrontations (plus l'adversaire est haut placé, plus le gain est élevé, +5 ₵ par bonne réponse).</li>
          <li>
            Recycler les doublons dans les archives :{' '}
            {RARETES.map((r, i) => `${r.nom.toLowerCase()} ${VALEUR_RECYCLAGE[i]} ₵`).join(' · ')}.
          </li>
        </ul>
      </div>

      <details className="encart">
        <summary>Zone dangereuse</summary>
        <p>Supprimer le compte efface définitivement le profil, la collection et l'historique enregistrés sur le serveur.</p>
        <button
          className="btn btn-danger"
          onClick={() => {
            if (confirm(`Supprimer définitivement le compte ${compte.email ?? ''} et toute sa collection ?`)) void supprimerCompte()
          }}
        >
          Supprimer mon compte
        </button>
      </details>
    </section>
  )
}
