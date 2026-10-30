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
  // Un tambour rituel (taiko) : la peau frappée, une note grave qui chute, le fût qui résonne
  tambour: [
    1.6,
    (d, sr) => {
      let phase = 0
      for (let i = 0; i < d.length; i++) {
        const t = i / sr
        phase += (2 * Math.PI * (48 + 70 * Math.exp(-t / 0.05))) / sr
        d[i] = Math.sin(phase) * Math.exp(-t / 0.42) * 0.9 + hasard() * Math.exp(-t / 0.008) * 0.6
      }
      resonance(d, sr, 96, 0.25, 0.25)
      resonance(d, sr, 171, 0.12, 0.12)
      grains(d, sr, (t) => (t < 0.03 ? 4000 : 0), [0.0003, 0.001], 0.3)
      passeBas(d, sr, 3200)
      normaliser(d)
    },
  ],
  // Un souffle qui enfle et s'envole : de l'air poussé, de plus en plus clair
  souffle: [
    1.4,
    (d, sr) => {
      let lp = 0
      for (let i = 0; i < d.length; i++) {
        const t = i / sr
        const env = Math.sin(Math.PI * Math.min(1, t / 1.4)) ** 1.5
        // Le filtre s'ouvre en même temps que le souffle monte
        lp += (hasard() - lp) * (0.02 + 0.25 * (t / 1.4) ** 2)
        d[i] = lp * env
      }
      passeHaut(d, sr, 80)
      normaliser(d, 0.8)
    },
  ],
  // Des bois ou des os qui poussent et craquent : des fibres qui cèdent, un corps qui résonne
  craquement: [
    0.7,
    (d, sr) => {
      const env = (t: number) => Math.exp(-t / 0.25)
      grains(d, sr, (t) => 1400 * env(t), [0.0006, 0.004], 1)
      for (const f of [230, 410, 655]) resonance(d, sr, f * (0.9 + Math.random() * 0.2), 0.05, 0.25)
      passeHaut(d, sr, 120)
      passeBas(d, sr, 5000)
      normaliser(d)
    },
  ],
  // Un grondement de pierre, sourd et roulant
  grondement: [
    3,
    (d, sr) => {
      let lp = 0
      let lent = 0
      for (let i = 0; i < d.length; i++) {
        const t = i / sr
        lp += (hasard() - lp) * 0.008
        lent += (Math.random() - lent) * 0.0004
        d[i] = lp * (0.5 + lent) * Math.min(1, t / 0.4) * Math.min(1, (3 - t) / 0.6)
      }
      grains(d, sr, () => 60, [0.003, 0.012], 0.4)
      passeBas(d, sr, 420)
      normaliser(d)
    },
  ],
  // Un battement d'ailes immense : l'air chassé, puis le froissement des plumes
  aile: [
    0.9,
    (d, sr) => {
      let lp = 0
      for (let i = 0; i < d.length; i++) {
        const t = i / sr
        lp += (hasard() - lp) * 0.06
        d[i] = lp * Math.sin(Math.PI * Math.min(1, t / 0.55)) ** 2 * 1.4
      }
      grains(d, sr, (t) => (t > 0.25 ? 900 * Math.exp(-(t - 0.25) / 0.2) : 0), [0.0005, 0.002], 0.5)
      passeHaut(d, sr, 60)
      passeBas(d, sr, 3000)
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
function choeur(c: AudioContext, sortie: AudioNode, notes: number[], gain: number, b: Construction, voyelle: [number, number, number][] = VOYELLE_AH) {
  const entree = c.createGain()
  entree.gain.value = 1
  const formants = c.createGain()
  formants.gain.value = gain
  for (const [f, q, v] of voyelle) {
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

// ---------- Partitions : la musique d'une cinématique, calée à l'instant près ----------

/**
 * Des sons placés à un instant précis (s) depuis le début de l'ambiance, branchés sur ses sorties : ils
 * s'éteignent avec elle si l'on quitte la scène. `sortie` est le son sec, `salle` celui qui part en réverbération.
 */
function partition(c: AudioContext, sortie: GainNode, salle: GainNode, b: Construction) {
  const t0 = c.currentTime + 0.03
  const vers = (gain: number, r: number) => {
    const g = c.createGain()
    g.gain.value = gain
    g.connect(sortie)
    if (r > 0) {
      const e = c.createGain()
      e.gain.value = r
      g.connect(e).connect(salle)
    }
    return g
  }
  const p = {
    /** Un bruitage */
    son(t: number, nom: string, { gain = 1, vitesse = 1, r = 0.3, pan = 0 }: { gain?: number; vitesse?: number; r?: number; pan?: number } = {}) {
      const s = c.createBufferSource()
      s.buffer = bruitage(c, nom)
      s.playbackRate.value = vitesse
      const pp = c.createStereoPanner()
      pp.pan.value = pan
      s.connect(pp).connect(vers(gain, r))
      s.start(t0 + t)
      b.sources.push(s)
    },
    /** Une note : oscillateur, enveloppe, glissement, filtre qui s'ouvre */
    note(
      t: number,
      freq: number,
      {
        duree,
        gain,
        type = 'sine',
        attaque = 0.01,
        relache = 0.3,
        glisse,
        filtre,
        r = 0.4,
        vibrato,
      }: {
        duree: number
        gain: number
        type?: OscillatorType
        attaque?: number
        relache?: number
        glisse?: number
        filtre?: { de: number; a: number; q?: number; en?: number; type?: BiquadFilterType }
        r?: number
        vibrato?: [number, number, number]
      },
    ) {
      const debut = t0 + t
      const fin = debut + attaque + duree + relache
      const g = c.createGain()
      g.gain.setValueAtTime(0.0001, debut)
      g.gain.exponentialRampToValueAtTime(gain, debut + attaque)
      g.gain.setValueAtTime(gain, debut + attaque + duree)
      g.gain.exponentialRampToValueAtTime(0.0001, fin)
      let sortieNote: AudioNode = g
      g.connect(vers(1, r))
      if (filtre) {
        const f = c.createBiquadFilter()
        f.type = filtre.type ?? 'lowpass'
        f.Q.value = filtre.q ?? 0.7
        f.frequency.setValueAtTime(filtre.de, debut)
        f.frequency.exponentialRampToValueAtTime(filtre.a, debut + (filtre.en ?? attaque + duree))
        f.connect(g)
        sortieNote = f
      }
      const o = c.createOscillator()
      o.type = type
      o.frequency.setValueAtTime(freq, debut)
      if (glisse) o.frequency.exponentialRampToValueAtTime(glisse, fin)
      if (vibrato) {
        // [vitesse, profondeur relative, entrée en s]
        const lfo = c.createOscillator()
        lfo.frequency.value = vibrato[0]
        const prof = c.createGain()
        prof.gain.setValueAtTime(0, debut)
        prof.gain.linearRampToValueAtTime(freq * vibrato[1], debut + vibrato[2])
        lfo.connect(prof).connect(o.frequency)
        lfo.start(debut)
        lfo.stop(fin + 0.05)
        b.sources.push(lfo)
      }
      o.connect(sortieNote)
      o.start(debut)
      o.stop(fin + 0.05)
      b.sources.push(o)
    },
    /** Une cloche : des partiels qui s'éteignent chacun à son rythme */
    cloche(t: number, base: number, gain: number, duree: number, r = 0.6) {
      for (const [k, v] of [
        [1, 1],
        [2, 0.5],
        [2.4, 0.35],
        [3, 0.25],
        [4.2, 0.15],
        [5.4, 0.1],
      ])
        p.note(t, base * k, { duree: 0.01, relache: duree / Math.sqrt(k), gain: gain * v, attaque: 0.004, r })
    },
    /** Le « braam » des bandes-annonces : des cuivres graves désaccordés dont le filtre s'ouvre d'un coup */
    braam(t: number, notes: number[], duree: number, gain: number) {
      for (const n of notes)
        for (const dd of [-0.008, 0, 0.009])
          p.note(t, n * (1 + dd), {
            duree,
            gain: gain / notes.length,
            type: 'sawtooth',
            attaque: 0.06,
            relache: 1.4,
            filtre: { de: 140, a: 1600, q: 1.2, en: 0.5 },
            r: 0.5,
          })
      p.note(t, notes[0] / 2, { duree, gain: gain * 0.6, attaque: 0.03, relache: 1.6, glisse: notes[0] / 2.6, r: 0.3 })
    },
    /** Une trompette : un cuivre dont l'éclat s'ouvre à l'attaque, puis vibre */
    trompette(t: number, freq: number, duree: number, gain: number) {
      for (const [type, g] of [
        ['sawtooth', 1],
        ['square', 0.35],
      ] as const)
        p.note(t, freq, {
          duree,
          gain: gain * g,
          type,
          attaque: 0.05,
          relache: 0.35,
          filtre: { de: 500, a: 3200, q: 2.5, en: 0.12 },
          vibrato: [5.5, 0.006, 0.3],
          r: 0.65,
        })
    },
    /** Un coup de sub-basse qui retombe, avec un tampon ralenti pour le corps */
    impact(t: number, force = 1) {
      p.note(t, 58, { duree: 0.05, relache: 1.4 * force, gain: 0.55 * force, glisse: 26, attaque: 0.004, r: 0.5 })
      p.son(t, 'tampon', { gain: 0.6 * force, vitesse: 0.5, r: 0.6 })
      p.son(t, 'raclement', { gain: 0.25 * force, vitesse: 1.4, r: 0.6 })
    },
    /** Un chœur qui enfle et retombe selon des images clés [instant, volume] */
    choeur(notes: number[], cles: [number, number][], formants: [number, number, number][] = VOYELLE_AH) {
      const env = c.createGain()
      env.gain.setValueAtTime(0.0001, t0)
      for (const [t, v] of cles) env.gain.exponentialRampToValueAtTime(Math.max(0.0001, v), t0 + t)
      env.connect(salle)
      choeur(c, env, notes, 1, b, formants)
    },
    /** Un bourdon grave dont le filtre s'ouvre selon des images clés [instant, fréquence] et le volume [instant, volume] */
    bourdon(freqs: number[], type: OscillatorType, ouverture: [number, number][], volume: [number, number][]) {
      const f = c.createBiquadFilter()
      f.type = 'lowpass'
      f.Q.value = 2
      f.frequency.setValueAtTime(ouverture[0][1], t0)
      for (const [t, v] of ouverture) f.frequency.exponentialRampToValueAtTime(v, t0 + t)
      const g = c.createGain()
      g.gain.setValueAtTime(0.0001, t0)
      for (const [t, v] of volume) g.gain.exponentialRampToValueAtTime(Math.max(0.0001, v), t0 + t)
      f.connect(g).connect(salle)
      g.connect(sortie)
      for (const fr of freqs) voix(c, f, fr, type, [0.15 + Math.random() * 0.2, 0.003], b)
    },
    /** Une boucle de bruitage dont le volume suit des images clés */
    nappe(nom: string, vitesse: number, volume: [number, number][], r = 0.3) {
      const s = c.createBufferSource()
      s.buffer = bruitage(c, nom)
      s.loop = true
      s.playbackRate.value = vitesse
      const g = c.createGain()
      g.gain.setValueAtTime(0.0001, t0)
      for (const [t, v] of volume) g.gain.exponentialRampToValueAtTime(Math.max(0.0001, v), t0 + t)
      s.connect(g).connect(vers(1, r))
      s.start(t0)
      b.sources.push(s)
    },
  }
  return p
}

/** Formants de voyelles : [fréquence, Q, gain] */
const VOYELLE_AH: [number, number, number][] = [
  [750, 7, 1],
  [1180, 9, 0.55],
  [2650, 11, 0.3],
  [3350, 12, 0.12],
]
const VOYELLE_OH: [number, number, number][] = [
  [450, 7, 1],
  [800, 9, 0.6],
  [2830, 11, 0.15],
]

// Ré mineur, le Roi écarlate ; ré majeur, le Gate Guardian
const D1 = 36.71
const D2 = 73.42
const A2 = 110
const D3 = 146.83
const F3 = 174.61
const FD3 = 185
const A3 = 220
const D4 = 293.66
const FD4 = 369.99
const A4 = 440
const D5 = 587.33

/**
 * Le Roi écarlate (scène ROI, 9,6 s avant le retour) : le feu s'allume dans un coup de sub-basse, des tambours
 * rituels de plus en plus pressés, ses bois qui poussent en craquant, un chœur d'hommes grave et dissonant ;
 * chacun de ses sept yeux s'ouvre sur une cloche funèbre ; puis les chaînes se tendent dans un fracas de métal
 * et un accord de cuivres écrase tout.
 */
function partitionRoi(c: AudioContext, sortie: GainNode, salle: GainNode, b: Construction) {
  const p = partition(c, sortie, salle, b)
  // Le feu prend : coup sourd, souffle qui s'envole, brasier qui gronde de plus en plus
  p.impact(0, 1.1)
  p.son(0.05, 'souffle', { gain: 0.7, vitesse: 0.8, r: 0.4 })
  p.nappe('feu', 1, [
    [0.3, 0.25],
    [2, 0.6],
    [8.4, 0.85],
    [9.8, 0.0001],
  ])
  p.nappe('feu', 0.55, [
    [0.5, 0.15],
    [8.4, 0.45],
    [9.8, 0.0001],
  ])
  // Une basse en triton (ré, sol dièse) dont le filtre s'ouvre lentement : la menace monte
  p.bourdon(
    [D1, D1 * 1.414, D2, D2 * 1.006],
    'sawtooth',
    [
      [0, 110],
      [5.4, 380],
      [8.4, 1100],
      [9.6, 300],
    ],
    [
      [0.2, 0.06],
      [5.4, 0.12],
      [8.4, 0.2],
      [9.9, 0.0001],
    ],
  )
  // Un chœur d'hommes, « oh », grave et dissonant (la seconde mineure en haut)
  p.choeur(
    [D2, A2, D3, F3, F3 * 1.0595],
    [
      [2.6, 0.0001],
      [4.2, 0.05],
      [6.0, 0.09],
      [8.4, 0.16],
      [9.9, 0.0001],
    ],
    VOYELLE_OH,
  )
  // Tambours rituels : ils accompagnent la croissance puis se pressent quand les yeux s'ouvrent
  for (const [t, g] of [
    [1.8, 0.7],
    [3.0, 0.75],
    [4.2, 0.8],
    [5.4, 1],
    [6.0, 0.7],
    [6.35, 0.7],
    [6.65, 0.75],
    [6.9, 0.8],
    [7.1, 0.85],
    [7.28, 0.9],
    [7.42, 1],
  ])
    p.son(t, 'tambour', { gain: g, vitesse: 0.92 + Math.random() * 0.1, r: 0.45, pan: (Math.random() - 0.5) * 0.3 })
  p.impact(5.4, 1)
  // Les bois poussent et se ramifient en craquant, tout autour
  for (let t = 3.0; t < 5.6; t += 0.2 + Math.random() * 0.12)
    p.son(t, 'craquement', { gain: 0.35, vitesse: 0.7 + Math.random() * 0.6, pan: (Math.random() - 0.5) * 1.4, r: 0.35 })
  // Les sept yeux : une cloche funèbre par œil, de plus en plus grave, et un souffle humide
  for (let i = 0; i < 7; i++) {
    const t = 6.05 + i * 0.2
    p.cloche(t, [392, 370, 349, 330, 311, 294, 277][i] / 2, 0.05, 2.4)
    p.son(t, 'goutte', { gain: 0.18, vitesse: 0.35, r: 0.6, pan: i % 2 ? 0.4 : -0.4 })
  }
  // Les chaînes : des volées de maillons, le métal qui se tend en gémissant, puis le fracas
  for (const t of [7.6, 7.9, 8.15])
    for (let i = 0; i < 9; i++)
      p.son(t + i * 0.03 + Math.random() * 0.015, 'maillon', { gain: 0.3, vitesse: 0.6 + Math.random() * 0.35, pan: (Math.random() - 0.5) * 1.2, r: 0.5 })
  p.note(7.6, 210, { duree: 0.7, gain: 0.05, type: 'sawtooth', glisse: 95, attaque: 0.08, filtre: { de: 900, a: 500, q: 9, type: 'bandpass' }, r: 0.5 })
  p.impact(7.95, 1)
  p.impact(8.2, 1.2)
  // L'accord final : des cuivres en ré mineur, avec la seconde qui grince
  p.braam(8.4, [D2, A2, D3, F3, F3 * 1.0595], 0.9, 0.3)
}

/**
 * Le Gate Guardian (scène GARDIEN, 9,2 s) : la pierre gronde, une lumière de cristal grandit dans la porte, qui
 * s'ouvre d'un coup ; le chœur céleste entre et enfle, les trompettes de l'Apocalypse sonnent ; ses ailes battent
 * dans un souffle immense, le feu rugit ; son œil s'ouvre sur un cri de cristal et le chœur se déchire, la couronne
 * se pose en carillon, et les cuivres concluent.
 */
function partitionGardien(c: AudioContext, sortie: GainNode, salle: GainNode, b: Construction) {
  const p = partition(c, sortie, salle, b)
  // La porte : la pierre gronde, une lumière de cristal grandit
  p.son(0, 'grondement', { gain: 0.9, r: 0.4 })
  for (const [f, g] of [
    [1760, 0.012],
    [2217, 0.01],
    [2637, 0.008],
    [3520, 0.005],
  ])
    p.note(0.2, f, { duree: 1.2, gain: g, attaque: 1.1, relache: 2.2, vibrato: [7, 0.004, 0.6], r: 0.8 })
  p.impact(1.55, 1.3)
  p.son(1.55, 'souffle', { gain: 0.6, vitesse: 0.6, r: 0.7 })
  // Le chœur céleste : il entre quand la porte s'ouvre et enfle avec la lumière
  p.choeur(
    [D3, FD3, A3, D4, FD4, A4, D5],
    [
      [1.5, 0.0001],
      [2.6, 0.05],
      [4.0, 0.1],
      [6.3, 0.12],
      [6.6, 0.2],
      [8.6, 0.13],
      [9.6, 0.0001],
    ],
  )
  p.bourdon(
    [D2, A2],
    'triangle',
    [
      [0, 200],
      [4, 600],
    ],
    [
      [1.5, 0.05],
      [6.6, 0.1],
      [9.6, 0.0001],
    ],
  )
  // Première trompette : ré, la, ré
  p.trompette(2.8, D4, 0.25, 0.05)
  p.trompette(3.15, A4, 0.25, 0.05)
  p.trompette(3.5, D5, 1.0, 0.06)
  // La lumière envahit tout : un souffle clair, des cloches cristallines
  p.son(3.6, 'souffle', { gain: 0.4, vitesse: 1.6, r: 0.8 })
  for (let i = 0; i < 8; i++) p.cloche(3.8 + i * 0.12, [1175, 1397, 1760, 2349][i % 4], 0.012, 1.6, 0.8)
  // Les six ailes battent, par paires, de part et d'autre
  for (const [t, pan] of [
    [4.85, -0.6],
    [5.2, 0.6],
    [5.55, 0],
  ])
    p.son(t, 'aile', { gain: 0.9, vitesse: 0.75, pan, r: 0.5 })
  // Le feu jaillit
  p.son(5.0, 'souffle', { gain: 0.8, vitesse: 0.45, r: 0.5 })
  p.nappe('feu', 0.8, [
    [4.9, 0.0001],
    [5.2, 0.7],
    [6.4, 0.35],
    [9.2, 0.0001],
  ])
  // L'œil s'ouvre : un cri de cristal qui monte, deux cordes qui battent l'une contre l'autre
  p.note(6.2, 2349, { duree: 0.5, gain: 0.02, attaque: 0.3, relache: 1.5, glisse: 2793, r: 0.7 })
  p.note(6.2, 2380, { duree: 0.5, gain: 0.015, attaque: 0.3, relache: 1.5, glisse: 2830, r: 0.7 })
  // Le chœur se déchire (une seconde mineure), la deuxième trompette, plus haute
  p.choeur(
    [D4 * 1.0595, A4 * 1.0595],
    [
      [6.55, 0.0001],
      [6.65, 0.08],
      [7.6, 0.03],
      [8.4, 0.0001],
    ],
  )
  p.trompette(6.6, A4, 0.25, 0.06)
  p.trompette(6.95, D5, 0.25, 0.06)
  p.trompette(7.3, FD4 * 2, 1.2, 0.07)
  p.impact(6.6, 0.8)
  // La couronne se pose : un carillon
  for (const [i, f] of [587, 880, 1175, 1760].entries()) p.cloche(7.0 + i * 0.07, f, 0.04, 3)
  // Les cuivres concluent, en majeur
  p.braam(7.6, [D2, A2, D3, FD3], 1.1, 0.26)
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
  // Les partitions des cinématiques, calées sur leur scène
  roi: partitionRoi,
  gardien: partitionGardien,
  // Un bureau la nuit : le silence, une horloge
  bureau: (c, sortie, _salle, b) => {
    bourdon(c, sortie, [50], 'sine', 200, 0.02, b)
    let tic = 0
    repeter(1, () => lire('touche', { gain: 0.12, vitesse: tic++ % 2 ? 0.55 : 0.6, r: 0.3 }), b)
  },
}

/** Une partition commence net (son premier coup tombe à l'instant 0) ; une ambiance monte en 1,5 s */
const ENTREE: Record<string, number> = { roi: 0.02, gardien: 0.02 }

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
    g.gain.exponentialRampToValueAtTime(1, c.currentTime + (ENTREE[nom] ?? 1.5))
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
