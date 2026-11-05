import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { RARETES, designation, type Base } from '../data/catalogue'
import { COSMETIQUES, TYPES_COSMETIQUES } from '../data/cosmetiques'
import { BOOSTERS } from '../engine/boosters'
import { PAR_ID, variantesPour, type IdVariante } from '../engine/variantes'
import { appeler } from '../state/enLigne'
import { notifier } from '../state/sauvegarde'
import { Caviarde, Indisponible } from './Anime'
import { BoutonConfirme } from './Confirmer'
import { useGlisserPourFermer } from './feuille'

/**
 * La gestion des codes, réservée au créateur (public.codes_admin, creer_code, desactiver_code, supprimer_code) : la
 * liste des codes et de leurs utilisations, et un formulaire pour en créer un qui donne ce qu'on veut — crédits, XP,
 * dossiers gratuits, dossiers offerts de tout type (Apollyon compris), cosmétiques, cartes précises dans une variante.
 */
export interface Recompense {
  credits?: number
  xp?: number
  dossiers?: number
  keter?: number
  offerts?: Record<string, number>
  cosmetique?: string
  cosmetiques?: string[]
  cartes?: { c: string; v?: IdVariante; n?: number }[]
}

interface CodeAdmin {
  code: string
  description: string | null
  recompense: Recompense
  utilisationsMax: number | null
  expireLe: string | null
  creeLe: string
  utilisations: number
  actif: boolean
}

const nb = (n: number) => n.toLocaleString('fr-FR')

/** La récompense d'un code, en clair (aussi pour le message du joueur qui le saisit) */
export function decrireRecompense(r: Recompense, base?: Base | null): string {
  const morceaux: string[] = []
  if (r.credits) morceaux.push(`+${nb(r.credits)} ₵`)
  if (r.xp) morceaux.push(`+${nb(r.xp)} XP`)
  if (r.dossiers) morceaux.push(`+${r.dossiers} dossier${r.dossiers > 1 ? 's' : ''} gratuit${r.dossiers > 1 ? 's' : ''}`)
  if (r.keter) morceaux.push(`${r.keter} dossier${r.keter > 1 ? 's' : ''} Keter offert${r.keter > 1 ? 's' : ''}`)
  for (const [id, n] of Object.entries(r.offerts ?? {}))
    if (n > 0) morceaux.push(`${n} × ${BOOSTERS.find((b) => b.id === id)?.nom ?? id} offert${n > 1 ? 's' : ''}`)
  for (const id of [r.cosmetique, ...(r.cosmetiques ?? [])].filter((x): x is string => !!x)) morceaux.push(`« ${COSMETIQUES[id]?.nom ?? id} »`)
  for (const c of r.cartes ?? []) {
    const carte = base?.parId.get(c.c)
    const v = c.v && c.v !== 'std' ? ` ${PAR_ID[c.v]?.nom ?? c.v}` : ''
    morceaux.push(`${(c.n ?? 1) > 1 ? `${c.n} × ` : ''}${carte ? designation(carte) : c.c}${v}`)
  }
  return morceaux.join(', ') || 'rien'
}

const DUREES: [string, number | null][] = [
  ['Jamais', null],
  ['1 heure', 1],
  ['24 heures', 24],
  ['3 jours', 72],
  ['7 jours', 168],
  ['30 jours', 720],
]

function codeAuHasard() {
  const lettres = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from({ length: 8 }, () => lettres[Math.floor(Math.random() * lettres.length)]).join('')
}

export function GestionCodes({ base, onFermer }: { base: Base | null; onFermer: () => void }) {
  const feuille = useGlisserPourFermer(onFermer)
  const [codes, setCodes] = useState<CodeAdmin[] | null | undefined>(undefined)
  const charger = useCallback(() => void appeler<CodeAdmin[]>('codes_admin').then(setCodes), [])
  useEffect(charger, [charger])
  useEffect(() => {
    const touche = (e: KeyboardEvent) => e.key === 'Escape' && onFermer()
    window.addEventListener('keydown', touche)
    return () => window.removeEventListener('keydown', touche)
  }, [onFermer])

  // Le formulaire
  const [code, setCode] = useState(codeAuHasard)
  const [description, setDescription] = useState('')
  const [credits, setCredits] = useState('')
  const [xp, setXp] = useState('')
  const [dossiers, setDossiers] = useState('')
  const [offerts, setOfferts] = useState<Record<string, string>>({})
  const [cosmetiques, setCosmetiques] = useState<string[]>([])
  const [cartes, setCartes] = useState<{ c: string; v: IdVariante; n: number }[]>([])
  const [recherche, setRecherche] = useState('')
  const [utilisations, setUtilisations] = useState('')
  const [duree, setDuree] = useState<number | null>(168)
  const [envoi, setEnvoi] = useState(false)

  const entier = (t: string) => Math.max(0, Math.floor(Number(t) || 0))
  const recompense: Recompense = useMemo(() => {
    const r: Recompense = {}
    if (entier(credits)) r.credits = entier(credits)
    if (entier(xp)) r.xp = entier(xp)
    if (entier(dossiers)) r.dossiers = Math.min(10, entier(dossiers))
    const o = Object.fromEntries(
      Object.entries(offerts)
        .map(([k, v]) => [k, entier(v)])
        .filter(([, v]) => (v as number) > 0),
    )
    if (Object.keys(o).length) r.offerts = o
    if (cosmetiques.length) r.cosmetiques = cosmetiques
    if (cartes.length) r.cartes = cartes.map((c) => ({ c: c.c, v: c.v, n: c.n }))
    return r
  }, [credits, xp, dossiers, offerts, cosmetiques, cartes])
  const vide = Object.keys(recompense).length === 0

  const trouvees = useMemo(() => {
    const r = recherche.trim().toLowerCase()
    if (!base || r.length < 2) return []
    return base.cartes.filter((c) => `${c.num ?? ''} ${c.nm} ${c.id}`.toLowerCase().includes(r)).slice(0, 8)
  }, [base, recherche])

  async function creer() {
    setEnvoi(true)
    const r = await appeler<CodeAdmin[]>('creer_code', {
      p_code: code,
      p_recompense: recompense,
      p_description: description,
      p_utilisations_max: utilisations.trim() ? entier(utilisations) : null,
      p_expire_le: duree === null ? null : new Date(Date.now() + duree * 3_600_000).toISOString(),
    })
    setEnvoi(false)
    if (!r) return
    setCodes(r)
    notifier(`Code ${code.toUpperCase()} créé`, 'succes')
    setCode(codeAuHasard())
    setDescription('')
    setCredits('')
    setXp('')
    setDossiers('')
    setOfferts({})
    setCosmetiques([])
    setCartes([])
  }

  async function agir(fonction: 'desactiver_code' | 'supprimer_code', c: string) {
    const r = await appeler<CodeAdmin[]>(fonction, { p_code: c })
    if (r) setCodes(r)
  }

  // Rendue dans le corps de la page : l'en-tête (flou d'arrière-plan) retiendrait sinon la fenêtre dans sa hauteur
  return createPortal(
    <div className="modale-fond" onClick={onFermer}>
      <div className="modale gestion-codes" ref={feuille} onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Gestion des codes">
        <button className="fermer" onClick={onFermer} aria-label="Fermer">
          ✕
        </button>
        <p className="dossier-entete">Créateur · codes</p>
        <h2>Gestion des codes</h2>

        <section className="codes-formulaire">
          <h3>Nouveau code</h3>
          <div className="codes-ligne">
            <label>
              Code
              <span className="codes-code">
                <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={32} spellCheck={false} />
                <button className="btn" type="button" onClick={() => setCode(codeAuHasard())} title="Un code au hasard">
                  ↻
                </button>
              </span>
            </label>
            <label>
              Description (vue du joueur)
              <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Stream du 15 novembre" maxLength={80} />
            </label>
          </div>

          <h4>Ce qu’il donne</h4>
          <div className="codes-grille">
            <label>
              Crédits
              <input type="number" min={0} value={credits} onChange={(e) => setCredits(e.target.value)} placeholder="0" />
            </label>
            <label>
              XP
              <input type="number" min={0} value={xp} onChange={(e) => setXp(e.target.value)} placeholder="0" />
            </label>
            <label>
              Dossiers gratuits (réserve, 10 au plus)
              <input type="number" min={0} max={10} value={dossiers} onChange={(e) => setDossiers(e.target.value)} placeholder="0" />
            </label>
          </div>

          <h4>Dossiers offerts</h4>
          <div className="codes-grille">
            {BOOSTERS.filter((b) => b.id !== 'standard').map((b) => (
              <label key={b.id} className="codes-dossier" style={{ ['--paquet' as string]: b.couleur }}>
                {b.nom}
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={offerts[b.id] ?? ''}
                  onChange={(e) => setOfferts((o) => ({ ...o, [b.id]: e.target.value }))}
                  placeholder="0"
                />
              </label>
            ))}
          </div>

          <h4>Cosmétiques</h4>
          {TYPES_COSMETIQUES.map(({ type, nom }) => (
            <details key={type} className="codes-cosmetiques">
              <summary>
                {nom}
                {cosmetiques.filter((id) => COSMETIQUES[id]?.type === type).length > 0 && (
                  <span className="compteur">{cosmetiques.filter((id) => COSMETIQUES[id]?.type === type).length}</span>
                )}
              </summary>
              <div className="codes-choix">
                {Object.entries(COSMETIQUES)
                  .filter(([id, c]) => c.type === type && !id.endsWith('-createur'))
                  .map(([id, c]) => (
                    <label key={id} className="case">
                      <input
                        type="checkbox"
                        checked={cosmetiques.includes(id)}
                        onChange={(e) => setCosmetiques((l) => (e.target.checked ? [...l, id] : l.filter((x) => x !== id)))}
                      />{' '}
                      {c.nom}
                    </label>
                  ))}
              </div>
            </details>
          ))}

          <h4>Cartes</h4>
          <input value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="Chercher une carte (numéro, nom)…" />
          {trouvees.length > 0 && (
            <ul className="codes-trouvees">
              {trouvees.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    style={{ ['--r' as string]: RARETES[c.ra].couleur }}
                    onClick={() => {
                      setCartes((l) => (l.some((x) => x.c === c.id) ? l : [...l, { c: c.id, v: 'std', n: 1 }]))
                      setRecherche('')
                    }}
                  >
                    {designation(c)} <small>{c.num ? c.nm : ''}</small> <small style={{ color: RARETES[c.ra].couleur }}>{RARETES[c.ra].nom}</small>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {cartes.length > 0 && (
            <ul className="codes-cartes">
              {cartes.map((x, i) => {
                const c = base?.parId.get(x.c)
                return (
                  <li key={x.c}>
                    <span>{c ? designation(c) : x.c}</span>
                    <select
                      value={x.v}
                      onChange={(e) => setCartes((l) => l.map((y, j) => (j === i ? { ...y, v: e.target.value as IdVariante } : y)))}
                      aria-label="Variante"
                    >
                      {(c ? variantesPour(c) : []).map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.nom}
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min={1}
                      max={20}
                      value={x.n}
                      onChange={(e) => setCartes((l) => l.map((y, j) => (j === i ? { ...y, n: Math.max(1, Math.min(20, entier(e.target.value))) } : y)))}
                      aria-label="Nombre"
                    />
                    <button className="btn btn-discret" type="button" onClick={() => setCartes((l) => l.filter((_, j) => j !== i))} aria-label="Retirer">
                      ✕
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
          {cartes.some((x) => base?.parId.get(x.c)?.ra === 5) && (
            <p className="discret">Une Mythique prend un numéro de son édition limitée : elle ne se donne plus une fois les 50 sortis.</p>
          )}

          <h4>Limites</h4>
          <div className="codes-grille">
            <label>
              Nombre d’agents (vide : illimité)
              <input type="number" min={1} value={utilisations} onChange={(e) => setUtilisations(e.target.value)} placeholder="Illimité" />
            </label>
            <label>
              Valable
              <select value={duree ?? 'jamais'} onChange={(e) => setDuree(e.target.value === 'jamais' ? null : Number(e.target.value))}>
                {DUREES.map(([nom, h]) => (
                  <option key={nom} value={h ?? 'jamais'}>
                    {nom}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <p className="codes-apercu">
            <strong>{code || '—'}</strong> donnera : {decrireRecompense(recompense, base)}
            {utilisations.trim() ? ` · ${entier(utilisations)} agent${entier(utilisations) > 1 ? 's' : ''} au plus` : ' · illimité'}
            {duree === null ? ' · sans fin' : ` · valable ${DUREES.find(([, h]) => h === duree)?.[0]}`}
          </p>
          <button className="btn btn-principal" disabled={envoi || vide || code.trim().length < 3} onClick={() => void creer()}>
            Créer le code
          </button>
        </section>

        <section>
          <h3>Codes existants</h3>
          {codes === undefined ? (
            <Caviarde lignes={3} />
          ) : !codes ? (
            <Indisponible reessayer={charger} />
          ) : codes.length === 0 ? (
            <p className="discret">Aucun code pour l’instant.</p>
          ) : (
            <ul className="codes-liste">
              {codes.map((c) => (
                <li key={c.code} className={c.actif ? '' : 'inactif'}>
                  <div className="codes-tete">
                    <button
                      className="codes-nom"
                      title="Copier le code"
                      onClick={() => void navigator.clipboard?.writeText(c.code).then(() => notifier(`${c.code} copié`, 'succes'))}
                    >
                      {c.code}
                    </button>
                    <span className={`codes-etat ${c.actif ? 'actif' : ''}`}>{c.actif ? 'Actif' : 'Inactif'}</span>
                  </div>
                  {c.description && <p className="discret">{c.description}</p>}
                  <p>{decrireRecompense(c.recompense, base)}</p>
                  <p className="discret">
                    {c.utilisations}
                    {c.utilisationsMax ? ` / ${c.utilisationsMax}` : ''} utilisation{c.utilisations > 1 ? 's' : ''}
                    {c.expireLe ? ` · ${c.actif ? 'expire' : 'fini'} le ${new Date(c.expireLe).toLocaleString('fr-FR')}` : ' · sans date de fin'}
                  </p>
                  <div className="actions">
                    {c.actif && (
                      <button className="btn" onClick={() => void agir('desactiver_code', c.code)}>
                        Désactiver
                      </button>
                    )}
                    <BoutonConfirme
                      className="btn btn-danger"
                      danger
                      question={`Supprimer ${c.code} et son historique d’utilisation ?`}
                      confirmer="Supprimer"
                      onConfirme={() => void agir('supprimer_code', c.code)}
                    >
                      Supprimer
                    </BoutonConfirme>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>,
    document.body,
  )
}
