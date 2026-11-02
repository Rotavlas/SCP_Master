// Découpe le catalogue pour le navigateur : public/data/leger/cards.json et cards.fr.json sans les extraits des
// dossiers (descriptions et procédures, plus de la moitié du poids), et les extraits rangés à part en 64 fragments
// (textes-vo-NN.json, textes-fr-NN.json), chargés seulement quand une fiche s'ouvre (src/data/textes.ts).
// La fonction Edge « duel » garde le catalogue complet (public/data/cards.json) pour ses questions.
// Lancé avant `npm run dev` et `npm run build` (predev, prebuild) ; les fichiers produits ne sont pas suivis par git.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const racine = fileURLToPath(new URL('..', import.meta.url))
const lire = (f) => JSON.parse(readFileSync(`${racine}public/data/${f}`, 'utf8').replace(/^﻿/, ''))

/** Même calcul que fragment() dans src/data/textes.ts */
export const FRAGMENTS = 64
export function fragment(id) {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return h % FRAGMENTS
}

const sortie = `${racine}public/data/leger/`
rmSync(sortie, { recursive: true, force: true })
mkdirSync(sortie, { recursive: true })

function decouper(entrees, langue) {
  const fragments = Array.from({ length: FRAGMENTS }, () => ({}))
  for (const [id, champs] of entrees) {
    if (champs.x === undefined && champs.q === undefined) continue
    fragments[fragment(id)][id] = { ...(champs.x !== undefined && { x: champs.x }), ...(champs.q !== undefined && { q: champs.q }) }
  }
  fragments.forEach((f, n) => writeFileSync(`${sortie}textes-${langue}-${n}.json`, JSON.stringify(f)))
}

const sansTextes = ({ x: _x, q: _q, ...reste }) => reste

const catalogue = lire('cards.json')
writeFileSync(`${sortie}cards.json`, JSON.stringify({ ...catalogue, cartes: catalogue.cartes.map(sansTextes) }))
decouper(
  catalogue.cartes.map((c) => [c.id, c]),
  'vo',
)

const traductions = lire('cards.fr.json')
writeFileSync(`${sortie}cards.fr.json`, JSON.stringify(Object.fromEntries(Object.entries(traductions).map(([id, t]) => [id, sansTextes(t)]))))
decouper(Object.entries(traductions), 'fr')

const taille = (f) => (readFileSync(`${sortie}${f}`).length / 1e6).toFixed(1)
console.log(`catalogue léger : cards.json ${taille('cards.json')} Mo, cards.fr.json ${taille('cards.fr.json')} Mo, extraits en ${FRAGMENTS} fragments`)
