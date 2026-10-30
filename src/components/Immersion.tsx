import { useEffect, useRef, useState, type ReactNode } from 'react'
import { SceneMythique } from './ScenesMythiques'
import { ambiance, jouer, planifier } from '../state/sons'

/**
 * Le moteur des cinématiques immersives des Mythiques (à la manière des cartes immersives) : la scène occupe
 * tout l'écran, la caméra se déplace dans l'illustration pendant qu'elle se construit, puis tout revient se
 * ranger dans le cadre de la carte.
 *
 * L'illustration se construit pixel par pixel d'après sa carte des temps (outils/temps_mythiques.mjs) :
 * l'encre pousse le long du dessin, avec une lueur à son front (la couleur de sa classe), le papier blanchit
 * ensuite. Le rendu est un seul shader WebGL 2 ; sans WebGL, l'illustration s'affiche telle quelle.
 */

export interface Classe {
  /** Couleur de la lueur au front de croissance */
  couleur: string
  /** Durée de la lueur (s) */
  tau: number
  /** Intensité de la lueur (0 à 1) */
  eclat?: number
  /** Ondulation (px), comme une flamme : s'apaise avant la fin */
  ondule?: number
  /** 1 : une photographie qui se développe (du blanc vers l'image) */
  photo?: boolean
}

/** Valeurs animées par images clés [instant, valeur] */
export type Piste = 'porte' | 'porteEch' | 'lumiere' | 'rouge' | 'eau' | 'efface' | 'alarme' | 'braise' | 'noir'

export interface SceneImmersive {
  /** Carte des temps : public/immersion/<nom>.png */
  nom: string
  /** L'illustration finale, relative à la racine du site */
  image: string
  /** Début du retour dans la carte (il dure RETOUR s) */
  retour: number
  /** Décor derrière l'illustration : 0 nuit, 1 brasier, 2 porte, 3 mur, 4 papier, 5 cuve de révélateur, 6 page écrite */
  fond: { mode: number; c1: string; c2: string }
  classes: Classe[]
  /** Caméra : [instant, x, y, zoom] (coordonnées de l'image ; zoom 1 : l'image entière à l'écran) */
  camera: [number, number, number, number][]
  /** Secousses : [instant, force en px de l'image] */
  secousses?: [number, number][]
  /** Fenêtre où le temps de construction avance par saccades (un vieux moniteur) */
  saccade?: [number, number]
  pistes?: Partial<Record<Piste, [number, number][]>>
  /** Dessiné par-dessus, dans les coordonnées de l'image (suit la caméra) ; animations CSS à partir du début */
  dessus?: (l: number, h: number) => ReactNode
  /** Calque plein écran par-dessus la toile (avant-scène), animations CSS à partir du début */
  avant?: ReactNode
  /** La toile n'apparaît qu'à cet instant (une avant-scène la précède) */
  debutToile?: number
  /** Recadrage de la carte [x, y, largeur, hauteur] : le retour se pose exactement sur ce cadre (SCP-173) */
  cadreCarte?: [number, number, number, number]
  /** Le son : une ambiance (state/sons.ts), des sons à des instants donnés ; les secousses font un impact
   * (ou un raclement), sauf `secoue: false` */
  son?: { ambiance: string; evenements?: [number, () => void][]; secoue?: 'impact' | 'raclement' | false }
}

/** Durée du retour dans la carte (s) */
export const RETOUR = 0.8
export const dureeScene = (s: SceneImmersive) => s.retour + RETOUR

// ---------- Chargement ----------

const BASE = import.meta.env.BASE_URL
const bitmaps = new Map<string, Promise<ImageBitmap>>()
const bitmap = (url: string) => {
  let p = bitmaps.get(url)
  if (!p) {
    // Les octets de la carte des temps sont des données : aucune conversion de couleur
    p = fetch(`${BASE}${url}`)
      .then((r) => (r.ok ? r.blob() : Promise.reject(new Error(url))))
      .then((b) => createImageBitmap(b, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' }))
    p.catch(() => bitmaps.delete(url))
    bitmaps.set(url, p)
  }
  return p
}
/** Charge d'avance l'illustration et sa carte des temps (dès qu'on sait qu'une Mythique arrive). */
export const prechargerScene = (s: SceneImmersive) => Promise.all([bitmap(s.image), bitmap(`immersion/${s.nom}.png`)]).catch(() => undefined)

// ---------- Outils ----------

const lisse = (x: number) => x * x * (3 - 2 * x)
/** Valeur d'une piste à l'instant t (interpolation douce entre images clés). */
function valeur(cles: [number, number, ...number[]][] | undefined, t: number, defaut = 0): number[] {
  if (!cles?.length) return [defaut]
  if (t <= cles[0][0]) return cles[0].slice(1)
  for (let i = 1; i < cles.length; i++) {
    const [t1] = cles[i]
    if (t <= t1) {
      const a = cles[i - 1]
      const b = cles[i]
      const k = lisse((t - a[0]) / (t1 - a[0]))
      return a.slice(1).map((v, j) => v + (b[j + 1] - v) * k)
    }
  }
  return cles[cles.length - 1].slice(1)
}
const hex = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16) / 255)
const hash = (n: number) => {
  const s = Math.sin(n * 127.1) * 43758.5453
  return s - Math.floor(s)
}

// ---------- Le shader ----------

const SOMMETS = `#version 300 es
in vec2 a;
void main() { gl_Position = vec4(a, 0.0, 1.0); }`

const PIXELS = `#version 300 es
precision highp float;
uniform sampler2D u_img, u_temps;
uniform vec2 u_taille, u_ecran;
uniform vec3 u_cam;
uniform float u_t, u_tr, u_fin, u_vignette, u_sortie, u_glitch;
uniform int u_fond;
uniform vec3 u_c1, u_c2;
uniform vec3 u_couleur[8];
uniform float u_tau[8], u_eclat[8], u_ondule[8], u_photo[8];
uniform float u_porte, u_porteEch, u_lumiere, u_rouge, u_eau, u_efface, u_alarme, u_braise, u_noir;
out vec4 sortie;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float bruit(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * bruit(p); p *= 2.03; a *= 0.5; }
  return v;
}

vec3 fond(vec2 p) {
  vec2 q = p / u_taille.y;
  if (u_fond == 1) {
    // Brasier : des flammes montent du bas, des braises s'envolent
    float haut = 1.0 - q.y;
    float n = fbm(vec2(q.x * 3.5, q.y * 2.6 + u_t * 0.9));
    float f = clamp(n * 1.4 - haut * 1.15 + u_braise * 0.85 - 0.25, 0.0, 1.0);
    vec3 c = mix(u_c1, u_c2, f) + vec3(1.0, 0.55, 0.15) * pow(f, 3.0) * 0.5;
    vec2 e = vec2(p.x, p.y + u_t * 110.0) / 16.0;
    vec2 ie = floor(e);
    float s = step(0.965, hash(ie)) * smoothstep(0.3, 0.0, length(fract(e) - 0.5 - (vec2(hash(ie + 3.1), hash(ie + 7.7)) - 0.5) * 0.5));
    return c + vec3(1.0, 0.5, 0.15) * s * u_braise * (0.4 + haut);
  }
  if (u_fond == 2) {
    // Une porte de lumière dans le noir ; en s'ouvrant, sa lumière envahit la pièce
    vec2 base = vec2(u_taille.x * 0.5, u_taille.y);
    vec2 d = (p - base) / u_porteEch + base;
    float demi = u_taille.x * 0.15, haut = u_taille.y * 0.9;
    float dx = abs(d.x - base.x);
    float dedans = step(dx, demi * u_porte) * step(base.y - haut, d.y) * step(d.y, base.y);
    float cadre = step(dx, demi + 10.0) * step(base.y - haut - 10.0, d.y) * (1.0 - step(dx, demi) * step(base.y - haut, d.y));
    float dist = length(max(vec2(dx - demi * u_porte, (base.y - haut) - d.y), 0.0)) * u_porteEch;
    float halo = u_porte * 0.55 * exp(-dist / (u_taille.x * 0.07)) + u_lumiere * exp(-dist / (u_taille.x * 0.8));
    float rayons = u_lumiere * 0.15 * pow(bruit(vec2(atan(p.y - base.y, p.x - base.x) * 9.0, u_t * 0.3)), 3.0);
    vec3 c = mix(u_c1, u_c2, clamp(max(dedans, halo + rayons), 0.0, 1.0));
    return mix(c, vec3(0.02), cadre * (1.0 - u_lumiere) * 0.8);
  }
  if (u_fond == 3) {
    // Un mur de béton, balayé par le gyrophare
    float g = 0.27 + fbm(p * 0.018) * 0.16 + (hash(floor(p * 0.7)) - 0.5) * 0.05;
    vec3 c = vec3(g, g * 0.97, g * 0.94) * (0.5 + u_lumiere * 0.5);
    float ang = atan(p.y - u_taille.y * 0.5, p.x - u_taille.x * 0.5);
    float faisceau = pow(max(0.0, cos(ang - u_t * 3.2)), 10.0);
    return c + vec3(0.75, 0.04, 0.02) * faisceau * u_alarme + vec3(0.2, 0.0, 0.0) * u_alarme * (0.5 + 0.5 * sin(u_t * 6.0));
  }
  if (u_fond == 4) {
    // Papier ancien, taché
    return u_c1 * (0.9 + fbm(p * 0.008) * 0.14) - vec3(hash(floor(p)) * 0.03);
  }
  if (u_fond == 6) {
    // Une page de récit : des lignes de mots (u_c2) sur un papier (u_c1)
    vec3 c = u_c1 * (0.93 + fbm(p * 0.008) * 0.1);
    float rang = floor(p.y / 30.0);
    float y = mod(p.y, 30.0);
    float decalage = hash(vec2(rang, 3.0)) * 40.0;
    float mot = floor((p.x + decalage) / 26.0);
    float lettre = step(4.0, mod(p.x + decalage, 26.0)) * step(0.22, hash(vec2(mot, rang)));
    float encre = step(13.0, y) * step(y, 19.0) * lettre * step(30.0, p.x) * step(p.x, u_taille.x - 30.0);
    return mix(c, u_c2, encre * 0.6);
  }
  if (u_fond == 5) {
    // Le révélateur dans la cuve, sous la lampe inactinique
    float r = fbm(p * 0.006 + vec2(u_t * 0.05, 0.0));
    return u_c1 * (0.55 + 0.6 * r) + u_c2 * pow(bruit(p * 0.02 + u_t * 0.4), 6.0) * u_eau;
  }
  // Nuit ; la lumière revient (en grésillant) avec u_lumiere
  return mix(u_c1, u_c2, u_lumiere);
}

vec2 temps(vec2 p, float bande) {
  vec2 uv = (floor(p) + 0.5) / u_taille;
  vec4 a = texture(u_temps, vec2(uv.x, (uv.y + bande) / 3.0));
  return vec2((a.r * 65280.0 + a.g * 255.0) / 1000.0, a.b * 255.0);
}

void main() {
  vec2 f = vec2(gl_FragCoord.x, u_ecran.y - gl_FragCoord.y);
  // Un vieil écran qui décroche : la ligne glisse
  f.x += u_glitch * (hash(vec2(floor(f.y / 6.0), floor(u_t * 20.0))) - 0.5) * 40.0 * step(0.85, hash(vec2(floor(f.y / 30.0), floor(u_t * 9.0))));
  vec2 p = (f - u_ecran * 0.5) / u_cam.z + u_cam.xy;
  if (u_eau > 0.0) p += u_eau * vec2(sin(p.y * 0.05 + u_t * 3.0), cos(p.x * 0.045 + u_t * 2.6)) * 3.0;
  vec3 col;
  bool dedans = p.x >= 0.0 && p.y >= 0.0 && p.x < u_taille.x && p.y < u_taille.y;
  if (!dedans) {
    // Hors de l'illustration, le décor continue ; le brasier, lui, s'y assombrit (le bas de l'image est coupé net)
    col = fond(p) * (u_fond == 1 ? 0.6 : 1.0) * (1.0 - u_sortie);
  } else {
    int c = int(temps(p, 0.0).y + 0.5);
    // Les flammes ondulent tant qu'elles brûlent
    float on = u_ondule[c] * (1.0 - smoothstep(u_fin - 1.2, u_fin, u_t));
    if (on > 0.0) {
      p += vec2(bruit(p * 0.035 + vec2(0.0, u_t * 2.4)) - 0.5, bruit(p * 0.035 + vec2(5.2, u_t * 3.1)) - 0.5) * on * 2.0;
      p = clamp(p, vec2(0.0), u_taille - 1.0);
    }
    vec3 orig = texture(u_img, p / u_taille).rgb;
    float lum = dot(orig, vec3(0.299, 0.587, 0.114));
    vec2 e = temps(p, 0.0);
    vec2 pa = temps(p, 1.0);
    float t = u_tr;
    if (u_photo[c] > 0.5) {
      // Le tirage se développe : du papier blanc vers l'image, les ombres d'abord ; puis il s'efface un instant
      vec3 blanc = vec3(0.95, 0.94, 0.9);
      col = mix(blanc, orig, smoothstep(e.x, e.x + 1.3, t));
      col = mix(col, blanc, u_efface * (1.0 - lum));
    } else {
      // Papier : le décor, puis noir (couvert par l'encre) pendant pa.y × 50 ms, puis blanc (avec sa lueur)
      vec3 base = fond(p);
      float noir = pa.y * 0.05;
      if (t >= pa.x - noir && noir > 0.0) base = mix(base, vec3(0.012), smoothstep(0.0, 0.05, t - (pa.x - noir)));
      if (t >= pa.x) {
        float k = u_eclat[c] * exp(-(t - pa.x) / u_tau[c]);
        base = mix(base, mix(vec3(1.0), u_couleur[c] * 1.4, clamp(k, 0.0, 1.0)), smoothstep(0.0, 0.05, t - pa.x));
      }
      // Encre : posée sur le papier, avec la transparence de l'original (bords lisses), lueur au front
      float a = (1.0 - lum) * smoothstep(0.0, 0.04, t - e.x);
      float k = u_eclat[c] * exp(-max(t - e.x, 0.0) / u_tau[c]);
      vec3 encre = mix(vec3(0.0), u_couleur[c] * 1.3, clamp(k, 0.0, 1.0));
      col = mix(base, encre, a);
    }
    // À la fin, l'original exact
    col = mix(col, orig, smoothstep(u_fin, u_fin + 0.5, u_t));
  }
  col *= mix(vec3(1.0), vec3(1.0, 0.3, 0.22), u_rouge);
  // Le noir : une lumière qui grésille, un œil qui cligne
  col *= 1.0 - u_noir;
  vec2 s = f / u_ecran - 0.5;
  col *= 1.0 - u_vignette * 0.55 * dot(s, s) * 2.0;
  col += (hash(f + fract(u_t) * 91.0) - 0.5) * 0.035 * u_vignette;
  sortie = vec4(col, 1.0);
}`

function programme(gl: WebGL2RenderingContext) {
  const shader = (type: number, src: string) => {
    const s = gl.createShader(type)!
    gl.shaderSource(s, src)
    gl.compileShader(s)
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'shader')
    return s
  }
  const p = gl.createProgram()!
  gl.attachShader(p, shader(gl.VERTEX_SHADER, SOMMETS))
  gl.attachShader(p, shader(gl.FRAGMENT_SHADER, PIXELS))
  gl.linkProgram(p)
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? 'programme')
  return p
}

function texture(gl: WebGL2RenderingContext, unite: number, image: ImageBitmap, lineaire: boolean) {
  const tx = gl.createTexture()
  gl.activeTexture(gl.TEXTURE0 + unite)
  gl.bindTexture(gl.TEXTURE_2D, tx)
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false)
  gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image)
  const filtre = lineaire ? gl.LINEAR : gl.NEAREST
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filtre)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filtre)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
}

/** Le cadre de la carte au centre d'un écran L × H (le même que celui de la cinématique). */
function cadreCarte(L: number, H: number) {
  const l = Math.min(L * 0.82, H * 0.58 * (200 / 280), 420)
  const h = (l * 280) / 200
  return { x: (L - l) / 2, y: (H - h) / 2, l, h }
}

// ---------- Le composant ----------

/** `fige` : la scène arrêtée à cet instant (pour l'atelier). */
export function Immersion({ id, scene, fige }: { id: string; scene: SceneImmersive; fige?: number }) {
  const toile = useRef<HTMLCanvasElement>(null)
  const cadre = useRef<HTMLDivElement>(null)
  const bord = useRef<HTMLDivElement>(null)
  const dessus = useRef<SVGSVGElement>(null)
  const [taille, setTaille] = useState<{ l: number; h: number } | null>(null)
  const [echec, setEchec] = useState(false)

  useEffect(() => {
    let fini = false
    let couperSon = () => {}
    let rendu = 0
    const canvas = toile.current!
    const gl = canvas.getContext('webgl2', { antialias: false, premultipliedAlpha: false })
    if (!gl) {
      setEchec(true)
      return
    }
    void Promise.all([bitmap(scene.image), bitmap(`immersion/${scene.nom}.png`)])
      .then(([img, temps]) => {
        if (fini) return
        const prog = programme(gl)
        gl.useProgram(prog)
        const tampon = gl.createBuffer()
        gl.bindBuffer(gl.ARRAY_BUFFER, tampon)
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
        const a = gl.getAttribLocation(prog, 'a')
        gl.enableVertexAttribArray(a)
        gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0)
        texture(gl, 0, img, true)
        texture(gl, 1, temps, false)
        const u = (n: string) => gl.getUniformLocation(prog, n)
        gl.uniform1i(u('u_img'), 0)
        gl.uniform1i(u('u_temps'), 1)
        // Le repère est celui de la carte des temps (l'original) ; l'image peut être plus grande (agrandie, plus nette)
        const l = temps.width
        const h = temps.height / 3
        gl.uniform2f(u('u_taille'), l, h)
        gl.uniform1i(u('u_fond'), scene.fond.mode)
        gl.uniform3fv(u('u_c1'), hex(scene.fond.c1))
        gl.uniform3fv(u('u_c2'), hex(scene.fond.c2))
        const classes = Array.from({ length: 8 }, (_, i) => scene.classes[i] ?? scene.classes[0])
        gl.uniform3fv(
          u('u_couleur'),
          classes.flatMap((c) => hex(c.couleur)),
        )
        gl.uniform1fv(
          u('u_tau'),
          classes.map((c) => c.tau),
        )
        gl.uniform1fv(
          u('u_eclat'),
          classes.map((c) => c.eclat ?? 1),
        )
        gl.uniform1fv(
          u('u_ondule'),
          classes.map((c) => c.ondule ?? 0),
        )
        gl.uniform1fv(
          u('u_photo'),
          classes.map((c) => (c.photo ? 1 : 0)),
        )
        const fin = scene.retour - 0.6
        gl.uniform1f(u('u_fin'), fin)
        const pistes: Piste[] = ['porte', 'porteEch', 'lumiere', 'rouge', 'eau', 'efface', 'alarme', 'braise', 'noir']
        const loc = Object.fromEntries(pistes.map((p) => [p, u(`u_${p}`)]))
        const lt = u('u_t')
        const ltr = u('u_tr')
        const lcam = u('u_cam')
        const lecran = u('u_ecran')
        const lvignette = u('u_vignette')
        const lsortie = u('u_sortie')
        const lglitch = u('u_glitch')
        setTaille({ l, h })
        const debut = performance.now()
        if (fige === undefined && scene.son) {
          const fond = ambiance(scene.son.ambiance)
          const secoue = scene.son.secoue ?? 'impact'
          const annuler = planifier([
            ...(scene.son.evenements ?? []),
            ...(secoue
              ? (scene.secousses ?? []).map(([ts, force]): [number, () => void] => [
                  ts,
                  () => (secoue === 'raclement' ? jouer.raclement() : jouer.impact(force > 8 ? 45 : 60)),
                ])
              : []),
            // Le retour dans la carte : l'ambiance s'efface, la carte se pose
            [scene.retour, fond.arreter],
            [scene.retour + 0.2, jouer.glisse],
          ])
          couperSon = () => {
            fond.arreter()
            annuler()
          }
        }
        const image = () => {
          if (fini) return
          const t = fige ?? (performance.now() - debut) / 1000
          // Taille de la toile : l'écran, dans la limite de 2,6 millions de pixels
          const L = canvas.clientWidth
          const H = canvas.clientHeight
          const dpr = Math.min(window.devicePixelRatio || 1, 1.5, Math.sqrt(2.6e6 / Math.max(1, L * H)))
          const cl = Math.round(L * dpr)
          const ch = Math.round(H * dpr)
          if (canvas.width !== cl || canvas.height !== ch) {
            canvas.width = cl
            canvas.height = ch
          }
          gl.viewport(0, 0, cl, ch)
          gl.uniform2f(lecran, cl, ch)
          // Caméra : les plans, puis le retour dans le cadre de la carte
          let [cx, cy, zoom] = valeur(
            scene.camera.map(([t0, ...v]) => [t0, ...v] as [number, number, number, number]),
            t,
          )
          const s0 = Math.min(L / l, H / h)
          const carte = cadreCarte(L, H)
          const r = lisse(Math.min(1, Math.max(0, (t - scene.retour) / RETOUR)))
          if (r > 0) {
            // La carte montre l'image entière, ou son recadrage (qui remplit alors tout le cadre)
            const [rx, ry, rl, rh] = scene.cadreCarte ?? [0, 0, l, h]
            const zCarte = (scene.cadreCarte ? Math.max(carte.l / rl, carte.h / rh) : Math.min(carte.l / l, carte.h / h)) / s0
            cx += (rx + rl / 2 - cx) * r
            cy += (ry + rh / 2 - cy) * r
            zoom += (zCarte - zoom) * r
          }
          // Secousses
          for (const [ts, force] of scene.secousses ?? []) {
            const dt = t - ts
            if (dt > 0 && dt < 0.6) {
              const k = force * Math.exp(-dt * 7)
              cx += Math.sin(dt * 95 + ts) * k
              cy += Math.cos(dt * 83 + ts * 2) * k
            }
          }
          const k = s0 * zoom
          gl.uniform3f(lcam, cx, cy, k * dpr)
          // Temps de construction, par saccades dans la fenêtre voulue
          let tr = t
          let glitch = 0
          if (scene.saccade && t > scene.saccade[0] && t < scene.saccade[1]) {
            const pas = Math.floor(t * 8)
            tr = pas / 8 - (hash(pas) > 0.72 ? 0.18 : 0)
            glitch = hash(pas + 0.5) > 0.8 ? 1 : 0
          }
          gl.uniform1f(lt, t)
          gl.uniform1f(ltr, tr)
          gl.uniform1f(lglitch, glitch)
          for (const p of pistes) {
            const defaut = p === 'porteEch' ? 1 : 0
            gl.uniform1f(loc[p], valeur(scene.pistes?.[p] as [number, number][] | undefined, t, defaut)[0])
          }
          gl.uniform1f(lvignette, 1 - r)
          gl.uniform1f(lsortie, r)
          gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
          // Ce qui suit la caméra, et le cadre de la carte qui se referme
          if (dessus.current) dessus.current.style.transform = `translate(${L / 2 - cx * k}px, ${H / 2 - cy * k}px) scale(${k})`
          // La fenêtre se resserre de tout l'écran jusqu'à la carte ; le cadre en suit exactement le bord,
          // il ne passe jamais par-dessus le dessin
          const [haut, droite, bas, gauche] = [carte.y * r, (L - carte.x - carte.l) * r, (H - carte.y - carte.h) * r, carte.x * r]
          if (cadre.current) {
            cadre.current.style.clipPath = r > 0 ? `inset(${haut}px ${droite}px ${bas}px ${gauche}px round ${10 * r}px)` : ''
            if (scene.debutToile !== undefined) cadre.current.style.opacity = String(Math.min(1, Math.max(0, (t - scene.debutToile) / 0.6)))
          }
          if (bord.current) {
            Object.assign(bord.current.style, {
              left: `${gauche}px`,
              top: `${haut}px`,
              width: `${L - gauche - droite}px`,
              height: `${H - haut - bas}px`,
              borderRadius: `${10 * r}px`,
              opacity: String(r),
            })
          }
          rendu = requestAnimationFrame(image)
        }
        rendu = requestAnimationFrame(image)
      })
      .catch((e) => {
        console.warn('Cinématique immersive indisponible', e)
        if (!fini) setEchec(true)
      })
    return () => {
      fini = true
      couperSon()
      cancelAnimationFrame(rendu)
      gl.getExtension('WEBGL_lose_context')?.loseContext()
    }
  }, [scene, fige])

  if (echec)
    return (
      <div className="im-repli">
        <SceneMythique id={id} />
      </div>
    )
  return (
    <div className="immersion">
      <div className="im-cadre" ref={cadre} style={scene.debutToile ? { opacity: 0 } : undefined}>
        <canvas ref={toile} className="im-toile" />
        {taille && scene.dessus && (
          <svg ref={dessus} className="im-dessus" width={taille.l} height={taille.h} viewBox={`0 0 ${taille.l} ${taille.h}`} aria-hidden="true">
            {scene.dessus(taille.l, taille.h)}
          </svg>
        )}
      </div>
      {taille && scene.avant}
      <div className="im-bord" ref={bord} aria-hidden="true" />
    </div>
  )
}
