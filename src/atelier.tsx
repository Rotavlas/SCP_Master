/**
 * Atelier des cartes Mythiques et Légendaires : chaque carte, sa scène en grand, son animation et sa
 * cinématique complète, pour travailler les illustrations. Page de développement seulement
 * (npm run atelier) : elle n'est pas publiée avec le jeu.
 */
import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Protocole } from './components/Booster'
import { Carte } from './components/Carte'
import { AnimationMythique } from './components/AnimationsMythiques'
import { SceneMythique } from './components/ScenesMythiques'
import { chargerBase, type Base } from './data/catalogue'
import { VARIANTES } from './engine/variantes'
import { CREDITS_ILLUSTRATIONS, SIGNATURES } from './data/mythiques'
import type { Carte as TCarte } from './types'
import { brancherServeurLocal } from './atelierServeur'
import { Breche } from './components/Breche'
import { DuelEclair } from './components/DuelEclair'
import { Reconfinement } from './components/Reconfinement'
import { Tuto, TutoBreche } from './components/TutoBreche'
import { ETAPES_ECLAIR, ETAPES_RECO } from './components/TutoModes'
import { QuestionAlteree } from './components/QuestionAlteree'
import type { Alteration } from './engine/effets'
import { ADVERSAIRES } from './engine/duel'
import './styles.css'

// Les originaux (public/sunny/, public/photos/), pour comparer avec la fin de l'animation
const ORIGINAUX: Record<string, string> = {
  'entite:scarlet-king': 'sunny/scarlet-king.png',
  'dr-clef-s-proposal': 'sunny/gate-guardian.png',
  'fim:alpha-1': 'sunny/alpha-1.png',
  'perso:o5-1': 'sunny/o5-1.png',
  'perso:the-administrator': 'sunny/administrateur.png',
  'perso:aaron-siegel': 'photos/aaron-siegel.png',
  'scp-2747': 'sunny/anafabula.png',
  'scp-173': 'photos/scp-173.png',
}

const LEGENDAIRES = ['scp-173', 'scp-2521', 'site:site-19', 'fim:epsilon-11', 'dept:ethics-committee', 'fim:r-sh-1']

/** atelier.html?voir=<id> : une seule cinématique, en grand, rejouable ; &t=<s> : arrêtée à cet instant */
function Voir({ id }: { id: string }) {
  const [n, setN] = useState(0)
  const t = new URLSearchParams(location.search).get('t')
  return (
    <main className="atelier-voir">
      <div className="atelier-voir-scene">
        <AnimationMythique key={n} id={id} fige={t === null ? undefined : Number(t)} />
      </div>
      <button className="btn btn-principal atelier-rejouer" onClick={() => setN(n + 1)}>
        Rejouer
      </button>
    </main>
  )
}

/**
 * atelier.html?mode=reco|breche|eclair : une confrontation contre l'IA, jouée avec le vrai code du serveur en local
 * (src/atelierServeur.ts) ; &equipe=id1,id2… pour changer l'équipe de démonstration, &niveau=1…5 pour l'adversaire.
 */
function EssaiMode({ base, mode }: { base: Base; mode: string }) {
  const [tuto, setTuto] = useState(false)
  const [n, setN] = useState(0)
  const params = new URLSearchParams(location.search)
  const adversaire = ADVERSAIRES[Math.min(4, Math.max(0, Number(params.get('niveau') ?? 3) - 1))]
  const quitter = () => setN(n + 1)
  return (
    <main className="contenu">
      <div className="actions">
        <button className="btn" onClick={() => setTuto(true)}>
          Tutoriel
        </button>
        <button className="btn" onClick={quitter}>
          Nouvelle partie
        </button>
      </div>
      {tuto &&
        (mode === 'breche' ? (
          <TutoBreche onFermer={() => setTuto(false)} />
        ) : (
          <Tuto etapes={mode === 'reco' ? ETAPES_RECO : ETAPES_ECLAIR} cle="atelier" onFermer={() => setTuto(false)} />
        ))}
      {mode === 'reco' ? (
        <Reconfinement key={n} base={base} adversaire={adversaire} onQuitter={quitter} />
      ) : mode === 'eclair' ? (
        <DuelEclair key={n} base={base} adversaire={adversaire} onQuitter={quitter} />
      ) : (
        <Breche key={n} base={base} adversaire={adversaire} onQuitter={quitter} />
      )}
    </main>
  )
}

/** atelier.html?mode=alterations : chaque altération d'une question, en boucle, pour en juger le rendu */
const ALTERATIONS: Alteration[] = ['clignement', 'memetique', 'antimemetique', 'effacement', 'realite', 'spatial', 'visuel', 'sonore', 'temporel']

function PlancheAlterations() {
  const [debut, setDebut] = useState(() => Date.now())
  const [maintenant, setMaintenant] = useState(Date.now())
  const [choisie, setChoisie] = useState<Alteration>('clignement')
  useEffect(() => {
    const t = setInterval(() => setMaintenant(Date.now()), 200)
    return () => clearInterval(t)
  }, [])
  const ecoule = ((maintenant - debut) / 1000) % 20
  const question = {
    intitule: 'Quelles procédures reconfinent SCP-173 ?',
    document:
      'Item SCP-173 is to be kept in a locked container at all times. When personnel must enter SCP-173’s container, no fewer than 3 may enter at any time.',
    options: [
      'Cellule verrouillée, trois agents au moins, contact visuel permanent',
      'Aquarium d’eau salée de 30 000 litres',
      'Coffre de type Faraday, Site-77',
      'Aucune procédure : neutralisé',
    ],
  }
  return (
    <main className="contenu">
      <div className="pastilles">
        {ALTERATIONS.map((a) => (
          <button
            key={a}
            className={`pastille-filtre ${a === choisie ? 'active' : ''}`}
            onClick={() => {
              setChoisie(a)
              setDebut(Date.now())
            }}
          >
            {a}
          </button>
        ))}
      </div>
      <div className="duel-question" style={{ maxWidth: 640, margin: '1rem auto' }}>
        <p className="dossier-entete">
          Altération : {choisie} · {ecoule.toFixed(0)} s
        </p>
        <QuestionAlteree
          key={`${choisie}-${debut}`}
          question={question}
          alteration={choisie}
          retirees={[3]}
          onRepondre={() => setDebut(Date.now())}
          ecoule={ecoule}
        />
      </div>
    </main>
  )
}

function Atelier({ base }: { base: Base }) {
  const params = new URLSearchParams(location.search)
  const voir = params.get('voir')
  if (voir) return <Voir id={voir} />
  const mode = params.get('mode') ?? (params.has('breche') ? 'breche' : null)
  if (mode === 'alterations') return <PlancheAlterations />
  if (mode) {
    brancherServeurLocal(params.get('equipe')?.split(','))
    return <EssaiMode base={base} mode={mode} />
  }
  const mythiques = Object.keys(SIGNATURES)
    .map((id) => base.parId.get(id))
    .filter((c): c is TCarte => !!c)
  const [rejeu, setRejeu] = useState<Record<string, number>>({})
  const [cinematique, setCinematique] = useState<TCarte | null>(null)
  return (
    <main className="atelier">
      <header>
        <h1>Atelier des Mythiques</h1>
        <p className="discret">
          Chaque carte, sa scène et son animation. Modifier src/components/ScenesMythiques.tsx ou styles.css (.sm-*) : la page se met à jour seule.
        </p>
      </header>
      {mythiques.map((c) => {
        const credit = CREDITS_ILLUSTRATIONS[c.id]
        return (
          <section key={c.id} className="atelier-ligne" style={{ ['--sig' as string]: SIGNATURES[c.id].couleur }}>
            <Carte carte={c} base={base} taille="g" />
            <div className="atelier-scene">{rejeu[c.id] ? <AnimationMythique key={rejeu[c.id]} id={c.id} /> : <SceneMythique id={c.id} />}</div>
            {ORIGINAUX[c.id] && (
              <figure className="atelier-original">
                <img src={`/${ORIGINAUX[c.id]}`} alt={`Original : ${c.nm}`} />
                <figcaption>Original</figcaption>
              </figure>
            )}
            <div className="atelier-infos">
              <h2>{c.nm}</h2>
              <p className="discret">« {SIGNATURES[c.id].indice} »</p>
              {credit && (
                <p className="discret">
                  Illustration d'après <a href={credit.source}>{credit.artiste}</a> ({credit.licence})
                </p>
              )}
              <div className="actions">
                <button className="btn btn-principal" onClick={() => setRejeu((r) => ({ ...r, [c.id]: (r[c.id] ?? 0) + 1 }))}>
                  Rejouer l'animation
                </button>
                <button className="btn" onClick={() => setCinematique(c)}>
                  Cinématique complète
                </button>
              </div>
            </div>
          </section>
        )
      })}
      <h2>Variantes</h2>
      <p className="discret">Chaque variante sur une Épique, une Légendaire et une Mythique, pour vérifier qu'elles s'accordent avec les cadres.</p>
      {['scp-3812', 'scp-096', 'entite:scarlet-king'].map((id) => {
        const c = base.parId.get(id)
        return (
          c && (
            <div key={id} className="atelier-variantes">
              {VARIANTES.map((v) => (
                <figure key={v.id}>
                  <Carte carte={c} base={base} taille="m" variante={v.id} />
                  <figcaption>{v.nom}</figcaption>
                </figure>
              ))}
            </div>
          )
        )
      })}
      <h2>Légendaires</h2>
      <div className="atelier-legendaires">
        {LEGENDAIRES.map((id) => base.parId.get(id))
          .filter((c): c is TCarte => !!c)
          .map((c) => (
            <div key={c.id}>
              <Carte carte={c} base={base} taille="m" />
              <button className="btn" onClick={() => setCinematique(c)}>
                Cinématique
              </button>
            </div>
          ))}
      </div>
      {cinematique && <Protocole key={cinematique.id + Date.now()} carte={cinematique} onFini={() => setCinematique(null)} />}
    </main>
  )
}

// Une seule racine React, même quand le rechargement à chaud réexécute ce fichier
const conteneur = document.getElementById('racine') as HTMLElement & { racine?: ReturnType<typeof createRoot> }
conteneur.racine ??= createRoot(conteneur)
void chargerBase().then((base) => conteneur.racine!.render(<Atelier base={base} />))
