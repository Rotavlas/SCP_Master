import { useEffect, useState } from 'react'
import { RARETES, type Base } from '../data/catalogue'
import { definirAgent } from '../state/actions'
import { tableauDuels, type TableauDuels } from '../state/jcj'
import { ACCREDITATIONS, accreditation, useSauvegarde, varianteAffichee } from '../state/sauvegarde'
import type { Ecran } from '../types'
import { Carte } from './Carte'
import { CompteARebours } from './CompteARebours'
import { Logo } from './Logo'

interface Props {
  base: Base
  aller: (e: Ecran) => void
  ouvrirCarte: (id: string) => void
}

export function Accueil({ base, aller, ouvrirCarte }: Props) {
  const s = useSauvegarde()
  const [nom, setNom] = useState('')
  const [occupe, setOccupe] = useState(false)
  // Elo, rang et agents en ligne pour la tuile des confrontations
  const [duels, setDuels] = useState<TableauDuels | null>(null)
  useEffect(() => {
    if (s.agent) void tableauDuels().then(setDuels)
  }, [s.agent])
  const acc = accreditation(s.xp)
  const possedees = Object.keys(s.collection)
  const parRarete = RARETES.map(() => 0)
  for (const id of possedees) {
    const c = base.parId.get(id)
    if (c) parRarete[c.ra]++
  }
  const vitrine = possedees
    .map((id) => base.parId.get(id)!)
    .filter(Boolean)
    .sort((a, b) => b.ra - a.ra + (s.variantes[b.id] ? 0.5 : 0) - (s.variantes[a.id] ? 0.5 : 0) || a.p - b.p)
    .slice(0, 5)

  // Premier passage d'un joueur connecté : il choisit son pseudo public
  if (!s.agent) {
    return (
      <section className="accueil-inscription">
        <Logo taille={96} className="logo-grand" />
        <p className="dossier-entete">Fondation SCP · Création du dossier personnel</p>
        <h1>Bienvenue, agent.</h1>
        <p className="intro">
          Choisissez le pseudo sous lequel les autres membres du personnel vous verront. Trois dossiers vous attendent pour commencer votre
          collection.
        </p>
        <form
          className="inscription"
          onSubmit={async (e) => {
            e.preventDefault()
            if (!nom.trim()) return
            setOccupe(true)
            await definirAgent(nom.trim().slice(0, 24))
            setOccupe(false)
          }}
        >
          <label htmlFor="agent">Pseudo public (3 à 24 caractères)</label>
          <div>
            <input
              id="agent"
              value={nom}
              onChange={(e) => setNom(e.target.value)}
              placeholder="Agent ████"
              autoFocus
              maxLength={24}
              pattern="[A-Za-z0-9À-ÿ _.\-]{3,24}"
              title="Lettres, chiffres, espaces, points, tirets et soulignés"
            />
            <button className="btn btn-principal" disabled={!nom.trim() || occupe}>
              Prendre son poste
            </button>
          </div>
        </form>
      </section>
    )
  }

  const progression = acc.suivant ? (s.xp - acc.xp) / (acc.suivant.xp - acc.xp) : 1

  return (
    <section className="accueil">
      <div className="bienvenue">
        <p className="dossier-entete">Session ouverte · {new Date().toLocaleDateString('fr-FR')}</p>
        <h1>Bonjour, {s.agent}.</h1>
        <p className="accreditation">
          {acc.nom}
          {acc.suivant && (
            <span>
              {' '}
              · {s.xp}/{acc.suivant.xp} XP
            </span>
          )}
        </p>
        <div className="jauge" aria-label="Progression vers l'accréditation suivante">
          <div style={{ width: `${progression * 100}%` }} />
        </div>
      </div>

      <div className="tuiles">
        <button className="tuile tuile-booster" onClick={() => aller('booster')}>
          <span className="tuile-titre">Ouvrir un dossier</span>
          <span className="tuile-valeur">{s.boosters}</span>
          <span className="tuile-sous">
            en stock · <CompteARebours />
          </span>
        </button>
        <button className="tuile tuile-jcj" onClick={() => aller('duel')}>
          <span className="tuile-titre">Confrontation</span>
          <span className="tuile-valeur">{duels ? `${duels.elo} Elo` : '—'}</span>
          <span className="tuile-sous">
            {duels ? `#${duels.rang} · ${duels.jcj.victoires} victoire${duels.jcj.victoires > 1 ? 's' : ''} entre agents · ${duels.enLigne} en ligne` : 'duels entre agents'}
          </span>
        </button>
        <button className="tuile" onClick={() => aller('collection')}>
          <span className="tuile-titre">Archives</span>
          <span className="tuile-valeur">{possedees.length.toLocaleString('fr-FR')}</span>
          <span className="tuile-sous">sur {base.cartes.length.toLocaleString('fr-FR')} dossiers</span>
        </button>
        <button className="tuile" onClick={() => aller('boutique')}>
          <span className="tuile-titre">Intendance</span>
          <span className="tuile-valeur">{s.credits.toLocaleString('fr-FR')} ₵</span>
          <span className="tuile-sous">crédits disponibles</span>
        </button>
      </div>

      <div className="raretes-resume">
        {RARETES.map((r, i) => (
          <div key={r.nom}>
            <span className="puce" style={{ background: r.couleur }} />
            {r.nom}
            <strong>
              {parRarete[i]}/{base.parRarete[i].length}
            </strong>
          </div>
        ))}
      </div>

      {vitrine.length > 0 && (
        <div className="vitrine">
          <h2>Vos dossiers les plus précieux</h2>
          <div className="rangee-cartes">
            {vitrine.map((c) => (
              <Carte key={c.id} carte={c} base={base} taille="p" variante={varianteAffichee(s, c.id)} onClick={() => ouvrirCarte(c.id)} />
            ))}
          </div>
        </div>
      )}

      <details className="regles">
        <summary>Comment jouer</summary>
        <ul>
          <li>Un dossier (booster de 5 cartes) gratuit toutes les 10 minutes, jusqu'à 10 en stock. L'intendance vend des dossiers thématiques.</li>
          <li>Chaque carte peut sortir dans une variante rare : holographique, expurgée, archive d'origine, brèche ou sceau O5.</li>
          <li>Le Répertoire liste toutes les fiches obtenables ; ajoutez celles que vous cherchez à votre liste de souhaits.</li>
          <li>Le bouton VO/VF bascule les textes vers les traductions de la branche française, quand elles existent.</li>
          <li>La rareté vient de la popularité de la page : note du wiki et nombre de pages qui la citent.</li>
          <li>
            <strong>Menace</strong> dépend de la longueur du dossier et de la dangerosité de l'objet ;{' '}
            <strong>Confinement</strong> de sa classe et de ses procédures.
          </li>
          <li>
            En confrontation, chaque manche pose une question sur l'une des deux cartes en jeu. Bonne réponse : votre carte
            frappe. Répondez vite pour frapper plus fort.
          </li>
          <li>
            Les duels <strong>entre agents</strong> sont le cœur du jeu : le duel classé fait gagner ou perdre de l'Elo et rapporte
            des crédits, le défi amical se lance à un ami en ligne. Contre l'IA, 10 duels récompensés par jour pour s'entraîner.
          </li>
          <li>Le Marché permet d'enchérir, de vendre et d'échanger des cartes avec les autres agents.</li>
          <li>L'onglet Social réunit amis, clans et messages ; les Classements comparent Elo, collection, fortune et clans.</li>
          <li>Les victoires rapportent crédits et XP. L'accréditation débloque des adversaires IA plus coriaces.</li>
          <li>Paliers : {ACCREDITATIONS.map((a) => `N${a.niveau} à ${a.xp} XP`).join(', ')}.</li>
        </ul>
      </details>
    </section>
  )
}
