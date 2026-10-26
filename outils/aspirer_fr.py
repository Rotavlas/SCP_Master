"""Télécharge les pages traduites de la branche française (fondationscp.wikidot.com).

Usage : python -I outils/aspirer_fr.py <dossier_donnees>
Les pages sont mises en cache dans <dossier_donnees>/fr/ : relancer le script reprend là où il s'était arrêté.
Seuls les SCP traduits (liens existants des pages de séries FR) et les pages de référence sont récupérés.
"""

import re
import sys
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

SITE = "https://fondationscp.wikidot.com/"
HUBS = ["scp-series"] + [f"scp-series-{i}" for i in range(2, 11)]
REFERENCES = ["task-forces", "personnel-and-character-dossier", "groups-of-interest", "canon-hub"]
EN_TETE = {"User-Agent": "scp-masters (jeu de fan, aspiration ponctuelle des traductions)"}


def telecharger(page, dossier):
    fichier = dossier / (page.replace(":", "_") + ".html")
    if fichier.exists() and fichier.stat().st_size > 0:
        return fichier, False
    for essai in range(3):
        try:
            req = urllib.request.Request(SITE + page, headers=EN_TETE)
            with urllib.request.urlopen(req, timeout=30) as r:
                fichier.write_bytes(r.read())
            time.sleep(0.25)  # reste poli avec Wikidot
            return fichier, True
        except urllib.error.HTTPError as e:
            if e.code == 404:
                fichier.write_text("", encoding="utf-8")
                return fichier, True
            time.sleep(2 + essai * 3)
        except Exception:
            time.sleep(2 + essai * 3)
    return None, True


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    dossier = Path(sys.argv[1]) / "fr"
    dossier.mkdir(parents=True, exist_ok=True)

    for page in HUBS + REFERENCES:
        telecharger(page, dossier)

    # Liens des pages de séries FR : un lien sans la classe « newpage » est une page traduite
    pages = []
    for hub in HUBS:
        f = dossier / f"{hub}.html"
        if not f.exists():
            continue
        contenu = f.read_text(encoding="utf-8", errors="replace")
        for attributs, cible in re.findall(r'<a ([^>]*?)href="/(scp-\d{3,4})"', contenu):
            if "newpage" not in attributs and cible not in pages:
                pages.append(cible)
    print(f"{len(pages)} SCP traduits à récupérer")

    faits = 0
    with ThreadPoolExecutor(max_workers=4) as pool:
        for _, nouveau in pool.map(lambda p: telecharger(p, dossier), pages):
            faits += 1
            if nouveau and faits % 100 == 0:
                print(f"{faits}/{len(pages)}", flush=True)
    print("Terminé")


if __name__ == "__main__":
    main()
