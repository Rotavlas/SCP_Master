import { DUREE_TEMPORELLE } from '../engine/effets'
import { INTEGRITE_SITE, SEUIL_RAPIDE, SOUTIENS, TOURS_RECO } from '../engine/reconfinement'
import { MANCHES } from '../engine/duel'
import type { Etape } from './TutoBreche'

/** Les tutoriels du Reconfinement et du Duel éclair (celui de la Brèche est dans TutoBreche.tsx) */
export const CLE_TUTO_RECO = 'scp-tuto-reco'
export const CLE_TUTO_ECLAIR = 'scp-tuto-eclair'

export const ETAPES_RECO: Etape[] = [
  {
    titre: 'Deux Sites, cinq tours',
    texte: (
      <>
        Chaque agent protège un Site de <b>{INTEGRITE_SITE} points</b>. À chaque tour, les deux agents jouent une carte de leur main, en même temps. Au bout de{' '}
        <b>{TOURS_RECO} tours</b>, le Site le plus intact l'emporte ; un Site qui tombe à zéro perd aussitôt.
      </>
    ),
  },
  {
    titre: 'Libérer une anomalie',
    texte: (
      <>
        Un SCP, une grande entité, un Groupe d'intérêt, un conte… est une <b>anomalie</b> : jouée, elle s'échappe chez l'adversaire. Pour l'arrêter, il doit la{' '}
        <b>reconfiner</b> en répondant à une question sur elle, souvent sur ses procédures de confinement. S'il échoue, c'est la brèche : son Site perd des
        points selon la Menace de l'anomalie.
      </>
    ),
  },
  {
    titre: 'Chaque anomalie a son effet',
    texte: (
      <ul className="tuto-roles">
        <li>
          <b>◉ SCP-173</b> : l'écran se ferme par instants, et plus on tarde, plus il frappe fort.
        </li>
        <li>
          <b>◐ SCP-096</b> : son image est voilée. La regarder aide à répondre, mais une erreur après l'avoir vu triple ses dégâts.
        </li>
        <li>
          <b>≋ Mémétiques</b> : les réponses se brouillent. <b>◌ Antimémétiques</b> : la question s'efface. <b>⧗ Temporelles</b> : {DUREE_TEMPORELLE} secondes
          seulement.
        </li>
        <li>
          <b>⚔ Hostiles</b> frappent plus fort, <b>☣ contagieuses</b> rongent le Site à chaque tour, <b>⛊ indestructibles</b> blessent même reconfinées…
        </li>
      </ul>
    ),
  },
  {
    titre: 'Jouer un soutien',
    texte: (
      <ul className="tuto-roles">
        <li>
          <b>{SOUTIENS.fim.nom}</b> (FIM) : {SOUTIENS.fim.texte}
        </li>
        <li>
          <b>{SOUTIENS.personnel.nom}</b> (personnel) : {SOUTIENS.personnel.texte}
        </li>
        <li>
          <b>{SOUTIENS.protocole.nom}</b> : {SOUTIENS.protocole.texte}
        </li>
        <li>
          <b>{SOUTIENS.site.nom}</b> (Site) : {SOUTIENS.site.texte}
        </li>
      </ul>
    ),
  },
  {
    titre: 'La Manifestation',
    texte: (
      <>
        Chaque reconfinement réussi remplit votre <b>jauge de Manifestation</b>, davantage en moins de {SEUIL_RAPIDE} secondes. Pleine, elle libère la{' '}
        <b>Mythique de votre équipe</b> : sa cinématique, puis son pouvoir. Les chaînes du Roi écarlate enchaînent deux cartes adverses, Patmos-Omega ravage le
        Site d'en face, la Main droite rouge reconfine d'office… Sans Mythique, c'est le Protocole d'urgence du Conseil O5.
      </>
    ),
  },
]

export const ETAPES_ECLAIR: Etape[] = [
  {
    titre: 'Le duel classique',
    texte: (
      <>
        En {MANCHES} manches, chacun engage une carte cachée ; une même question tombe pour les deux, sur l'une des deux cartes. Le plus juste et le plus rapide
        frappe, selon la Menace de sa carte contre le Confinement de l'autre.
      </>
    ),
  },
  {
    titre: 'Les anomalies s’en mêlent',
    texte: (
      <>
        Chaque carte trouble la question de l'adversaire selon son lore : réponses brouillées, question qui s'efface, temps réduit, éclairs, paupières qui se
        ferment… Vous sentez l'effet de sa carte avant de la voir. Les anomalies hostiles frappent plus fort, les contagieuses rongent à chaque manche.
      </>
    ),
  },
]
