/**
 * Le Discord de la communauté, côté serveur (fonction Edge « duel ») :
 *  - le grade d'un agent suit son niveau d'accréditation (rôles 0 à 5), posé par le bot (secret discordBotSecret) ;
 *  - les commandes /carte, /profil et /podium du bot (interactions HTTP signées par Discord, clé publique ci-dessous) ;
 *  - l'installation de ces commandes sur le serveur, réservée au créateur.
 * Les identifiants ci-dessous ne sont pas des secrets ; le jeton du bot, lui, ne vit que dans les secrets de la fonction.
 */
import { RARETES, TYPES, designation, nomClasse } from '../src/data/catalogue'
import type { Carte } from '../src/types'
import { Erreur, base, rpc, type Environnement } from './commun'

export const DISCORD = {
  serveur: '1569271113001865256',
  application: '1564369053366222898',
  clePublique: '9f58515e9e013747a6fe78c106498cd8446f88151f60ab4ba9f1b1f1bd41ef27',
  /** Rôles des niveaux d'accréditation, du niveau 0 au niveau 5 (Thaumiel) */
  roles: ['1569331856682516570', '1569331991445250058', '1569332057358860348', '1569332146349543496', '1569332192654397450', '1569332293804367934'],
}

/** Les niveaux d'accréditation (les mêmes que src/state/sauvegarde.ts, module du navigateur) */
const NIVEAUX = [
  'Niveau 0 — Personnel non essentiel',
  'Niveau 1 — Accès restreint',
  'Niveau 2 — Accès confidentiel',
  'Niveau 3 — Secret',
  'Niveau 4 — Top secret',
  'Niveau 5 — Thaumiel',
]

const API = 'https://discord.com/api/v10'
const SITE = 'https://scp-masters.vercel.app'

/** discordClePublique : seulement pour les tests (une clé générée), sinon celle de l'application */
type EnvDiscord = Environnement & { discord?: string; discordClePublique?: string }

async function bot(env: EnvDiscord, chemin: string, init: RequestInit = {}): Promise<Response> {
  if (!env.discord) throw new Erreur(503, 'Bot Discord non configuré (secret discordBotSecret absent)')
  return fetch(`${API}${chemin}`, {
    ...init,
    headers: { Authorization: `Bot ${env.discord}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  })
}

// ---------- Le grade d'un agent ----------

export interface EtatGrade {
  lie: boolean
  membre?: boolean
  niveau?: number
}

/** Pose sur le serveur Discord le rôle du niveau de l'agent (et retire les autres rôles de niveau) */
export async function synchroniserGrade(env: EnvDiscord, idJoueur: string): Promise<EtatGrade> {
  const i = await rpc<{ discord_id: string | null; niveau: number } | null>(env, 'discord_infos', { p_joueur: idJoueur })
  if (!i?.discord_id) return { lie: false }
  const niveau = Math.max(0, Math.min(5, i.niveau))
  const m = await bot(env, `/guilds/${DISCORD.serveur}/members/${i.discord_id}`)
  if (m.status === 404) return { lie: true, membre: false, niveau }
  if (!m.ok) throw new Erreur(502, `Discord ne répond pas (${m.status})`)
  const membre = (await m.json()) as { roles: string[] }
  const roles = [...membre.roles.filter((r) => !DISCORD.roles.includes(r)), DISCORD.roles[niveau]]
  const r = await bot(env, `/guilds/${DISCORD.serveur}/members/${i.discord_id}`, { method: 'PATCH', body: JSON.stringify({ roles }) })
  if (!r.ok) throw new Erreur(502, `Le grade n’a pas pu être posé (${r.status}) : le rôle du bot est-il au-dessus des rôles de niveau ?`)
  await rpc(env, 'discord_grade_enregistre', { p_joueur: idJoueur, p_grade: niveau })
  return { lie: true, membre: true, niveau }
}

// ---------- Les commandes ----------

const COMMANDES = [
  {
    name: 'carte',
    description: 'La fiche d’une carte de SCP Masters',
    options: [{ type: 3, name: 'nom', description: 'Désignation ou nom (ex. SCP-173, The Sculpture)', required: true }],
  },
  {
    name: 'profil',
    description: 'Le profil d’un agent de SCP Masters',
    options: [{ type: 3, name: 'pseudo', description: 'Pseudo de l’agent', required: true }],
  },
  { name: 'podium', description: 'Le podium de la dernière Épreuve et le haut du classement' },
]

/** Installe (ou met à jour) les commandes sur le serveur de la communauté ; réservé au créateur */
export async function installerCommandes(env: EnvDiscord, idJoueur: string): Promise<{ commandes: number }> {
  if (!(await rpc<boolean>(env, 'discord_est_createur', { p_joueur: idJoueur }))) throw new Erreur(403, 'Réservé au créateur du jeu')
  const r = await bot(env, `/applications/${DISCORD.application}/guilds/${DISCORD.serveur}/commands`, { method: 'PUT', body: JSON.stringify(COMMANDES) })
  if (!r.ok) throw new Erreur(502, `Discord a refusé les commandes (${r.status}) : le bot a-t-il été invité avec « applications.commands » ?`)
  return { commandes: COMMANDES.length }
}

// ---------- Les interactions (Discord appelle la fonction) ----------

const octets = (hex: string) => new Uint8Array((hex.match(/../g) ?? []).map((h) => parseInt(h, 16)))

/** La requête vient-elle bien de Discord ? (signature Ed25519 du corps, avec la clé publique de l'application) */
export async function signatureValide(corps: string, signature: string, horodatage: string, clePublique = DISCORD.clePublique): Promise<boolean> {
  try {
    const cle = await crypto.subtle.importKey('raw', octets(clePublique), { name: 'Ed25519' }, false, ['verify'])
    return await crypto.subtle.verify('Ed25519', cle, octets(signature), new TextEncoder().encode(horodatage + corps))
  } catch {
    return false
  }
}

const couleur = (hex: string) => parseInt(hex.replace('#', ''), 16) || 0xd23a2c

function chercher(cartes: Carte[], texte: string): Carte | undefined {
  const q = texte.trim().toLowerCase()
  const nombre = q.match(/^(?:scp-?)?(\d{1,4})$/)?.[1]
  if (nombre) {
    const num = `SCP-${nombre.padStart(3, '0')}`.toLowerCase()
    const c = cartes.find((x) => x.num?.toLowerCase() === num)
    if (c) return c
  }
  const exacte = cartes.find((x) => x.id.toLowerCase() === q || x.num?.toLowerCase() === q || x.nm.toLowerCase() === q)
  if (exacte) return exacte
  return cartes.filter((x) => x.nm.toLowerCase().includes(q) || x.num?.toLowerCase().includes(q)).sort((a, b) => a.p - b.p)[0]
}

async function reponseCarte(env: EnvDiscord, texte: string): Promise<Record<string, unknown>> {
  const b = await base(env, 'vf')
  const c = chercher(b.cartes, texte)
  if (!c) return { content: `Aucune fiche ne correspond à « ${texte.slice(0, 60)} ».` }
  const r = RARETES[c.ra]
  const champs = [
    { name: 'Type', value: TYPES[c.k].nom, inline: true },
    ...(nomClasse(c) ? [{ name: 'Classe', value: nomClasse(c), inline: true }] : []),
    { name: 'Rareté', value: r.nom, inline: true },
    { name: 'Menace / Confinement', value: `${c.atk} / ${c.def}`, inline: true },
    ...(c.a ? [{ name: 'Auteur', value: c.a, inline: true }] : []),
    ...(c.y ? [{ name: 'Publication', value: String(c.y), inline: true }] : []),
  ]
  const image = b.vignette(c)
  return {
    embeds: [
      {
        title: `${designation(c)}${c.num && c.num !== c.nm ? ` — ${c.nm}` : ''}`,
        url: SITE,
        color: couleur(r.couleur),
        fields: champs,
        ...(image ? { thumbnail: { url: image } } : {}),
        footer: { text: 'SCP Masters · à collectionner sur scp-masters.vercel.app' },
      },
    ],
  }
}

async function reponseProfil(env: EnvDiscord, pseudo: string): Promise<Record<string, unknown>> {
  const p = await rpc<{
    pseudo: string
    xp: number
    niveau: number
    elo: number
    jcj: { victoires: number; defaites: number; nuls: number }
    fiches: number
    mythiques: number
    clan: { nom: string; tag: string } | null
  } | null>(env, 'discord_profil', { p_pseudo: pseudo })
  if (!p) return { content: `Aucun agent ne s’appelle « ${pseudo.slice(0, 40)} ».` }
  return {
    embeds: [
      {
        title: `Dossier de l’agent ${p.pseudo}`,
        url: SITE,
        color: 0xf0b43c,
        fields: [
          { name: 'Accréditation', value: NIVEAUX[Math.max(0, Math.min(5, p.niveau))], inline: false },
          { name: 'Elo', value: String(p.elo), inline: true },
          { name: 'Entre agents', value: `${p.jcj.victoires} V · ${p.jcj.defaites} D · ${p.jcj.nuls} N`, inline: true },
          { name: 'Collection', value: `${p.fiches.toLocaleString('fr-FR')} fiches · ${p.mythiques} Mythique${p.mythiques > 1 ? 's' : ''}`, inline: true },
          ...(p.clan ? [{ name: 'Clan', value: `[${p.clan.tag}] ${p.clan.nom}`, inline: true }] : []),
        ],
        footer: { text: 'SCP Masters' },
      },
    ],
  }
}

async function reponsePodium(env: EnvDiscord): Promise<Record<string, unknown>> {
  const p = await rpc<{
    epreuve: { semaine: string; podium: { pseudo: string; score: number; rang: number }[] } | null
    elo: { pseudo: string; elo: number }[]
  }>(env, 'discord_podium', {})
  const medaille = (i: number) => ['🥇', '🥈', '🥉'][i] ?? '·'
  const epreuve = p.epreuve?.podium.length
    ? p.epreuve.podium.map((x, i) => `${medaille(i)} **${x.pseudo}** · ${x.score} points`).join('\n')
    : 'Pas encore d’Épreuve close.'
  const elo = p.elo.length ? p.elo.map((x, i) => `${medaille(i)} **${x.pseudo}** · ${x.elo} Elo`).join('\n') : '—'
  return {
    embeds: [
      {
        title: 'Podiums de SCP Masters',
        url: SITE,
        color: 0xf0b43c,
        fields: [
          { name: p.epreuve ? `Épreuve de la semaine du ${p.epreuve.semaine.split('-').reverse().slice(0, 2).join('/')}` : 'Épreuve', value: epreuve },
          { name: 'Classement Elo', value: elo },
        ],
      },
    ],
  }
}

interface Interaction {
  type: number
  token: string
  data?: { name: string; options?: { name: string; value: string }[] }
}

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined

/** Une interaction signée par Discord : répond « en cours » tout de suite, puis complète le message */
export async function traiterInteraction(req: Request, env: EnvDiscord): Promise<Response> {
  const corps = await req.text()
  const valide = await signatureValide(
    corps,
    req.headers.get('X-Signature-Ed25519') ?? '',
    req.headers.get('X-Signature-Timestamp') ?? '',
    env.discordClePublique ?? DISCORD.clePublique,
  )
  if (!valide) return new Response('Signature invalide', { status: 401 })
  const i = JSON.parse(corps) as Interaction
  const json = (d: unknown) => new Response(JSON.stringify(d), { headers: { 'Content-Type': 'application/json' } })
  if (i.type === 1) return json({ type: 1 })
  if (i.type !== 2 || !i.data) return json({ type: 4, data: { content: 'Commande inconnue.' } })
  const option = (nom: string) => String(i.data?.options?.find((o) => o.name === nom)?.value ?? '')
  const travail = (async () => {
    let message: Record<string, unknown>
    try {
      message =
        i.data!.name === 'carte'
          ? await reponseCarte(env, option('nom'))
          : i.data!.name === 'profil'
            ? await reponseProfil(env, option('pseudo'))
            : i.data!.name === 'podium'
              ? await reponsePodium(env)
              : { content: 'Commande inconnue.' }
    } catch {
      message = { content: 'Le terminal de la Fondation ne répond pas, réessayez dans un instant.' }
    }
    await fetch(`${API}/webhooks/${DISCORD.application}/${i.token}/messages/@original`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...message, allowed_mentions: { parse: [] } }),
    })
  })()
  // La réponse doit partir en moins de trois secondes : « le bot réfléchit », la suite arrive ensuite
  if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime?.waitUntil) EdgeRuntime.waitUntil(travail)
  else await travail
  return json({ type: 5 })
}
