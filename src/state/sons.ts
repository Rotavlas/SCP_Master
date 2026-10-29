import { useSyncExternalStore } from 'react'

/**
 * Les sons du jeu, tous fabriqués dans le navigateur (Web Audio API) : aucun fichier, aucune licence.
 * Deux techniques :
 *  - les bruitages (papier, carton, tampon, machine à écrire, gouttes, braises…) sont calculés échantillon par
 *    échantillon une fois pour toutes, comme on enregistrerait un son : une déchirure, ce sont des centaines de
 *    micro-craquements de fibres ; une carte, un claquement de carton avec sa résonance et un souffle d'air ;
 *  - les sons tenus (chœur, orgue, sirène, bourdonnements) sont joués en direct par des oscillateurs : un chœur,
 *    ce sont plusieurs voix par note, légèrement désaccordées et vibrées, passées dans les formants d'une voyelle.
 * Tout passe par une réverbération commune (une salle calculée elle aussi), puis un compresseur doux.
 * Le contexte audio ne naît qu'au premier geste du joueur ; le son se coupe d'un bouton, choix gardé sur l'appareil.
 */

const CLE = 'scp-son'
const VOLUME = 0.7
let actif = (() => {
  try {
    return localStorage.getItem(CLE) !== '0'
  } catch {
    return true
  }
})()
const abonnes = new Set<() => void>()

let ctx: AudioContext | null = null
let maitre: GainNode | null = null
let reverb: GainNode | null = null

/** Crée le contexte audio (au premier geste) ; null si le son est coupé ou indisponible. */
function audio(): AudioContext | null {
  if (!actif) return null
  if (!ctx) {
    const C = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!C) return null
    const c = new C()
    ctx = c
    // Un compresseur doux : les impacts et les ambiances qui se superposent ne saturent pas
    const comp = c.createDynamicsCompressor()
    comp.threshold.value = -18
    comp.ratio.value = 3.5
    comp.connect(c.destination)
    maitre = c.createGain()
    maitre.gain.value = VOLUME
    maitre.connect(comp)
    // La salle : une réponse impulsionnelle stéréo de 2,8 s, du bruit qui s'éteint et s'assourdit
    const salle = c.createConvolver()
    salle.buffer = calculer(
      c,
      2.8,
      (d, sr, canal) => {
        let lp = 0
        for (let i = 0; i < d.length; i++) {
          const t = i / sr
          lp += (Math.random() * 2 - 1 - lp) * (0.5 - 0.35 * Math.min(1, t / 1.5))
          d[i] = lp * Math.exp(-t / 0.55) * (t < 0.012 ? t / 0.012 : 1) * (canal ? 0.95 : 1)
        }
      },
      2,
    )
    reverb = c.createGain()
    reverb.gain.value = 1
    const retour = c.createGain()
    retour.gain.value = 0.45
    reverb.connect(salle).connect(retour).connect(maitre)
  }
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

/** À appeler une fois : le premier clic ou la première touche débloquent l'audio. */
export function preparerSons() {
  const debloquer = () => {
    audio()
    window.removeEventListener('pointerdown', debloquer)
    window.removeEventListener('keydown', debloquer)
  }
  window.addEventListener('pointerdown', debloquer)
  window.addEventListener('keydown', debloquer)
}

export function basculerSon() {
  actif = !actif
  try {
    localStorage.setItem(CLE, actif ? '1' : '0')
  } catch {
    // Préférence non mémorisée (navigation privée) : elle vaut pour cette visite
  }
  if (maitre && ctx) maitre.gain.setTargetAtTime(actif ? VOLUME : 0, ctx.currentTime, 0.05)
  if (actif) audio()
  abonnes.forEach((f) => f())
}

export const useSonActif = () =>
  useSyncExternalStore(
    (f) => {
      abonnes.add(f)
      return () => abonnes.delete(f)
    },
    () => actif,
  )

// ---------- Bruitages calculés ----------

const hasard = () => Math.random() * 2 - 1

function calculer(c: BaseAudioContext, duree: number, f: (d: Float32Array, sr: number, canal: number) => void, canaux = 1) {
  const b = c.createBuffer(canaux, Math.ceil(c.sampleRate * duree), c.sampleRate)
  for (let k = 0; k < canaux; k++) f(b.getChannelData(k), c.sampleRate, k)
  return b
}

/** Filtres simples (un pôle), appliqués sur place, et normalisation */
function passeHaut(d: Float32Array, sr: number, fc: number) {
  const a = Math.exp((-2 * Math.PI * fc) / sr)
  let y = 0
  let x0 = 0
  for (let i = 0; i < d.length; i++) {
    const x = d[i]
    y = a * (y + x - x0)
    x0 = x
    d[i] = y
  }
}
function passeBas(d: Float32Array, sr: number, fc: number) {
  const a = 1 - Math.exp((-2 * Math.PI * fc) / sr)
  let y = 0
  for (let i = 0; i < d.length; i++) d[i] = y += (d[i] - y) * a
}
function normaliser(d: Float32Array, crete = 0.9) {
  let m = 0
  for (const v of d) m = Math.max(m, Math.abs(v))
  if (m > 0) for (let i = 0; i < d.length; i++) d[i] *= crete / m
}

/**
 * Des grains : de minuscules éclats de bruit qui s'éteignent (fibres qui cèdent, braises, gravier).
 * `densite(t)` : grains par seconde à l'instant t ; `longueur` : durée d'un grain (s).
 */
function grains(d: Float32Array, sr: number, densite: (t: number) => number, longueur: [number, number], force = 1) {
  const actifs: { reste: number; tau: number; amp: number }[] = []
  for (let i = 0; i < d.length; i++) {
    const t = i / sr
    if (Math.random() < densite(t) / sr) {
      const l = longueur[0] + Math.random() * (longueur[1] - longueur[0])
      actifs.push({ reste: Math.ceil(l * sr * 4), tau: l * sr, amp: force * (0.2 + Math.random() * 0.8) ** 2 })
    }
    let v = 0
    for (let j = actifs.length - 1; j >= 0; j--) {
      const g = actifs[j]
      v += hasard() * g.amp * Math.exp(-(Math.ceil(g.tau * 4) - g.reste) / g.tau)
      if (--g.reste <= 0) actifs.splice(j, 1)
    }
    d[i] += v
  }
}

/** Une résonance amortie (le corps d'un objet qui sonne) */
function resonance(d: Float32Array, sr: number, freq: number, tau: number, amp: number, debut = 0) {
  for (let i = Math.floor(debut * sr); i < d.length; i++) {
    const t = i / sr - debut
    d[i] += Math.sin(2 * Math.PI * freq * t) * Math.exp(-t / tau) * amp
  }
}

const BRUITAGES: Record<string, [number, (d: Float32Array, sr: number) => void]> = {
  // Une feuille de papier qu'on déchire : des centaines de fibres qui cèdent, de plus en plus serrées puis lâchées
  dechirure: [
    0.75,
    (d, sr) => {
      const env = (t: number) => Math.min(1, t / 0.06) * Math.max(0, 1 - t / 0.72) ** 1.2
      grains(d, sr, (t) => 900 * env(t) * (0.6 + 0.4 * Math.sin(t * 40)), [0.0004, 0.004])
      for (let i = 0; i < d.length; i++) d[i] += hasard() * 0.08 * env(i / sr)
      passeHaut(d, sr, 900)
      passeBas(d, sr, 9000)
      normaliser(d)
    },
  ],
  // Du papier froissé, frotté, qu'on manipule
  froissement: [
    0.45,
    (d, sr) => {
      let lent = 0
      for (let i = 0; i < d.length; i++) {
        const t = i / sr
        lent += (Math.random() - lent) * 0.002
        d[i] = hasard() * lent * Math.sin((Math.PI * t) / 0.45) * 0.6
      }
      grains(d, sr, (t) => 260 * Math.sin((Math.PI * t) / 0.45), [0.0006, 0.003], 0.8)
      passeHaut(d, sr, 1600)
      passeBas(d, sr, 8000)
      normaliser(d, 0.8)
    },
  ],
  // Le sceau de cire qui casse : trois craquements secs et un petit choc sourd
  sceau: [
    0.25,
    (d, sr) => {
      for (const [t0, f] of [
        [0, 1300],
        [0.018, 900],
        [0.041, 1600],
      ]) {
        for (let i = Math.floor(t0 * sr); i < Math.floor((t0 + 0.004) * sr); i++) d[i] += hasard() * (1 - (i / sr - t0) / 0.004)
        resonance(d, sr, f, 0.006, 0.5, t0)
      }
      resonance(d, sr, 130, 0.04, 0.6)
      normaliser(d)
    },
  ],
  // Une carte qu'on retourne : le souffle du carton dans l'air
  souffleCarte: [
    0.16,
    (d, sr) => {
      for (let i = 0; i < d.length; i++) {
        const t = i / sr
        d[i] = hasard() * Math.sin((Math.PI * t) / 0.16) ** 2
      }
      passeHaut(d, sr, 700)
      passeBas(d, sr, 4500)
      normaliser(d, 0.7)
    },
  ],
  // … puis son claquement : le bord du carton qui frappe, son corps qui résonne un instant
  claqueCarte: [
    0.09,
    (d, sr) => {
      for (let i = 0; i < Math.floor(0.0025 * sr); i++) d[i] = hasard() * (1 - i / (0.0025 * sr))
      resonance(d, sr, 2150, 0.011, 0.45)
      resonance(d, sr, 3550, 0.006, 0.25)
      resonance(d, sr, 640, 0.018, 0.2)
      for (let i = 0; i < d.length; i++) d[i] += hasard() * 0.25 * Math.exp(-i / sr / 0.02)
      passeHaut(d, sr, 300)
      normaliser(d)
    },
  ],
  // Une carte qui glisse sur la pile : un frottement de carton
  glisseCarte: [
    0.28,
    (d, sr) => {
      let lent = 0
      for (let i = 0; i < d.length; i++) {
        const t = i / sr
        lent += (Math.random() - lent) * 0.01
        d[i] = hasard() * (0.5 + lent) * Math.sin((Math.PI * t) / 0.28) ** 0.7
      }
      passeHaut(d, sr, 900)
      passeBas(d, sr, 3800)
      normaliser(d, 0.6)
    },
  ],
  // Un tampon encreur qui s'abat sur un bureau : le choc sourd, la claque du papier, le bois qui résonne
  tampon: [
    0.45,
    (d, sr) => {
      for (let i = 0; i < d.length; i++) {
        const t = i / sr
        d[i] = Math.sin(2 * Math.PI * (70 * t - 30 * t * t)) * Math.exp(-t / 0.09) * 0.9
        d[i] += hasard() * Math.exp(-t / 0.012) * 0.7
      }
      resonance(d, sr, 185, 0.05, 0.35)
      resonance(d, sr, 410, 0.025, 0.15)
      passeBas(d, sr, 5000)
      normaliser(d)
    },
  ],
  // Une touche de machine à écrire : le clic de la touche, le claquement métallique de la barre de frappe
  touche: [
    0.08,
    (d, sr) => {
      for (let i = 0; i < Math.floor(0.002 * sr); i++) d[i] = hasard() * 0.8
      resonance(d, sr, 2350, 0.007, 0.5, 0.008)
      resonance(d, sr, 3900, 0.004, 0.3, 0.008)
      resonance(d, sr, 160, 0.012, 0.45, 0.009)
      for (let i = Math.floor(0.008 * sr); i < Math.floor(0.0105 * sr); i++) d[i] += hasard()
      passeHaut(d, sr, 120)
      normaliser(d)
    },
  ],
  // Une goutte : un « plic », dont la hauteur monte en quelques millisecondes
  goutte: [
    0.18,
    (d, sr) => {
      let phase = 0
      for (let i = 0; i < d.length; i++) {
        const t = i / sr
        phase += (2 * Math.PI * (650 + 1100 * Math.min(1, t / 0.03))) / sr
        d[i] = Math.sin(phase) * Math.exp(-t / 0.05) * Math.min(1, t / 0.001)
      }
      normaliser(d, 0.8)
    },
  ],
  // Un pas lourd : le talon, le gravier
  pas: [
    0.25,
    (d, sr) => {
      for (let i = 0; i < d.length; i++) d[i] = Math.sin(2 * Math.PI * 58 * (i / sr)) * Math.exp(-i / sr / 0.05) * 0.8
      grains(d, sr, (t) => (t < 0.12 ? 2000 : 0), [0.0005, 0.002], 0.35)
      passeBas(d, sr, 2500)
      normaliser(d)
    },
  ],
  // Le béton qui racle le sol : un frottement grave et granuleux
  raclement: [
    0.55,
    (d, sr) => {
      const env = (t: number) => Math.sin((Math.PI * t) / 0.55) ** 0.5
      grains(d, sr, (t) => 1800 * env(t), [0.001, 0.006], 0.9)
      for (let i = 0; i < d.length; i++) d[i] += hasard() * 0.3 * env(i / sr)
      passeBas(d, sr, 1100)
      passeHaut(d, sr, 60)
      normaliser(d)
    },
  ],
  // Un maillon de chaîne qui claque contre un autre
  maillon: [
    0.5,
    (d, sr) => {
      for (let i = 0; i < Math.floor(0.002 * sr); i++) d[i] = hasard()
      for (const [f, tau, a] of [
        [1240, 0.12, 0.4],
        [2890, 0.07, 0.3],
        [4720, 0.04, 0.2],
        [6650, 0.025, 0.12],
      ])
        resonance(d, sr, f * (0.97 + Math.random() * 0.06), tau, a)
      normaliser(d)
    },
  ],
  // Des braises qui crépitent sur un grondement : un fond de feu, en boucle
  feu: [
    4,
    (d, sr) => {
      let lp = 0
      for (let i = 0; i < d.length; i++) d[i] = (lp += (hasard() - lp) * 0.02) * 2.4
      grains(d, sr, () => 14, [0.0003, 0.0015], 1.2)
      grains(d, sr, () => 2.5, [0.002, 0.008], 1.6)
      passeHaut(d, sr, 40)
      normaliser(d, 0.8)
    },
  ],
}

const tampons = new Map<string, AudioBuffer>()
function bruitage(c: AudioContext, nom: string) {
  let b = tampons.get(nom)
  if (!b) {
    const [duree, f] = BRUITAGES[nom]
    b = calculer(c, duree, f)
    tampons.set(nom, b)
  }
  return b
}

interface Lecture {
  gain?: number
  /** Décalage (s) depuis maintenant */
  a?: number
  /** Vitesse de lecture (hauteur) */
  vitesse?: number
  /** Part envoyée dans la salle (0 à 1) */
  r?: number
  /** Position stéréo (-1 à 1) */
  pan?: number
}

/** La sortie d'un son : sec vers le maître, une part vers la salle, placée dans l'espace stéréo. */
function sortieSon(c: AudioContext, gain: number, r: number, pan: number) {
  const g = c.createGain()
  g.gain.value = gain
  const p = c.createStereoPanner()
  p.pan.value = pan
  g.connect(p).connect(maitre!)
  if (r > 0) {
    const e = c.createGain()
    e.gain.value = r
    g.connect(e).connect(reverb!)
  }
  return g
}

function lire(nom: string, { gain = 1, a = 0, vitesse = 1, r = 0.15, pan = 0 }: Lecture = {}) {
  const c = audio()
  if (!c) return
  const s = c.createBufferSource()
  s.buffer = bruitage(c, nom)
  s.playbackRate.value = vitesse
  s.connect(sortieSon(c, gain, r, pan))
  s.start(c.currentTime + a)
}

/** Une note tenue ou frappée : oscillateur avec attaque et extinction, glissement possible. */
function note(
  freq: number,
  {
    a = 0,
    attaque = 0.005,
    duree,
    gain,
    type = 'sine',
    vers,
    r = 0.3,
    pan = 0,
  }: Lecture & { attaque?: number; duree: number; gain: number; type?: OscillatorType; vers?: number },
) {
  const c = audio()
  if (!c) return
  const t = c.currentTime + a
  const g = c.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(gain, t + attaque)
  g.gain.exponentialRampToValueAtTime(0.0001, t + attaque + duree)
  g.connect(sortieSon(c, 1, r, pan))
  const o = c.createOscillator()
  o.type = type
  o.frequency.setValueAtTime(freq, t)
  if (vers) o.frequency.exponentialRampToValueAtTime(vers, t + attaque + duree)
  o.connect(g)
  o.start(t)
  o.stop(t + attaque + duree + 0.05)
}

/** Une cloche : des partiels qui s'éteignent chacun à son rythme (plus haut, plus vite) */
function cloche(base: number, { gain, duree, a = 0, r = 0.5 }: { gain: number; duree: number; a?: number; r?: number }) {
  for (const [k, v] of [
    [1, 1],
    [2, 0.5],
    [2.4, 0.35],
    [3, 0.25],
    [4.2, 0.15],
    [5.4, 0.1],
  ])
    note(base * k, { a, gain: gain * v, duree: duree / Math.sqrt(k), r })
}

// ---------- Sons ponctuels ----------

const varie = (x: number, part = 0.08) => x * (1 - part + Math.random() * 2 * part)

export const jouer = {
  /** Le sceau de cire qui casse, puis la feuille qui se déchire et le dossier qu'on ouvre */
  dechirure() {
    lire('sceau', { gain: 0.8, r: 0.1 })
    lire('dechirure', { gain: 0.9, a: 0.05, vitesse: varie(1, 0.05), r: 0.12 })
    lire('froissement', { gain: 0.5, a: 0.55, r: 0.15 })
  },
  /** Une carte qu'on retourne (souffle, claquement), puis, au-delà de la rareté rare, sa rareté qui tinte */
  retourner(ra: number, variante = false) {
    lire('souffleCarte', { gain: 0.45, vitesse: varie(1), r: 0.05 })
    lire('claqueCarte', { gain: 0.75, a: 0.11, vitesse: varie(1, 0.05), r: 0.1 })
    // Une note discrète pour une peu commune, un arpège de clochettes ensuite, une cloche pour une légendaire
    const arpeges = [[], [1568], [1319, 1976], [1175, 1568, 2349], [1047, 1568, 2093, 2637]]
    ;(arpeges[Math.min(ra, 4)] ?? []).forEach((f, i) => cloche(f, { a: 0.16 + i * 0.09, gain: 0.05 + ra * 0.008, duree: 0.8 + ra * 0.25 }))
    if (ra >= 4) cloche(392, { a: 0.2, gain: 0.08, duree: 3.5, r: 0.7 })
    if (variante) for (let i = 0; i < 7; i++) cloche(2400 + Math.random() * 2400, { a: 0.15 + i * 0.05, gain: 0.025, duree: 0.6 })
  },
  /** La montée avant une Épique ou une variante : un souffle qui enfle, une note qui monte */
  suspense() {
    const c = audio()
    if (!c) return
    lire('froissement', { gain: 0.25, vitesse: 0.6 })
    note(196, { attaque: 0.85, duree: 0.15, gain: 0.06, type: 'triangle', vers: 392, r: 0.5 })
    note(294, { attaque: 0.85, duree: 0.15, gain: 0.04, type: 'triangle', vers: 587, r: 0.5 })
  },
  /** La carte glisse hors de la pile */
  glisse() {
    lire('glisseCarte', { gain: 0.5, vitesse: varie(1), pan: 0.3, r: 0.05 })
  },
  /** Une touche de machine à écrire (une touche effacée sonne plus sourde) */
  frappe(grave = false) {
    lire('touche', { gain: grave ? 0.3 : 0.4, vitesse: grave ? 0.75 : varie(1, 0.06), pan: (Math.random() - 0.5) * 0.4, r: 0.08 })
  },
  /** Un mot décrypté : un petit relais qui claque */
  decrypte() {
    note(varie(1800), { duree: 0.03, gain: 0.04, type: 'square', r: 0.1 })
  },
  /** Le tampon qui s'abat */
  tampon() {
    lire('tampon', { gain: 1, r: 0.25 })
  },
  /** L'éclair blanc avant la carte : un souffle qui s'envole, une cloche claire */
  eclair() {
    lire('froissement', { gain: 0.3, vitesse: 1.6, r: 0.6 })
    cloche(1047, { gain: 0.06, duree: 2.2, r: 0.8 })
    cloche(1568, { gain: 0.04, duree: 1.8, a: 0.03, r: 0.8 })
  },
  /** Le coup sourd d'une scène (une main qui s'abat, des chaînes qui se tendent, une épée qui se plante) */
  impact(grave = 55) {
    note(grave, { duree: 0.9, gain: 0.5, vers: grave * 0.55, r: 0.6 })
    lire('tampon', { gain: 0.7, vitesse: 0.55, r: 0.6 })
    lire('raclement', { gain: 0.25, vitesse: 1.6, r: 0.5 })
  },
  /** Des chaînes qui se tendent : une volée de maillons */
  chaine() {
    for (let i = 0; i < 6; i++)
      lire('maillon', { a: i * 0.045 + Math.random() * 0.02, gain: 0.25, vitesse: varie(1, 0.12), pan: (Math.random() - 0.5) * 0.8, r: 0.35 })
  },
  /** Une ligne qui paraît dans la brume : un souffle qui enfle et une note grave lointaine */
  brume() {
    lire('froissement', { gain: 0.2, vitesse: 0.45, r: 0.8 })
    note(110, { attaque: 0.6, duree: 1.6, gain: 0.05, type: 'triangle', r: 0.8 })
  },
  /** Une plume qui gratte le papier */
  plume() {
    for (let i = 0; i < 5; i++) lire('froissement', { a: i * 0.16 + Math.random() * 0.05, gain: 0.18, vitesse: 1.9 + Math.random() * 0.4, r: 0.1 })
  },
  /** Le béton qui racle le sol */
  raclement() {
    lire('raclement', { gain: 0.9, vitesse: varie(1, 0.1), r: 0.35 })
  },
  /** Un plantage : des relais qui claquent au hasard, un souffle d'électricité */
  plantage() {
    for (let i = 0; i < 14; i++) note(80 + Math.random() * 2500, { a: i * 0.035, duree: 0.025, gain: 0.05, type: 'square', r: 0.1 })
    lire('froissement', { gain: 0.35, vitesse: 0.35, r: 0.2 })
  },
  /** Le bip d'un moniteur cardiaque */
  bip(freq = 1000) {
    note(freq, { attaque: 0.004, duree: 0.13, gain: 0.07, r: 0.25 })
  },
  /** Une goutte dans la cuve */
  goutte() {
    lire('goutte', { gain: 0.35, vitesse: varie(1, 0.15), pan: (Math.random() - 0.5) * 0.8, r: 0.6 })
  },
}

// ---------- Ambiances ----------

export interface Ambiance {
  /** Arrête l'ambiance en fondu */
  arreter: () => void
}

interface Construction {
  sources: AudioScheduledSourceNode[]
  minuteries: number[]
}

/** Un oscillateur modulé par un vibrato lent */
function voix(c: AudioContext, sortie: AudioNode, freq: number, type: OscillatorType, vibrato: [number, number], b: Construction) {
  const o = c.createOscillator()
  o.type = type
  o.frequency.value = freq
  const lfo = c.createOscillator()
  lfo.frequency.value = vibrato[0]
  const prof = c.createGain()
  prof.gain.value = freq * vibrato[1]
  lfo.connect(prof).connect(o.frequency)
  o.connect(sortie)
  o.start()
  lfo.start()
  b.sources.push(o, lfo)
}

/** Une boucle d'un bruitage, à un volume donné */
function boucle(c: AudioContext, sortie: AudioNode, nom: string, gain: number, vitesse: number, b: Construction) {
  const s = c.createBufferSource()
  s.buffer = bruitage(c, nom)
  s.loop = true
  s.playbackRate.value = vitesse
  const g = c.createGain()
  g.gain.value = gain
  s.connect(g).connect(sortie)
  s.start()
  b.sources.push(s)
}

/** Un bourdonnement : oscillateurs passés dans un filtre */
function bourdon(c: AudioContext, sortie: AudioNode, freqs: number[], type: OscillatorType, coupure: number, gain: number, b: Construction) {
  const f = c.createBiquadFilter()
  f.type = 'lowpass'
  f.frequency.value = coupure
  const g = c.createGain()
  g.gain.value = gain
  f.connect(g).connect(sortie)
  for (const fr of freqs) voix(c, f, fr, type, [0.1 + Math.random() * 0.2, 0.002], b)
}

/** Répète une action à intervalle (avec un peu de hasard) */
function repeter(periode: number, f: () => void, b: Construction) {
  b.minuteries.push(window.setInterval(f, periode * 1000))
}

/**
 * Le chœur : pour chaque note, trois voix légèrement désaccordées, chacune avec son vibrato, et un souffle ;
 * le tout passe dans les trois formants de la voyelle « ah » d'une voix humaine, puis dans une grande salle.
 */
function choeur(c: AudioContext, sortie: AudioNode, notes: number[], gain: number, b: Construction) {
  const entree = c.createGain()
  entree.gain.value = 1
  const formants = c.createGain()
  formants.gain.value = gain
  for (const [f, q, v] of [
    [750, 7, 1],
    [1180, 9, 0.55],
    [2650, 11, 0.3],
    [3350, 12, 0.12],
  ]) {
    const bp = c.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.value = f
    bp.Q.value = q
    const g = c.createGain()
    g.gain.value = v
    entree.connect(bp).connect(g).connect(formants)
  }
  formants.connect(sortie)
  // La respiration des chanteurs : le volume ondule lentement
  const souffle = c.createOscillator()
  souffle.frequency.value = 0.09
  const profondeur = c.createGain()
  profondeur.gain.value = gain * 0.35
  souffle.connect(profondeur).connect(formants.gain)
  souffle.start()
  b.sources.push(souffle)
  for (const n of notes)
    for (const desaccord of [-0.006, 0, 0.007]) voix(c, entree, n * (1 + desaccord), 'sawtooth', [4.6 + Math.random() * 1.4, 0.004 + Math.random() * 0.002], b)
  boucle(c, entree, 'froissement', 0.05, 0.3, b)
}

/** Les ambiances, par nom */
const AMBIANCES: Record<string, (c: AudioContext, sortie: GainNode, salle: GainNode, b: Construction) => void> = {
  // Un brasier : le feu qui crépite et gronde, une basse qui respire
  brasier: (c, sortie, salle, b) => {
    boucle(c, sortie, 'feu', 0.55, 1, b)
    boucle(c, salle, 'feu', 0.2, 0.6, b)
    bourdon(c, salle, [41.2, 41.6, 82.4], 'sawtooth', 180, 0.12, b)
  },
  // Un chœur céleste, en ré mineur, dans une cathédrale
  choeur: (c, _sortie, salle, b) => {
    choeur(c, salle, [146.8, 174.6, 220, 293.7, 440], 0.09, b)
    bourdon(c, salle, [73.4], 'triangle', 300, 0.08, b)
  },
  // Une sirène de confinement qui hurle au loin, et des pas lourds
  alarme: (c, sortie, salle, b) => {
    const f = c.createBiquadFilter()
    f.type = 'bandpass'
    f.frequency.value = 900
    f.Q.value = 0.8
    const g = c.createGain()
    g.gain.value = 0.05
    f.connect(g).connect(salle)
    const o = c.createOscillator()
    o.type = 'sawtooth'
    o.frequency.value = 650
    // La sirène monte et descend
    const lfo = c.createOscillator()
    lfo.frequency.value = 0.4
    const prof = c.createGain()
    prof.gain.value = 260
    lfo.connect(prof).connect(o.frequency)
    o.connect(f)
    o.start()
    lfo.start()
    b.sources.push(o, lfo)
    let pied = 0
    repeter(0.52, () => lire('pas', { gain: 0.35, vitesse: varie(1, 0.1), pan: pied++ % 2 ? 0.25 : -0.25, r: 0.4 }), b)
    void sortie
  },
  // Un orgue d'église grave : fondamentale, octave et quinte, qui respire dans une grande salle
  orgue: (c, _sortie, salle, b) => {
    for (const n of [65.4, 98, 130.8, 155.6]) bourdon(c, salle, [n, n * 2, n * 3, n * 4], 'sine', 1800, 0.035, b)
  },
  // Le bourdonnement des machines et la ventilation ; le cœur sur le moniteur
  machines: (c, sortie, salle, b) => {
    bourdon(c, sortie, [50, 100, 150], 'sawtooth', 260, 0.05, b)
    boucle(c, sortie, 'froissement', 0.06, 0.25, b)
    repeter(1.3, () => jouer.bip(), b)
    void salle
  },
  // La chambre noire : le ronronnement d'une pompe, des gouttes
  chambre: (c, sortie, salle, b) => {
    bourdon(c, sortie, [60, 120], 'triangle', 200, 0.06, b)
    repeter(0.8, () => Math.random() < 0.55 && jouer.goutte(), b)
    void salle
  },
  // Un néon qui grésille et sautille
  neon: (c, sortie, _salle, b) => {
    const f = c.createBiquadFilter()
    f.type = 'bandpass'
    f.frequency.value = 1800
    f.Q.value = 1.5
    const g = c.createGain()
    g.gain.value = 0.035
    f.connect(g).connect(sortie)
    voix(c, f, 100, 'sawtooth', [0.3, 0.001], b)
    bourdon(c, sortie, [100], 'sine', 400, 0.03, b)
    repeter(0.4, () => Math.random() < 0.25 && note(100, { duree: 0.06, gain: 0.04, type: 'square', r: 0 }), b)
  },
  // Une page qui frémit : des froissements, un souffle
  page: (c, sortie, salle, b) => {
    boucle(c, salle, 'froissement', 0.08, 0.4, b)
    repeter(0.9, () => Math.random() < 0.5 && lire('froissement', { gain: 0.15, vitesse: varie(1.1, 0.3), pan: Math.random() - 0.5, r: 0.4 }), b)
    bourdon(c, salle, [55, 82.4], 'triangle', 250, 0.05, b)
    void sortie
  },
  // Un bureau la nuit : le silence, une horloge
  bureau: (c, sortie, _salle, b) => {
    bourdon(c, sortie, [50], 'sine', 200, 0.02, b)
    let tic = 0
    repeter(1, () => lire('touche', { gain: 0.12, vitesse: tic++ % 2 ? 0.55 : 0.6, r: 0.3 }), b)
  },
}

/** Lance une ambiance (rien si le son est coupé) ; l'arrêter la fait disparaître en fondu. */
export function ambiance(nom: string): Ambiance {
  const c = audio()
  const def = AMBIANCES[nom]
  if (!c || !maitre || !reverb || !def) return { arreter: () => undefined }
  // Deux sorties en fondu : sèche (vers le maître) et dans la salle (vers la réverbération)
  const sortie = c.createGain()
  const salle = c.createGain()
  for (const [g, vers] of [
    [sortie, maitre],
    [salle, reverb],
  ] as const) {
    g.gain.setValueAtTime(0.0001, c.currentTime)
    g.gain.exponentialRampToValueAtTime(1, c.currentTime + 1.5)
    g.connect(vers)
  }
  // La salle s'entend aussi un peu directement
  const direct = c.createGain()
  direct.gain.value = 0.35
  salle.connect(direct).connect(maitre)
  const b: Construction = { sources: [], minuteries: [] }
  def(c, sortie, salle, b)
  let arretee = false
  return {
    arreter: () => {
      if (arretee) return
      arretee = true
      b.minuteries.forEach(clearInterval)
      for (const g of [sortie, salle]) g.gain.setTargetAtTime(0.0001, c.currentTime, 0.35)
      window.setTimeout(() => {
        b.sources.forEach((s) => s.stop())
        sortie.disconnect()
        salle.disconnect()
      }, 2000)
    },
  }
}

/** Planifie des sons à des instants (s) donnés ; renvoie de quoi tout annuler. */
export function planifier(evenements: [number, () => void][]): () => void {
  const ids = evenements.map(([t, f]) => window.setTimeout(f, t * 1000))
  return () => ids.forEach(clearTimeout)
}
