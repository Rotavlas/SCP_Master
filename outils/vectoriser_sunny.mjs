// Prépare les illustrations de SunnyClockwork (CC BY-SA 3.0, https://scp-wiki.wikidot.com/sunny-art-tales)
// pour les cartes Mythiques. L'original est copié tel quel dans public/sunny/ : c'est l'image finale de
// l'animation, identique au pixel près. Son tracé vectoriel (potrace) sert aux contours qui se dessinent
// pendant la construction ; il est découpé en formes (un contour et ses trous).
// Usage : npm run vectoriser   (sources dans outils/sunny/, résultat dans public/data/scenes.json et public/sunny/)
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import potrace from 'potrace'

const racine = fileURLToPath(new URL('..', import.meta.url))

/**
 * Une entrée par carte. `niveaux` : nombre de gris du tracé des contours (1 = noir et blanc, le plus rapide).
 * `fond` : couleur autour de l'image dans le cadre de la carte, quand ses proportions diffèrent.
 */
const SOURCES = [
  { id: 'dr-clef-s-proposal', fichier: 'gate-guardian.png', niveaux: 1, fond: '#ffffff' },
  { id: 'fim:alpha-1', fichier: 'alpha-1.png', niveaux: 1, fond: '#ffffff' },
  { id: 'perso:o5-1', fichier: 'o5-1.png', niveaux: 1, fond: '#ffffff' },
  { id: 'perso:the-administrator', fichier: 'administrateur.png', niveaux: 1, fond: '#ffffff' },
]

const tracer = (fichier, options) =>
  new Promise((ok, ko) => potrace.trace(fichier, options, (e, svg) => (e ? ko(e) : ok(svg))))
const posteriser = (fichier, options) =>
  new Promise((ok, ko) => potrace.posterize(fichier, options, (e, svg) => (e ? ko(e) : ok(svg))))

/** Les sous-chemins d'un attribut d (« M … Z »), avec leur boîte englobante. */
function sousChemins(d) {
  return d
    .split(/(?=M)/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const n = s.match(/-?\d+(?:\.\d+)?/g).map(Number)
      const xs = n.filter((_, i) => i % 2 === 0)
      const ys = n.filter((_, i) => i % 2 === 1)
      // Coordonnées arrondies au dixième : le fichier reste léger, l'écart est invisible
      const d2 = s.replace(/-?\d+\.\d+/g, (x) => String(Math.round(Number(x) * 10) / 10)).replace(/,\s*/g, ' ')
      return { d: d2, x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) }
    })
}

const contient = (a, b) => a !== b && a.x0 <= b.x0 && a.y0 <= b.y0 && a.x1 >= b.x1 && a.y1 >= b.y1
const aire = (s) => (s.x1 - s.x0) * (s.y1 - s.y0)

/**
 * Regroupe chaque contour avec ses trous : un sous-chemin contenu dans un nombre impair d'autres est un trou,
 * rattaché au plus petit contour qui le contient (potrace remplit en pair-impair).
 */
function formes(d) {
  const sc = sousChemins(d)
  const profondeur = sc.map((s) => sc.filter((t) => contient(t, s)).length)
  const pieces = sc.map((s, i) => (profondeur[i] % 2 === 0 ? { ...s, trous: [] } : null))
  sc.forEach((s, i) => {
    if (profondeur[i] % 2 === 0) return
    const parent = pieces
      .map((p, j) => (p && contient(p, s) ? j : -1))
      .filter((j) => j >= 0)
      .sort((a, b) => aire(pieces[a]) - aire(pieces[b]))[0]
    if (parent !== undefined) pieces[parent].trous.push(s.d)
  })
  return pieces.filter(Boolean)
}

const sortie = {}
for (const s of SOURCES) {
  const fichier = `${racine}outils/sunny/${s.fichier}`
  const svg = s.niveaux > 1 ? await posteriser(fichier, { steps: s.niveaux, turdSize: 6, optTolerance: 0.3 }) : await tracer(fichier, { threshold: 128, turdSize: 6, optTolerance: 0.3 })
  const [, l, h] = svg.match(/viewBox="0 0 (\d+) (\d+)"/)
  // Les attributs d'un chemin arrivent dans un ordre qui dépend du mode (trace ou posterize)
  const couches = [...svg.matchAll(/<path([^>]*)\/?>/g)].map(([, attributs]) => {
    const d = attributs.match(/\sd="([^"]+)"/)[1]
    const opacite = attributs.match(/fill-opacity="([\d.]+)"/)
    return { opacite: opacite ? Number(opacite[1]) : 1, formes: formes(d) }
  })
  // Ordre d'apparition : les grandes masses d'abord, les détails ensuite
  const pieces = couches.flatMap((c, ci) => c.formes.map((f) => ({ ...f, couche: ci, opacite: c.opacite })))
  pieces.sort((a, b) => aire(b) - aire(a))
  mkdirSync(`${racine}public/sunny`, { recursive: true })
  copyFileSync(fichier, `${racine}public/sunny/${s.fichier}`)
  sortie[s.id] = {
    image: `sunny/${s.fichier}`,
    largeur: Number(l),
    hauteur: Number(h),
    fond: s.fond,
    pieces: pieces.map((p) => ({ d: [p.d, ...p.trous].join(' '), o: p.opacite, c: [Math.round((p.x0 + p.x1) / 2), Math.round((p.y0 + p.y1) / 2)] })),
  }
  console.log(`${s.id} : ${pieces.length} formes, ${couches.length} niveau(x)`)
}

writeFileSync(`${racine}public/data/scenes.json`, JSON.stringify(sortie))
console.log(`public/data/scenes.json (${(JSON.stringify(sortie).length / 1024).toFixed(0)} Ko)`)
