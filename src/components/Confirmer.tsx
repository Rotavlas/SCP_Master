import { useState, type ReactNode } from 'react'

/**
 * Bouton en deux temps, à la place de confirm() : le premier clic affiche la question
 * et les boutons « Confirmer » / « Annuler » à sa place, dans la page.
 */
export function BoutonConfirme({
  children,
  question,
  confirmer = 'Confirmer',
  onConfirme,
  className = 'btn',
  disabled,
  danger,
  title,
}: {
  children: ReactNode
  question: ReactNode
  confirmer?: string
  onConfirme: () => void
  className?: string
  disabled?: boolean
  danger?: boolean
  title?: string
}) {
  const [ouvert, setOuvert] = useState(false)
  if (!ouvert) {
    return (
      <button className={className} disabled={disabled} title={title} onClick={() => setOuvert(true)}>
        {children}
      </button>
    )
  }
  return (
    <span className="confirmation" role="group">
      <span className="confirmation-question">{question}</span>
      <button
        className={`btn ${danger ? 'btn-danger' : 'btn-principal'}`}
        autoFocus
        onClick={() => {
          setOuvert(false)
          onConfirme()
        }}
      >
        {confirmer}
      </button>
      <button className="btn btn-discret" onClick={() => setOuvert(false)}>
        Annuler
      </button>
    </span>
  )
}

/** À la place de prompt() : un champ de texte court, dans la page, avec envoi et annulation. */
export function BoutonSaisie({
  children,
  question,
  envoyer = 'Envoyer',
  onEnvoi,
  className = 'btn',
  title,
  max = 300,
}: {
  children: ReactNode
  question: string
  envoyer?: string
  onEnvoi: (texte: string) => void
  className?: string
  title?: string
  max?: number
}) {
  const [ouvert, setOuvert] = useState(false)
  const [texte, setTexte] = useState('')
  if (!ouvert) {
    return (
      <button className={className} title={title} onClick={() => setOuvert(true)}>
        {children}
      </button>
    )
  }
  return (
    <form
      className="confirmation"
      onSubmit={(e) => {
        e.preventDefault()
        setOuvert(false)
        onEnvoi(texte.trim())
        setTexte('')
      }}
    >
      <label className="confirmation-question">
        {question}
        <input value={texte} maxLength={max} autoFocus onChange={(e) => setTexte(e.target.value)} />
      </label>
      <button className="btn btn-principal">{envoyer}</button>
      <button type="button" className="btn btn-discret" onClick={() => setOuvert(false)}>
        Annuler
      </button>
    </form>
  )
}
