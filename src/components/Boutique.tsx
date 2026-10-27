import type { Base } from '../data/catalogue'
import { RARETES } from '../data/catalogue'
import { BOOSTERS, VALEUR_RECYCLAGE } from '../engine/boosters'
import { VARIANTES } from '../engine/variantes'
import { supprimerCompte } from '../state/enLigne'
import { useSauvegarde } from '../state/sauvegarde'
import { tirer, type Tirage } from './Booster'
import { BoutonConfirme } from './Confirmer'
import { Logo } from './Logo'

export function Boutique({ base, ouvrir }: { base: Base; ouvrir: (t: Tirage) => void }) {
  const s = useSauvegarde()

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
                if (i === 5) {
                  // Tirée à part : une chance par carte, comme les autres raretés (en moyenne un dossier sur N)
                  const surN = Math.round(1 / (1 - (1 - b.mythique) ** 5))
                  return (
                    <li key={r.nom} title={`En moyenne un dossier sur ${surN.toLocaleString('fr-FR')}, sans garantie`}>
                      <span className="puce" style={{ background: r.couleur }} />
                      {r.nom} <strong>{(b.mythique * 100).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} %</strong>
                    </li>
                  )
                }
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
        <BoutonConfirme
          className="btn btn-danger"
          danger
          question="Supprimer définitivement le compte et toute sa collection ?"
          confirmer="Oui, tout supprimer"
          onConfirme={() => void supprimerCompte()}
        >
          Supprimer mon compte
        </BoutonConfirme>
      </details>
    </section>
  )
}
