import { JOURNAL } from '../data/journal'

/** Le journal des modifications : ce qui a changé dans le jeu, jour par jour, du plus récent au plus ancien. */
export function Journal() {
  return (
    <section className="journal">
      <p className="dossier-entete">Registre des modifications · Site-19</p>
      <h1>Journal</h1>
      <ol className="journal-liste">
        {JOURNAL.map((e) => (
          <li key={e.date}>
            <time dateTime={e.date}>{new Date(`${e.date}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}</time>
            <h2>{e.titre}</h2>
            <ul>
              {e.points.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </section>
  )
}
