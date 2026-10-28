/**
 * Atelier des cartes Mythiques et Légendaires : chaque carte, sa scène en grand, son animation et sa
 * cinématique complète, pour travailler les illustrations. Page de développement seulement
 * (npm run atelier) : elle n'est pas publiée avec le jeu.
 */
import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Protocole } from './components/Booster'
import { Carte } from './components/Carte'
import { AnimationMythique } from './components/AnimationsMythiques'
import { SceneMythique } from './components/ScenesMythiques'
import { chargerBase, type Base } from './data/catalogue'
import { CREDITS_ILLUSTRATIONS, SIGNATURES } from './data/mythiques'
import type { Carte as TCarte } from './types'
import './styles.css'

// Les originaux de SunnyClockwork (public/sunny/), pour comparer avec la fin de l'animation
const ORIGINAUX: Record<string, string> = {
  'entite:scarlet-king': 'scarlet-king.png',
  'dr-clef-s-proposal': 'gate-guardian.png',
  'fim:alpha-1': 'alpha-1.png',
  'perso:o5-1': 'o5-1.png',
  'perso:the-administrator': 'administrateur.png',
}

const LEGENDAIRES = ['scp-173', 'scp-2521', 'site:site-19', 'fim:epsilon-11', 'dept:ethics-committee', 'fim:r-sh-1']

/** atelier.html?voir=<id> : une seule cinématique, en grand, rejouable */
function Voir({ id }: { id: string }) {
  const [n, setN] = useState(0)
  return (
    <main className="atelier-voir">
      <div className="atelier-voir-scene">
        <AnimationMythique key={n} id={id} />
      </div>
      <button className="btn btn-principal" onClick={() => setN(n + 1)}>
        Rejouer
      </button>
    </main>
  )
}

function Atelier({ base }: { base: Base }) {
  const voir = new URLSearchParams(location.search).get('voir')
  if (voir) return <Voir id={voir} />
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
                <img src={`/sunny/${ORIGINAUX[c.id]}`} alt={`Original de SunnyClockwork : ${c.nm}`} />
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
