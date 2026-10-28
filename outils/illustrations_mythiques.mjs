// Prépare les illustrations des cartes Mythiques : les dessins de SunnyClockwork (CC BY-SA 3.0,
// https://scp-wiki.wikidot.com/sunny-art-tales) et la photo d'Aaron Siegel. L'original est copié tel quel dans
// public/sunny/ ou public/photos/ : c'est l'image de la carte et la dernière image de sa cinématique, au pixel
// près. public/data/scenes.json donne à la carte son image, ses dimensions et la couleur autour.
// Les cinématiques, elles, lisent leurs cartes des temps (outils/temps_mythiques.mjs).
// Usage : npm run illustrations   (sources dans outils/sunny/ et outils/photos/)
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const racine = fileURLToPath(new URL('..', import.meta.url))

/** `fond` : couleur autour de l'image dans le cadre de la carte, quand ses proportions diffèrent. */
const SOURCES = [
  // scarlet-king.png : l'illustration du tarot « IV - The Emperor », recadrée sans son cadre ni son titre
  { id: 'entite:scarlet-king', fichier: 'scarlet-king.png', fond: '#ffffff' },
  { id: 'dr-clef-s-proposal', fichier: 'gate-guardian.png', fond: '#ffffff' },
  { id: 'fim:alpha-1', fichier: 'alpha-1.png', fond: '#ffffff' },
  { id: 'perso:o5-1', fichier: 'o5-1.png', fond: '#ffffff' },
  { id: 'perso:the-administrator', fichier: 'administrateur.png', fond: '#ffffff' },
  { id: 'perso:aaron-siegel', fichier: 'aaron-siegel.png', dossier: 'photos', fond: '#0d0d0d' },
]

const sortie = {}
for (const s of SOURCES) {
  const dossier = s.dossier ?? 'sunny'
  const fichier = `${racine}outils/${dossier}/${s.fichier}`
  mkdirSync(`${racine}public/${dossier}`, { recursive: true })
  copyFileSync(fichier, `${racine}public/${dossier}/${s.fichier}`)
  // Largeur et hauteur : dans l'en-tête IHDR du PNG
  const png = readFileSync(fichier)
  sortie[s.id] = { image: `${dossier}/${s.fichier}`, largeur: png.readUInt32BE(16), hauteur: png.readUInt32BE(20), fond: s.fond }
  console.log(`${s.id} : ${sortie[s.id].largeur}×${sortie[s.id].hauteur}`)
}
writeFileSync(`${racine}public/data/scenes.json`, JSON.stringify(sortie))
