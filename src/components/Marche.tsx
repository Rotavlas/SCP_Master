import { useCallback, useEffect, useMemo, useState } from 'react'
import { RARETES, designation, type Base } from '../data/catalogue'
import { miseMinimale, netVendeur, tempsRestant } from '../engine/marche'
import { PAR_ID, VARIANTES, type IdVariante } from '../engine/variantes'
import {
  annulerEchange,
  annulerEnchere,
  chargerMarche,
  chercherJoueurs,
  collectionEchangeable,
  encherir,
  historiqueMises,
  mesEchanges,
  proposerEchange,
  repondreEchange,
  useDirectEncheres,
  type Disponible,
  type Enchere,
  type EtatMarche,
  type LigneOffre,
  type Mise,
  type Offre,
} from '../state/marche'
import { useSauvegarde } from '../state/sauvegarde'
import type { Carte as TCarte } from '../types'
import { Carte } from './Carte'
import { BoutonConfirme } from './Confirmer'

type Onglet = 'encheres' | 'ventes' | 'echanges'
const credits = (n: number) => `${n.toLocaleString('fr-FR')} ₵`

/** Hôtel des ventes en direct, ventes personnelles et échanges entre joueurs. */
export function Marche({ base, ouvrirCarte, recherche: rechercheInitiale }: { base: Base; ouvrirCarte: (id: string) => void; recherche: string }) {
  const s = useSauvegarde()
  const [onglet, setOnglet] = useState<Onglet>('encheres')
  const [etat, setEtat] = useState<EtatMarche | null>(null)
  // Écart entre l'horloge du serveur et celle du navigateur, pour des comptes à rebours justes
  const [decalage, setDecalage] = useState(0)
  const [maintenant, setMaintenant] = useState(Date.now())

  const rafraichir = useCallback(async () => {
    const e = await chargerMarche()
    if (!e) return
    setDecalage(Date.parse(e.maintenant) - Date.now())
    setEtat(e)
  }, [])

  useEffect(() => {
    void rafraichir()
    // Le direct recharge à chaque mise ; ce rappel régulier rattrape une connexion temps réel coupée
    const recharge = setInterval(() => void rafraichir(), 30_000)
    const horloge = setInterval(() => setMaintenant(Date.now()), 1000)
    return () => {
      clearInterval(recharge)
      clearInterval(horloge)
    }
  }, [rafraichir])
  useDirectEncheres(() => void rafraichir())

  // Une vente arrivée à échéance : le serveur la conclut au prochain chargement
  const echues = etat?.ouvertes.some((e) => Date.parse(e.fin) <= maintenant + decalage)
  useEffect(() => {
    if (echues) {
      const t = setTimeout(() => void rafraichir(), 1500)
      return () => clearTimeout(t)
    }
  }, [echues, rafraichir])

  const miennes = etat?.ouvertes.filter((e) => e.aMoi).length ?? 0

  return (
    <section className="marche">
      <div className="marche-entete">
        <div>
          <p className="dossier-entete">Bureau des transferts · Site-19</p>
          <h1>Marché</h1>
        </div>
        <nav className="onglets-marche" role="tablist">
          {(
            [
              ['encheres', 'Enchères en direct', etat?.ouvertes.length],
              ['ventes', 'Mes ventes', miennes],
              ['echanges', 'Échanges', s.offresRecues],
            ] as const
          ).map(([id, nom, n]) => (
            <button key={id} role="tab" aria-selected={onglet === id} className={onglet === id ? 'actif' : ''} onClick={() => setOnglet(id)}>
              {nom}
              {!!n && <span className={`compteur ${id === 'echanges' ? 'compteur-alerte' : ''}`}>{n}</span>}
            </button>
          ))}
        </nav>
      </div>

      {onglet === 'encheres' && (
        <Encheres base={base} etat={etat} maintenant={maintenant + decalage} ouvrirCarte={ouvrirCarte} rechercheInitiale={rechercheInitiale} rafraichir={rafraichir} />
      )}
      {onglet === 'ventes' && <MesVentes base={base} etat={etat} maintenant={maintenant + decalage} ouvrirCarte={ouvrirCarte} rafraichir={rafraichir} />}
      {onglet === 'echanges' && <Echanges base={base} ouvrirCarte={ouvrirCarte} />}
    </section>
  )
}

// ---------- Enchères ----------

type Tri = 'fin' | 'prix' | 'rarete'

function Encheres({
  base,
  etat,
  maintenant,
  ouvrirCarte,
  rechercheInitiale,
  rafraichir,
}: {
  base: Base
  etat: EtatMarche | null
  maintenant: number
  ouvrirCarte: (id: string) => void
  rechercheInitiale: string
  rafraichir: () => Promise<void>
}) {
  const [recherche, setRecherche] = useState(rechercheInitiale)
  const [rarete, setRarete] = useState<number | 'toutes'>('toutes')
  const [variante, setVariante] = useState<IdVariante | 'toutes'>('toutes')
  const [enTete, setEnTete] = useState(false)
  const [tri, setTri] = useState<Tri>('fin')

  const liste = useMemo(() => {
    if (!etat) return []
    const r = recherche.trim().toLowerCase()
    const prix = (e: Enchere) => e.mise ?? e.prixDepart
    return etat.ouvertes
      .map((e) => ({ e, carte: base.parId.get(e.carte) }))
      .filter((x): x is { e: Enchere; carte: TCarte } => !!x.carte)
      .filter(({ e, carte }) => {
        if (rarete !== 'toutes' && carte.ra !== rarete) return false
        if (variante !== 'toutes' && e.variante !== variante) return false
        if (enTete && !e.enTete) return false
        return !r || carte.id === r || `${carte.num ?? ''} ${carte.nm} ${e.vendeur}`.toLowerCase().includes(r)
      })
      .sort((a, b) => (tri === 'prix' ? prix(b.e) - prix(a.e) : tri === 'rarete' ? b.carte.ra - a.carte.ra || Date.parse(a.e.fin) - Date.parse(b.e.fin) : Date.parse(a.e.fin) - Date.parse(b.e.fin)))
  }, [etat, base, recherche, rarete, variante, enTete, tri])

  if (!etat) return <p className="discret">Connexion au bureau des transferts…</p>

  return (
    <>
      <div className="filtres">
        <input type="search" placeholder="Carte ou vendeur…" value={recherche} onChange={(e) => setRecherche(e.target.value)} />
        <select value={rarete} onChange={(e) => setRarete(e.target.value === 'toutes' ? 'toutes' : Number(e.target.value))}>
          <option value="toutes">Toutes raretés</option>
          {RARETES.map((r, i) => (
            <option key={r.nom} value={i}>
              {r.nom}
            </option>
          ))}
        </select>
        <select value={variante} onChange={(e) => setVariante(e.target.value as IdVariante | 'toutes')}>
          <option value="toutes">Toutes variantes</option>
          {VARIANTES.map((v) => (
            <option key={v.id} value={v.id}>
              {v.nom}
            </option>
          ))}
        </select>
        <select value={tri} onChange={(e) => setTri(e.target.value as Tri)}>
          <option value="fin">Fin la plus proche</option>
          <option value="prix">Prix le plus haut</option>
          <option value="rarete">Rareté</option>
        </select>
        <label className="case">
          <input type="checkbox" checked={enTete} onChange={(e) => setEnTete(e.target.checked)} /> Où je mène
        </label>
      </div>
      <p className="discret direct">
        <span className="point-direct" aria-hidden="true" /> En direct · {etat.ouvertes.length} vente{etat.ouvertes.length > 1 ? 's' : ''} en cours. Mise minimale : +5 %. Une mise dans les 2 dernières minutes
        prolonge la vente de 2 minutes.
      </p>
      {liste.length === 0 ? (
        <p className="alerte">Aucune vente ne correspond. Mettez une carte en vente depuis sa fiche, dans vos archives.</p>
      ) : (
        <div className="liste-encheres">
          {liste.map(({ e, carte }) => (
            <LigneEnchere key={e.id} e={e} carte={carte} base={base} maintenant={maintenant} ouvrirCarte={ouvrirCarte} rafraichir={rafraichir} />
          ))}
        </div>
      )}
    </>
  )
}

function LigneEnchere({
  e,
  carte,
  base,
  maintenant,
  ouvrirCarte,
  rafraichir,
}: {
  e: Enchere
  carte: TCarte
  base: Base
  maintenant: number
  ouvrirCarte: (id: string) => void
  rafraichir: () => Promise<void>
}) {
  const s = useSauvegarde()
  const minimum = miseMinimale(e.mise, e.prixDepart)
  const [montant, setMontant] = useState(String(minimum))
  const [occupe, setOccupe] = useState(false)
  // Un autre joueur a misé : la proposition suit la nouvelle mise minimale
  useEffect(() => setMontant(String(minimum)), [minimum])
  const fin = Date.parse(e.fin)
  const urgent = fin - maintenant < 120_000
  const m = Number(montant)
  const valide = Number.isInteger(m) && m >= minimum && m <= s.credits

  async function miser(somme: number) {
    setOccupe(true)
    await encherir(e.id, somme)
    setOccupe(false)
    await rafraichir()
  }

  return (
    <article className={`enchere ${e.enTete ? 'en-tete' : ''} ${e.aMoi ? 'a-moi' : ''}`}>
      <Carte carte={carte} base={base} taille="p" variante={e.variante} inclinable={false} onClick={() => ouvrirCarte(carte.id)} />
      <div className="enchere-infos">
        <h3>
          {designation(carte)}
          {carte.num && <span>{carte.nm}</span>}
        </h3>
        <p className="discret">
          <span style={{ color: PAR_ID[e.variante].couleur }}>{PAR_ID[e.variante].nom}</span>
          {e.serie !== null && ` · n° ${e.serie}`} · vendu par {e.aMoi ? 'vous' : e.vendeur}
        </p>
        <p className="enchere-prix">
          {/* La clé suit la mise : l'animation rejoue à chaque nouvelle mise */}
          <strong key={e.mise ?? 'depart'} className="prix-maj">
            {credits(e.mise ?? e.prixDepart)}
          </strong>
          <span className="discret">{e.mise === null ? ' mise de départ' : ` par ${e.enTete ? 'vous' : e.meneur ?? '—'}`}</span>
          {e.enTete && <span className="badge-tete">Vous menez</span>}
        </p>
        <p className={`enchere-fin ${urgent ? 'urgent' : ''}`}>Fin dans {tempsRestant(fin, maintenant)}</p>
        {e.nbMises > 0 && <HistoriqueMises idEnchere={e.id} nbMises={e.nbMises} />}
      </div>
      <div className="enchere-actions">
        {e.aMoi ? (
          e.nbMises === 0 ? (
            <button className="btn btn-discret" disabled={occupe} onClick={() => void annulerEnchere(e.id).then(rafraichir)}>
              Retirer la vente
            </button>
          ) : (
            <p className="discret">Votre vente : {credits(netVendeur(e.mise ?? 0))} après frais</p>
          )
        ) : e.enTete ? (
          <p className="discret">Votre mise est en tête.</p>
        ) : (
          <>
            <form
              className="miser"
              onSubmit={(ev) => {
                ev.preventDefault()
                if (valide) void miser(m)
              }}
            >
              <input type="number" min={minimum} step={1} value={montant} onChange={(ev) => setMontant(ev.target.value)} aria-label="Montant de la mise" />
              <button className="btn btn-principal" disabled={!valide || occupe}>
                Enchérir
              </button>
            </form>
            {m > s.credits && <p className="discret urgent">Solde insuffisant</p>}
            {e.achatImmediat !== null && (
              <BoutonConfirme
                disabled={occupe || e.achatImmediat > s.credits}
                question={`Acheter tout de suite pour ${credits(e.achatImmediat)} ?`}
                confirmer="Acheter"
                onConfirme={() => void miser(e.achatImmediat!)}
              >
                Achat immédiat {credits(e.achatImmediat)}
              </BoutonConfirme>
            )}
          </>
        )}
      </div>
    </article>
  )
}

/** Les mises d'une enchère, dépliables ; rechargées à chaque nouvelle mise (nbMises change avec le direct). */
function HistoriqueMises({ idEnchere, nbMises }: { idEnchere: string; nbMises: number }) {
  const [ouvert, setOuvert] = useState(false)
  const [mises, setMises] = useState<Mise[] | null>(null)
  useEffect(() => {
    if (ouvert) void historiqueMises(idEnchere).then(setMises)
  }, [ouvert, idEnchere, nbMises])

  return (
    <div className="historique-mises">
      <button className="btn-lien" aria-expanded={ouvert} onClick={() => setOuvert(!ouvert)}>
        {ouvert ? 'Masquer' : 'Historique des'} {nbMises} mise{nbMises > 1 ? 's' : ''}
      </button>
      {ouvert && (
        <ol>
          {!mises && <li className="discret">Chargement…</li>}
          {mises?.map((m, i) => (
            <li key={`${m.le}-${i}`} className={`${i === 0 ? 'meilleure' : ''} ${m.moi ? 'moi' : ''}`}>
              <strong>{credits(m.montant)}</strong>
              <span>{m.moi ? 'vous' : m.pseudo}</span>
              <span className="discret">{new Date(m.le).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

// ---------- Mes ventes ----------

function MesVentes({
  base,
  etat,
  maintenant,
  ouvrirCarte,
  rafraichir,
}: {
  base: Base
  etat: EtatMarche | null
  maintenant: number
  ouvrirCarte: (id: string) => void
  rafraichir: () => Promise<void>
}) {
  if (!etat) return <p className="discret">Connexion au bureau des transferts…</p>
  const miennes = etat.ouvertes.filter((e) => e.aMoi || e.enTete)
  const STATUTS = { vendue: 'Vendue', invendue: 'Sans acheteur', annulee: 'Retirée' } as const
  return (
    <>
      <p className="discret">Pour vendre une carte, ouvrez sa fiche dans vos archives : le cours et la mise aux enchères s'y trouvent.</p>
      <h2>En cours</h2>
      {miennes.length === 0 ? (
        <p className="discret">Aucune vente ni mise en tête.</p>
      ) : (
        <div className="liste-encheres">
          {miennes.map((e) => {
            const carte = base.parId.get(e.carte)
            return carte ? <LigneEnchere key={e.id} e={e} carte={carte} base={base} maintenant={maintenant} ouvrirCarte={ouvrirCarte} rafraichir={rafraichir} /> : null
          })}
        </div>
      )}
      <h2>Historique</h2>
      {etat.historique.length === 0 ? (
        <p className="discret">Rien pour l'instant.</p>
      ) : (
        <table className="historique">
          <thead>
            <tr>
              <th>Carte</th>
              <th>Rôle</th>
              <th>Issue</th>
              <th>Prix</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            {etat.historique.map((h) => {
              const carte = base.parId.get(h.carte)
              return (
                <tr key={h.id}>
                  <td>
                    <button className="btn-lien" onClick={() => ouvrirCarte(h.carte)}>
                      {carte ? designation(carte) : h.carte}
                    </button>{' '}
                    <span className="discret">
                      {PAR_ID[h.variante].nom}
                      {h.serie !== null && ` n° ${h.serie}`}
                    </span>
                  </td>
                  <td>{h.vendu ? 'Vendeur' : 'Acheteur'}</td>
                  <td>{STATUTS[h.statut]}</td>
                  <td>{h.mise === null ? '—' : h.vendu && h.statut === 'vendue' ? `${credits(h.mise)} (net ${credits(netVendeur(h.mise))})` : credits(h.mise)}</td>
                  <td>{new Date(h.close).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </>
  )
}

// ---------- Échanges ----------

function Echanges({ base, ouvrirCarte }: { base: Base; ouvrirCarte: (id: string) => void }) {
  const [offres, setOffres] = useState<Offre[] | null>(null)
  const [nouvelle, setNouvelle] = useState(false)
  const recharger = useCallback(() => void mesEchanges().then(setOffres), [])
  useEffect(recharger, [recharger])

  if (!offres) return <p className="discret">Ouverture du registre des échanges…</p>
  const recues = offres.filter((o) => o.recue && o.statut === 'ouverte')
  const envoyees = offres.filter((o) => !o.recue && o.statut === 'ouverte')
  const closes = offres.filter((o) => o.statut !== 'ouverte')

  return (
    <>
      {nouvelle ? (
        <NouvelleOffre
          base={base}
          fermer={() => {
            setNouvelle(false)
            recharger()
          }}
        />
      ) : (
        <div className="actions">
          <button className="btn btn-principal" onClick={() => setNouvelle(true)}>
            Proposer un échange
          </button>
          <p className="discret">Ce que vous proposez est réservé jusqu'à la réponse. L'échange se fait d'un coup, ou pas du tout. Une offre expire au bout de 7 jours.</p>
        </div>
      )}
      <h2>Offres reçues</h2>
      {recues.length === 0 ? <p className="discret">Aucune offre en attente.</p> : recues.map((o) => <CarteOffre key={o.id} o={o} base={base} ouvrirCarte={ouvrirCarte} apres={recharger} />)}
      <h2>Offres envoyées</h2>
      {envoyees.length === 0 ? <p className="discret">Aucune offre en attente.</p> : envoyees.map((o) => <CarteOffre key={o.id} o={o} base={base} ouvrirCarte={ouvrirCarte} apres={recharger} />)}
      {closes.length > 0 && (
        <>
          <h2>30 derniers jours</h2>
          {closes.map((o) => (
            <CarteOffre key={o.id} o={o} base={base} ouvrirCarte={ouvrirCarte} apres={recharger} />
          ))}
        </>
      )}
    </>
  )
}

const STATUTS_OFFRE = { ouverte: 'En attente', acceptee: 'Acceptée', refusee: 'Refusée', annulee: 'Annulée', expiree: 'Expirée' } as const

function Lignes({ lignes, creditsOfferts, base, ouvrirCarte }: { lignes: LigneOffre[]; creditsOfferts: number; base: Base; ouvrirCarte: (id: string) => void }) {
  return (
    <ul className="lignes-offre">
      {lignes.map((l, i) => {
        const carte = base.parId.get(l.c)
        return (
          <li key={i}>
            <button className="btn-lien" onClick={() => ouvrirCarte(l.c)} style={{ color: carte ? RARETES[carte.ra].couleur : undefined }}>
              {carte ? designation(carte) : l.c}
            </button>{' '}
            <span className="discret">
              {carte?.num ? carte.nm : ''} · {PAR_ID[l.v].nom}
              {l.s !== null && ` n° ${l.s}`}
            </span>
          </li>
        )
      })}
      {creditsOfferts > 0 && <li className="credits-offre">{credits(creditsOfferts)}</li>}
      {lignes.length === 0 && creditsOfferts === 0 && <li className="discret">Rien</li>}
    </ul>
  )
}

function CarteOffre({ o, base, ouvrirCarte, apres }: { o: Offre; base: Base; ouvrirCarte: (id: string) => void; apres: () => void }) {
  const [occupe, setOccupe] = useState(false)
  const agir = async (f: () => Promise<boolean>) => {
    setOccupe(true)
    await f()
    setOccupe(false)
    apres()
  }
  // Côté auteur : « je donne / je demande » ; côté destinataire, les rôles s'inversent
  const [recois, donne, recoisCredits, donneCredits] = o.recue ? [o.donne, o.demande, o.creditsDe, o.creditsA] : [o.demande, o.donne, o.creditsA, o.creditsDe]
  return (
    <article className={`offre ${o.statut}`}>
      <header>
        <strong>{o.recue ? `De ${o.avec}` : `À ${o.avec}`}</strong>
        <span className={`statut-offre ${o.statut}`}>{STATUTS_OFFRE[o.statut]}</span>
        <span className="discret">
          {o.statut === 'ouverte' ? `expire le ${new Date(o.expire).toLocaleDateString('fr-FR')}` : new Date(o.close ?? o.cree).toLocaleDateString('fr-FR')}
        </span>
      </header>
      {o.message && <blockquote>{o.message}</blockquote>}
      <div className="offre-cotes">
        <div>
          <h4>Vous recevez</h4>
          <Lignes lignes={recois} creditsOfferts={recoisCredits} base={base} ouvrirCarte={ouvrirCarte} />
        </div>
        <span className="offre-fleche" aria-hidden="true">
          ⇄
        </span>
        <div>
          <h4>Vous donnez</h4>
          <Lignes lignes={donne} creditsOfferts={donneCredits} base={base} ouvrirCarte={ouvrirCarte} />
        </div>
      </div>
      {o.statut === 'ouverte' && (
        <div className="actions">
          {o.recue ? (
            <>
              <BoutonConfirme
                className="btn btn-principal"
                disabled={occupe}
                question={`Accepter l'échange avec ${o.avec} ?`}
                confirmer="Oui, échanger"
                onConfirme={() => void agir(() => repondreEchange(o.id, true))}
              >
                Accepter
              </BoutonConfirme>
              <button className="btn" disabled={occupe} onClick={() => void agir(() => repondreEchange(o.id, false))}>
                Refuser
              </button>
            </>
          ) : (
            <button className="btn" disabled={occupe} onClick={() => void agir(() => annulerEchange(o.id))}>
              Retirer l'offre
            </button>
          )}
        </div>
      )}
    </article>
  )
}

/** Composer une offre : choisir le joueur, puis ce qu'on donne et ce qu'on demande dans les cartes libres de chacun. */
function NouvelleOffre({ base, fermer }: { base: Base; fermer: () => void }) {
  const s = useSauvegarde()
  const [texte, setTexte] = useState('')
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [joueur, setJoueur] = useState<string | null>(null)
  const [miennes, setMiennes] = useState<Disponible[]>([])
  const [siennes, setSiennes] = useState<Disponible[]>([])
  const [donne, setDonne] = useState<{ c: string; v: IdVariante }[]>([])
  const [demande, setDemande] = useState<{ c: string; v: IdVariante }[]>([])
  const [creditsDonnes, setCreditsDonnes] = useState('')
  const [creditsDemandes, setCreditsDemandes] = useState('')
  const [message, setMessage] = useState('')
  const [occupe, setOccupe] = useState(false)

  useEffect(() => {
    if (joueur || texte.trim().length < 2) return setSuggestions([])
    const t = setTimeout(() => void chercherJoueurs(texte).then((r) => setSuggestions(r ?? [])), 250)
    return () => clearTimeout(t)
  }, [texte, joueur])

  useEffect(() => {
    if (!joueur) return
    void collectionEchangeable(joueur).then((r) => setSiennes(r ?? []))
    void collectionEchangeable(s.agent).then((r) => setMiennes(r ?? []))
  }, [joueur, s.agent])

  const cd = Number(creditsDonnes || 0)
  const cde = Number(creditsDemandes || 0)
  const valide =
    !!joueur &&
    Number.isInteger(cd) &&
    Number.isInteger(cde) &&
    cd >= 0 &&
    cde >= 0 &&
    cd <= s.credits &&
    (donne.length > 0 || cd > 0) &&
    (demande.length > 0 || cde > 0)

  if (!joueur) {
    return (
      <div className="nouvelle-offre">
        <h2>Proposer un échange</h2>
        <label>
          Avec quel agent ?
          <input type="search" autoFocus placeholder="Début du pseudo…" value={texte} onChange={(e) => setTexte(e.target.value)} />
        </label>
        <ul className="suggestions">
          {suggestions.map((p) => (
            <li key={p}>
              <button className="btn" onClick={() => setJoueur(p)}>
                {p}
              </button>
            </li>
          ))}
          {texte.trim().length >= 2 && suggestions.length === 0 && <li className="discret">Aucun agent trouvé.</li>}
        </ul>
        <button className="btn btn-discret" onClick={fermer}>
          Annuler
        </button>
      </div>
    )
  }

  return (
    <form
      className="nouvelle-offre"
      onSubmit={async (e) => {
        e.preventDefault()
        if (!valide) return
        setOccupe(true)
        const ok = await proposerEchange(joueur, donne, demande, cd, cde, message)
        setOccupe(false)
        if (ok) fermer()
      }}
    >
      <h2>Échange avec {joueur}</h2>
      <div className="offre-cotes">
        <Selection titre="Vous donnez" base={base} disponibles={miennes} choix={donne} setChoix={setDonne} credits={creditsDonnes} setCredits={setCreditsDonnes} max={s.credits} />
        <span className="offre-fleche" aria-hidden="true">
          ⇄
        </span>
        <Selection titre={`Vous demandez à ${joueur}`} base={base} disponibles={siennes} choix={demande} setChoix={setDemande} credits={creditsDemandes} setCredits={setCreditsDemandes} />
      </div>
      <label>
        Message (facultatif)
        <input maxLength={200} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Votre doublon contre le mien ?" />
      </label>
      <div className="actions">
        <button className="btn btn-principal" disabled={!valide || occupe}>
          Envoyer l'offre
        </button>
        <button type="button" className="btn btn-discret" onClick={fermer}>
          Annuler
        </button>
        {!valide && <span className="discret">Chaque côté doit contenir au moins une carte ou des crédits.</span>}
      </div>
    </form>
  )
}

function Selection({
  titre,
  base,
  disponibles,
  choix,
  setChoix,
  credits: montant,
  setCredits,
  max,
}: {
  titre: string
  base: Base
  disponibles: Disponible[]
  choix: { c: string; v: IdVariante }[]
  setChoix: (c: { c: string; v: IdVariante }[]) => void
  credits: string
  setCredits: (c: string) => void
  max?: number
}) {
  const [filtre, setFiltre] = useState('')
  const restants = (d: Disponible) => d.n - choix.filter((x) => x.c === d.c && x.v === d.v).length
  const visibles = useMemo(() => {
    const r = filtre.trim().toLowerCase()
    return disponibles
      .map((d) => ({ d, carte: base.parId.get(d.c) }))
      .filter((x): x is { d: Disponible; carte: TCarte } => !!x.carte && (!r || `${x.carte.num ?? ''} ${x.carte.nm}`.toLowerCase().includes(r)))
      .sort((a, b) => b.carte.ra - a.carte.ra || a.carte.p - b.carte.p)
      .slice(0, 60)
  }, [disponibles, base, filtre])

  return (
    <div className="selection">
      <h4>{titre}</h4>
      <ul className="lignes-offre choisies">
        {choix.map((x, i) => {
          const carte = base.parId.get(x.c)
          return (
            <li key={i}>
              <span style={{ color: carte ? RARETES[carte.ra].couleur : undefined }}>{carte ? designation(carte) : x.c}</span> <span className="discret">{PAR_ID[x.v].nom}</span>
              <button type="button" className="btn-lien" onClick={() => setChoix(choix.filter((_, j) => j !== i))} aria-label="Retirer">
                ✕
              </button>
            </li>
          )
        })}
        {choix.length === 0 && <li className="discret">Aucune carte</li>}
      </ul>
      <label>
        Crédits
        <input type="number" min={0} max={max} step={1} placeholder="0" value={montant} onChange={(e) => setCredits(e.target.value)} />
      </label>
      <input type="search" placeholder={`Chercher parmi ${disponibles.length} cartes libres…`} value={filtre} onChange={(e) => setFiltre(e.target.value)} />
      <ul className="disponibles">
        {visibles.map(({ d, carte }) => (
          <li key={`${d.c}:${d.v}`}>
            <button type="button" disabled={restants(d) <= 0 || choix.length >= 10} onClick={() => setChoix([...choix, { c: d.c, v: d.v }])}>
              <span style={{ color: RARETES[carte.ra].couleur }}>{designation(carte)}</span>
              {carte.num && <span className="discret"> {carte.nm}</span>} <span className="discret">· {PAR_ID[d.v].nom}</span>
              <span className="discret"> ×{restants(d)}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
