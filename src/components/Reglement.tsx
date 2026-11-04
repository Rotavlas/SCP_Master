import { useEffect, useState, type ReactNode } from 'react'
import { RARETES } from '../data/catalogue'
import { BOOSTERS, EDITION_MYTHIQUE, PART_AU_DELA, PLAFOND_RECYCLAGE, PREMIERE_EDITION, VALEUR_RECYCLAGE } from '../engine/boosters'
import { ADVERSAIRES } from '../engine/duel'
import { DUREES, FRAIS_VENTE, MULTIPLICATEUR_BRULAGE } from '../engine/marche'
import { VARIANTES } from '../engine/variantes'
import { appeler } from '../state/enLigne'
import { useSauvegarde } from '../state/sauvegarde'
import { JaugeRecyclage } from './JaugeRecyclage'

/**
 * La circulaire de l'Intendance : toutes les règles de l'économie du jeu, sur une seule page (prix, limites,
 * chances, taxes, plafonds, primes). Les chiffres viennent du code partagé avec le serveur quand il existe
 * (src/engine) ; les autres reprennent les fonctions SQL citées à chaque article, qui font foi.
 */

const pct = (x: number, chiffres = 2) => `${(x * 100).toLocaleString('fr-FR', { maximumFractionDigits: chiffres })} %`
const credits = (n: number) => `${n.toLocaleString('fr-FR')} ₵`

/** Chance moyenne par carte d'une rareté dans un dossier : quatre cartes ordinaires et la dernière, meilleure */
const parCarte = (b: (typeof BOOSTERS)[number], i: number) => (b.poids[i] * 4 + b.poidsDerniere[i]) / 5

/** « 1 dossier sur N » pour qu'au moins une Mythique sorte */
const unSur = (chance: number) => Math.round(1 / (1 - (1 - chance) ** 5))

// Valeurs fixées côté serveur (supabase/migrations) : missions, rapport, piste, album, épreuve, raid, saisons, clans
const RAPPORT = [
  { jour: 1, gain: credits(100) },
  { jour: 2, gain: credits(150) },
  { jour: 3, gain: '1 dossier' },
  { jour: 4, gain: credits(250) },
  { jour: 5, gain: '2 dossiers' },
  { jour: 6, gain: credits(400) },
  { jour: 7, gain: 'Dossier Keter' },
]
const EPREUVE = [
  { rang: '1er', gain: 1500 },
  { rang: '2e et 3e', gain: 1000 },
  { rang: '4e au 10e', gain: 500 },
  { rang: 'Tous les autres', gain: 100 },
]
const SAISON = [
  { palier: 'Or', elo: '1 300 et plus', gain: 2500 },
  { palier: 'Argent', elo: '1 150 et plus', gain: 1200 },
  { palier: 'Bronze', elo: '1 050 et plus', gain: 600 },
  { palier: 'Participation', elo: 'en dessous', gain: 200 },
]
const ALBUM = [
  { page: 'Codes de confinement', gain: 600 },
  { page: 'Initiatives de Réponse Automatisée', gain: 800 },
  { page: 'Scénarios de classe K', gain: 800 },
  { page: 'Départements', gain: 1000 },
  { page: 'Grandes entités', gain: 2000 },
  { page: 'Conseil O5, Sites, FIM', gain: 3000 },
  { page: 'Mythiques', gain: 10000 },
]
const BONUS_VARIANTE: [string, number][] = [
  ['Dossier standard, d’anomalies, narratif', 1],
  ['Dossiers du personnel', 1.5],
  ['Dossier Keter', 2],
  ['Archives du Conseil O5', 4],
  ['Dossier Apollyon', 6],
]

/** Les articles, pour le sommaire */
const ARTICLES = [
  ['dossiers', 'Dossiers'],
  ['mythiques', 'Mythiques'],
  ['variantes', 'Variantes'],
  ['recyclage', 'Recyclage et brûlage'],
  ['marche', 'Marché'],
  ['confrontations', 'Confrontations'],
  ['primes', 'Primes et récompenses'],
  ['clans', 'Clans'],
] as const

export function Reglement() {
  const s = useSauvegarde()
  // Les dossiers encore achetables aujourd'hui (Apollyon : cette semaine) ; le serveur fait foi
  const [restants, setRestants] = useState<Record<string, number> | null>(null)
  useEffect(() => {
    void appeler<Record<string, number>>('achats_restants').then(setRestants)
  }, [s.credits])

  return (
    <article className="reglement">
      <header className="reglement-entete">
        <div className="reglement-emetteur">
          <span>Fondation SCP</span>
          <span>Intendance générale</span>
        </div>
        <h1>Circulaire 05-ECO</h1>
        <dl className="reglement-meta">
          <div>
            <dt>Objet</dt>
            <dd>Règles économiques en vigueur</dd>
          </div>
          <div>
            <dt>Destinataire</dt>
            <dd>{s.agent || 'Tout le personnel'}</dd>
          </div>
          <div>
            <dt>Diffusion</dt>
            <dd>Niveau 1 et plus</dd>
          </div>
        </dl>
        <span className="reglement-tampon" aria-hidden="true">
          Approuvé
        </span>
      </header>

      <section className="reglement-quotas" aria-label="Vos quotas du jour">
        <h2>Vos quotas du jour</h2>
        <div className="quotas-grille">
          {BOOSTERS.filter((b) => b.parJour || b.parSemaine).map((b) => {
            const max = b.parJour ?? b.parSemaine ?? 0
            const reste = restants?.[b.id]
            return (
              <div key={b.id} className={`quota ${reste === 0 ? 'quota-epuise' : ''}`}>
                <span className="quota-nom">{b.nom}</span>
                <span className="quota-valeur">
                  <span className="quota-chiffre">{reste === undefined ? '—' : reste}</span>
                  <small> / {max}</small>
                </span>
                <span className="quota-periode">{b.parSemaine ? 'cette semaine' : 'aujourd’hui'}</span>
              </div>
            )
          })}
          <div className="quota">
            <span className="quota-nom">Dossiers en réserve</span>
            <span className="quota-valeur">
              {s.boosters}
              <small> / 10</small>
            </span>
            <span className="quota-periode">un toutes les 10 minutes</span>
          </div>
        </div>
        <JaugeRecyclage />
      </section>

      <nav className="reglement-sommaire" aria-label="Articles">
        {ARTICLES.map(([id, nom], i) => (
          <a key={id} href={`#article-${id}`}>
            <span>Art. {i + 1}</span> {nom}
          </a>
        ))}
      </nav>

      <Article n={1} id="dossiers" titre="Dossiers">
        <p>
          Chaque dossier contient 5 fiches ; la dernière est toujours d’une rareté meilleure. Le dossier standard gratuit s’accumule en réserve : un toutes les
          10 minutes, 10 au plus. Les dossiers Keter offerts (Rapport quotidien, piste d’accréditation) ne comptent pas dans la limite d’achat.
        </p>
        <div className="tableau-defile">
          <table>
            <thead>
              <tr>
                <th>Dossier</th>
                <th>Prix</th>
                <th>Limite</th>
                {RARETES.slice(0, 5).map((r) => (
                  <th key={r.nom} style={{ color: r.couleur }}>
                    {r.nom}
                  </th>
                ))}
                <th style={{ color: RARETES[5].couleur }}>Mythique</th>
              </tr>
            </thead>
            <tbody>
              {BOOSTERS.map((b) => (
                <tr key={b.id}>
                  <th scope="row">{b.nom}</th>
                  <td>{credits(b.prix)}</td>
                  <td>{b.parJour ? `${b.parJour} par jour` : b.parSemaine ? `${b.parSemaine} par semaine` : 'aucune'}</td>
                  {RARETES.slice(0, 5).map((_, i) => (
                    <td key={i} className={parCarte(b, i) === 0 ? 'nul' : ''}>
                      {parCarte(b, i) === 0 ? '—' : pct(parCarte(b, i))}
                    </td>
                  ))}
                  <td>1 sur {unSur(b.mythique).toLocaleString('fr-FR')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="reglement-note">
          Chances moyennes par fiche. Mythique : nombre moyen de dossiers pour en voir une. Limites remises à zéro à minuit (heure de Paris) ; l’Apollyon, le
          lundi.
        </p>
      </Article>

      <Article n={2} id="mythiques" titre="Mythiques">
        <ul className="reglement-liste">
          <li>
            Chaque Mythique n’existe qu’en <strong>{EDITION_MYTHIQUE} exemplaires numérotés</strong>, pour toute la vie du jeu. Une fois son édition épuisée,
            une Légendaire sort à sa place ; elle ne s’obtient plus qu’au marché.
          </li>
          <li>Une Mythique brûlée est perdue pour toujours : son numéro ne revient pas.</li>
          <li>
            Les exemplaires n° 1 à {PREMIERE_EDITION} forment la <strong>Première édition</strong>.
          </li>
          <li>
            Une Mythique peut sortir en <strong>Négatif</strong> (5 %) ou en <strong>Épreuve d’artiste</strong> (4 %), deux variantes qui n’existent que pour
            elles, ou dans une variante ordinaire. Le numéro reste commun à toutes ses variantes.
          </li>
        </ul>
      </Article>

      <Article n={3} id="variantes" titre="Variantes">
        <div className="reglement-colonnes">
          <table>
            <thead>
              <tr>
                <th>Variante</th>
                <th>Chance par fiche</th>
                <th>Brûlage</th>
              </tr>
            </thead>
            <tbody>
              {VARIANTES.filter((v) => v.id !== 'std').map((v) => (
                <tr key={v.id}>
                  <th scope="row">
                    <span className="puce" style={{ background: v.couleur }} /> {v.nom}
                  </th>
                  <td>{v.mythique ? `${pct(v.chance)} des Mythiques` : pct(v.chance)}</td>
                  <td>×{MULTIPLICATEUR_BRULAGE[v.id]}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <table>
            <thead>
              <tr>
                <th>Dossier</th>
                <th>Chances de variante</th>
              </tr>
            </thead>
            <tbody>
              {BONUS_VARIANTE.map(([nom, x]) => (
                <tr key={nom}>
                  <th scope="row">{nom}</th>
                  <td>×{x.toLocaleString('fr-FR')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Article>

      <Article n={4} id="recyclage" titre="Recyclage et brûlage">
        <p>
          Recycler un doublon ou brûler un exemplaire rend des crédits selon sa rareté, multipliés par sa variante quand on le brûle. Le recyclage automatique
          garde toujours un exemplaire standard de chaque carte et toutes les variantes rares.
        </p>
        <div className="reglement-baremes">
          {RARETES.map((r, i) => (
            <div key={r.nom} className="bareme" style={{ ['--r' as string]: r.couleur }}>
              <span>{r.nom}</span>
              <strong>{credits(VALEUR_RECYCLAGE[i])}</strong>
            </div>
          ))}
        </div>
        <div className="reglement-plafond">
          <strong>Plafond quotidien : {credits(PLAFOND_RECYCLAGE)} à plein tarif</strong>
          <span>
            Recyclage et brûlage confondus. Au-delà, chaque recyclage ou brûlage ne rapporte plus que {PART_AU_DELA * 100} % de sa valeur, jusqu’à minuit (heure
            de Paris).
          </span>
        </div>
        <ul className="reglement-liste">
          <li>
            <strong>Fusion</strong> : 5 doublons standard d’une carte (en plus de l’exemplaire gardé) sont détruits pour 1 exemplaire dans une variante tirée au
            hasard, au prorata des chances des dossiers (Holographique la moitié du temps, Sceau O5 environ 2 %). Frais : la valeur de recyclage des 5 doublons.{' '}
            <strong>3 fusions par jour</strong>, jamais pour une Mythique.
          </li>
        </ul>
      </Article>

      <Article n={5} id="marche" titre="Marché">
        <ul className="reglement-liste">
          <li>
            Une <strong>taxe de {FRAIS_VENTE * 100} %</strong> est prélevée au vendeur sur chaque vente. Ces crédits sortent du jeu.
          </li>
          <li>Durées de vente : {DUREES.map((d) => d.nom).join(', ')}.</li>
          <li>Une enchère dépasse la précédente d’au moins 5 %.</li>
          <li>Les échanges entre agents ne sont pas taxés.</li>
          <li>Chaque Mythique a son registre public : détenteurs successifs de chaque exemplaire numéroté, prix payé aux enchères, destruction.</li>
          <li>
            Cosmétiques (titres, cadres de profil, couvertures de dossier) : de 1 500 à 60 000 ₵, achetés une fois, sans effet sur le jeu. Ces crédits sortent
            du jeu. Ceux des Groupes d’intérêt ne s’achètent pas : ils récompensent une collection complète, sans aucun crédit.
          </li>
        </ul>
      </Article>

      <Article n={6} id="confrontations" titre="Confrontations">
        <div className="reglement-colonnes">
          <table>
            <thead>
              <tr>
                <th>Contre l’IA</th>
                <th>Victoire</th>
                <th>XP</th>
                <th>Accréditation</th>
              </tr>
            </thead>
            <tbody>
              {ADVERSAIRES.map((a) => (
                <tr key={a.niveau}>
                  <th scope="row">{a.nom}</th>
                  <td>{credits(a.gain)}</td>
                  <td>{a.xp}</td>
                  <td>niveau {a.accreditation}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <ul className="reglement-liste">
            <li>
              Contre l’IA : <strong>5 duels récompensés par 24 heures</strong> glissantes. Victoire : le gain, plus 5 ₵ par bonne réponse ; nul : un tiers du
              gain ; défaite : 10 ₵.
            </li>
            <li>
              Entre agents, en classé : victoire {credits(120)}, nul {credits(50)}, défaite {credits(25)}. Au plus{' '}
              <strong>20 duels récompensés par 24 heures</strong>, et plus aucun crédit au-delà de 3 duels dans la journée contre le même adversaire.
            </li>
          </ul>
        </div>
        <h3>Saison classée (un mois)</h3>
        <p>Récompensée à la clôture pour qui a joué au moins 5 duels classés dans le mois ; ensuite, tous les Elo se rapprochent de moitié de 1 000.</p>
        <div className="reglement-baremes">
          {SAISON.map((x) => (
            <div key={x.palier} className="bareme">
              <span>
                {x.palier} · {x.elo}
              </span>
              <strong>{credits(x.gain)}</strong>
            </div>
          ))}
        </div>
      </Article>

      <Article n={7} id="primes" titre="Primes et récompenses">
        <h3>Rapport quotidien</h3>
        <ol className="reglement-rapport">
          {RAPPORT.map((r) => (
            <li key={r.jour}>
              <span>J{r.jour}</span>
              {r.gain}
            </li>
          ))}
        </ol>
        <p className="reglement-note">Un rapport par jour. Un seul jour manqué, et la série repart du premier jour.</p>
        <div className="reglement-colonnes">
          <div>
            <h3>Épreuve de la semaine</h3>
            <table>
              <tbody>
                {EPREUVE.map((e) => (
                  <tr key={e.rang}>
                    <th scope="row">{e.rang}</th>
                    <td>{credits(e.gain)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div>
            <h3>Album de la Fondation</h3>
            <table>
              <tbody>
                {ALBUM.map((a) => (
                  <tr key={a.page}>
                    <th scope="row">{a.page}</th>
                    <td>{credits(a.gain)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <ul className="reglement-liste">
          <li>
            Missions : trois par jour ({credits(60)} à {credits(100)} ou un dossier), trois par semaine ({credits(500)}, {credits(600)} ou 3 dossiers).
          </li>
          <li>
            Piste d’accréditation : 30 paliers d’XP ; chacun rapporte 50 ₵ plus 15 ₵ par palier, un dossier tous les trois, un dossier Keter tous les dix.
          </li>
          <li>
            Raid de clan : {credits(500)} et un dossier par membre ayant infligé au moins 40 dégâts, si l’anomalie tombe avant lundi. Dégâts plafonnés à 150 par
            agent et par jour.
          </li>
          <li>Une page d’album, une mission, un palier ou un raid se réclament une seule fois.</li>
        </ul>
      </Article>

      <Article n={8} id="clans" titre="Clans">
        <ul className="reglement-liste">
          <li>Fonder un clan coûte {credits(2000)} ; 30 membres au plus.</li>
        </ul>
      </Article>

      <footer className="reglement-pied">Le serveur fait foi. Toute modification de ces règles est annoncée au journal des modifications.</footer>
    </article>
  )
}

function Article({ n, id, titre, children }: { n: number; id: string; titre: string; children: ReactNode }) {
  return (
    <section className="reglement-article" id={`article-${id}`}>
      <h2>
        <span className="reglement-numero">Article {n}</span>
        {titre}
      </h2>
      {children}
    </section>
  )
}
