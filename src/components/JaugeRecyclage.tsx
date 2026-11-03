import { PART_AU_DELA, PLAFOND_RECYCLAGE } from '../engine/boosters'
import { useRecyclageRestant } from '../state/enLigne'

/** Un cran de la jauge : 100 ₵ */
const CRAN = 100

/**
 * Le plafond du jour pour le recyclage et le brûlage : 3 000 ₵ à plein tarif (prive.gain_plafonne), puis 20 % de la
 * valeur jusqu'à minuit (heure de Paris). Trente crans de 100 ₵ qui s'éteignent à mesure qu'on recycle ou brûle.
 * `compacte` : une seule ligne, pour une fiche ou le marché.
 */
export function JaugeRecyclage({ compacte }: { compacte?: boolean }) {
  const restant = useRecyclageRestant()
  if (restant === null) return null
  const crans = PLAFOND_RECYCLAGE / CRAN
  const allumes = Math.ceil(Math.max(0, restant) / CRAN)
  const epuise = restant <= 0
  const bas = !epuise && restant < PLAFOND_RECYCLAGE * 0.25
  return (
    <div className={`jauge-recyclage ${compacte ? 'compacte' : ''} ${epuise ? 'epuise' : bas ? 'bas' : ''}`}>
      <div className="jauge-recyclage-tete">
        <span className="jauge-recyclage-titre">Recyclage et brûlage aujourd’hui</span>
        <strong>
          {epuise ? `Plafond atteint : ${PART_AU_DELA * 100} % de la valeur jusqu’à minuit` : `${restant.toLocaleString('fr-FR')} ₵ encore à plein tarif`}
        </strong>
      </div>
      <div className="jauge-recyclage-crans" role="meter" aria-valuemin={0} aria-valuemax={PLAFOND_RECYCLAGE} aria-valuenow={Math.max(0, restant)}>
        {Array.from({ length: crans }, (_, i) => (
          <span key={i} className={i < allumes ? 'allume' : ''} />
        ))}
      </div>
      {!compacte && (
        <p className="discret">
          Au plus {PLAFOND_RECYCLAGE.toLocaleString('fr-FR')} ₵ par jour à plein tarif, recyclage et brûlage confondus ; au-delà, {PART_AU_DELA * 100} % de la
          valeur. Le compteur repart à minuit (heure de Paris).
        </p>
      )}
    </div>
  )
}
