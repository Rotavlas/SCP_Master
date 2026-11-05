// Durée de vie du jeu : simule une année d'ouvertures de dossiers pour trois profils de joueurs, avec le vrai
// catalogue (public/data/cards.json) et les vrais taux (src/engine/boosters.ts, prive.variantes, ouvrir_booster()).
// Usage : node outils/simuler_duree_de_vie.mjs
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const racine = fileURLToPath(new URL('..', import.meta.url))
const cartes = JSON.parse(readFileSync(`${racine}public/data/cards.json`, 'utf8')).cartes

const MELANGE = { s: 0.66, c: 0.14, d: 0.05, p: 0.06, f: 0.04, g: 0.03, n: 0.02 }
const COMMUN = [0.6636, 0.24, 0.075, 0.02, 0.0014]
const COMMUN_DERNIERE = [0, 0.7105, 0.22, 0.065, 0.0045]
const DOSSIERS = {
  standard: { types: MELANGE, poids: COMMUN, derniere: COMMUN_DERNIERE, bonus: 1, mythique: 0.0004 },
  keter: { types: MELANGE, poids: [0, 0.6907, 0.24, 0.065, 0.0043], derniere: [0, 0, 0.7629, 0.22, 0.0171], bonus: 2, mythique: 0.0012 },
  o5: { types: MELANGE, poids: [0, 0, 0.7629, 0.22, 0.0171], derniere: [0, 0, 0, 0.9429, 0.0571], bonus: 4, mythique: 0.004 },
  apollyon: { types: MELANGE, poids: [0, 0, 0, 0.85, 0.15], derniere: [0, 0, 0, 0, 1], bonus: 6, mythique: 0.012 },
}
const VARIANTES = [
  ['o5', 0.0015],
  ['breche', 0.005],
  ['arch', 0.012],
  ['exp', 0.02],
  ['holo', 0.04],
]

// Les cartes par type et rareté, comme prive.tirer_carte (repli sur toute la rareté si le type n'en a pas)
const parTypeRarete = new Map()
const parRarete = [[], [], [], [], [], []]
for (const c of cartes) {
  parRarete[c.ra].push(c.id)
  const k = `${c.k}:${c.ra}`
  if (!parTypeRarete.has(k)) parTypeRarete.set(k, [])
  parTypeRarete.get(k).push(c.id)
}
const total = cartes.length
const parId = new Map(cartes.map((c) => [c.id, c]))

const tirerIndice = (poids) => {
  let x = Math.random()
  for (let i = 0; i < poids.length; i++) if ((x -= poids[i]) < 0) return i
  return poids.length - 1
}
const tirerType = (types) => {
  let x = Math.random()
  for (const [k, p] of Object.entries(types)) if ((x -= p) < 0) return k
  return 's'
}
const hasard = (l) => l[Math.floor(Math.random() * l.length)]
const tirerVariante = (bonus) => {
  let x = Math.random()
  for (const [v, p] of VARIANTES) if ((x -= p * bonus) < 0) return v
  return 'std'
}

function ouvrir(type, etat) {
  const t = DOSSIERS[type]
  for (let i = 0; i < 5; i++) {
    let carte
    let variante
    if (Math.random() < t.mythique) {
      carte = hasard(parRarete[5])
      const x = Math.random()
      variante = x < 0.05 ? 'negatif' : x < 0.09 ? 'esquisse' : tirerVariante(t.bonus)
    } else {
      const ra = tirerIndice(i === 4 ? t.derniere : t.poids)
      carte = hasard(parTypeRarete.get(`${tirerType(t.types)}:${ra}`) ?? parRarete[ra])
      variante = tirerVariante(t.bonus)
    }
    etat.cartes.set(carte, (etat.cartes.get(carte) ?? 0) + 1)
    if (variante !== 'std') {
      etat.variantes[variante] = (etat.variantes[variante] ?? 0) + 1
      etat.paires.add(`${carte}:${variante}`)
      const ra = parId.get(carte).ra
      if (ra >= 4) etat.variantesHautes[variante] = (etat.variantesHautes[variante] ?? 0) + 1
      if (!etat.premiere[variante]) etat.premiere[variante] = etat.jour
    }
    const ra = parId.get(carte).ra
    if (ra === 4 && !etat.premiere.legendaire) etat.premiere.legendaire = etat.jour
    if (ra === 5 && !etat.premiere.mythique) etat.premiere.mythique = etat.jour
  }
}

// Les collections des Groupes d'intérêt (même définition que la migration 20261115090000)
const COLLECTIONS = {
  'dieu-brise': ['gdi:church-of-the-broken-god', 'Church of the Broken God'],
  insurrection: ['gdi:the-chaos-insurgency', 'The Chaos Insurgency'],
  'main-du-serpent': ['gdi:the-serpent-s-hand', "The Serpent's Hand"],
}
const membres = Object.fromEntries(
  Object.entries(COLLECTIONS).map(([id, [gdi, cat]]) => [id, [gdi, ...cartes.filter((c) => c.k === 'd' && c.cat === cat).map((c) => c.id)]]),
)

// Les profils : dossiers gratuits par jour (1 toutes les 10 minutes, 10 en réserve) et achats
const PROFILS = {
  occasionnel: { gratuits: 15, keter: 0, o5: 0, apollyon: 0, fusions: 0 },
  regulier: { gratuits: 40, keter: 1, o5: 0, apollyon: 0, fusions: 1 },
  acharne: { gratuits: 90, keter: 3, o5: 1, apollyon: 1 / 7, fusions: 3 },
}
const JALONS = [7, 30, 90, 180, 365]

for (const [nom, p] of Object.entries(PROFILS)) {
  const etat = { cartes: new Map(), variantes: {}, variantesHautes: {}, paires: new Set(), premiere: {}, jour: 0, fusions: {} }
  const lignes = []
  const finCollections = {}
  for (let jour = 1; jour <= 365; jour++) {
    etat.jour = jour
    for (let i = 0; i < p.gratuits; i++) ouvrir('standard', etat)
    for (let i = 0; i < p.keter; i++) ouvrir('keter', etat)
    for (let i = 0; i < p.o5; i++) ouvrir('o5', etat)
    if (Math.random() < p.apollyon) ouvrir('apollyon', etat)
    // Fusions : 5 doublons standard en une variante (au prorata des chances)
    for (let f = 0; f < p.fusions; f++) {
      const v = tirerVariante(1 / 0.0785)
      etat.fusions[v] = (etat.fusions[v] ?? 0) + 1
    }
    for (const [id, l] of Object.entries(membres)) if (!finCollections[id] && l.every((c) => etat.cartes.has(c))) finCollections[id] = jour
    if (JALONS.includes(jour)) {
      const possedees = [...etat.cartes.keys()]
      const pr = (ra) => possedees.filter((c) => parId.get(c).ra === ra).length
      lignes.push({
        jour,
        fiches: `${possedees.length} (${((possedees.length / total) * 100).toFixed(1)} %)`,
        legendaires: `${pr(4)}/${parRarete[4].length}`,
        mythiques: `${pr(5)}/${parRarete[5].length}`,
        holo: etat.variantes.holo ?? 0,
        exp: etat.variantes.exp ?? 0,
        arch: etat.variantes.arch ?? 0,
        breche: etat.variantes.breche ?? 0,
        o5: etat.variantes.o5 ?? 0,
        'var. Légendaire+': Object.values(etat.variantesHautes).reduce((a, b) => a + b, 0),
        'O5 Légendaire+': etat.variantesHautes.o5 ?? 0,
      })
    }
  }
  console.log(`\n=== ${nom} : ${p.gratuits} dossiers gratuits/jour, ${p.keter} Keter, ${p.o5} O5, ${p.apollyon ? '1 Apollyon/semaine' : '0 Apollyon'}, ${p.fusions} fusion(s)/jour`)
  console.table(lignes)
  console.log(
    '  Premières fois (jour) :',
    Object.entries(etat.premiere)
      .map(([k, v]) => `${k} J${v}`)
      .join(' · '),
  )
  console.log('  Collections complètes (jour) :', Object.entries(membres).map(([id, l]) => `${id} (${l.length}) ${finCollections[id] ? `J${finCollections[id]}` : '> 1 an'}`).join(' · '))
  console.log('  En plus, par les fusions sur un an :', JSON.stringify(etat.fusions))
}
