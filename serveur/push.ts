/**
 * Notifications sur l'appareil (Web Push) : la file d'attente remplie par la base (prive.push_file) part vers les
 * téléphones et ordinateurs abonnés. Appelée chaque minute par pg_cron et pg_net (action « push »), seulement quand la
 * file n'est pas vide ; sans effet si on l'appelle à vide, d'où l'absence de jeton.
 *
 * Le chiffrement suit les normes du Web Push (RFC 8291, contenu « aes128gcm ») et l'identification du serveur, VAPID
 * (RFC 8292), avec la seule WebCrypto : aucune bibliothèque, rien à installer sur la fonction Edge.
 */
import { designation, type Base } from '../src/data/catalogue'
import { base, rpc, type Environnement } from './commun'

/** Ce qu'on envoie au service worker (pwa/sw.js), qui l'affiche */
export interface Contenu {
  titre: string
  texte: string
  /** Écran ouvert au toucher de la notification */
  url: string
  /** Remplace une notification de même étiquette encore affichée */
  etiquette: string
}

interface Appareil {
  endpoint: string
  p256dh: string
  auth: string
}

interface Envoi {
  type: string
  donnees: Record<string, unknown>
  appareils: Appareil[]
}

// ---------- Le texte de chaque notification ----------

const credits = (n: unknown) => `${Number(n ?? 0).toLocaleString('fr-FR')} ₵`
const rang = (r: unknown) => `${r ?? '?'}${r === 1 ? 'er' : 'e'}`

export function contenu(type: string, d: Record<string, unknown>, b: Base | null): Contenu {
  const c = typeof d.carte === 'string' ? b?.parId.get(d.carte) : undefined
  const nom = c ? designation(c) : 'une carte'
  const variante = typeof d.variante === 'string' && d.variante !== 'std' ? ' (variante)' : ''
  const marche = (onglet: string) => `/?ecran=marche&onglet=${onglet}`
  switch (type) {
    case 'souhait_en_vente':
      return {
        titre: 'Carte souhaitée en vente',
        texte: `${nom}${variante} est en vente à partir de ${credits(d.prix)}.`,
        url: marche('encheres'),
        etiquette: `souhait:${d.enchere}`,
      }
    case 'surencheri':
      return {
        titre: 'Vous êtes surenchéri',
        texte: `${d.par ?? 'Un agent'} mise ${credits(d.mise)} sur ${nom}.`,
        url: marche('encheres'),
        etiquette: `enchere:${d.enchere}`,
      }
    case 'enchere_gagnee':
      return {
        titre: 'Enchère remportée',
        texte: `${nom}${variante} est à vous pour ${credits(d.prix)}.`,
        url: '/?ecran=collection',
        etiquette: `enchere:${d.enchere}`,
      }
    case 'vente_conclue':
      return {
        titre: 'Vente conclue',
        texte: `${nom} vendue à ${d.acheteur ?? 'un agent'} pour ${credits(d.prix)}.`,
        url: marche('ventes'),
        etiquette: `vente:${d.enchere}`,
      }
    case 'vente_invendue':
      return { titre: 'Vente sans preneur', texte: `${nom} revient dans vos archives.`, url: marche('ventes'), etiquette: `vente:${d.enchere}` }
    case 'echange_recu':
      return {
        titre: 'Proposition d’échange',
        texte: `${d.de ?? 'Un agent'} vous propose un échange.`,
        url: marche('echanges'),
        etiquette: `echange:${d.offre}`,
      }
    case 'echange_accepte':
      return { titre: 'Échange accepté', texte: `${d.avec ?? 'L’agent'} a accepté votre échange.`, url: marche('echanges'), etiquette: `echange:${d.offre}` }
    case 'echange_refuse':
      return { titre: 'Échange refusé', texte: `${d.avec ?? 'L’agent'} a refusé votre échange.`, url: marche('echanges'), etiquette: `echange:${d.offre}` }
    case 'epreuve_resultat':
      return {
        titre: 'Épreuve de la semaine',
        texte: `${rang(d.rang)} sur ${d.participants ?? '?'} avec ${d.score ?? 0} points : +${credits(d.credits)}.`,
        url: '/?ecran=duel',
        etiquette: 'epreuve',
      }
    case 'saison_resultat':
      return { titre: 'Saison classée close', texte: `Vous finissez ${rang(d.rang)} : +${credits(d.credits)}.`, url: '/?ecran=classement', etiquette: 'saison' }
    case 'raid_vaincu':
      return { titre: 'Raid réussi', texte: `${nom} est reconfiné. Réclamez votre part dans la page du clan.`, url: '/?ecran=social', etiquette: 'raid' }
    case 'essai':
      return {
        titre: 'Notifications activées',
        texte: 'Surenchères, offres d’échange, ventes et messages arriveront ici, même le jeu fermé.',
        url: '/',
        etiquette: 'essai',
      }
    case 'message':
      return { titre: `Message de ${d.de ?? 'un agent'}`, texte: String(d.texte ?? ''), url: '/?ecran=social', etiquette: `message:${d.de}` }
    default:
      return { titre: 'SCP Masters', texte: 'Du nouveau au terminal.', url: '/', etiquette: type }
  }
}

// ---------- Encodages ----------

const encodeur = new TextEncoder()

export function enBase64Url(octets: Uint8Array): string {
  let s = ''
  for (const o of octets) s += String.fromCharCode(o)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function depuisBase64Url(texte: string): Uint8Array {
  const b = atob(texte.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (texte.length % 4)) % 4))
  return Uint8Array.from(b, (c) => c.charCodeAt(0))
}

function concat(...parties: Uint8Array[]): Uint8Array {
  const r = new Uint8Array(parties.reduce((n, p) => n + p.length, 0))
  let i = 0
  for (const p of parties) {
    r.set(p, i)
    i += p.length
  }
  return r
}

async function hmac(cle: Uint8Array, donnees: Uint8Array): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey('raw', cle as BufferSource, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, donnees as BufferSource))
}

// ---------- Chiffrement du contenu (RFC 8291) ----------

/** Chiffre le contenu pour un appareil : en-tête (sel, taille d'enregistrement, clé publique éphémère) puis le texte chiffré */
export async function chiffrer(
  texte: string,
  appareil: Pick<Appareil, 'p256dh' | 'auth'>,
  sel = crypto.getRandomValues(new Uint8Array(16)),
): Promise<Uint8Array> {
  const cleAppareil = depuisBase64Url(appareil.p256dh)
  const secret = depuisBase64Url(appareil.auth)
  const ephemere = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair
  const publiqueEphemere = new Uint8Array(await crypto.subtle.exportKey('raw', ephemere.publicKey))
  const publiqueAppareil = await crypto.subtle.importKey('raw', cleAppareil as BufferSource, { name: 'ECDH', namedCurve: 'P-256' }, false, [])
  const partage = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: publiqueAppareil }, ephemere.privateKey, 256))

  const prkCle = await hmac(secret, partage)
  const ikm = await hmac(prkCle, concat(encodeur.encode('WebPush: info\0'), cleAppareil, publiqueEphemere, new Uint8Array([1])))
  const prk = await hmac(sel, ikm)
  const cek = (await hmac(prk, concat(encodeur.encode('Content-Encoding: aes128gcm\0'), new Uint8Array([1])))).slice(0, 16)
  const nonce = (await hmac(prk, concat(encodeur.encode('Content-Encoding: nonce\0'), new Uint8Array([1])))).slice(0, 12)

  const cle = await crypto.subtle.importKey('raw', cek as BufferSource, 'AES-GCM', false, ['encrypt'])
  // Un seul enregistrement : le texte suivi du délimiteur de fin (0x02)
  const clair = concat(encodeur.encode(texte), new Uint8Array([2]))
  const chiffre = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce as BufferSource }, cle, clair as BufferSource))

  const entete = new Uint8Array(16 + 4 + 1 + publiqueEphemere.length)
  entete.set(sel, 0)
  new DataView(entete.buffer).setUint32(16, 4096)
  entete[20] = publiqueEphemere.length
  entete.set(publiqueEphemere, 21)
  return concat(entete, chiffre)
}

// ---------- Identification du serveur (VAPID, RFC 8292) ----------

/** La clé VAPID : JWK privée P-256 (secret VAPID_JWK de la fonction Edge) */
export interface CleVapid {
  privee: CryptoKey
  /** Clé publique brute (65 octets) en base64url : la même que dans src/state/push.ts */
  publique: string
}

export async function lireCleVapid(jwk: string): Promise<CleVapid> {
  const j = JSON.parse(jwk) as JsonWebKey
  const privee = await crypto.subtle.importKey('jwk', { ...j, key_ops: ['sign'] }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])
  const publique = enBase64Url(concat(new Uint8Array([4]), depuisBase64Url(j.x ?? ''), depuisBase64Url(j.y ?? '')))
  return { privee, publique }
}

async function enteteVapid(endpoint: string, cle: CleVapid, sujet: string): Promise<string> {
  const json = (o: unknown) => enBase64Url(encodeur.encode(JSON.stringify(o)))
  const corps = `${json({ typ: 'JWT', alg: 'ES256' })}.${json({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: sujet })}`
  const signature = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, cle.privee, encodeur.encode(corps)))
  return `vapid t=${corps}.${enBase64Url(signature)}, k=${cle.publique}`
}

/**
 * Envoie à un appareil ; renvoie le statut du service de notifications (201 : accepté ; 404 ou 410 : désabonné) et,
 * en cas de refus, sa raison (Apple : {"reason": "…"})
 */
export async function envoyer(appareil: Appareil, c: Contenu, cle: CleVapid, sujet: string): Promise<{ statut: number; raison: string }> {
  const corps = await chiffrer(JSON.stringify(c), appareil)
  const r = await fetch(appareil.endpoint, {
    method: 'POST',
    headers: {
      Authorization: await enteteVapid(appareil.endpoint, cle, sujet),
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: '86400',
      Urgency: 'normal',
      Topic: c.etiquette.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32) || 'scp',
    },
    body: corps as BodyInit,
  })
  const raison = r.ok ? '' : (await r.text().catch(() => '')).slice(0, 160)
  if (r.ok) await r.body?.cancel().catch(() => undefined)
  return { statut: r.status, raison }
}

// ---------- Le passage de la file ----------

let cleVapid: Promise<CleVapid> | null = null

/** Ce que chaque service de notifications a répondu, pour le diagnostic (journaux de la fonction, essai du joueur) */
export interface Resultat {
  type: string
  service: string
  statut: number
  raison: string
}

export async function traiterPush(
  env: Environnement & { vapid?: string },
): Promise<{ envoyes: number; echecs: number; desabonnes: number; details?: Resultat[]; cle?: false }> {
  if (!env.vapid) {
    console.error('push : secret VAPID_JWK absent ou vide')
    return { envoyes: 0, echecs: 0, desabonnes: 0, cle: false }
  }
  cleVapid ??= lireCleVapid(env.vapid)
  const cle = await cleVapid
  const lot = await rpc<Envoi[]>(env, 'push_a_envoyer', {})
  if (!lot.length) return { envoyes: 0, echecs: 0, desabonnes: 0 }
  // Les noms des cartes ; sans catalogue, la notification part quand même (« une carte »)
  const b = await base(env, 'vf').catch(() => null)
  const desabonnes: string[] = []
  const details: Resultat[] = []
  let envoyes = 0
  let echecs = 0
  await Promise.all(
    lot.flatMap((e) =>
      e.appareils.map(async (a) => {
        const service = new URL(a.endpoint).host
        try {
          const { statut, raison } = await envoyer(a, contenu(e.type, e.donnees, b), cle, env.site)
          details.push({ type: e.type, service, statut, raison })
          if (statut === 404 || statut === 410) desabonnes.push(a.endpoint)
          else if (statut >= 200 && statut < 300) envoyes++
          else echecs++
        } catch (x) {
          details.push({ type: e.type, service, statut: 0, raison: String(x).slice(0, 160) })
          echecs++
        }
      }),
    ),
  )
  if (desabonnes.length) await rpc(env, 'push_expires', { p_endpoints: desabonnes })
  console.log('push', JSON.stringify(details))
  return { envoyes, echecs, desabonnes: desabonnes.length, details }
}
