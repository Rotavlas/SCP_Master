// Prépare les cinématiques immersives des Mythiques (src/components/Immersion.tsx) : pour chaque pixel de
// l'illustration, l'instant où son encre apparaît et celui où son papier blanchit. L'encre pousse en suivant
// le dessin (plus courte distance le long de l'encre, depuis des graines) : les bois se ramifient, les flammes
// montent, les chaînes avancent maillon par maillon, les contours courent avant que l'intérieur ne se remplisse.
//
// Résultat : public/immersion/<nom>.png, trois bandes de la taille de l'image, les unes sous les autres :
//   1. encre : R,G = instant en ms (16 bits), B = classe du pixel (couleur de la lueur, ondulation…) ;
//   2. papier : R,G = instant où le papier blanchit, B = durée (× 50 ms) pendant laquelle il est noir avant ;
//   3. réservée (la même que 2, pour garder une hauteur paire) — non lue.
// Usage : npm run immersion [-- --apercu]   (--apercu : planches de contrôle dans outils/.cache/immersion/)
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { PNG } from 'pngjs'

const racine = fileURLToPath(new URL('..', import.meta.url))
const JAMAIS = 65535

// ---------- Régions (coordonnées de l'image) ----------

const poly = (...pts) => ({ poly: pts })
const rect = (x0, y0, x1, y1) => ({ rect: [x0, y0, x1, y1] })
const ellipse = (cx, cy, rx, ry, rot = 0) => ({ ellipse: [cx, cy, rx, ry, rot] })

function dans(f, x, y) {
  if (f.rect) return x >= f.rect[0] && x < f.rect[2] && y >= f.rect[1] && y < f.rect[3]
  if (f.ellipse) {
    const [cx, cy, rx, ry, rot] = f.ellipse
    const a = (-rot * Math.PI) / 180
    const dx = x - cx
    const dy = y - cy
    const u = dx * Math.cos(a) - dy * Math.sin(a)
    const v = dx * Math.sin(a) + dy * Math.cos(a)
    return (u / rx) ** 2 + (v / ry) ** 2 <= 1
  }
  // Polygone : règle pair-impair
  let c = false
  const p = f.poly
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    if (p[i][1] > y !== p[j][1] > y && x < ((p[j][0] - p[i][0]) * (y - p[i][1])) / (p[j][1] - p[i][1]) + p[i][0]) c = !c
  }
  return c
}

/** Masque d'une région : `formes` (union), moins `sauf`. Sans formes : toute l'image. */
function masqueRegion(l, h, formes, sauf = []) {
  const m = new Uint8Array(l * h)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < l; x++) m[y * l + x] = (!formes || formes.some((f) => dans(f, x, y))) && !sauf.some((f) => dans(f, x, y)) ? 1 : 0
  return m
}

// ---------- Les cartes ----------
// Chaque phase attribue un instant aux pixels de sa région qui n'en ont pas encore :
//   encre   : l'encre pousse depuis `graines` ([x, y, t]) et/ou depuis ce qui est déjà apparu (`voisins`, à partir de t0),
//             à `vitesse` px/s le long des contours, `remplissage` × vitesse à l'intérieur des aplats,
//             `saut` × vitesse pour franchir le blanc entre deux traits ; `finir` : l'instant où la phase doit être finie ;
//   instant : toute l'encre de la région d'un coup (à t0, étalée sur `alea` s) ;
//   papier  : le blanc de la région (des yeux, des chaînes…), qui s'ouvre depuis `graines` ; `sombre` : noir avant ;
//   photo   : une photographie qui se développe, les ombres d'abord.
// Puis : l'encre restante pousse depuis ce qui est apparu ; le blanc enfermé dans le dessin (détails) s'ouvre
// `details` s après l'encre qui l'entoure (noir avant si `interieurSombre`) ; le reste du papier blanchit depuis
// le dessin vers l'extérieur à partir de `papier.t0`.

const CARTES = [
  {
    nom: 'scarlet-king',
    source: 'outils/sunny/scarlet-king.png',
    interieurSombre: true,
    details: 0.5,
    papier: { t0: 8.7, vitesse: 700, classe: 6 },
    phases: [
      // Les flammes montent du sol, de chaque côté
      {
        type: 'encre',
        classe: 1,
        region: [poly([0, 230], [150, 230], [152, 470], [150, 644], [0, 644]), poly([312, 230], [459, 230], [459, 644], [318, 644], [314, 470])],
        graines: [
          [30, 643, 0.5],
          [95, 643, 0.75],
          [140, 643, 0.6],
          [330, 643, 0.65],
          [390, 643, 0.85],
          [440, 643, 0.55],
        ],
        vitesse: 230,
        remplissage: 0.9,
      },
      // Le corps se dresse depuis le bas, jusqu'à la tête
      {
        type: 'encre',
        classe: 0,
        region: [rect(100, 150, 360, 644)],
        sauf: [rect(185, 20, 272, 150)],
        graines: [
          [230, 643, 1.9],
          [180, 643, 2.0],
          [280, 643, 2.0],
        ],
        vitesse: 210,
        remplissage: 0.85,
        finir: 4.3,
      },
      // Les bois poussent de la tête et se ramifient
      { type: 'encre', classe: 2, region: [rect(40, 0, 420, 250)], sauf: [rect(185, 20, 272, 150)], voisins: true, t0: 4.3, vitesse: 150, remplissage: 1 },
      // La couronne se dresse au-dessus
      { type: 'encre', classe: 3, region: [rect(185, 20, 272, 150)], graines: [[228, 146, 5.3]], vitesse: 260, saut: 0.8 },
      // Les sept yeux s'ouvrent un à un, après le corps
      {
        type: 'papier',
        classe: 4,
        sombre: true,
        region: [
          ellipse(208, 280, 20, 22, -40),
          ellipse(238, 273, 18, 15, -20),
          ellipse(240, 305, 28, 20, -25),
          ellipse(218, 340, 26, 17, 0),
          ellipse(242, 368, 26, 19, 25),
          ellipse(210, 388, 24, 18, 30),
          ellipse(248, 403, 15, 16, 20),
        ],
        graines: [
          [208, 280, 5.9],
          [238, 273, 6.15],
          [240, 305, 6.4],
          [218, 340, 6.65],
          [242, 368, 6.9],
          [210, 388, 7.15],
          [248, 403, 7.4],
        ],
        vitesse: 70,
      },
      // Les chaînes avancent maillon par maillon et se tendent
      {
        type: 'papier',
        classe: 5,
        sombre: true,
        region: [poly([128, 515], [330, 515], [336, 644], [128, 644])],
        graines: [
          [130, 560, 7.5],
          [130, 615, 7.75],
          [330, 545, 7.6],
          [332, 605, 7.85],
        ],
        vitesse: 330,
        saut: 0.25,
      },
    ],
  },
  {
    nom: 'gate-guardian',
    source: 'outils/sunny/gate-guardian.png',
    interieurSombre: true,
    details: 0.4,
    papier: { t0: 7.7, vitesse: 1100, classe: 6 },
    phases: [
      // Il sort de la porte : la silhouette se dresse depuis le seuil
      {
        type: 'encre',
        classe: 0,
        region: [rect(318, 140, 486, 1132)],
        graines: [
          [400, 1131, 1.5],
          [372, 1131, 1.6],
          [430, 1131, 1.6],
        ],
        vitesse: 480,
        remplissage: 0.9,
        finir: 3.4,
      },
      // Les flammes jaillissent du sol, à droite de l'épée
      {
        type: 'encre',
        classe: 2,
        region: [poly([440, 590], [800, 590], [800, 1132], [440, 1132])],
        graines: [
          [470, 1131, 5.0],
          [560, 1131, 5.15],
          [690, 1131, 5.05],
          [770, 1131, 5.2],
          [440, 700, 5.1],
        ],
        vitesse: 420,
        remplissage: 0.9,
      },
      // Les six ailes se déploient depuis les épaules
      {
        type: 'encre',
        classe: 1,
        region: [rect(0, 230, 800, 1132)],
        sauf: [rect(318, 140, 486, 520)],
        voisins: true,
        t0: 3.5,
        vitesse: 300,
        remplissage: 0.9,
        finir: 5.0,
      },
      // La couronne se pose
      { type: 'encre', classe: 5, region: [rect(320, 40, 480, 135)], graines: [[400, 130, 6.6]], vitesse: 320, saut: 0.8 },
      // L'œil s'ouvre
      { type: 'papier', classe: 4, sombre: true, region: [ellipse(398, 215, 16, 34)], graines: [[398, 215, 6.1]], vitesse: 45 },
    ],
  },
  {
    nom: 'alpha-1',
    source: 'outils/sunny/alpha-1.png',
    interieurSombre: false,
    details: 0.3,
    papier: { t0: 8.0, vitesse: 1300, classe: 3 },
    phases: [
      // L'anneau se trace sur le mur, depuis le haut, dans les deux sens
      {
        type: 'encre',
        classe: 0,
        region: [ellipse(400, 401, 405, 405)],
        sauf: [ellipse(400, 401, 340, 340)],
        graines: [[400, 6, 4.0]],
        vitesse: 950,
        remplissage: 1,
        finir: 5.2,
      },
      // La main s'abat d'un coup
      {
        type: 'instant',
        classe: 1,
        region: [poly([174, 160], [441, 150], [520, 250], [575, 400], [700, 570], [601, 705], [520, 640], [347, 570], [174, 350])],
        t0: 5.6,
        alea: 0.08,
      },
      // La lance part vers sa cible
      { type: 'encre', classe: 2, region: [poly([80, 650], [180, 720], [700, 190], [640, 120])], graines: [[150, 670, 6.3]], vitesse: 1500, saut: 0.6 },
    ],
  },
  {
    nom: 'administrateur',
    source: 'outils/sunny/administrateur.png',
    interieurSombre: false,
    details: 0.6,
    papier: { t0: 7.7, vitesse: 1000, classe: 1 },
    phases: [
      // Tout part du sceau : les contours courent dans tout le dessin, les aplats se remplissent derrière eux
      { type: 'encre', classe: 0, graines: [[352, 990, 0.5]], vitesse: 520, remplissage: 0.14, saut: 0.45, finir: 7.0 },
    ],
  },
  {
    nom: 'o5-1',
    source: 'outils/sunny/o5-1.png',
    interieurSombre: false,
    details: 0.5,
    papier: { t0: 6.4, vitesse: 1600, classe: 1 },
    phases: [
      // Le courant arrive par les câbles du plafond et dessine le corps, contour d'abord
      {
        type: 'encre',
        classe: 0,
        graines: [
          [214, 0, 0.6],
          [330, 0, 0.9],
          [352, 0, 0.95],
          [418, 0, 1.1],
          [440, 0, 1.15],
          [545, 0, 0.8],
          [610, 0, 1.0],
          [636, 40, 1.05],
        ],
        vitesse: 330,
        remplissage: 0.35,
        saut: 0.35,
        finir: 5.4,
      },
    ],
  },
  {
    // SCP-2747, l'anafabula (« Lady in Thorns ») : sur une page de texte, les flèches noires jaillissent du sol, la
    // dame apparaît, ses ronces poussent et se ramifient, la couronne se pose ; puis la page est effacée
    nom: 'anafabula',
    source: 'outils/sunny/anafabula.png',
    interieurSombre: false,
    details: 0.4,
    papier: { t0: 7.4, vitesse: 900, classe: 4 },
    phases: [
      {
        type: 'encre',
        classe: 1,
        // Les flèches, sans les ronces qui les surplombent (x 130 à 640, jusqu'à y 570)
        region: [rect(0, 290, 130, 1063), rect(640, 320, 752, 1063), rect(0, 570, 752, 1063)],
        sauf: [rect(300, 395, 470, 780)],
        graines: [
          [60, 1062, 0.6],
          [190, 1062, 0.8],
          [290, 1062, 1.0],
          [480, 1062, 0.95],
          [570, 1062, 0.7],
          [700, 1062, 0.9],
        ],
        vitesse: 700,
        remplissage: 0.9,
        finir: 2.7,
      },
      { type: 'encre', classe: 0, region: [rect(300, 395, 470, 780)], graines: [[380, 470, 2.9]], vitesse: 260, remplissage: 0.8, saut: 0.5, finir: 4.0 },
      { type: 'encre', classe: 3, region: [rect(345, 345, 415, 398)], graines: [[380, 394, 6.2]], vitesse: 140, saut: 0.8 },
      { type: 'encre', classe: 2, region: [rect(90, 0, 680, 620)], voisins: true, t0: 4.0, vitesse: 230, remplissage: 0.9, finir: 6.1 },
    ],
  },
  {
    // SCP-173 : la photo est là d'emblée, c'est la lumière (et les clignements) qui la montrent
    nom: 'scp-173',
    source: 'public/photos/scp-173.png',
    phases: [{ type: 'photo', classe: 0, t0: 0.3, duree: 0.8, gamma: 1 }],
  },
  {
    nom: 'aaron-siegel',
    // La photo préparée (yeux caviardés) : npm run illustrations d'abord
    source: 'public/photos/aaron-siegel.png',
    phases: [{ type: 'photo', classe: 0, t0: 1.6, duree: 3.4, gamma: 1.2 }],
  },
]

// ---------- Calcul ----------

/** File de priorité (tas binaire) sur des indices de pixels. */
class Tas {
  constructor(n) {
    this.i = new Int32Array(n * 2)
    this.k = new Float64Array(n * 2)
    this.n = 0
  }
  pousser(i, k) {
    if (this.n >= this.i.length) {
      const i2 = new Int32Array(this.i.length * 2)
      i2.set(this.i)
      const k2 = new Float64Array(this.k.length * 2)
      k2.set(this.k)
      this.i = i2
      this.k = k2
    }
    let p = this.n++
    while (p > 0) {
      const q = (p - 1) >> 1
      if (this.k[q] <= k) break
      this.i[p] = this.i[q]
      this.k[p] = this.k[q]
      p = q
    }
    this.i[p] = i
    this.k[p] = k
  }
  tirer() {
    const i = this.i[0]
    const k = this.k[0]
    const di = this.i[--this.n]
    const dk = this.k[this.n]
    let p = 0
    for (;;) {
      let c = 2 * p + 1
      if (c >= this.n) break
      if (c + 1 < this.n && this.k[c + 1] < this.k[c]) c++
      if (this.k[c] >= dk) break
      this.i[p] = this.i[c]
      this.k[p] = this.k[c]
      p = c
    }
    this.i[p] = di
    this.k[p] = dk
    return [i, k]
  }
}

const VOISINS = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, Math.SQRT2],
  [-1, 1, Math.SQRT2],
  [1, -1, Math.SQRT2],
  [-1, -1, Math.SQRT2],
]

/**
 * Plus courts chemins depuis des sources ([indice, instant]) : `cout(i)` = secondes par pixel pour traverser i
 * (Infinity : infranchissable). Renvoie l'instant d'arrivée de chaque pixel.
 */
function propager(l, h, sources, cout) {
  const d = new Float64Array(l * h).fill(Infinity)
  const tas = new Tas(l * h)
  for (const [i, t] of sources)
    if (t < d[i]) {
      d[i] = t
      tas.pousser(i, t)
    }
  while (tas.n) {
    const [i, k] = tas.tirer()
    if (k > d[i]) continue
    const x = i % l
    const y = (i - x) / l
    for (const [dx, dy, len] of VOISINS) {
      const nx = x + dx
      const ny = y + dy
      if (nx < 0 || ny < 0 || nx >= l || ny >= h) continue
      const j = ny * l + nx
      const c = cout(j)
      if (c === Infinity) continue
      const nk = k + c * len
      if (nk < d[j]) {
        d[j] = nk
        tas.pousser(j, nk)
      }
    }
  }
  return d
}

/** Un bruit lisse (valeurs aléatoires sur une grille de `pas` px, interpolées). */
function bruitDoux(l, h, pas) {
  const gl = Math.ceil(l / pas) + 2
  const gh = Math.ceil(h / pas) + 2
  const g = Float32Array.from({ length: gl * gh }, () => Math.random())
  const b = new Float32Array(l * h)
  const lisse = (t) => t * t * (3 - 2 * t)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < l; x++) {
      const gx = Math.floor(x / pas)
      const gy = Math.floor(y / pas)
      const fx = lisse(x / pas - gx)
      const fy = lisse(y / pas - gy)
      const v = (a, c) => g[(gy + c) * gl + gx + a]
      b[y * l + x] = (v(0, 0) * (1 - fx) + v(1, 0) * fx) * (1 - fy) + (v(0, 1) * (1 - fx) + v(1, 1) * fx) * fy
    }
  return b
}

function lire(fichier) {
  const png = PNG.sync.read(readFileSync(`${racine}${fichier}`))
  const { width: l, height: h, data } = png
  const lum = new Float32Array(l * h)
  for (let i = 0; i < l * h; i++) lum[i] = (0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2]) / 255
  return { l, h, lum }
}

function construire(carte) {
  const { l, h, lum } = lire(carte.source)
  const n = l * h
  const encre = new Uint8Array(n)
  for (let i = 0; i < n; i++) encre[i] = lum[i] < 0.5 ? 1 : 0
  const voisin = (i, f) => {
    const x = i % l
    const y = (i - x) / l
    for (const [dx, dy] of VOISINS) {
      const nx = x + dx
      const ny = y + dy
      if (nx >= 0 && ny >= 0 && nx < l && ny < h && f(ny * l + nx)) return true
    }
    return false
  }
  // Bord : encre touchant du papier (les contours)
  const bord = new Uint8Array(n)
  for (let i = 0; i < n; i++) bord[i] = encre[i] && voisin(i, (j) => !encre[j]) ? 1 : 0
  // Papier extérieur : relié au bord de l'image par un passage plus large que 2 × `fermeture` px ; le reste
  // (yeux, chaînes, fins traits blancs qui touchent à peine l'extérieur) est enfermé dans le dessin
  const R = carte.fermeture ?? 4
  const versEncre = propager(
    l,
    h,
    [...Array(n).keys()].filter((i) => encre[i]).map((i) => [i, 0]),
    () => 1,
  )
  const exterieur = new Uint8Array(n)
  {
    const large = []
    for (let i = 0; i < n; i++) {
      const x = i % l
      const y = (i - x) / l
      if ((x === 0 || y === 0 || x === l - 1 || y === h - 1) && versEncre[i] > R) large.push([i, 0])
    }
    // Le passage large, puis R px de plus vers l'encre
    const d = propager(l, h, large, (i) => (encre[i] ? Infinity : versEncre[i] > R ? 0 : 1))
    for (let i = 0; i < n; i++) exterieur[i] = !encre[i] && d[i] <= R + 1 ? 1 : 0
  }

  const tEncre = new Float64Array(n).fill(Infinity)
  const tPapier = new Float64Array(n).fill(Infinity)
  const sombre = new Float64Array(n).fill(Infinity)
  const classe = new Uint8Array(n)
  const idx = (x, y) => Math.min(h - 1, Math.max(0, Math.round(y))) * l + Math.min(l - 1, Math.max(0, Math.round(x)))

  for (const ph of carte.phases) {
    const region = masqueRegion(l, h, ph.region, ph.sauf)
    if (ph.type === 'photo') {
      // Les ombres se développent d'abord ; un bruit doux pour que l'image monte par plaques, comme un tirage
      const grain = bruitDoux(l, h, 9)
      for (let i = 0; i < n; i++) {
        tEncre[i] = ph.t0 + ph.duree * Math.pow(lum[i], ph.gamma) + (grain[i] - 0.5) * 0.6
        tPapier[i] = tEncre[i]
        classe[i] = ph.classe
      }
      continue
    }
    if (ph.type === 'instant') {
      for (let i = 0; i < n; i++)
        if (region[i] && encre[i] && tEncre[i] === Infinity) {
          tEncre[i] = ph.t0 + Math.random() * (ph.alea ?? 0)
          classe[i] = ph.classe
        }
      continue
    }
    const cible = ph.type === 'encre' ? (i) => encre[i] && tEncre[i] === Infinity : (i) => !encre[i] && !exterieur[i] && tPapier[i] === Infinity
    const v = ph.vitesse
    const saut = ph.saut ?? 0.3
    const remplissage = ph.remplissage ?? 1
    const cout =
      ph.type === 'encre'
        ? (i) => (!region[i] ? Infinity : encre[i] ? 1 / (bord[i] ? v : v * remplissage) : 1 / (v * saut))
        : (i) => (!region[i] ? Infinity : encre[i] ? 1 / (v * saut) : 1 / v)
    const sources = (ph.graines ?? []).map(([x, y, t]) => [idx(x, y), t])
    if (ph.voisins)
      for (let i = 0; i < n; i++)
        if (region[i] && cible(i)) {
          let t = Infinity
          voisin(i, (j) => {
            if (tEncre[j] < t) t = tEncre[j]
            return false
          })
          if (t < Infinity) sources.push([i, Math.max(ph.t0 ?? 0, t)])
        }
    if (!sources.length) throw new Error(`${carte.nom} : phase sans source`)
    const d = propager(l, h, sources, cout)
    const pris = []
    for (let i = 0; i < n; i++) if (region[i] && cible(i) && d[i] < Infinity) pris.push(i)
    // `finir` : la phase est étirée ou resserrée pour finir à cet instant
    if (ph.finir) {
      const t0 = Math.min(...sources.map((s) => s[1]))
      let max = 0
      for (const i of pris) max = Math.max(max, d[i])
      const k = max > t0 ? (ph.finir - t0) / (max - t0) : 1
      for (const i of pris) d[i] = t0 + (d[i] - t0) * k
    }
    for (const i of pris) {
      if (ph.type === 'encre') tEncre[i] = d[i]
      else {
        tPapier[i] = d[i]
        if (ph.sombre) sombre[i] = 1
      }
      classe[i] = ph.classe
    }
  }

  const photo = carte.phases.some((p) => p.type === 'photo')
  if (!photo) {
    // L'encre restante pousse depuis ce qui est déjà apparu
    const reste = []
    for (let i = 0; i < n; i++)
      if (encre[i] && tEncre[i] < Infinity)
        voisin(i, (j) => {
          if (encre[j] && tEncre[j] === Infinity) reste.push([i, tEncre[i]])
          return true
        })
    if (reste.length) {
      const d = propager(l, h, reste, (i) => (encre[i] ? 1 / 500 : 1 / 150))
      for (let i = 0; i < n; i++) if (encre[i] && tEncre[i] === Infinity) tEncre[i] = d[i]
    }
    // Le blanc enfermé dans le dessin : couvert par l'encre qui l'entoure, il s'ouvre un peu après
    const couvert = propager(
      l,
      h,
      [...Array(n).keys()].filter((i) => encre[i]).map((i) => [i, tEncre[i]]),
      // Lentement : le blanc est couvert par l'encre qui le borde de près, pas par une flamme lointaine
      (i) => (encre[i] ? Infinity : 1 / 40),
    )
    // Seuls les détails fins (traits blancs, dents, reflets) s'ouvrent avec le dessin : une plage blanche plus large
    // que 2 × `detailMax` px garde le décor jusqu'à ce que tout le papier blanchisse (sinon, des taches blanches
    // apparaîtraient au milieu de la scène)
    const fin = new Uint8Array(n)
    {
      const vu = new Uint8Array(n)
      const seuil = carte.detailMax ?? 3.5
      for (let i0 = 0; i0 < n; i0++) {
        if (vu[i0] || encre[i0] || exterieur[i0] || tPapier[i0] < Infinity) continue
        const composante = []
        const pile = [i0]
        vu[i0] = 1
        let large = 0
        while (pile.length) {
          const i = pile.pop()
          composante.push(i)
          large = Math.max(large, versEncre[i])
          voisin(i, (j) => {
            if (!vu[j] && !encre[j] && !exterieur[j] && tPapier[j] === Infinity) {
              vu[j] = 1
              pile.push(j)
            }
            return false
          })
        }
        if (large <= seuil) for (const i of composante) fin[i] = 1
      }
    }
    // Un trait blanc entre deux aplats ne noircit qu'une fois les deux aplats posés : l'encre la plus tardive
    // dans un rayon de 2 px, sinon l'arrivée par le blanc
    const tardive = (i) => {
      const x = i % l
      const y = (i - x) / l
      let t = -Infinity
      for (let dy = -2; dy <= 2; dy++)
        for (let dx = -2; dx <= 2; dx++) {
          const nx = x + dx
          const ny = y + dy
          if (nx >= 0 && ny >= 0 && nx < l && ny < h && encre[ny * l + nx]) t = Math.max(t, tEncre[ny * l + nx])
        }
      return t
    }
    for (let i = 0; i < n; i++) if (!encre[i] && couvert[i] < Infinity) couvert[i] = Math.max(couvert[i], tardive(i))
    for (let i = 0; i < n; i++) {
      if (encre[i]) continue
      if (sombre[i] === 1) sombre[i] = Math.min(couvert[i], tPapier[i])
      else if (tPapier[i] === Infinity && !exterieur[i] && fin[i] && couvert[i] < Infinity) {
        tPapier[i] = couvert[i] + carte.details
        if (carte.interieurSombre) sombre[i] = couvert[i]
      }
    }
    // Le reste du papier blanchit, du dessin vers l'extérieur
    const p = carte.papier
    const bordPapier = []
    for (let i = 0; i < n; i++) if (!encre[i] && tPapier[i] === Infinity && voisin(i, (j) => encre[j])) bordPapier.push([i, p.t0])
    const d = propager(l, h, bordPapier, () => 1 / p.vitesse)
    for (let i = 0; i < n; i++)
      if (!encre[i] && tPapier[i] === Infinity) {
        tPapier[i] = d[i] < Infinity ? d[i] : p.t0
        classe[i] = p.classe
      }
    // Bords adoucis : le papier voisin de l'encre reçoit l'instant de cette encre (et réciproquement),
    // pour que l'image d'origine, lissée, se pose sans escalier au bord des traits
    for (let passe = 0; passe < 3; passe++) {
      const te = Float64Array.from(tEncre)
      const tp = Float64Array.from(tPapier)
      for (let i = 0; i < n; i++) {
        if (te[i] === Infinity)
          voisin(i, (j) => {
            if (te[j] < tEncre[i]) {
              tEncre[i] = te[j]
              if (encre[i] === 0 && classe[i] === p.classe) classe[i] = classe[j]
            }
            return false
          })
        if (tp[i] === Infinity)
          voisin(i, (j) => {
            if (tp[j] < tPapier[i]) {
              tPapier[i] = tp[j]
              sombre[i] = sombre[j]
            }
            return false
          })
      }
    }
  }

  // Encodage
  const png = new PNG({ width: l, height: h * 3, colorType: 2 })
  const ms = (t) => (t === Infinity ? JAMAIS : Math.max(0, Math.min(JAMAIS - 1, Math.round(t * 1000))))
  const ecrire = (i, bande, r, g, b) => {
    const o = (bande * n + i) * 4
    png.data[o] = r
    png.data[o + 1] = g
    png.data[o + 2] = b
    png.data[o + 3] = 255
  }
  let fin = 0
  for (let i = 0; i < n; i++) {
    const a = ms(tEncre[i])
    const b = ms(tPapier[i])
    // Durée du noir avant le blanc, par pas de 50 ms (0 : pas de noir)
    const noir = sombre[i] < Infinity && tPapier[i] < Infinity ? Math.min(255, Math.max(1, Math.round((tPapier[i] - sombre[i]) / 0.05))) : 0
    ecrire(i, 0, a >> 8, a & 255, classe[i])
    ecrire(i, 1, b >> 8, b & 255, noir)
    ecrire(i, 2, b >> 8, b & 255, noir)
    if (encre[i] && a < JAMAIS) fin = Math.max(fin, a)
    if (b < JAMAIS) fin = Math.max(fin, b)
  }
  mkdirSync(`${racine}public/immersion`, { recursive: true })
  writeFileSync(`${racine}public/immersion/${carte.nom}.png`, PNG.sync.write(png, { colorType: 2 }))
  console.log(`${carte.nom} : ${l}×${h}, tout apparu à ${(fin / 1000).toFixed(2)} s`)
  return { l, h, lum, tEncre, tPapier, sombre, classe }
}

// ---------- Planches de contrôle ----------
// Un rendu sommaire à quelques instants : fond rouge (rien encore), noir (encre), blanc (papier), gris (noir avant blanc).

const TEINTES = [
  [0, 0, 0],
  [255, 120, 0],
  [120, 60, 200],
  [230, 190, 0],
  [220, 30, 30],
  [80, 160, 255],
  [60, 200, 90],
  [255, 0, 200],
]

function apercu(carte, r, instants) {
  const { l, h, lum, tEncre, tPapier, sombre, classe } = r
  const ech = Math.max(1, Math.ceil(l / 240))
  const pl = Math.floor(l / ech)
  const ph = Math.floor(h / ech)
  const png = new PNG({ width: pl * (instants.length + 1), height: ph })
  for (let k = 0; k <= instants.length; k++) {
    const t = instants[k]
    for (let y = 0; y < ph; y++)
      for (let x = 0; x < pl; x++) {
        const i = y * ech * l + x * ech
        let c
        if (k === instants.length) {
          // Dernière vignette : les classes
          c = lum[i] < 0.5 ? TEINTES[classe[i]] : [255, 255, 255]
        } else if (carte.phases[0].type === 'photo') {
          const v = Math.min(1, Math.max(0, (t - tEncre[i]) / 1.4))
          const g = 245 * (1 - v) + lum[i] * 255 * v
          c = [g, g * 0.3, g * 0.25]
        } else {
          const enc = (1 - lum[i]) * (t >= tEncre[i] ? 1 : 0)
          let base = [150, 20, 20]
          if (t >= tPapier[i]) base = [255, 255, 255]
          else if (t >= sombre[i]) base = [40, 40, 40]
          c = base.map((v) => v * (1 - enc))
          if (t >= tEncre[i] && t - tEncre[i] < 0.35 && lum[i] < 0.5) c = TEINTES[classe[i]].map((v) => v * 0.8 + 50)
        }
        const o = (y * png.width + k * pl + x) * 4
        png.data[o] = c[0]
        png.data[o + 1] = c[1]
        png.data[o + 2] = c[2]
        png.data[o + 3] = 255
      }
  }
  mkdirSync(`${racine}outils/.cache/immersion`, { recursive: true })
  writeFileSync(`${racine}outils/.cache/immersion/${carte.nom}.png`, PNG.sync.write(png))
}

const voir = process.argv.includes('--apercu')
const seule = process.argv.find((a) => a.startsWith('--carte='))?.slice(8)
for (const carte of CARTES) {
  if (seule && carte.nom !== seule) continue
  const r = construire(carte)
  if (voir) apercu(carte, r, carte.apercu ?? [1, 2, 3, 4, 5, 6, 7, 8, 9])
}
