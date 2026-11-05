// Vérifie le chiffrement des notifications sur l'appareil (serveur/push.ts) : un faux appareil déchiffre ce que le
// serveur lui envoie (RFC 8291) et contrôle la signature VAPID (RFC 8292), sans réseau.
// Usage : node outils/construire_duel.mjs && node outils/tester_push.mjs
import assert from 'node:assert/strict'
import { contenu, depuisBase64Url, enBase64Url, envoyer, lireCleVapid } from './.cache/push.mjs'

const enc = new TextEncoder()
const concat = (...p) => {
  const r = new Uint8Array(p.reduce((n, x) => n + x.length, 0))
  let i = 0
  for (const x of p) r.set(x, (i += x.length) - x.length)
  return r
}
const hmac = async (cle, d) =>
  new Uint8Array(await crypto.subtle.sign('HMAC', await crypto.subtle.importKey('raw', cle, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']), d))

// Le faux appareil : sa paire de clés et son secret d'authentification, comme ceux d'un navigateur
const appareil = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])
const publiqueAppareil = new Uint8Array(await crypto.subtle.exportKey('raw', appareil.publicKey))
const secret = crypto.getRandomValues(new Uint8Array(16))

async function dechiffrer(corps) {
  const sel = corps.slice(0, 16)
  const longueur = corps[20]
  const publiqueServeur = corps.slice(21, 21 + longueur)
  const chiffre = corps.slice(21 + longueur)
  const cleServeur = await crypto.subtle.importKey('raw', publiqueServeur, { name: 'ECDH', namedCurve: 'P-256' }, false, [])
  const partage = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: cleServeur }, appareil.privateKey, 256))
  const ikm = await hmac(await hmac(secret, partage), concat(enc.encode('WebPush: info\0'), publiqueAppareil, publiqueServeur, new Uint8Array([1])))
  const prk = await hmac(sel, ikm)
  const cek = (await hmac(prk, concat(enc.encode('Content-Encoding: aes128gcm\0'), new Uint8Array([1])))).slice(0, 16)
  const nonce = (await hmac(prk, concat(enc.encode('Content-Encoding: nonce\0'), new Uint8Array([1])))).slice(0, 12)
  const clair = new Uint8Array(
    await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']), chiffre),
  )
  assert.equal(clair.at(-1), 2, 'délimiteur du dernier enregistrement')
  assert.equal(new DataView(corps.buffer, corps.byteOffset).getUint32(16), 4096)
  return new TextDecoder().decode(clair.slice(0, -1))
}

// La clé VAPID du serveur
const paire = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
const jwk = await crypto.subtle.exportKey('jwk', paire.privateKey)
const cle = await lireCleVapid(JSON.stringify(jwk))
assert.equal(depuisBase64Url(cle.publique).length, 65)

// Le service de notifications, simulé : il garde la requête
let requete = null
globalThis.fetch = async (url, init) => {
  requete = { url, ...init }
  return new Response(null, { status: 201 })
}

const c = contenu('surencheri', { par: 'Docteur Bravo', mise: 1200, enchere: 'e1' }, null)
assert.equal(c.titre, 'Vous êtes surenchéri')
assert.match(c.texte, /Docteur Bravo mise 1\s200 ₵ sur une carte/)
const { statut } = await envoyer(
  { endpoint: 'https://fcm.googleapis.com/fcm/send/abc', p256dh: enBase64Url(publiqueAppareil), auth: enBase64Url(secret) },
  c,
  cle,
  'https://scp-masters.vercel.app',
)
assert.equal(statut, 201)
assert.equal(requete.headers['Content-Encoding'], 'aes128gcm')
assert.deepEqual(JSON.parse(await dechiffrer(new Uint8Array(requete.body))), c)

// L'en-tête VAPID : un jeton ES256 pour l'origine du service, signé par la clé dont la publique est jointe
const [, jeton, k] = requete.headers.Authorization.match(/^vapid t=([^,]+), k=(.+)$/)
assert.equal(k, cle.publique)
const [entete, charge, signature] = jeton.split('.')
const revendications = JSON.parse(new TextDecoder().decode(depuisBase64Url(charge)))
assert.equal(revendications.aud, 'https://fcm.googleapis.com')
assert.equal(revendications.sub, 'https://scp-masters.vercel.app')
assert.ok(revendications.exp > Date.now() / 1000)
const publique = await crypto.subtle.importKey('raw', depuisBase64Url(k), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify'])
assert.ok(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, publique, depuisBase64Url(signature), enc.encode(`${entete}.${charge}`)))

// Jamais vers une adresse qui n'est pas un service de notifications (SSRF), et sans suivre de redirection
assert.equal(requete.redirect, 'manual')
requete = null
for (const endpoint of ['https://attaquant.exemple.org/x', 'https://fcm.googleapis.com.attaquant.org/x', 'http://fcm.googleapis.com/x']) {
  const r = await envoyer({ endpoint, p256dh: enBase64Url(publiqueAppareil), auth: enBase64Url(secret) }, c, cle, 'https://scp-masters.vercel.app')
  assert.equal(r.statut, 410, endpoint)
  assert.equal(requete, null, endpoint)
}

console.log('Notifications sur l’appareil : chiffrement, signature VAPID, textes et services autorisés vérifiés.')
