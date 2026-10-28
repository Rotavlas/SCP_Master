// Prépare les illustrations des cartes Mythiques : les dessins de SunnyClockwork (CC BY-SA 3.0,
// https://scp-wiki.wikidot.com/sunny-art-tales) et la photo d'Aaron Siegel, dans public/sunny/ ou public/photos/ :
// c'est l'image de la carte et la dernière image de sa cinématique. public/data/scenes.json donne à la carte son
// image, ses dimensions (celles de l'original, qui servent de repère aux animations) et la couleur autour.
//   - `agrandir` : un original trop petit (pur noir et blanc) est vectorisé (potrace) puis redessiné plus grand,
//     net à toutes les tailles ; l'écart avec l'original, ramené à sa taille, est vérifié ;
//   - `caviarder` : des bandes noires posées sur la photo ([x0, y0, x1, y1], coordonnées de l'original).
// Les cinématiques lisent aussi leurs cartes des temps (outils/temps_mythiques.mjs, à relancer ensuite).
// Usage : npm run illustrations   (sources dans outils/sunny/ et outils/photos/)
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { PNG } from 'pngjs'
import potrace from 'potrace'

const racine = fileURLToPath(new URL('..', import.meta.url))

/** `fond` : couleur autour de l'image dans le cadre de la carte, quand ses proportions diffèrent. */
const SOURCES = [
  // scarlet-king.png : l'illustration du tarot « IV - The Emperor », recadrée sans son cadre ni son titre (459 × 644)
  { id: 'entite:scarlet-king', fichier: 'scarlet-king.png', fond: '#ffffff', agrandir: 3 },
  { id: 'dr-clef-s-proposal', fichier: 'gate-guardian.png', fond: '#ffffff' },
  { id: 'fim:alpha-1', fichier: 'alpha-1.png', fond: '#ffffff' },
  { id: 'perso:o5-1', fichier: 'o5-1.png', fond: '#ffffff' },
  { id: 'perso:the-administrator', fichier: 'administrateur.png', fond: '#ffffff' },
  // SCP-173 : la photo d'origine, « Untitled 2004 » d'Izumi Kato (pas sous licence libre ; choix du créateur du jeu)
  { id: 'scp-173', fichier: 'scp-173.png', dossier: 'photos', fond: '#0d0d0d' },
  // SCP-2747, l'anafabula : « Lady in Thorns »
  { id: 'scp-2747', fichier: 'anafabula.png', fond: '#ffffff' },
  { id: 'perso:aaron-siegel', fichier: 'aaron-siegel.png', dossier: 'photos', fond: '#0d0d0d', caviarder: [[132, 116, 246, 152]] },
]

const tracer = (fichier) =>
  new Promise((ok, ko) => potrace.trace(fichier, { threshold: 128, turdSize: 1, optTolerance: 0.1 }, (e, svg) => (e ? ko(e) : ok(svg))))

/** Les contours d'un tracé potrace (M, L, C, Z absolus), aplatis en polygones à l'échelle `k`. */
function polygones(d, k) {
  const jetons = d.match(/[MLCZ]|-?\d+(?:\.\d+)?/g)
  const polys = []
  let poly = null
  let x = 0
  let y = 0
  let i = 0
  const nombre = () => Number(jetons[i++]) * k
  while (i < jetons.length) {
    const c = jetons[i++]
    if (c === 'M') {
      poly = []
      polys.push(poly)
      x = nombre()
      y = nombre()
      poly.push([x, y])
    } else if (c === 'L') {
      while (i < jetons.length && !/[MLCZ]/.test(jetons[i])) {
        x = nombre()
        y = nombre()
        poly.push([x, y])
      }
    } else if (c === 'C') {
      while (i < jetons.length && !/[MLCZ]/.test(jetons[i])) {
        const [x1, y1, x2, y2, x3, y3] = [nombre(), nombre(), nombre(), nombre(), nombre(), nombre()]
        // Assez de segments pour que la courbe reste lisse à cette taille
        const n = Math.max(4, Math.ceil(Math.hypot(x3 - x, y3 - y) / 2))
        for (let j = 1; j <= n; j++) {
          const t = j / n
          const u = 1 - t
          poly.push([
            u * u * u * x + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3,
            u * u * u * y + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3,
          ])
        }
        x = x3
        y = y3
      }
    }
  }
  return polys
}

/** Remplit les polygones (pair-impair) sur une image l × h, avec un anticrénelage exact en largeur et 4 sous-lignes. */
function remplir(polys, l, h) {
  const aretes = []
  for (const p of polys)
    for (let j = 0; j < p.length; j++) {
      const [x0, y0] = p[j]
      const [x1, y1] = p[(j + 1) % p.length]
      if (y0 !== y1) aretes.push(y0 < y1 ? [x0, y0, x1, y1] : [x1, y1, x0, y0])
    }
  aretes.sort((a, b) => a[1] - b[1])
  const couverture = new Float32Array(l * h)
  const SOUS = 4
  let suivante = 0
  let actives = []
  for (let sy = 0; sy < h * SOUS; sy++) {
    const y = (sy + 0.5) / SOUS
    while (suivante < aretes.length && aretes[suivante][1] <= y) actives.push(aretes[suivante++])
    actives = actives.filter((a) => a[3] > y)
    const xs = actives.filter((a) => a[1] <= y).map(([x0, y0, x1, y1]) => x0 + ((y - y0) * (x1 - x0)) / (y1 - y0))
    xs.sort((a, b) => a - b)
    const ligne = Math.floor(sy / SOUS) * l
    for (let j = 0; j + 1 < xs.length; j += 2) {
      const a = Math.max(0, xs[j])
      const b = Math.min(l, xs[j + 1])
      if (b <= a) continue
      const pa = Math.floor(a)
      const pb = Math.floor(b)
      if (pa === pb) {
        couverture[ligne + pa] += (b - a) / SOUS
        continue
      }
      couverture[ligne + pa] += (pa + 1 - a) / SOUS
      for (let px = pa + 1; px < pb; px++) couverture[ligne + px] += 1 / SOUS
      if (pb < l) couverture[ligne + pb] += (b - pb) / SOUS
    }
  }
  return couverture
}

async function agrandir(fichier, k) {
  const svg = await tracer(fichier)
  const [, l, h] = svg.match(/viewBox="0 0 (\d+) (\d+)"/).map(Number)
  const d = [...svg.matchAll(/\sd="([^"]+)"/g)].map((m) => m[1]).join(' ')
  const L = l * k
  const H = h * k
  const encre = remplir(polygones(d, k), L, H)
  const png = new PNG({ width: L, height: H, colorType: 2 })
  for (let i = 0; i < L * H; i++) {
    const v = Math.round(255 * (1 - Math.min(1, encre[i])))
    png.data[i * 4] = png.data[i * 4 + 1] = png.data[i * 4 + 2] = v
    png.data[i * 4 + 3] = 255
  }
  // Contrôle : ramenée à la taille de l'original, l'image agrandie doit lui ressembler au pixel près
  const orig = PNG.sync.read(readFileSync(fichier))
  let ecart = 0
  let differents = 0
  for (let y = 0; y < h; y++)
    for (let x = 0; x < l; x++) {
      let m = 0
      for (let dy = 0; dy < k; dy++) for (let dx = 0; dx < k; dx++) m += png.data[((y * k + dy) * L + x * k + dx) * 4]
      const e = Math.abs(m / (k * k) - orig.data[(y * l + x) * 4])
      ecart += e
      if (e > 96) differents++
    }
  console.log(`  agrandie ×${k} : écart moyen ${(ecart / (l * h)).toFixed(1)}/255, ${((100 * differents) / (l * h)).toFixed(2)} % de pixels différents`)
  return { png, l, h }
}

function caviarder(fichier, bandes) {
  const png = PNG.sync.read(readFileSync(fichier))
  for (const [x0, y0, x1, y1] of bandes)
    for (let y = y0; y < y1; y++)
      for (let x = x0; x < x1; x++) {
        const o = (y * png.width + x) * 4
        png.data[o] = png.data[o + 1] = png.data[o + 2] = 0
      }
  return { png, l: png.width, h: png.height }
}

const sortie = {}
for (const s of SOURCES) {
  const dossier = s.dossier ?? 'sunny'
  const fichier = `${racine}outils/${dossier}/${s.fichier}`
  console.log(s.id)
  const { png, l, h } = s.agrandir
    ? await agrandir(fichier, s.agrandir)
    : s.caviarder
      ? caviarder(fichier, s.caviarder)
      : { png: PNG.sync.read(readFileSync(fichier)), l: 0, h: 0 }
  mkdirSync(`${racine}public/${dossier}`, { recursive: true })
  writeFileSync(`${racine}public/${dossier}/${s.fichier}`, PNG.sync.write(png, { colorType: 2 }))
  sortie[s.id] = { image: `${dossier}/${s.fichier}`, largeur: l || png.width, hauteur: h || png.height, fond: s.fond }
}
writeFileSync(`${racine}public/data/scenes.json`, JSON.stringify(sortie))
