import type { ReactNode } from "react";

/**
 * L'illustration de chaque Mythique, en SVG (cadre 200 × 280, celui d'une carte), dans un même style
 * d'affiche : silhouettes noires en aplat sur fond papier, une seule couleur d'accent par carte.
 * Sur la carte elle est au repos ; dans la cinématique d'ouverture (`anime`), elle se construit
 * sous les yeux du joueur : les yeux du Roi écarlate s'ouvrent, les ailes du Gardien s'embrasent…
 * Les états de départ des animations sont dans styles.css (.sm-*), l'état final est celui du dessin.
 */
export function SceneMythique({
  id,
  anime = false,
}: {
  id: string;
  anime?: boolean;
}) {
  const scene = SCENES[id];
  if (!scene) return null;
  return (
    <svg
      className={`scene-mythique sm-${id.replace(/[^a-z0-9]+/g, "-")} ${anime ? "sm-anime" : ""}`}
      viewBox="0 0 200 280"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      {scene}
    </svg>
  );
}

export const aUneScene = (id: string) => id in SCENES;

const PAPIER = "#f4f1ea";
const NOIR = "#0b0b0b";

/** Un œil en amande : iris d'accent, pupille noire, point d'accent au centre. */
function Oeil({
  x,
  y,
  t = 1,
  r = 0,
  i,
  accent,
}: {
  x: number;
  y: number;
  t?: number;
  r?: number;
  i: number;
  accent: string;
}) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${r}) scale(${t})`}>
      <g className="sm-oeil" style={{ ["--i" as string]: i }}>
        <path d="M-9 0 Q-2 -7 9 -2 Q2 6 -9 0 Z" fill={accent} />
        <circle cx="0" cy="-0.5" r="3" fill={NOIR} />
        <circle cx="0" cy="-0.5" r="1.2" fill={accent} />
      </g>
    </g>
  );
}

/** Flamme noire à volutes blanches, côté gauche ; `miroir` pour le côté droit. */
function Flammes({ miroir }: { miroir?: boolean }) {
  return (
    <g transform={miroir ? "translate(200 0) scale(-1 1)" : undefined}>
      <g className="sm-flammes">
        <path
          d="M0 280 L0 150 Q14 160 10 176 Q22 166 20 150 Q34 168 26 188 Q40 180 38 166 Q52 190 44 214 Q58 210 56 196 Q66 222 58 250 L62 280 Z"
          fill={NOIR}
        />
        {[
          [10, 200, 5],
          [26, 222, 6],
          [12, 244, 7],
          [40, 252, 6],
          [24, 268, 5],
        ].map(([x, y, r], i) => (
          <circle key={i} cx={x} cy={y} r={r} fill={PAPIER} />
        ))}
      </g>
    </g>
  );
}

/** Bois de cerf (côté gauche, le droit en miroir). */
const BOIS =
  "M94 76 Q80 66 70 46 Q64 34 66 18 M70 46 Q58 44 48 36 M76 58 Q62 60 52 56 M66 30 Q56 26 52 14 M84 70 Q72 76 60 74 M70 46 Q76 34 76 24";

/** Une chaîne : maillons blancs cerclés de noir. */
function Chaine({
  x1,
  y1,
  x2,
  y2,
  i,
}: {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  i: number;
}) {
  return (
    <g
      className="sm-chaine"
      style={{ ["--i" as string]: i }}
      strokeLinecap="round"
      fill="none"
    >
      <line
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke={NOIR}
        strokeWidth="7"
        strokeDasharray="9 3"
      />
      <line
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke={PAPIER}
        strokeWidth="4.5"
        strokeDasharray="9 3"
      />
      <line
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke={NOIR}
        strokeWidth="1.6"
        strokeDasharray="5 7"
        strokeDashoffset="-2"
      />
    </g>
  );
}

const ROUGE = "#e0261b";

const SCENES: Record<string, ReactNode> = {
  // Le Roi écarlate : bois de cerf, couronne au losange rouge, sept yeux, enchaîné au milieu des flammes
  "entite:scarlet-king": (
    <>
      <rect width="200" height="280" fill={PAPIER} />
      <Flammes />
      <Flammes miroir />
      <g
        className="sm-bois"
        stroke={NOIR}
        strokeWidth="4.5"
        strokeLinecap="round"
        fill="none"
      >
        <path d={BOIS} />
        <path d={BOIS} transform="translate(200 0) scale(-1 1)" />
      </g>
      <g className="sm-roi">
        <path
          d="M100 90 Q90 92 88 104 Q66 108 54 128 Q50 150 56 170 Q50 200 58 280 L142 280 Q150 200 144 170 Q150 150 146 128 Q134 108 112 104 Q110 92 100 90 Z"
          fill={NOIR}
        />
        <circle cx="100" cy="80" r="13" fill={NOIR} />
        <path
          d="M91 92 L93 96 L95 92 L97 96 L99 92 L101 96 L103 92 L105 96 L107 92 L109 96"
          stroke={PAPIER}
          strokeWidth="1.2"
          fill="none"
        />
        {/* Plumes blanches sur les épaules et la poitrine */}
        <g stroke={PAPIER} strokeWidth="1.3" fill="none">
          <path d="M60 134 Q72 128 82 136" />
          <path d="M58 152 Q70 146 80 154" />
          <path d="M140 134 Q128 128 118 136" />
          <path d="M142 152 Q130 146 120 154" />
          <path d="M70 196 Q80 206 90 196 Q100 206 110 196 Q120 206 130 196" />
        </g>
      </g>
      <g className="sm-couronne">
        <path
          d="M86 70 L88 50 L93 62 L100 30 L107 62 L112 50 L114 70 Z"
          fill={NOIR}
        />
        <path
          className="sm-gemme"
          d="M100 54 L103.5 61 L100 68 L96.5 61 Z"
          fill={ROUGE}
        />
      </g>
      {[
        [94, 118, 1, -20],
        [110, 124, 0.75, 10],
        [98, 136, 1.05, -10],
        [88, 152, 0.95, 0],
        [108, 158, 1, -15],
        [96, 174, 0.9, 10],
        [112, 184, 0.6, 0],
      ].map(([x, y, t, r], i) => (
        <Oeil key={i} x={x} y={y} t={t} r={r} i={i} accent={ROUGE} />
      ))}
      <g className="sm-chaines">
        <Chaine x1={52} y1={222} x2={150} y2={262} i={0} />
        <Chaine x1={150} y1={214} x2={60} y2={272} i={1} />
        <Chaine x1={70} y1={282} x2={146} y2={238} i={2} />
      </g>
    </>
  ),

  // The Gate Guardian : une silhouette immense, quatre ailes de flammes, la porte en contrebas
  "dr-clef-s-proposal": (
    <>
      <rect width="200" height="280" fill={PAPIER} />
      <circle
        className="sm-halo"
        cx="100"
        cy="62"
        r="20"
        fill="none"
        stroke="#e8a200"
        strokeWidth="3"
      />
      <g className="sm-ailes">
        {[
          "M90 96 Q50 70 30 20 Q44 30 46 48 Q52 30 48 10 Q66 40 64 64 Q72 50 72 36 Q86 64 92 104 Z",
          "M110 96 Q150 70 170 20 Q156 30 154 48 Q148 30 152 10 Q134 40 136 64 Q128 50 128 36 Q114 64 108 104 Z",
          "M88 120 Q52 120 22 152 Q38 148 46 156 Q30 166 24 190 Q46 172 60 170 Q52 186 56 200 Q70 170 90 140 Z",
          "M112 120 Q148 120 178 152 Q162 148 154 156 Q170 166 176 190 Q154 172 140 170 Q148 186 144 200 Q130 170 110 140 Z",
        ].map((d, i) => (
          <g key={i} className="sm-aile" style={{ ["--i" as string]: i }}>
            <path d={d} fill={NOIR} />
            <path
              d={d}
              fill="#e8a200"
              transform="translate(100 110) scale(0.55) translate(-100 -110)"
            />
          </g>
        ))}
      </g>
      <g className="sm-gardien" fill={NOIR}>
        <circle cx="100" cy="62" r="11" />
        <path d="M86 78 Q100 72 114 78 L126 236 Q100 246 74 236 Z" />
        <path
          d="M94 80 L100 200 L106 80"
          stroke={PAPIER}
          strokeWidth="1.2"
          fill="none"
        />
      </g>
      <g className="sm-porte">
        <rect x="0" y="252" width="200" height="28" fill={NOIR} />
        <path d="M64 256 L64 222 Q100 196 136 222 L136 256 Z" fill={NOIR} />
        <path d="M76 256 L76 226 Q100 208 124 226 L124 256 Z" fill="#e8a200" />
        <line
          x1="100"
          y1="214"
          x2="100"
          y2="256"
          stroke={NOIR}
          strokeWidth="3"
        />
      </g>
    </>
  ),

  // MTF Alpha-1 : la main droite rouge, sous le réticule
  "fim:alpha-1": (
    <>
      <rect width="200" height="280" fill={PAPIER} />
      <g className="sm-balayage" fill={NOIR}>
        <rect x="0" y="0" width="200" height="22" />
        <rect x="0" y="258" width="200" height="22" />
        {Array.from({ length: 10 }, (_, i) => (
          <rect
            key={i}
            x={i * 22 + 4}
            y="8"
            width="12"
            height="6"
            fill={PAPIER}
          />
        ))}
      </g>
      <g className="sm-reticule" fill="none" stroke={NOIR} strokeWidth="3">
        <circle cx="100" cy="140" r="84" strokeDasharray="16 8" />
        <circle cx="100" cy="140" r="64" strokeWidth="2" />
        <line x1="100" y1="40" x2="100" y2="72" />
        <line x1="100" y1="208" x2="100" y2="240" />
        <line x1="2" y1="140" x2="34" y2="140" />
        <line x1="166" y1="140" x2="198" y2="140" />
      </g>
      <g className="sm-main" fill="#d8141c">
        <rect x="68" y="126" width="66" height="70" rx="22" />
        <rect x="68" y="80" width="14" height="60" rx="7" />
        <rect x="85" y="68" width="14" height="70" rx="7" />
        <rect x="102" y="70" width="14" height="68" rx="7" />
        <rect x="119" y="82" width="13" height="58" rx="6.5" />
        <rect
          x="126"
          y="134"
          width="13"
          height="44"
          rx="6.5"
          transform="rotate(38 132 156)"
        />
        <path
          d="M78 176 Q100 186 124 176"
          stroke={PAPIER}
          strokeWidth="2"
          fill="none"
        />
      </g>
    </>
  ),

  // The Administrator : un fauteuil vide sous un seul projecteur, l'identité expurgée
  "perso:the-administrator": (
    <>
      <rect width="200" height="280" fill={NOIR} />
      <polygon
        className="sm-projecteur"
        points="86,0 114,0 172,256 28,256"
        fill={PAPIER}
      />
      <ellipse cx="100" cy="256" rx="72" ry="10" fill={PAPIER} />
      <g className="sm-fauteuil" fill={NOIR}>
        <path d="M64 104 Q100 84 136 104 L132 196 L68 196 Z" />
        <rect x="56" y="188" width="88" height="20" rx="5" />
        <rect x="52" y="156" width="14" height="44" rx="5" />
        <rect x="134" y="156" width="14" height="44" rx="5" />
        <rect x="96" y="206" width="8" height="40" />
        <rect x="72" y="244" width="56" height="8" rx="3" />
        <path
          d="M80 120 Q100 110 120 120"
          stroke="#d4a017"
          strokeWidth="2"
          fill="none"
        />
      </g>
      <g className="sm-barres" fill={NOIR}>
        <rect
          className="sm-barre"
          style={{ ["--i" as string]: 0 }}
          x="20"
          y="30"
          width="126"
          height="14"
        />
        <rect
          className="sm-barre"
          style={{ ["--i" as string]: 1 }}
          x="58"
          y="50"
          width="122"
          height="14"
        />
        <rect
          className="sm-barre"
          style={{ ["--i" as string]: 2 }}
          x="34"
          y="70"
          width="96"
          height="14"
        />
        <rect
          x="20"
          y="30"
          width="126"
          height="14"
          fill="none"
          stroke="#d4a017"
          strokeWidth="1.2"
          className="sm-barre"
          style={{ ["--i" as string]: 0 }}
        />
      </g>
    </>
  ),

  // O5-1 : la table du Conseil vue d'en haut, treize sièges, le premier s'allume
  "perso:o5-1": (
    <>
      <rect width="200" height="280" fill={PAPIER} />
      <circle cx="100" cy="140" r="60" fill={NOIR} />
      <circle
        cx="100"
        cy="140"
        r="24"
        fill="none"
        stroke={PAPIER}
        strokeWidth="1.5"
      />
      {Array.from({ length: 13 }, (_, i) => {
        const a = -Math.PI / 2 + (i * 2 * Math.PI) / 13;
        return (
          <circle
            key={i}
            className={i === 0 ? "sm-siege sm-siege-1" : "sm-siege"}
            style={{ ["--i" as string]: i }}
            cx={100 + Math.cos(a) * 80}
            cy={140 + Math.sin(a) * 80}
            r={i === 0 ? 12 : 8}
            fill={i === 0 ? "#2f80ed" : NOIR}
          />
        );
      })}
      <line
        className="sm-rayon-1"
        x1="100"
        y1="140"
        x2="100"
        y2="72"
        stroke="#2f80ed"
        strokeWidth="3"
      />
      <text
        x="100"
        y="147"
        textAnchor="middle"
        fill={PAPIER}
        fontSize="17"
        fontWeight="700"
        fontFamily="monospace"
      >
        O5
      </text>
      <rect x="0" y="252" width="200" height="28" fill={NOIR} />
      <text
        x="100"
        y="271"
        textAnchor="middle"
        fill={PAPIER}
        fontSize="10"
        fontFamily="monospace"
        letterSpacing="3"
      >
        SIÈGE · 01 · / · 13
      </text>
    </>
  ),

  // Aaron Siegel : un portrait de 1891 en silhouette, les orbites d'un physicien
  "perso:aaron-siegel": (
    <>
      <rect width="200" height="280" fill={PAPIER} />
      <g className="sm-photo">
        <rect
          x="22"
          y="28"
          width="156"
          height="200"
          fill="none"
          stroke={NOIR}
          strokeWidth="6"
        />
        <path d="M74 74 L126 74 L122 46 Q100 38 78 46 Z" fill={NOIR} />
        <rect x="64" y="72" width="72" height="7" rx="3" fill={NOIR} />
        <circle cx="100" cy="98" r="22" fill={NOIR} />
        <path d="M52 228 Q54 150 100 134 Q146 150 148 228 Z" fill={NOIR} />
        <path d="M92 138 L100 160 L108 138" fill={PAPIER} />
        <path d="M96 150 L100 158 L104 150 L100 146 Z" fill="#2f6fd1" />
      </g>
      <g className="sm-orbites" fill="none" stroke="#2f6fd1" strokeWidth="2.2">
        <ellipse cx="100" cy="100" rx="88" ry="24" />
        <ellipse
          cx="100"
          cy="100"
          rx="88"
          ry="24"
          transform="rotate(60 100 100)"
        />
        <ellipse
          cx="100"
          cy="100"
          rx="88"
          ry="24"
          transform="rotate(-60 100 100)"
        />
        <circle cx="188" cy="100" r="4" fill="#2f6fd1" stroke="none" />
      </g>
      <text
        x="100"
        y="258"
        textAnchor="middle"
        fill={NOIR}
        fontSize="20"
        fontWeight="700"
        fontFamily="serif"
        letterSpacing="6"
      >
        1891
      </text>
    </>
  ),

  // Les Auteurs : une plume immense écrit la page, l'encre coule
  "perso:les-auteurs": (
    <>
      <rect width="200" height="280" fill={PAPIER} />
      <g className="sm-page">
        {Array.from({ length: 12 }, (_, i) => (
          <rect
            key={i}
            className="sm-ligne"
            style={{ ["--i" as string]: i }}
            x="18"
            y={110 + i * 13}
            width={i === 11 ? 70 : i % 3 === 2 ? 140 : 164}
            height="5"
            rx="2"
            fill={NOIR}
          />
        ))}
      </g>
      <g className="sm-plume">
        <path d="M138 0 L200 0 L200 22 L132 100 L120 96 Z" fill={NOIR} />
        <path d="M120 96 L132 100 L118 116 Z" fill={NOIR} />
        <line
          x1="166"
          y1="20"
          x2="124"
          y2="102"
          stroke={PAPIER}
          strokeWidth="1.5"
        />
        <circle cx="160" cy="34" r="4" fill={PAPIER} />
      </g>
      <g className="sm-encre" fill="#7b3fe4">
        <path d="M118 116 Q112 130 118 138 Q126 130 118 116 Z" />
        <circle cx="96" cy="160" r="5" />
        <circle cx="134" cy="200" r="3.5" />
      </g>
    </>
  ),
};
