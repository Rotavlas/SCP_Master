import { useCallback, useEffect, useRef, useState } from 'react'
import type { Base } from '../data/catalogue'
import { defier } from '../state/jcj'
import { useSauvegarde } from '../state/sauvegarde'
import {
  COUT_CLAN,
  bloquer,
  chercherJoueurs,
  conversationOuverte,
  creerClan,
  debloquer,
  demanderAmi,
  envoyerMessage,
  gererMembre,
  listeClans,
  mesAmis,
  messagesSalon,
  modifierClan,
  monClan,
  quitterClan,
  rafraichirConversations,
  rejoindreClan,
  repondreAmi,
  retirerAmi,
  signalerMessage,
  useConversations,
  useDirectSalon,
  type ActionMembre,
  type Destinataire,
  type FicheClan,
  type MesAmis,
  type Message,
  type MonClan,
  type ResumeClan,
} from '../state/social'
import { Carte } from './Carte'
import { BoutonConfirme, BoutonSaisie } from './Confirmer'

export type OngletSocial = 'amis' | 'clan' | 'messages'

interface Props {
  base: Base
  ouvrirProfil: (pseudo: string) => void
  onglet: OngletSocial
  setOnglet: (o: OngletSocial) => void
  /** Conversation privée à ouvrir (depuis un profil) */
  conversation: Destinataire | null
  setConversation: (d: Destinataire | null) => void
}

export function Social({ base, ouvrirProfil, onglet, setOnglet, conversation, setConversation }: Props) {
  const conversations = useConversations()
  const nonLus = conversations.reduce((t, c) => t + c.nonLus, 0)
  return (
    <section className="social">
      <div className="marche-entete">
        <div>
          <p className="dossier-entete">Réseau du personnel · communications internes</p>
          <h1>Social</h1>
        </div>
        <nav className="onglets-marche" role="tablist">
          {(
            [
              ['amis', 'Amis', 0],
              ['clan', 'Clan', 0],
              ['messages', 'Messages', nonLus],
            ] as const
          ).map(([id, nom, n]) => (
            <button key={id} role="tab" aria-selected={onglet === id} className={onglet === id ? 'actif' : ''} onClick={() => setOnglet(id)}>
              {nom}
              {n > 0 && <span className="compteur compteur-alerte">{n}</span>}
            </button>
          ))}
        </nav>
      </div>
      {onglet === 'amis' && (
        <Amis
          ouvrirProfil={ouvrirProfil}
          ecrire={(pseudo) => {
            setConversation({ type: 'mp', cible: pseudo })
            setOnglet('messages')
          }}
        />
      )}
      {onglet === 'clan' && <Clan base={base} ouvrirProfil={ouvrirProfil} />}
      {onglet === 'messages' && <Messages conversation={conversation} setConversation={setConversation} ouvrirProfil={ouvrirProfil} />}
    </section>
  )
}

// ---------- Amis ----------

function Amis({ ouvrirProfil, ecrire }: { ouvrirProfil: (p: string) => void; ecrire: (p: string) => void }) {
  const [amis, setAmis] = useState<MesAmis | null>(null)
  const [recherche, setRecherche] = useState('')
  const [suggestions, setSuggestions] = useState<string[]>([])
  const charger = useCallback(() => void mesAmis().then(setAmis), [])
  useEffect(charger, [charger])

  useEffect(() => {
    if (recherche.trim().length < 2) return setSuggestions([])
    const t = setTimeout(() => void chercherJoueurs(recherche).then((r) => setSuggestions(r ?? [])), 250)
    return () => clearTimeout(t)
  }, [recherche])

  async function agir(f: () => Promise<unknown>) {
    await f()
    charger()
  }

  return (
    <div className="grille-social">
      <div className="encart">
        <h3>Ajouter un agent</h3>
        <form
          className="ligne-formulaire"
          onSubmit={(e) => {
            e.preventDefault()
            if (recherche.trim()) void agir(() => demanderAmi(recherche.trim())).then(() => setRecherche(''))
          }}
        >
          <input value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="Pseudo de l'agent" list="suggestions-amis" maxLength={24} />
          <datalist id="suggestions-amis">
            {suggestions.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
          <button className="btn btn-principal" disabled={!recherche.trim()}>
            Demander
          </button>
        </form>
        {!!amis?.recues.length && (
          <>
            <h4>Demandes reçues</h4>
            <ul className="liste-simple">
              {amis.recues.map((p) => (
                <li key={p}>
                  <button className="btn-lien" onClick={() => ouvrirProfil(p)}>
                    {p}
                  </button>
                  <span className="actions-ligne">
                    <button className="btn btn-principal" onClick={() => void agir(() => repondreAmi(p, true))}>
                      Accepter
                    </button>
                    <button className="btn" onClick={() => void agir(() => repondreAmi(p, false))}>
                      Refuser
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
        {!!amis?.envoyees.length && (
          <>
            <h4>Demandes envoyées</h4>
            <ul className="liste-simple">
              {amis.envoyees.map((p) => (
                <li key={p}>
                  {p}
                  <button className="btn btn-discret" onClick={() => void agir(() => retirerAmi(p))}>
                    Annuler
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
        {!!amis?.bloques.length && (
          <details>
            <summary>Agents bloqués ({amis.bloques.length})</summary>
            <ul className="liste-simple">
              {amis.bloques.map((p) => (
                <li key={p}>
                  {p}
                  <button className="btn btn-discret" onClick={() => void agir(() => debloquer(p))}>
                    Débloquer
                  </button>
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>

      <div className="encart">
        <h3>Mes amis {amis && <span className="discret">({amis.amis.filter((a) => a.enLigne).length} en ligne)</span>}</h3>
        {!amis ? (
          <p className="discret">Chargement…</p>
        ) : amis.amis.length === 0 ? (
          <p className="discret">Pas encore d'amis. Ajoutez un agent par son pseudo, ou depuis les classements.</p>
        ) : (
          <ul className="liste-amis">
            {amis.amis.map((a) => (
              <li key={a.pseudo}>
                <span className={`point-presence ${a.enLigne ? 'en-ligne' : ''}`} />
                <button className="btn-lien nom" onClick={() => ouvrirProfil(a.pseudo)}>
                  {a.clan && <span className="tag-clan">{a.clan}</span>} {a.pseudo}
                </button>
                <span className="discret">{a.elo}</span>
                <span className="actions-ligne">
                  <button className="btn" disabled={!a.enLigne} title={a.enLigne ? 'Duel amical, sans Elo' : 'Hors ligne'} onClick={() => void defier(a.pseudo)}>
                    Défier
                  </button>
                  <button className="btn" onClick={() => ecrire(a.pseudo)}>
                    Message
                  </button>
                  <button className="btn btn-discret" title="Bloquer" onClick={() => void agir(() => bloquer(a.pseudo))}>
                    ⊘
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

// ---------- Clan ----------

const ROLES = { chef: 'Chef', officier: 'Officier', membre: 'Membre' }

function Clan({ base, ouvrirProfil }: { base: Base; ouvrirProfil: (p: string) => void }) {
  const [clan, setClan] = useState<MonClan | null>(null)
  const charger = useCallback(() => void monClan().then(setClan), [])
  useEffect(charger, [charger])

  if (!clan) return <p className="discret">Chargement…</p>
  if (!clan.tag) return <SansClan base={base} candidatures={clan.candidatures as string[]} recharger={charger} />
  return <MonClanVue base={base} clan={clan as FicheClan} recharger={charger} ouvrirProfil={ouvrirProfil} />
}

function SansClan({ base, candidatures, recharger }: { base: Base; candidatures: string[]; recharger: () => void }) {
  const s = useSauvegarde()
  const [recherche, setRecherche] = useState('')
  const [clans, setClans] = useState<ResumeClan[] | null>(null)
  const [nom, setNom] = useState('')
  const [tag, setTag] = useState('')
  const [description, setDescription] = useState('')
  const [ouvert, setOuvert] = useState(true)

  useEffect(() => {
    const t = setTimeout(() => void listeClans(recherche).then(setClans), 250)
    return () => clearTimeout(t)
  }, [recherche])

  return (
    <div className="grille-social">
      <div className="encart">
        <h3>Rejoindre un clan</h3>
        {candidatures.length > 0 && <p className="alerte">Candidature en attente : {candidatures.map((t) => `[${t}]`).join(', ')}</p>}
        <input value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="Nom ou tag du clan" />
        {!clans ? (
          <p className="discret">Chargement…</p>
        ) : clans.length === 0 ? (
          <p className="discret">Aucun clan trouvé.</p>
        ) : (
          <ul className="liste-clans">
            {clans.map((c) => {
              const embleme = c.embleme ? base.parId.get(c.embleme) : undefined
              return (
                <li key={c.tag}>
                  {embleme && (
                    <span className="mini-embleme">
                      <Carte carte={embleme} base={base} taille="p" inclinable={false} />
                    </span>
                  )}
                  <div>
                    <strong>
                      <span className="tag-clan">{c.tag}</span> {c.nom}
                    </strong>
                    <p className="discret">
                      {c.membres}/30 membres · {c.score} victoires · {c.ouvert ? 'ouvert à tous' : 'sur candidature'}
                    </p>
                    {c.description && <p className="description-clan">{c.description}</p>}
                  </div>
                  <button
                    className="btn"
                    disabled={c.membres >= 30 || candidatures.includes(c.tag)}
                    onClick={() => void rejoindreClan(c.tag).then((r) => r && recharger())}
                  >
                    {c.ouvert ? 'Rejoindre' : 'Postuler'}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
      <form
        className="encart"
        onSubmit={(e) => {
          e.preventDefault()
          void creerClan(nom, tag, description, ouvert).then((r) => r && recharger())
        }}
      >
        <h3>Fonder un clan</h3>
        <p className="discret">
          Coût : {COUT_CLAN.toLocaleString('fr-FR')} ₵ · 30 membres au plus. Le score du clan est la somme des victoires de ses membres en duel.
        </p>
        <label>
          Nom
          <input value={nom} onChange={(e) => setNom(e.target.value)} maxLength={30} required placeholder="Les Gardiens du Site-19" />
        </label>
        <label>
          Tag (2 à 4 lettres ou chiffres)
          <input value={tag} onChange={(e) => setTag(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} maxLength={4} required placeholder="S19" />
        </label>
        <label>
          Description
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={300} rows={3} />
        </label>
        <label className="case">
          <input type="checkbox" checked={ouvert} onChange={(e) => setOuvert(e.target.checked)} /> Ouvert à tous (sinon, sur candidature)
        </label>
        <button className="btn btn-principal" disabled={s.credits < COUT_CLAN || nom.trim().length < 3 || tag.length < 2}>
          Fonder · {COUT_CLAN.toLocaleString('fr-FR')} ₵
        </button>
      </form>
    </div>
  )
}

function MonClanVue({ base, clan, recharger, ouvrirProfil }: { base: Base; clan: FicheClan; recharger: () => void; ouvrirProfil: (p: string) => void }) {
  const s = useSauvegarde()
  const [description, setDescription] = useState(clan.description)
  const [reglages, setReglages] = useState(false)
  const embleme = clan.embleme ? base.parId.get(clan.embleme) : undefined
  const dirige = clan.monRole === 'chef' || clan.monRole === 'officier'

  async function gerer(pseudo: string, action: ActionMembre) {
    if (await gererMembre(pseudo, action)) recharger()
  }

  return (
    <div className="grille-social">
      <div className="encart">
        <div className="entete-clan">
          {embleme && (
            <span className="embleme-clan">
              <Carte carte={embleme} base={base} taille="p" inclinable={false} />
            </span>
          )}
          <div>
            <h2>
              <span className="tag-clan">{clan.tag}</span> {clan.nom}
            </h2>
            <p className="discret">
              {clan.membres.length}/30 membres · {clan.score} victoires · {clan.ouvert ? 'ouvert à tous' : 'sur candidature'} · fondé le{' '}
              {new Date(clan.creeLe).toLocaleDateString('fr-FR')}
            </p>
            {clan.description && <p className="description-clan">{clan.description}</p>}
          </div>
        </div>

        {clan.candidatures && clan.candidatures.length > 0 && (
          <>
            <h4>Candidatures</h4>
            <ul className="liste-simple">
              {clan.candidatures.map((c) => (
                <li key={c.pseudo}>
                  <button className="btn-lien" onClick={() => ouvrirProfil(c.pseudo)}>
                    {c.pseudo}
                  </button>
                  <span className="discret">{c.elo}</span>
                  <span className="actions-ligne">
                    <button className="btn btn-principal" onClick={() => void gerer(c.pseudo, 'accepter')}>
                      Accepter
                    </button>
                    <button className="btn" onClick={() => void gerer(c.pseudo, 'refuser')}>
                      Refuser
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}

        <h4>Membres</h4>
        <ul className="liste-amis">
          {clan.membres.map((m) => (
            <li key={m.pseudo}>
              <span className={`point-presence ${m.enLigne ? 'en-ligne' : ''}`} />
              <button className="btn-lien nom" onClick={() => ouvrirProfil(m.pseudo)}>
                {m.pseudo}
              </button>
              <span className={`role-clan role-${m.role}`}>{ROLES[m.role]}</span>
              <span className="discret">
                {m.elo} · {m.victoires} V
              </span>
              {dirige && m.pseudo !== s.agent && m.role !== 'chef' && (
                <span className="actions-ligne">
                  {clan.monRole === 'chef' &&
                    (m.role === 'membre' ? (
                      <button className="btn" onClick={() => void gerer(m.pseudo, 'promouvoir')}>
                        Promouvoir
                      </button>
                    ) : (
                      <>
                        <button className="btn" onClick={() => void gerer(m.pseudo, 'retrograder')}>
                          Rétrograder
                        </button>
                        <BoutonConfirme
                          question={`Confier la direction du clan à ${m.pseudo} ? Vous deviendrez officier.`}
                          confirmer="Nommer chef"
                          onConfirme={() => void gerer(m.pseudo, 'chef')}
                        >
                          Nommer chef
                        </BoutonConfirme>
                      </>
                    ))}
                  {(clan.monRole === 'chef' || m.role === 'membre') && (
                    <BoutonConfirme
                      className="btn btn-discret"
                      danger
                      question={`Exclure ${m.pseudo} du clan ?`}
                      confirmer="Exclure"
                      onConfirme={() => void gerer(m.pseudo, 'exclure')}
                    >
                      Exclure
                    </BoutonConfirme>
                  )}
                </span>
              )}
            </li>
          ))}
        </ul>

        <div className="actions">
          {clan.monRole === 'chef' && (
            <button className="btn" onClick={() => setReglages(!reglages)}>
              Réglages du clan
            </button>
          )}
          <BoutonConfirme
            className="btn btn-discret"
            danger
            question={clan.monRole === 'chef' ? 'Quitter le clan ? La direction passera au plus ancien officier.' : 'Quitter le clan ?'}
            confirmer="Quitter"
            onConfirme={() => void quitterClan().then((r) => r && recharger())}
          >
            Quitter le clan
          </BoutonConfirme>
        </div>
        {reglages && (
          <form
            className="reglages-clan"
            onSubmit={(e) => {
              e.preventDefault()
              const form = new FormData(e.currentTarget)
              void modifierClan(description, form.get('ouvert') === 'on', (form.get('embleme') as string) || null).then((r) => {
                if (r) {
                  setReglages(false)
                  recharger()
                }
              })
            }}
          >
            <label>
              Description
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={300} rows={3} />
            </label>
            <label className="case">
              <input type="checkbox" name="ouvert" defaultChecked={clan.ouvert} /> Ouvert à tous
            </label>
            <label>
              Emblème (une carte de votre collection)
              <select name="embleme" defaultValue={clan.embleme ?? ''}>
                <option value="">— inchangé —</option>
                {Object.keys(s.collection)
                  .map((id) => base.parId.get(id))
                  .filter((c) => !!c)
                  .sort((a, b) => b!.ra - a!.ra)
                  .slice(0, 200)
                  .map((c) => (
                    <option key={c!.id} value={c!.id}>
                      {c!.num ?? ''} {c!.nm}
                    </option>
                  ))}
              </select>
            </label>
            <button className="btn btn-principal">Enregistrer</button>
          </form>
        )}
      </div>

      <div className="encart encart-chat">
        <h3>Salon du clan</h3>
        <Chat destinataire={{ type: 'clan', cible: clan.tag }} ouvrirProfil={ouvrirProfil} />
      </div>
    </div>
  )
}

// ---------- Messages ----------

function Messages({
  conversation,
  setConversation,
  ouvrirProfil,
}: {
  conversation: Destinataire | null
  setConversation: (d: Destinataire | null) => void
  ouvrirProfil: (p: string) => void
}) {
  const conversations = useConversations()
  useEffect(() => void rafraichirConversations(), [])
  const active = conversation ?? (conversations[0] ? { type: conversations[0].type, cible: conversations[0].cible } : null)

  return (
    <div className="messagerie">
      <ul className="liste-conversations">
        {conversations.length === 0 && <li className="discret">Pas de conversation : ajoutez des amis ou rejoignez un clan.</li>}
        {conversations.map((c) => {
          const choisie = active?.type === c.type && active.cible === c.cible
          return (
            <li key={`${c.type}:${c.cible}`}>
              <button className={choisie ? 'actif' : ''} onClick={() => setConversation({ type: c.type, cible: c.cible })}>
                <span className="titre-conversation">
                  {c.type === 'clan' ? (
                    <>
                      Salon <span className="tag-clan">{c.cible}</span>
                    </>
                  ) : (
                    <>
                      <span className={`point-presence ${c.enLigne ? 'en-ligne' : ''}`} />
                      {c.cible}
                    </>
                  )}
                  {c.nonLus > 0 && !choisie && <span className="compteur compteur-alerte">{c.nonLus}</span>}
                </span>
                {c.dernier && (
                  <span className="apercu">
                    {c.dernier.pseudo} : {c.dernier.texte}
                  </span>
                )}
              </button>
            </li>
          )
        })}
      </ul>
      <div className="encart encart-chat">
        {active ? (
          <>
            <h3>
              {active.type === 'clan' ? (
                <>
                  Salon <span className="tag-clan">{active.cible}</span>
                </>
              ) : (
                <button className="btn-lien" onClick={() => ouvrirProfil(active.cible)}>
                  {active.cible}
                </button>
              )}
            </h3>
            <Chat key={`${active.type}:${active.cible}`} destinataire={active} ouvrirProfil={ouvrirProfil} />
          </>
        ) : (
          <p className="discret">Choisissez une conversation.</p>
        )}
      </div>
    </div>
  )
}

/** Une conversation en direct : historique, envoi, signalement. */
function Chat({ destinataire, ouvrirProfil }: { destinataire: Destinataire; ouvrirProfil: (p: string) => void }) {
  const [salon, setSalon] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [plusAnciens, setPlusAnciens] = useState(false)
  const [texte, setTexte] = useState('')
  const [envoi, setEnvoi] = useState(false)
  const fil = useRef<HTMLDivElement>(null)
  const enBas = useRef(true)

  useEffect(() => {
    conversationOuverte(destinataire)
    void messagesSalon(destinataire).then((r) => {
      if (!r) return
      setSalon(r.salon)
      setMessages(r.messages)
      setPlusAnciens(r.messages.length === 50)
      void rafraichirConversations()
    })
    return () => conversationOuverte(null)
  }, [destinataire.type, destinataire.cible]) // destinataire est recréé à chaque rendu : on suit son contenu

  useDirectSalon(salon, (m) => {
    setMessages((liste) => (liste.some((x) => x.id === m.id) ? liste : [...liste, m]))
    void rafraichirConversations()
  })

  // Reste collé au dernier message, sauf si l'on remonte lire l'historique
  useEffect(() => {
    if (enBas.current && fil.current) fil.current.scrollTop = fil.current.scrollHeight
  }, [messages])

  async function envoyer() {
    if (!texte.trim() || envoi) return
    setEnvoi(true)
    const m = await envoyerMessage(destinataire, texte)
    setEnvoi(false)
    if (!m) return
    setTexte('')
    enBas.current = true
    setMessages((liste) => (liste.some((x) => x.id === m.id) ? liste : [...liste, m]))
  }

  async function charger() {
    const r = await messagesSalon(destinataire, messages[0]?.id)
    if (!r) return
    enBas.current = false
    setMessages((liste) => [...r.messages, ...liste])
    setPlusAnciens(r.messages.length === 50)
  }

  return (
    <div className="chat">
      <div
        className="fil-messages"
        ref={fil}
        onScroll={(e) => {
          const el = e.currentTarget
          enBas.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40
        }}
      >
        {plusAnciens && (
          <button className="btn-lien charger-plus" onClick={() => void charger()}>
            Messages précédents
          </button>
        )}
        {messages.length === 0 && <p className="discret">Aucun message pour l'instant.</p>}
        {messages.map((m, i) => {
          const suite = i > 0 && messages[i - 1].pseudo === m.pseudo
          return (
            <div key={m.id} className={`bulle ${m.moi ? 'moi' : ''} ${suite ? 'suite' : ''}`}>
              {!suite && !m.moi && (
                <button className="btn-lien auteur" onClick={() => ouvrirProfil(m.pseudo)}>
                  {m.pseudo}
                </button>
              )}
              <p>{m.texte}</p>
              <span className="heure">
                {new Date(m.creeLe).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                {!m.moi && (
                  <BoutonSaisie
                    className="signaler"
                    title="Signaler ce message"
                    question="Pourquoi signaler ce message ?"
                    envoyer="Signaler"
                    onEnvoi={(raison) => void signalerMessage(m.id, raison)}
                  >
                    ⚑
                  </BoutonSaisie>
                )}
              </span>
            </div>
          )
        })}
      </div>
      <form
        className="saisie-message"
        onSubmit={(e) => {
          e.preventDefault()
          void envoyer()
        }}
      >
        <input value={texte} onChange={(e) => setTexte(e.target.value)} maxLength={500} placeholder="Votre message…" aria-label="Message" />
        <button className="btn btn-principal" disabled={!texte.trim() || envoi}>
          Envoyer
        </button>
      </form>
    </div>
  )
}
