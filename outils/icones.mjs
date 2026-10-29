// Les icônes de l'application installée (écran d'accueil d'un téléphone) : le logo de public/favicon.svg, dessiné
// en PNG à 192, 512 et 180 px (Apple), sur fond plein avec une marge, pour les masques ronds d'Android.
// Usage : node outils/icones.mjs
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { PNG } from 'pngjs'

const racine = fileURLToPath(new URL('..', import.meta.url))
const FOND = [11, 13, 14]
const TRAIT = [232, 228, 218]
const MARGE = 14

/** Le logo, dans le repère 0 à 100 du favicon : ce point est-il dans le trait ? */
function dansLogo(x, y) {
  const dx = x - 50
  const dy = y - 50
  const d = Math.hypot(dx, dy)
  // Le petit anneau
  if (Math.abs(d - 13) <= 3) return true
  // Le grand anneau en trois tirets (pointillés 64 / 15,6, tournés de -62°)
  if (Math.abs(d - 38) <= 3.5) {
    let a = Math.atan2(dy, dx) - (-62 * Math.PI) / 180
    a = ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)
    if ((a * 38) % 79.6 < 64) return true
  }
  // Les trois flèches vers le centre, tournées de 0°, 120° et 240°
  for (const deg of [0, 120, 240]) {
    const t = (-deg * Math.PI) / 180
    const px = 50 + dx * Math.cos(t) - dy * Math.sin(t)
    const py = 50 + dx * Math.sin(t) + dy * Math.cos(t)
    if (Math.abs(px - 50) <= 2.5 && py >= 10 && py <= 24) return true
    if (dansTriangle(px, py, 2.5)) return true
  }
  return false
}

/** Le triangle (43,24) (50,33) (57,24), épaissi de `e` (trait aux angles arrondis) */
function dansTriangle(x, y, e) {
  const p = [
    [43, 24],
    [50, 33],
    [57, 24],
  ]
  let dedans = true
  let dmin = Infinity
  for (let i = 0; i < 3; i++) {
    const [ax, ay] = p[i]
    const [bx, by] = p[(i + 1) % 3]
    const cross = (bx - ax) * (y - ay) - (by - ay) * (x - ax)
    if (cross > 0) dedans = false
    const l2 = (bx - ax) ** 2 + (by - ay) ** 2
    const u = Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / l2))
    dmin = Math.min(dmin, Math.hypot(x - (ax + u * (bx - ax)), y - (ay + u * (by - ay))))
  }
  return dedans || dmin <= e
}

function icone(taille, fichier) {
  const png = new PNG({ width: taille, height: taille })
  const echelle = (100 + 2 * MARGE) / taille
  const SOUS = 4
  for (let j = 0; j < taille; j++)
    for (let i = 0; i < taille; i++) {
      let n = 0
      for (let sy = 0; sy < SOUS; sy++)
        for (let sx = 0; sx < SOUS; sx++) if (dansLogo((i + (sx + 0.5) / SOUS) * echelle - MARGE, (j + (sy + 0.5) / SOUS) * echelle - MARGE)) n++
      const k = n / (SOUS * SOUS)
      const o = (j * taille + i) * 4
      for (let c = 0; c < 3; c++) png.data[o + c] = Math.round(FOND[c] + (TRAIT[c] - FOND[c]) * k)
      png.data[o + 3] = 255
    }
  writeFileSync(`${racine}public/${fichier}`, PNG.sync.write(png))
  console.log(fichier)
}

icone(192, 'icone-192.png')
icone(512, 'icone-512.png')
icone(180, 'apple-touch-icon.png')
