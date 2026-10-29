import { useSyncExternalStore } from 'react'

/**
 * Les sons du jeu, tous synthétisés par le Web Audio API : aucun fichier à télécharger, aucune licence.
 * Le contexte audio ne naît qu'au premier geste du joueur (règle des navigateurs) ; le son se coupe d'un bouton,
 * et ce choix reste sur l'appareil.
 *
 * Deux familles : des sons ponctuels (jouer.xxx) et des ambiances qui durent tant qu'une scène est à l'écran
 * (ambiance(...) renvoie de quoi l'arrêter en fondu).
 */

const CLE = 'scp-son'
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
let bruitBlanc: AudioBuffer | null = null

/** Crée le contexte audio (au premier geste) ; null si le son est coupé ou indisponible. */
function audio(): AudioContext | null {
  if (!actif) return null
  if (!ctx) {
    const C = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!C) return null
    ctx = new C()
    maitre = ctx.createGain()
    maitre.gain.value = 0.55
    // Un compresseur doux : les impacts et les ambiances qui se superposent ne saturent pas
    const comp = ctx.createDynamicsCompressor()
    comp.threshold.value = -16
    comp.ratio.value = 4
    maitre.connect(comp).connect(ctx.destination)
    bruitBlanc = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate)
    const d = bruitBlanc.getChannelData(0)
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
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
  if (maitre && ctx) maitre.gain.setTargetAtTime(actif ? 0.55 : 0, ctx.currentTime, 0.05)
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

// ---------- Briques ----------

interface Enveloppe {
  attaque?: number
  duree: number
  /** Volume de crête */
  gain: number
  /** Décalage (s) depuis maintenant */
  a?: number
}

function enveloppe(c: AudioContext, { attaque = 0.005, duree, gain, a = 0 }: Enveloppe) {
  const g = c.createGain()
  const t = c.currentTime + a
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(gain, t + attaque)
  g.gain.exponentialRampToValueAtTime(0.0001, t + attaque + duree)
  g.connect(maitre!)
  return { g, t, fin: t + attaque + duree + 0.05 }
}

/** Une note : oscillateur, éventuellement glissant vers `vers` Hz. */
function note(freq: number, e: Enveloppe & { type?: OscillatorType; vers?: number; detune?: number }) {
  const c = audio()
  if (!c) return
  const { g, t, fin } = enveloppe(c, e)
  const o = c.createOscillator()
  o.type = e.type ?? 'sine'
  o.frequency.setValueAtTime(freq, t)
  if (e.vers) o.frequency.exponentialRampToValueAtTime(e.vers, fin - 0.05)
  if (e.detune) o.detune.value = e.detune
  o.connect(g)
  o.start(t)
  o.stop(fin)
}

/** Un souffle de bruit filtré (passe-bande), dont la fréquence peut glisser. */
function souffle(freq: number, e: Enveloppe & { q?: number; vers?: number; filtre?: BiquadFilterType }) {
  const c = audio()
  if (!c || !bruitBlanc) return
  const { g, t, fin } = enveloppe(c, e)
  const s = c.createBufferSource()
  s.buffer = bruitBlanc
  s.loop = true
  const f = c.createBiquadFilter()
  f.type = e.filtre ?? 'bandpass'
  f.frequency.setValueAtTime(freq, t)
  if (e.vers) f.frequency.exponentialRampToValueAtTime(e.vers, fin - 0.05)
  f.Q.value = e.q ?? 1
  s.connect(f).connect(g)
  s.start(t, Math.random())
  s.stop(fin)
}

/** Un son métallique : des partiels inharmoniques qui s'éteignent (chaîne, cloche, ogive). */
function metal(base: number, e: Enveloppe) {
  for (const [r, v] of [
    [1, 1],
    [2.76, 0.6],
    [5.4, 0.4],
    [8.93, 0.25],
  ])
    note(base * r, { ...e, gain: e.gain * v, duree: e.duree / Math.sqrt(r) })
}

// ---------- Sons ponctuels ----------

export const jouer = {
  /** Le scellé qui se brise et le papier qui se déchire */
  dechirure() {
    note(140, { duree: 0.18, gain: 0.35, type: 'triangle', vers: 60 })
    for (let i = 0; i < 7; i++) souffle(2400 + Math.random() * 2000, { a: 0.04 + i * 0.05, duree: 0.06, gain: 0.18, q: 2 })
    souffle(900, { a: 0.05, duree: 0.45, gain: 0.12, vers: 3000, q: 0.7 })
  },
  /** Une carte qu'on retourne, puis sa rareté qui sonne */
  retourner(ra: number, variante = false) {
    souffle(600, { duree: 0.16, gain: 0.16, vers: 2600, q: 0.8 })
    const gammes = [[], [784], [784, 988], [659, 880, 1175], [523, 784, 1047, 1319, 1568]]
    const notes = gammes[Math.min(ra, 4)] ?? []
    notes.forEach((f, i) => note(f, { a: 0.08 + i * 0.07, duree: 0.6 + ra * 0.15, gain: 0.12, type: 'triangle' }))
    if (ra >= 4) metal(1568, { a: 0.4, duree: 1.4, gain: 0.08 })
    if (variante) for (let i = 0; i < 6; i++) note(2000 + i * 260, { a: 0.1 + i * 0.05, duree: 0.25, gain: 0.05 })
  },
  /** La montée avant une Épique ou une variante */
  suspense() {
    souffle(300, { attaque: 0.8, duree: 0.15, gain: 0.14, vers: 4000, q: 1.2 })
    note(110, { attaque: 0.8, duree: 0.2, gain: 0.12, type: 'sawtooth', vers: 440 })
  },
  /** La carte suivante glisse hors de l'écran */
  glisse() {
    souffle(1400, { duree: 0.2, gain: 0.07, vers: 400, q: 0.6 })
  },
  /** Une touche de machine à écrire ou de terminal */
  frappe(grave = false) {
    souffle(grave ? 1800 : 3500, { duree: 0.025, gain: 0.12, q: 3 })
    note(grave ? 90 : 160, { duree: 0.04, gain: 0.08, type: 'square' })
  },
  /** Un mot décrypté */
  decrypte() {
    note(1200 + Math.random() * 600, { duree: 0.05, gain: 0.05, type: 'square' })
  },
  /** Le tampon qui s'abat */
  tampon() {
    note(95, { duree: 0.35, gain: 0.5, type: 'sine', vers: 45 })
    souffle(500, { duree: 0.12, gain: 0.3, q: 0.5 })
  },
  /** L'éclair blanc, juste avant la carte */
  eclair() {
    souffle(4000, { attaque: 0.02, duree: 0.7, gain: 0.15, vers: 800, q: 0.4 })
    metal(2093, { duree: 1.2, gain: 0.06 })
  },
  /** Le coup sourd d'une scène (une main qui s'abat, des chaînes qui se tendent) */
  impact(grave = 55) {
    note(grave, { duree: 0.7, gain: 0.6, vers: grave * 0.6 })
    souffle(180, { duree: 0.4, gain: 0.25, q: 0.6, filtre: 'lowpass' })
  },
  /** Des chaînes qui claquent */
  chaine() {
    for (let i = 0; i < 4; i++) metal(620 + Math.random() * 200, { a: i * 0.06, duree: 0.35, gain: 0.07 })
  },
  /** Une ligne qui paraît dans la brume d'un prélude */
  brume() {
    souffle(700, { attaque: 0.5, duree: 1.2, gain: 0.06, vers: 300, q: 0.6 })
    note(220, { attaque: 0.6, duree: 1.4, gain: 0.04, type: 'sine' })
  },
  /** Une plume qui gratte le papier */
  plume() {
    for (let i = 0; i < 10; i++) souffle(3000 + Math.random() * 1500, { a: i * 0.12 + Math.random() * 0.05, duree: 0.09, gain: 0.04, q: 4 })
  },
  /** Le béton qui racle */
  raclement() {
    souffle(220, { attaque: 0.05, duree: 0.35, gain: 0.35, q: 2.5, vers: 160 })
    souffle(90, { attaque: 0.05, duree: 0.3, gain: 0.25, filtre: 'lowpass' })
  },
  /** Un plantage : un grésillement numérique */
  plantage() {
    for (let i = 0; i < 12; i++) note(80 + Math.random() * 2000, { a: i * 0.04, duree: 0.03, gain: 0.08, type: 'square' })
    souffle(2000, { duree: 1, gain: 0.1, q: 0.3 })
  },
  /** Un bip de moniteur */
  bip(freq = 980) {
    note(freq, { duree: 0.12, gain: 0.08 })
  },
  /** Une goutte dans la cuve */
  goutte() {
    note(1400 + Math.random() * 500, { duree: 0.15, gain: 0.07, vers: 500 })
  },
}

// ---------- Ambiances ----------

export interface Ambiance {
  /** Arrête l'ambiance en fondu */
  arreter: () => void
}

/** Une couche continue : des oscillateurs et/ou du bruit filtré, avec un fondu d'entrée. */
function couche(
  c: AudioContext,
  sortie: GainNode,
  {
    oscillateurs = [],
    bruit,
    gain,
    lfo,
  }: {
    oscillateurs?: [number, OscillatorType][]
    bruit?: { freq: number; q?: number; filtre?: BiquadFilterType }
    gain: number
    /** Modulation lente du volume : [fréquence (Hz), profondeur 0 à 1] */
    lfo?: [number, number]
  },
) {
  const g = c.createGain()
  g.gain.value = gain
  g.connect(sortie)
  const sources: AudioScheduledSourceNode[] = []
  for (const [f, type] of oscillateurs) {
    const o = c.createOscillator()
    o.type = type
    o.frequency.value = f
    o.connect(g)
    o.start()
    sources.push(o)
  }
  if (bruit && bruitBlanc) {
    const s = c.createBufferSource()
    s.buffer = bruitBlanc
    s.loop = true
    const f = c.createBiquadFilter()
    f.type = bruit.filtre ?? 'bandpass'
    f.frequency.value = bruit.freq
    f.Q.value = bruit.q ?? 1
    s.connect(f).connect(g)
    s.start()
    sources.push(s)
  }
  if (lfo) {
    const o = c.createOscillator()
    o.frequency.value = lfo[0]
    const p = c.createGain()
    p.gain.value = gain * lfo[1]
    o.connect(p).connect(g.gain)
    o.start()
    sources.push(o)
  }
  return sources
}

/** Les ambiances, par nom : chacune est un fond continu et des événements répétés. */
const AMBIANCES: Record<string, { couches: Parameters<typeof couche>[2][]; repete?: [number, () => void][] }> = {
  // Un brasier grave, des braises qui crépitent
  brasier: {
    couches: [
      {
        oscillateurs: [
          [55, 'sawtooth'],
          [55.6, 'sawtooth'],
        ],
        gain: 0.05,
        lfo: [0.2, 0.4],
      },
      { bruit: { freq: 400, filtre: 'lowpass' }, gain: 0.08, lfo: [0.7, 0.5] },
    ],
    repete: [[0.18, () => Math.random() < 0.5 && souffle(2500 + Math.random() * 3000, { duree: 0.02, gain: 0.12, q: 5 })]],
  },
  // Un chœur lointain, en la mineur, qui respire
  choeur: {
    couches: [
      {
        oscillateurs: [
          [220, 'sine'],
          [261.6, 'sine'],
          [329.6, 'sine'],
          [440.5, 'triangle'],
        ],
        gain: 0.035,
        lfo: [0.15, 0.5],
      },
    ],
  },
  // Une alarme qui tourne, et des pas lourds
  alarme: {
    couches: [{ oscillateurs: [[70, 'sawtooth']], gain: 0.04 }],
    repete: [
      [1.6, () => note(620, { attaque: 0.3, duree: 0.6, gain: 0.07, type: 'square', vers: 880 })],
      [0.55, () => note(70, { duree: 0.12, gain: 0.25, vers: 45 })],
    ],
  },
  // Un orgue grave, comme une salle d'archives immense
  orgue: {
    couches: [
      {
        oscillateurs: [
          [65.4, 'sine'],
          [98, 'sine'],
          [130.8, 'triangle'],
        ],
        gain: 0.05,
        lfo: [0.1, 0.3],
      },
    ],
  },
  // Le bourdonnement des machines, le cœur sur le moniteur
  machines: {
    couches: [
      {
        oscillateurs: [
          [50, 'sawtooth'],
          [100, 'sine'],
        ],
        gain: 0.03,
      },
    ],
    repete: [[1.3, () => jouer.bip()]],
  },
  // La chambre noire : un ronronnement, des gouttes
  chambre: {
    couches: [{ bruit: { freq: 200, filtre: 'lowpass' }, gain: 0.05 }],
    repete: [[0.9, () => Math.random() < 0.6 && jouer.goutte()]],
  },
  // Un néon qui grésille
  neon: {
    couches: [{ oscillateurs: [[120, 'square']], gain: 0.012, lfo: [7, 0.8] }],
  },
  // Une page qui frémit : un souffle, des chuchotements
  page: {
    couches: [{ bruit: { freq: 1800, q: 0.7 }, gain: 0.025, lfo: [0.3, 0.8] }],
    repete: [[0.7, () => Math.random() < 0.4 && souffle(1200 + Math.random() * 2000, { attaque: 0.2, duree: 0.4, gain: 0.04, q: 6 })]],
  },
  // Le silence d'un bureau, une horloge
  bureau: {
    couches: [{ bruit: { freq: 300, filtre: 'lowpass' }, gain: 0.02 }],
    repete: [[1, () => souffle(4000, { duree: 0.015, gain: 0.08, q: 8 })]],
  },
}

/** Lance une ambiance (rien si le son est coupé) ; l'arrêter la fait disparaître en fondu. */
export function ambiance(nom: string): Ambiance {
  const c = audio()
  const def = AMBIANCES[nom]
  if (!c || !maitre || !def) return { arreter: () => undefined }
  const sortie = c.createGain()
  sortie.gain.setValueAtTime(0.0001, c.currentTime)
  sortie.gain.exponentialRampToValueAtTime(1, c.currentTime + 1.2)
  sortie.connect(maitre)
  const sources = def.couches.flatMap((d) => couche(c, sortie, d))
  const minuteries = (def.repete ?? []).map(([p, f]) => window.setInterval(f, p * 1000))
  return {
    arreter: () => {
      minuteries.forEach(clearInterval)
      sortie.gain.setTargetAtTime(0.0001, c.currentTime, 0.3)
      window.setTimeout(() => {
        sources.forEach((s) => s.stop())
        sortie.disconnect()
      }, 1600)
    },
  }
}

/** Planifie des sons à des instants (s) donnés ; renvoie de quoi tout annuler. */
export function planifier(evenements: [number, () => void][]): () => void {
  const ids = evenements.map(([t, f]) => window.setTimeout(f, t * 1000))
  return () => ids.forEach(clearTimeout)
}
