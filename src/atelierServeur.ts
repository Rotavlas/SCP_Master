/**
 * Atelier : les confrontations jouées avec le vrai code du serveur (serveur/duel.ts), dans le navigateur, sans
 * fonction Edge ni base. Les fonctions SQL duel_* et jcj_* sont simulées en mémoire, l'équipe est une équipe de
 * démonstration ; pour les duels entre joueurs, un adversaire simulé joue de son côté, et le direct (Realtime)
 * est imité. Rien n'est enregistré ni récompensé.
 */
import { traiter } from '../serveur/duel'
import { supabase } from './state/enLigne'

export const EQUIPE_DEMO = ['scp-682', 'fim:epsilon-11', 'site:site-19', 'proto:110-montauk', 'entite:scarlet-king']
/** L'équipe de l'adversaire simulé des duels entre joueurs */
export const EQUIPE_ADVERSE = ['scp-173', 'scp-096', 'scp-055', 'scp-106', 'dr-clef-s-proposal']

const URL_FAUX = 'https://atelier.invalid'
const MOI = 'agent-atelier'
const LUI = 'agent-adverse'

interface Ligne {
  etat: unknown
  version: number
}

const parties = new Map<string, Ligne>()

/** L'Épreuve de la semaine simulée ; ?semaine=AAAA-MM-JJ pour en voir une autre */
let epreuve: (Ligne & { termine: boolean }) | null = null
const semaineAtelier = new URLSearchParams(location.search).get('semaine') ?? '2026-11-02'

/** Le duel entre joueurs simulé (les colonnes de public.duels_jcj et prive.duels_jcj_secret) */
let duelJcj: {
  id: string
  statut: string
  classe: boolean
  etat: unknown
  secret: unknown
  version: number
  resultat: unknown
} | null = null
const ecouteurs = new Set<() => void>()

/** L'état complet de la partie en cours, bonne réponse comprise : pour tester depuis la console de l'atelier */
export const etatAtelier = () => (duelJcj ? { etat: duelJcj.etat, secret: duelJcj.secret } : [...parties.values()].at(-1)?.etat)

const modeAtelier = new URLSearchParams(location.search).get('mode') ?? ''
const enHall = ['hall', 'reglement', 'app'].includes(modeAtelier)
const DEMO_HALL: Record<string, () => unknown> = {
  // L'ouverture d'un dossier (?mode=app) : cinq fiches de démonstration, dont une Légendaire
  ouvrir_booster: () =>
    modeAtelier === 'app'
      ? {
          cartes: [
            { id: 'scp-131', v: 'std' },
            { id: 'scp-999', v: 'holo' },
            { id: 'scp-049', v: 'std' },
            { id: 'scp-096', v: 'std' },
            { id: 'scp-682', v: 'std' },
          ],
          profil: {
            pseudo: 'Agent atelier',
            credits: 2350,
            xp: 3405,
            boosters: 3,
            dernier_booster: new Date().toISOString(),
            meilleur_adversaire: 3,
            stats: {},
            keter_offerts: 1,
          },
        }
      : null,
  achats_restants: () => (enHall ? { keter: 2, o5: 0, apollyon: 1 } : null),
  recyclage_restant: () => (enHall ? 650 : null),
  tableau_duels: () =>
    enHall
      ? {
          elo: 1184,
          rang: 12,
          jcj: { victoires: 9, defaites: 6, nuls: 1 },
          enLigne: 7,
          iaRestants: 3,
          jcjRestants: 5,
          enFile: 1,
          enCours: null,
          invitations: [],
          amisEnLigne: [
            { pseudo: 'Dr Clef', elo: 1290, occupe: false },
            { pseudo: 'Bright', elo: 1105, occupe: true },
          ],
        }
      : null,
  missions: () =>
    enHall
      ? [
          { id: 'j-dossiers', periode: 'jour', titre: 'Ouvrir 3 dossiers', objectif: 3, progres: 3, credits: 60, dossiers: 0, fin: '', reclamee: false },
          {
            id: 'j-victoires',
            periode: 'jour',
            titre: 'Gagner 2 confrontations contre l’IA',
            objectif: 2,
            progres: 1,
            credits: 80,
            dossiers: 0,
            fin: '',
            reclamee: false,
          },
          { id: 'j-vendre', periode: 'jour', titre: 'Vendre une fiche au marché', objectif: 1, progres: 0, credits: 60, dossiers: 0, fin: '', reclamee: false },
          {
            id: 's-agents',
            periode: 'semaine',
            titre: 'Jouer 5 duels entre agents',
            objectif: 5,
            progres: 2,
            credits: 600,
            dossiers: 0,
            fin: '',
            reclamee: false,
          },
        ]
      : null,
  rapport: () =>
    enHall
      ? {
          serie: 4,
          fait: false,
          jour: 5,
          recompenses: [1, 2, 3, 4, 5, 6, 7].map((jour) => ({
            jour,
            credits: [100, 150, 0, 250, 0, 400, 0][jour - 1],
            dossiers: [0, 0, 1, 0, 2, 0, 0][jour - 1],
            keter: jour === 7 ? 1 : 0,
          })),
        }
      : null,
  piste: () =>
    enHall
      ? {
          xp: 3400,
          reclame: 6,
          atteint: 8,
          paliers: Array.from({ length: 30 }, (_, i) => {
            const n = i + 1
            return { palier: n, xp: Math.round((100 * n ** 1.8) / 10) * 10, credits: 50 + 15 * n, dossiers: n % 3 ? 0 : 1, keter: n % 10 ? 0 : 1 }
          }),
        }
      : null,
  objectifs_proches: () =>
    enHall
      ? [
          { type: 'rapport', jour: 5, serie: 4 },
          { type: 'piste_prete', paliers: 2 },
          { type: 'album', titre: 'Initiatives de Réponse Automatisée', manque: 2 },
          { type: 'raid', carte: 'scp-682', manque: 12 },
          { type: 'epreuve' },
        ]
      : null,
  fil_clan: () =>
    enHall
      ? [
          { type: 'tirage', pseudo: 'Dr Clef', carte: 'entite:scarlet-king', numero: 7, le: new Date(Date.now() - 600_000).toISOString() },
          { type: 'raid', carte: 'scp-682', le: new Date(Date.now() - 3_600_000).toISOString() },
          { type: 'victoire', pseudo: 'Bright', contre: 'Iris Thompson', classe: true, le: new Date(Date.now() - 7_200_000).toISOString() },
          { type: 'epreuve', pseudo: 'Agent atelier', score: 1012, le: new Date(Date.now() - 86_400_000).toISOString() },
          { type: 'tirage', pseudo: 'Bright', carte: 'scp-096', le: new Date(Date.now() - 2 * 86_400_000).toISOString() },
          { type: 'album', pseudo: 'Dr Clef', page: 'Codes de confinement', le: new Date(Date.now() - 3 * 86_400_000).toISOString() },
          { type: 'arrivee', pseudo: 'Iris Thompson', le: new Date(Date.now() - 5 * 86_400_000).toISOString() },
        ]
      : null,
  epreuve: () =>
    enHall
      ? {
          semaine: semaineAtelier,
          fin: new Date(Date.now() + 4 * 86_400_000).toISOString(),
          moi: { score: 1012, bonnes: 8, termine: true, rang: 3 },
          participants: 27,
          classement: [
            { pseudo: 'Dr Clef', score: 1288, bonnes: 9, duree: 141, rang: 1 },
            { pseudo: 'Iris Thompson', score: 1120, bonnes: 8, duree: 160, rang: 2 },
            { pseudo: 'Agent atelier', score: 1012, bonnes: 8, duree: 175, rang: 3 },
            { pseudo: 'Bright', score: 870, bonnes: 7, duree: 190, rang: 4 },
          ],
          dernier: { semaine: '2026-10-26', score: 940, rang: 5, credits: 500 },
        }
      : null,
  raid: () =>
    enHall
      ? {
          fin: new Date(Date.now() + 4 * 86_400_000).toISOString(),
          requis: 40,
          credits: 500,
          courant: {
            semaine: semaineAtelier,
            cible: 'scp-682',
            pv: 850,
            degats: 512,
            vaincue: false,
            moi: 96,
            reclame: false,
            contributeurs: [
              { pseudo: 'Dr Clef', degats: 210 },
              { pseudo: 'Agent atelier', degats: 96 },
              { pseudo: 'Bright', degats: 206 },
            ],
          },
          precedent: { semaine: '2026-10-26', cible: 'scp-106', pv: 850, degats: 900, vaincue: true, moi: 120, reclame: false, contributeurs: [] },
        }
      : null,
  guerre_clan: () =>
    enHall
      ? {
          fin: new Date(Date.now() + 4 * 86_400_000).toISOString(),
          victoires: 1,
          courante: { semaine: semaineAtelier, adversaire: { nom: 'Les Veilleurs', tag: 'VEIL' }, nous: 34, eux: 27, moi: 11, reclame: false },
          precedente: { semaine: '2026-10-26', adversaire: { nom: 'Ordre de Minuit', tag: 'ODM' }, nous: 41, eux: 38, moi: 9, reclame: false },
        }
      : null,
  mes_statistiques: () =>
    enHall
      ? {
          familles: {
            classe: { n: 48, b: 41, t: 210 },
            surnom: { n: 31, b: 22, t: 190 },
            extrait: { n: 26, b: 14, t: 260 },
            illustration: { n: 9, b: 7, t: 61 },
            auteur: { n: 12, b: 4, t: 120 },
          },
          serie: 11,
          eclair: 1.42,
        }
      : null,
  ajouter_statistiques: () => null,
  // Succès, contrats, Mythiques en circulation, créateur (?mode=app)
  codes_admin: () =>
    enHall
      ? [
          {
            code: 'SITE19',
            description: 'Code de lancement',
            recompense: { credits: 300, offerts: { apollyon: 1 } },
            utilisationsMax: 100,
            expireLe: new Date(Date.now() + 5 * 86_400_000).toISOString(),
            creeLe: new Date().toISOString(),
            utilisations: 37,
            actif: true,
          },
          {
            code: 'CONFINEMENT',
            description: 'Stream du 15 novembre',
            recompense: { cosmetiques: ['couv-quadrille'], cartes: [{ c: 'scp-173', v: 'holo', n: 1 }] },
            utilisationsMax: null,
            expireLe: new Date(Date.now() - 86_400_000).toISOString(),
            creeLe: new Date().toISOString(),
            utilisations: 112,
            actif: false,
          },
        ]
      : null,
  createurs: () => (enHall ? ['Agent atelier'] : null),
  editions_mythiques: () =>
    enHall
      ? {
          'dr-clef-s-proposal': { emis: 41, total: 50 },
          'scp-173': { emis: 50, total: 50 },
          'scp-2747': { emis: 17, total: 50 },
          'fim:alpha-1': { emis: 28, total: 50 },
          'perso:the-administrator': { emis: 33, total: 50 },
          'perso:aaron-siegel': { emis: 12, total: 50 },
          'perso:o5-1': { emis: 46, total: 50 },
          'perso:les-auteurs': { emis: 9, total: 50 },
          'entite:scarlet-king': { emis: 38, total: 50 },
        }
      : null,
  contrats: () =>
    enHall
      ? {
          fin: new Date(Date.now() + 3 * 86_400_000).toISOString(),
          contrats: [
            { carte: 'scp-005', rempli: false, libres: 2 },
            { carte: 'scp-009', rempli: true, libres: 1 },
            { carte: 'scp-003', rempli: false, libres: 0 },
          ],
        }
      : null,
  succes: () =>
    enHall
      ? [
          {
            id: 'fiches-50',
            categorie: 'Collection',
            nom: 'Premier classeur',
            description: 'Posséder 50 fiches différentes.',
            recompense: null,
            valeur: 82,
            seuil: 50,
            obtenu: '2026-11-01T10:00:00Z',
          },
          {
            id: 'fiches-500',
            categorie: 'Collection',
            nom: 'Rayonnages',
            description: 'Posséder 500 fiches différentes.',
            recompense: null,
            valeur: 82,
            seuil: 500,
            obtenu: null,
          },
          {
            id: 'fiches-10000',
            categorie: 'Collection',
            nom: 'Mémoire de la Fondation',
            description: 'Posséder 10 000 fiches différentes.',
            recompense: 'titre-memoire',
            valeur: 82,
            seuil: 10000,
            obtenu: null,
          },
          {
            id: 'legendaires-1',
            categorie: 'Raretés',
            nom: 'Accès niveau 4',
            description: 'Posséder une Légendaire.',
            recompense: null,
            valeur: 6,
            seuil: 1,
            obtenu: null,
          },
          {
            id: 'mythiques-1',
            categorie: 'Raretés',
            nom: 'Niveau 5',
            description: 'Posséder une Mythique.',
            recompense: null,
            valeur: 2,
            seuil: 1,
            obtenu: '2026-11-03T10:00:00Z',
          },
          {
            id: 'arc-en-ciel',
            categorie: 'Variantes',
            nom: 'Arc-en-ciel',
            description: 'Réunir les 5 variantes d’une même carte.',
            recompense: 'titre-prisme',
            valeur: 0,
            seuil: 1,
            obtenu: null,
          },
          {
            id: 'o5-1',
            categorie: 'Variantes',
            nom: 'Sceau du Conseil',
            description: 'Posséder une carte au Sceau O5.',
            recompense: null,
            valeur: 0,
            seuil: 1,
            obtenu: null,
          },
          {
            id: 'archives-l',
            categorie: 'Archives complètes',
            nom: 'Tous les Sites',
            description: 'Posséder toutes les fiches de Sites.',
            recompense: 'cadre-archives-l',
            valeur: 31,
            seuil: 94,
            obtenu: null,
          },
          {
            id: 'archives-o',
            categorie: 'Archives complètes',
            nom: 'Tous les protocoles',
            description: 'Posséder toutes les fiches de protocoles.',
            recompense: 'cadre-archives-o',
            valeur: 31,
            seuil: 31,
            obtenu: null,
          },
          {
            id: 'jcj-1',
            categorie: 'Confrontation',
            nom: 'Premier sang',
            description: 'Gagner un duel entre agents.',
            recompense: null,
            valeur: 9,
            seuil: 1,
            obtenu: '2026-10-30T10:00:00Z',
          },
        ]
      : null,
  albums: () =>
    enHall
      ? [
          { id: 'codes', titre: 'Codes de confinement', credits: 600, total: 14, possedees: 14, reclame: false },
          { id: 'ira', titre: 'Initiatives de Réponse Automatisée', credits: 800, total: 9, possedees: 4, reclame: false },
          { id: 'conseil-o5', titre: 'Le Conseil O5', credits: 3000, total: 13, possedees: 13, reclame: true },
          { id: 'mythiques', titre: 'Les Mythiques', credits: 10000, total: 9, possedees: 2, reclame: false },
        ]
      : null,
  // Registre, fusion, cote, collections et cosmétiques (?mode=app)
  profil_public: () =>
    enHall
      ? {
          pseudo: 'Agent atelier',
          titre: new URLSearchParams(location.search).get('titre') ?? 'titre-dieu-brise',
          cadre: new URLSearchParams(location.search).get('cadre') ?? 'cadre-dieu-brise',
          xp: 3400,
          elo: 1184,
          rangElo: 12,
          credits: 2350,
          jcj: { victoires: 9, defaites: 6, nuls: 1 },
          stats: { duels: 30, victoires: 21 },
          enLigne: true,
          vuLe: new Date().toISOString(),
          creeLe: '2026-10-26T10:00:00Z',
          moi: true,
          collection: 82,
          legendaires: 6,
          badges: ['premier-dossier', 'legende'],
          badgesAffiches: ['legende'],
          vitrine: [],
          clan: null,
          relation: null,
          duels: [],
        }
      : null,
  fusions_restantes: () => (enHall ? 2 : null),
  registre_mythique: () =>
    enHall
      ? [
          {
            numero: 3,
            variante: 'std',
            detenteur: 'Agent atelier',
            moi: true,
            historique: [
              { pseudo: 'Dr Clef', evenement: 'tire', prix: null, le: '2026-10-29T10:00:00Z' },
              { pseudo: 'Agent atelier', evenement: 'enchere', prix: 18500, le: '2026-11-02T18:40:00Z' },
            ],
          },
          {
            numero: 11,
            variante: 'negatif',
            detenteur: 'Bright',
            moi: false,
            historique: [{ pseudo: 'Bright', evenement: 'tire', prix: null, le: '2026-11-01T09:12:00Z' }],
          },
          {
            numero: 17,
            variante: 'std',
            detenteur: null,
            moi: false,
            historique: [
              { pseudo: 'Kondraki', evenement: 'tire', prix: null, le: '2026-11-01T21:00:00Z' },
              { pseudo: 'Kondraki', evenement: 'brule', prix: null, le: '2026-11-03T08:30:00Z' },
            ],
          },
        ]
      : null,
  cote_marche: () =>
    enHall
      ? {
          ventes7: 142,
          credits7: 386400,
          ventesAvant: 118,
          creditsAvant: 352000,
          hausses: [
            { carte: 'scp-096', variante: 'std', prix: 420, avant: 260, pct: 62 },
            { carte: 'scp-682', variante: 'holo', prix: 2600, avant: 1900, pct: 37 },
          ],
          baisses: [{ carte: 'scp-049', variante: 'std', prix: 140, avant: 210, pct: -33 }],
          echangees: [
            { carte: 'scp-173', variante: 'std', ventes: 14, prix: 320 },
            { carte: 'scp-131', variante: 'std', ventes: 9, prix: 45 },
          ],
          records: [
            { carte: 'scp-999', variante: 'o5', prix: 48000, le: '2026-11-03T20:00:00Z' },
            { carte: 'scp-682', variante: 'std', prix: 9500, le: '2026-10-21T20:00:00Z' },
          ],
        }
      : null,
  cosmetiques: () =>
    enHall
      ? {
          catalogue: [
            { id: 'titre-agent-terrain', type: 'titre', prix: 1500, possede: true },
            { id: 'titre-chercheur', type: 'titre', prix: 3000, possede: false },
            { id: 'titre-directeur', type: 'titre', prix: 25000, possede: false },
            { id: 'titre-dieu-brise', type: 'titre', prix: null, possede: true },
            { id: 'cadre-acier', type: 'cadre', prix: 5000, possede: false },
            { id: 'cadre-laiton', type: 'cadre', prix: 10000, possede: false },
            { id: 'cadre-confinement', type: 'cadre', prix: 20000, possede: false },
            { id: 'cadre-sceau-or', type: 'cadre', prix: 50000, possede: false },
            { id: 'cadre-dieu-brise', type: 'cadre', prix: null, possede: true },
            { id: 'couv-quadrille', type: 'couverture', prix: 5000, possede: false },
            { id: 'couv-ruban-keter', type: 'couverture', prix: 8000, possede: true },
            { id: 'couv-marbre', type: 'couverture', prix: 15000, possede: false },
            { id: 'couv-dorure-o5', type: 'couverture', prix: 40000, possede: false },
          ],
          portes: { titre: 'titre-dieu-brise', cadre: 'cadre-dieu-brise', couverture: 'couv-ruban-keter' },
        }
      : null,
  collections_gdi: () =>
    enHall
      ? [
          { id: 'dieu-brise', titre: 'L’Église du Dieu Brisé', cartes: Array.from({ length: 19 }, (_, i) => `x-${i}`), possedees: 19, reclamee: true },
          { id: 'insurrection', titre: 'L’Insurrection du Chaos', cartes: Array.from({ length: 24 }, (_, i) => `y-${i}`), possedees: 24, reclamee: false },
          { id: 'main-du-serpent', titre: 'La Main du Serpent', cartes: Array.from({ length: 75 }, (_, i) => `z-${i}`), possedees: 12, reclamee: false },
        ]
      : null,
}

export function brancherServeurLocal(equipe: string[] = EQUIPE_DEMO) {
  if (!supabase || (window as unknown as { serveurLocal?: boolean }).serveurLocal) return
  ;(window as unknown as { serveurLocal: boolean; etatAtelier: typeof etatAtelier }).serveurLocal = true
  ;(window as unknown as { etatAtelier: typeof etatAtelier }).etatAtelier = etatAtelier
  const json = (d: unknown) => new Response(JSON.stringify(d), { status: 200, headers: { 'Content-Type': 'application/json' } })
  const preparation = () => ({ id: duelJcj!.id, joueurA: MOI, joueurB: LUI, classe: true, equipeA: equipe, equipeB: EQUIPE_ADVERSE, langue: 'vo' })
  const vraiFetch = window.fetch.bind(window)
  window.fetch = async (entree, init) => {
    const url = String(entree instanceof Request ? entree.url : entree)
    if (!url.startsWith(URL_FAUX)) return vraiFetch(entree, init)
    if (url.endsWith('/auth/v1/user')) {
      const jeton = new Headers(init?.headers).get('Authorization')
      return json({ id: jeton?.endsWith('adverse') ? LUI : MOI })
    }
    const p = JSON.parse(String(init?.body ?? '{}'))
    switch (url.split('/rpc/')[1]) {
      case 'duel_preparer': {
        const id = crypto.randomUUID()
        parties.clear()
        parties.set(id, { etat: null, version: 0 })
        return json({ id, equipe, langue: 'vo' })
      }
      case 'duel_lire': {
        const l = parties.get(p.p_duel)
        return json(l?.etat ? l : null)
      }
      case 'duel_ecrire': {
        const l = parties.get(p.p_duel)
        if (!l || l.version !== p.p_version) return json(false)
        parties.set(p.p_duel, { etat: p.p_etat, version: l.version + 1 })
        return json(true)
      }
      case 'duel_clore':
        parties.delete(p.p_duel)
        return json({ credits: 0, xp: 0, profil: null })
      // L'Épreuve de la semaine : une tentative en mémoire, à recommencer en rechargeant la page
      case 'epreuve_preparer':
        return json({ semaine: semaineAtelier, langue: 'vo', etat: epreuve?.etat ?? null, version: epreuve?.version ?? 0, termine: epreuve?.termine ?? false })
      case 'epreuve_ecrire':
        if ((epreuve?.version ?? 0) !== p.p_version || epreuve?.termine) return json(false)
        epreuve = { etat: p.p_etat, version: p.p_version + 1, termine: p.p_termine }
        return json(true)
      // Les duels entre joueurs : un seul, contre l'adversaire simulé
      case 'jcj_entrer_file':
        if (!duelJcj || duelJcj.statut === 'termine') {
          duelJcj = { id: crypto.randomUUID(), statut: 'preparation', classe: true, etat: {}, secret: null, version: 0, resultat: null }
          return json({ preparer: preparation() })
        }
        return json({ enCours: duelJcj.id })
      case 'jcj_preparer':
        return json(preparation())
      case 'jcj_quitter_file':
        return json(null)
      case 'jcj_lire':
        return json(
          duelJcj && {
            statut: duelJcj.statut,
            classe: duelJcj.classe,
            joueurA: MOI,
            joueurB: LUI,
            pseudoA: 'Vous',
            pseudoB: 'Agent Simulé',
            eloA: 1000,
            eloB: 1000,
            etat: duelJcj.etat,
            secret: duelJcj.secret,
            version: duelJcj.version,
            resultat: duelJcj.resultat,
          },
        )
      case 'jcj_ecrire':
        if (!duelJcj || duelJcj.version !== p.p_version) return json(false)
        Object.assign(duelJcj, { etat: p.p_etat, secret: p.p_secret, version: duelJcj.version + 1, statut: 'en_cours' })
        setTimeout(() => ecouteurs.forEach((f) => f()), 30)
        return json(true)
      case 'jcj_clore': {
        const gains = { credits: 0, xp: 0, elo: 0, profil: null }
        if (duelJcj) Object.assign(duelJcj, { etat: p.p_etat, version: duelJcj.version + 1, statut: 'termine', resultat: { a: gains, b: gains } })
        setTimeout(() => ecouteurs.forEach((f) => f()), 30)
        return json({ a: gains, b: gains })
      }
    }
    return json(null)
  }
  const env = { url: URL_FAUX, cleService: 'atelier', site: location.origin, origines: [location.origin] }
  const appel = async (body: Record<string, unknown>, jeton = 'atelier') => {
    const req = new Request(`${URL_FAUX}/functions/v1/duel`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${jeton}`, 'Content-Type': 'application/json', Origin: location.origin },
      body: JSON.stringify(body),
    })
    const r = await traiter(req, env)
    return { ok: r.ok, data: await r.json() }
  }
  // supabase.functions est un accesseur qui recrée son client à chaque appel : on le masque sur l'instance
  const invoke = async (_nom: string, { body }: { body: Record<string, unknown> }) => {
    const r = await appel(body)
    return r.ok ? { data: r.data, error: null } : { data: null, error: { message: r.data.message as string } }
  }
  Object.defineProperty(supabase, 'functions', { value: { invoke }, configurable: true })
  // Le classement de l'Épreuve et le raid ne se lisent qu'en ligne : ici, des données de démonstration (?mode=hall)
  const vraiRpc = supabase.rpc.bind(supabase)
  Object.defineProperty(supabase, 'rpc', {
    value: (nom: string, params?: object) =>
      nom in DEMO_HALL
        ? Promise.resolve({ data: DEMO_HALL[nom](), error: null })
        : // Le jeu entier (?mode=app) : rien ne part vers le vrai serveur, les écrans s'affichent vides
          modeAtelier === 'app'
          ? Promise.resolve({ data: null, error: null })
          : vraiRpc(nom, params),
    configurable: true,
  })
  // Le direct : chaque écriture du duel prévient l'écran, comme Realtime
  const canal = {
    on: (_t: string, _f: unknown, rappel: () => void) => {
      ecouteurs.add(rappel)
      return canal
    },
    subscribe: () => canal,
  }
  Object.defineProperty(supabase, 'channel', { value: () => canal, configurable: true })
  Object.defineProperty(supabase, 'removeChannel', { value: async () => 'ok', configurable: true })

  // L'adversaire simulé : il pose sa première carte après 2 s, et répond (juste deux fois sur trois) après 4 s
  setInterval(async () => {
    if (!duelJcj || duelJcj.statut !== 'en_cours') return
    const v = (await appel({ action: 'jcj_etat', id: duelJcj.id }, 'adverse')).data
    const e = v?.etat
    if (!e || e.mode !== 'reco') return
    const depuis = (Date.now() - e.maintenant) / 1000
    if (e.phase === 'choix' && !e.choisi.b && depuis > 2) await appel({ action: 'jcj_jouer', id: duelJcj.id, carte: v.main[0] }, 'adverse')
    const q = e.recos?.b?.question
    if (e.phase === 'question' && q && !e.repondu.b && depuis > 4) {
      const bonne = (duelJcj.secret as { bonnes: { b?: number } }).bonnes.b ?? 0
      const choix = Math.random() < 0.66 ? bonne : q.options.map((_: string, i: number) => i).find((i: number) => i !== bonne && !q.retirees.includes(i))
      await appel({ action: 'jcj_repondre', id: duelJcj.id, choix }, 'adverse')
    }
  }, 1000)
}
