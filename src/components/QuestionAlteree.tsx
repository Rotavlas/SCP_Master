import { useEffect, useMemo, useState } from 'react'
import type { Alteration } from '../engine/effets'

/**
 * Une question de confrontation, telle que l'anomalie adverse la fait vivre : réponses brouillées (mémétique),
 * intitulé qui s'efface (antimémétique) ou n'apparaît jamais (SCP-055, SCP-2747), réponses qui changent de place
 * (réalité, espace), éclairs, tremblements, paupières qui se ferment (SCP-173). Le choix renvoyé est toujours
 * l'indice d'origine de la réponse, quel que soit l'ordre affiché.
 */
const LETTRES = ['A', 'B', 'C', 'D']
// Des glyphes qui ressemblent assez aux lettres pour qu'on puisse encore, avec effort, les lire
const BROUILLE: Record<string, string> = {
  a: 'ɑ',
  e: 'ɘ',
  i: 'ı',
  o: 'ø',
  u: 'ʊ',
  s: 'ʂ',
  r: 'ɾ',
  n: 'ŋ',
  t: 'ŧ',
  l: 'ɭ',
  c: 'ɕ',
  d: 'ɖ',
  m: 'ɱ',
  p: 'ƥ',
  h: 'ɦ',
  g: 'ɠ',
  A: 'Λ',
  E: 'Ǝ',
  I: 'Ɨ',
  O: 'Ø',
  S: 'Ƨ',
  R: 'Я',
  N: 'И',
  T: 'Ŧ',
  C: 'Ͻ',
  P: 'Ƥ',
}

function brouiller(texte: string, graine: number): string {
  let x = graine
  return [...texte]
    .map((ch) => {
      x = (x * 9301 + 49297) % 233280
      return BROUILLE[ch] && x / 233280 < 0.4 ? BROUILLE[ch] : ch
    })
    .join('')
}

export interface QuestionAffichee {
  intitule: string
  document?: string
  options: string[]
}

export function QuestionAlteree({
  question,
  alteration,
  retirees = [],
  resultat,
  desactivee,
  onRepondre,
  ecoule,
}: {
  question: QuestionAffichee
  alteration?: Alteration | null
  /** Mauvaises réponses retirées (aide d'une FIM, Révélation) */
  retirees?: number[]
  /** Après la réponse : la bonne et celle choisie */
  resultat?: { bonne?: number; choix: number | null }
  desactivee?: boolean
  onRepondre: (i: number) => void
  /** Secondes écoulées depuis l'arrivée de la question */
  ecoule: number
}) {
  const n = question.options.length
  const [ordre, setOrdre] = useState(() => question.options.map((_, i) => i))
  const [tic, setTic] = useState(0)
  const [glitch, setGlitch] = useState(false)
  const actif = !resultat ? alteration : null

  // Nouvelle question : ordre d'origine
  useEffect(() => setOrdre(question.options.map((_, i) => i)), [question])

  // Le brouillage mémétique change sans cesse
  useEffect(() => {
    if (actif !== 'memetique') return
    const t = setInterval(() => setTic((x) => x + 1), 550)
    return () => clearInterval(t)
  }, [actif])

  // Réalité : à 5 s, deux réponses échangent leur place ; espace : les réponses se téléportent à 4, 9 et 14 s
  const etape = actif === 'realite' ? (ecoule >= 5 ? 1 : 0) : actif === 'spatial' ? [4, 9, 14].filter((s) => ecoule >= s).length : 0
  useEffect(() => {
    if (!etape) return
    setOrdre((o) => {
      const suivant = [...o]
      if (actif === 'realite') {
        const a = Math.floor(Math.random() * n)
        const b = (a + 1 + Math.floor(Math.random() * (n - 1))) % n
        ;[suivant[a], suivant[b]] = [suivant[b], suivant[a]]
      } else {
        for (let i = suivant.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1))
          ;[suivant[i], suivant[j]] = [suivant[j], suivant[i]]
        }
      }
      return suivant
    })
    setGlitch(true)
    const t = setTimeout(() => setGlitch(false), 450)
    return () => clearTimeout(t)
  }, [etape]) // seulement quand une nouvelle étape commence

  const intitule = useMemo(() => {
    if (actif === 'effacement') return question.intitule.replace(/\S/g, '█')
    return question.intitule
  }, [actif, question.intitule])

  return (
    <div className={`question-alteree ${actif ? `alteration-${actif}` : ''} ${glitch ? 'glitch' : ''}`}>
      <h2 className={actif === 'antimemetique' ? 's-efface' : ''}>{intitule}</h2>
      {question.document && actif !== 'effacement' && (
        <blockquote className={`document ${actif === 'antimemetique' ? 's-efface' : ''}`} lang="en">
          {question.document}
        </blockquote>
      )}
      <div className="options">
        {ordre.map((i, position) => {
          let classe = ''
          if (resultat) {
            if (i === resultat.bonne) classe = 'bonne'
            else if (i === resultat.choix) classe = 'mauvaise'
          }
          const retiree = retirees.includes(i)
          const texte = actif === 'memetique' ? brouiller(question.options[i], tic * 31 + i * 7 + 1) : question.options[i]
          return (
            <button
              key={i}
              className={`option ${classe} ${retiree ? 'retiree' : ''}`}
              disabled={desactivee || retiree || !!resultat}
              onClick={() => onRepondre(i)}
              style={{ ['--i' as string]: position }}
            >
              <span className="lettre">{LETTRES[position]}</span>
              <span>{texte}</span>
            </button>
          )
        })}
      </div>
      {/* Éclairs, paupières : par-dessus la question, sans bloquer les clics */}
      {(actif === 'visuel' || actif === 'clignement') && <div className={`voile-${actif}`} aria-hidden="true" />}
    </div>
  )
}
