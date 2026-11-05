/**
 * L'image à partager d'une carte : un visuel au format portrait (1080 × 1350, celui des réseaux sociaux) avec la carte,
 * sa rareté, sa variante, son numéro, l'agent qui l'a ouverte et l'adresse du jeu. Dessinée dans un canvas, sans
 * bibliothèque ; l'illustration vient de la vignette (wsrv.nl autorise son dessin), sinon le symbole de la Fondation.
 */
import { RARETES, TYPES, designation, type Base } from '../data/catalogue'
import { signature } from '../data/mythiques'
import { EDITION_MYTHIQUE } from '../engine/boosters'
import { PAR_ID, type IdVariante } from '../engine/variantes'
import type { Carte } from '../types'

const L = 1080
const H = 1350
const SITE = 'scp-masters.vercel.app'

function chargerImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resoudre) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.referrerPolicy = 'no-referrer'
    const fin = setTimeout(() => resoudre(null), 6000)
    img.onload = () => {
      clearTimeout(fin)
      resoudre(img)
    }
    img.onerror = () => {
      clearTimeout(fin)
      resoudre(null)
    }
    img.src = url
  })
}

function rectangleArrondi(c: CanvasRenderingContext2D, x: number, y: number, l: number, h: number, r: number) {
  c.beginPath()
  c.moveTo(x + r, y)
  c.arcTo(x + l, y, x + l, y + h, r)
  c.arcTo(x + l, y + h, x, y + h, r)
  c.arcTo(x, y + h, x, y, r)
  c.arcTo(x, y, x + l, y, r)
  c.closePath()
}

/** Le symbole de la Fondation : deux cercles et trois flèches vers le centre */
function symbole(c: CanvasRenderingContext2D, x: number, y: number, r: number, couleur: string) {
  c.save()
  c.strokeStyle = couleur
  c.fillStyle = couleur
  c.lineWidth = r * 0.16
  c.beginPath()
  c.arc(x, y, r * 0.78, 0, Math.PI * 2)
  c.stroke()
  c.lineWidth = r * 0.12
  c.beginPath()
  c.arc(x, y, r * 0.3, 0, Math.PI * 2)
  c.stroke()
  for (const d of [-90, 30, 150]) {
    const a = (d * Math.PI) / 180
    c.beginPath()
    c.moveTo(x + Math.cos(a) * r * 0.42, y + Math.sin(a) * r * 0.42)
    c.lineTo(x + Math.cos(a + 0.33) * r, y + Math.sin(a + 0.33) * r)
    c.lineTo(x + Math.cos(a - 0.33) * r, y + Math.sin(a - 0.33) * r)
    c.closePath()
    c.fill()
  }
  c.restore()
}

/** Coupe un texte en lignes qui tiennent dans la largeur (au plus `max` lignes, la dernière abrégée) */
function lignes(c: CanvasRenderingContext2D, texte: string, largeur: number, max: number): string[] {
  const mots = texte.split(/\s+/)
  const res: string[] = []
  let ligne = ''
  for (const m of mots) {
    const essai = ligne ? `${ligne} ${m}` : m
    if (c.measureText(essai).width <= largeur || !ligne) ligne = essai
    else {
      res.push(ligne)
      ligne = m
    }
  }
  if (ligne) res.push(ligne)
  if (res.length > max) {
    const garde = res.slice(0, max)
    garde[max - 1] = `${garde[max - 1].replace(/\s+\S*$/, '')}…`
    return garde
  }
  return res
}

export async function imageDeCarte(o: { carte: Carte; base: Base; variante?: IdVariante; numero?: number; pseudo?: string }): Promise<Blob | null> {
  const { carte, base } = o
  const variante = o.variante ?? 'std'
  const rarete = RARETES[carte.ra]
  const couleur = carte.ra === 5 ? signature(carte).couleur : variante !== 'std' ? PAR_ID[variante].couleur : rarete.couleur
  await document.fonts?.ready.catch(() => undefined)
  const toile = document.createElement('canvas')
  toile.width = L
  toile.height = H
  const c = toile.getContext('2d')
  if (!c) return null
  const mono = "'IBM Plex Mono', ui-monospace, Consolas, monospace"
  const machine = "'Special Elite', 'Courier New', monospace"

  // Le fond : nuit, halo de la rareté, lignes de balayage
  c.fillStyle = '#0b0d0e'
  c.fillRect(0, 0, L, H)
  const halo = c.createRadialGradient(L / 2, H * 0.45, 50, L / 2, H * 0.45, 760)
  halo.addColorStop(0, `${couleur}55`)
  halo.addColorStop(1, 'transparent')
  c.fillStyle = halo
  c.fillRect(0, 0, L, H)
  c.fillStyle = 'rgba(255,255,255,0.025)'
  for (let y = 0; y < H; y += 6) c.fillRect(0, y, L, 2)

  // L'en-tête
  c.fillStyle = '#d23a2c'
  c.fillRect(70, 78, 14, 14)
  c.fillStyle = '#8c9692'
  c.font = `500 28px ${mono}`
  c.textBaseline = 'middle'
  c.fillText('FONDATION SCP · DOSSIER OUVERT', 100, 86)

  // La carte
  const x = 150
  const y = 150
  const l = 780
  const h = 1010
  c.save()
  c.shadowColor = `${couleur}aa`
  c.shadowBlur = 60
  rectangleArrondi(c, x, y, l, h, 30)
  c.fillStyle = couleur
  c.fill()
  c.restore()
  rectangleArrondi(c, x + 12, y + 12, l - 24, h - 24, 22)
  c.fillStyle = '#141819'
  c.fill()

  // L'illustration
  const zone = { x: x + 40, y: y + 110, l: l - 80, h: 520 }
  const url = base.vignette(carte)
  const img = url ? await chargerImage(url) : null
  c.save()
  rectangleArrondi(c, zone.x, zone.y, zone.l, zone.h, 14)
  c.clip()
  if (img) {
    const e = Math.max(zone.l / img.width, zone.h / img.height)
    c.drawImage(img, zone.x + (zone.l - img.width * e) / 2, zone.y + (zone.h - img.height * e) / 2, img.width * e, img.height * e)
  } else {
    const fond = c.createLinearGradient(zone.x, zone.y, zone.x + zone.l, zone.y + zone.h)
    fond.addColorStop(0, '#1b2022')
    fond.addColorStop(1, `${couleur}44`)
    c.fillStyle = fond
    c.fillRect(zone.x, zone.y, zone.l, zone.h)
    symbole(c, zone.x + zone.l / 2, zone.y + zone.h / 2, 150, couleur)
  }
  c.restore()

  // La désignation et le type
  c.fillStyle = '#e4e2db'
  c.font = `700 46px ${mono}`
  c.fillText(designation(carte).replace(/[«»]/g, '').trim().slice(0, 26), x + 40, y + 62)
  c.textAlign = 'right'
  c.fillStyle = TYPES[carte.k].couleur
  c.font = `600 26px ${mono}`
  c.fillText(TYPES[carte.k].court.toUpperCase(), x + l - 40, y + 62)
  c.textAlign = 'left'

  // Rareté, variante, numéro
  let ty = zone.y + zone.h + 62
  c.fillStyle = rarete.couleur
  c.font = `700 32px ${mono}`
  c.fillText(rarete.nom.toUpperCase(), x + 40, ty)
  if (variante !== 'std') {
    c.textAlign = 'right'
    c.fillStyle = PAR_ID[variante].couleur
    c.fillText(PAR_ID[variante].nom.toUpperCase(), x + l - 40, ty)
    c.textAlign = 'left'
  }
  ty += 70
  c.fillStyle = '#f3ecd8'
  c.font = `400 54px ${machine}`
  for (const ligne of lignes(c, carte.nm, l - 80, 2)) {
    c.fillText(ligne, x + 40, ty)
    ty += 64
  }
  if (carte.ra === 5 && o.numero) {
    c.font = `700 34px ${mono}`
    const t = `N° ${String(o.numero).padStart(2, '0')} / ${EDITION_MYTHIQUE}`
    const lt = c.measureText(t).width + 40
    rectangleArrondi(c, x + 40, ty - 4, lt, 56, 8)
    c.strokeStyle = '#f4c542'
    c.lineWidth = 3
    c.stroke()
    c.fillStyle = '#f4c542'
    c.fillText(t, x + 60, ty + 24)
  }

  // Le bas de la carte : menace et confinement, comme sur la carte du jeu
  c.strokeStyle = 'rgba(255,255,255,0.12)'
  c.lineWidth = 2
  c.beginPath()
  c.moveTo(x + 40, y + h - 110)
  c.lineTo(x + l - 40, y + h - 110)
  c.stroke()
  c.font = `600 30px ${mono}`
  c.fillStyle = '#e06a5a'
  c.fillText(`MENACE ${carte.atk}`, x + 40, y + h - 62)
  c.textAlign = 'right'
  c.fillStyle = '#5aa0e0'
  c.fillText(`CONFINEMENT ${carte.def}`, x + l - 40, y + h - 62)
  c.textAlign = 'left'

  // Le pied : qui l'a ouverte, et où jouer
  c.fillStyle = '#8c9692'
  c.font = `500 30px ${mono}`
  if (o.pseudo) c.fillText(`Ouvert par ${o.pseudo}`, 70, H - 110)
  symbole(c, L - 110, H - 92, 34, '#e4e2db')
  c.textAlign = 'right'
  c.fillStyle = '#e4e2db'
  c.font = `700 34px ${mono}`
  c.fillText('SCP Masters', L - 160, H - 112)
  c.fillStyle = '#f0b43c'
  c.font = `500 28px ${mono}`
  c.fillText(SITE, L - 160, H - 70)
  c.textAlign = 'left'

  return new Promise((resoudre) => toile.toBlob((b) => resoudre(b), 'image/png'))
}

/**
 * Partage l'image : la feuille de partage du téléphone si elle accepte les fichiers, sinon l'image est téléchargée.
 * Renvoie ce qui s'est passé, pour le dire au joueur.
 */
export async function partagerImage(blob: Blob, nom: string, texte: string): Promise<'partage' | 'telechargee' | 'annule'> {
  const fichier = new File([blob], `${nom}.png`, { type: 'image/png' })
  if (navigator.canShare?.({ files: [fichier] })) {
    try {
      await navigator.share({ files: [fichier], text: `${texte} https://${SITE}` })
      return 'partage'
    } catch {
      return 'annule'
    }
  }
  const lien = document.createElement('a')
  lien.href = URL.createObjectURL(blob)
  lien.download = fichier.name
  lien.click()
  setTimeout(() => URL.revokeObjectURL(lien.href), 10_000)
  return 'telechargee'
}
