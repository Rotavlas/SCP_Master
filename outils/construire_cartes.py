"""Construit public/data/cards.json (et cards.fr.json) à partir de l'export scp-data
(https://scp-data.tedivm.com), des pages de référence du wiki et des traductions de la branche FR.

Usage : python -I outils/construire_cartes.py <dossier_donnees>
Le dossier doit contenir items_index.json, hubs_index.json, tales_index.json, goi_index.json,
content_goi.json, les content_series-*.json, tales/content_*.json, pages/*.html
(voir outils/telecharger_donnees.ps1) et, pour le français, fr/*.html (voir outils/aspirer_fr.py).
"""

import html
import json
import math
import re
import sys
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent
SORTIE = RACINE / "public" / "data" / "cards.json"
SORTIE_FR = RACINE / "public" / "data" / "cards.fr.json"
PREFIXE_IMAGE = "https://scp-wiki.wdfiles.com/local--files/"

SERIES = {f"series-{i}": i for i in range(1, 11)}
CONTENUS = ["content_scp-001.json", "content_series-1.json", "content_series-2.json",
            "content_series-3.json", "content_series-4.json", "content_series-5.json",
            "content_series-6.0.json", "content_series-6.5.json", "content_series-7.0.json",
            "content_series-7.5.json", "content_series-8.0.json", "content_series-8.5.json",
            "content_series-9.0.json", "content_series-9.5.json", "content_series-10.0.json",
            "content_series-10.5.json"]

# Classe principale, par ordre de priorité quand une page porte plusieurs tags
CLASSES = ["apollyon", "thaumiel", "keter", "euclid", "safe", "neutralized", "explained",
           "decommissioned", "pending", "esoteric-class"]
DEF_CLASSE = {"safe": 25, "euclid": 40, "keter": 55, "thaumiel": 58, "apollyon": 70,
              "neutralized": 15, "explained": 10, "decommissioned": 15, "pending": 35,
              "esoteric-class": 45}
BONUS_MENACE = {"hostile": 8, "k-class-scenario": 10, "predatory": 6, "reality-bending": 6,
                "cognitohazard": 4, "memetic": 4, "antimemetic": 5, "uncontained": 5,
                "contagion": 4, "self-replicating": 4, "weapon": 3}
BONUS_CONFINEMENT = {"indestructible": 8, "self-repairing": 6, "intangible": 5,
                     "teleportation": 3, "extradimensional": 3}
# Tags techniques ou trop vagues pour une question de quiz
TAGS_EXCLUS = {"scp", "_licensebox", "_cc", "_cc4", "_listpages", "co-authored", "featured",
               "rewrite", "reviewers-spotlight", "illustrated", "meta", "_image",
               "_tabview", "_footnotes", "contest", "doomsday2018", "_ext"} | set(CLASSES) | {"uncontained"}
# Seuils de rareté par rang de popularité : légendaire 1 %, épique 4 %, rare 10 %, peu commune 25 %
SEUILS_RARETE = [0.01, 0.05, 0.15, 0.40]
# Les contes et documents trop mal notés ne deviennent pas des cartes
SEUIL_NOTE_CONTE = 10


class Texte(HTMLParser):
    """Extrait le texte d'une page en ignorant la licence et les blocs repliés."""

    IGNORES = ("licensebox", "footnotes-footer", "footnoteref", "collapsible-block-folded",
               "collapsible-block-link", "page-rate-widget-box", "creditRate", "modalcontainer")
    VIDES = {"br", "img", "hr", "input", "meta", "link", "wbr", "source"}

    def __init__(self):
        super().__init__()
        self.morceaux = []
        self.ignore = None  # (balise, profondeur) de l'élément ignoré en cours

    def handle_starttag(self, tag, attrs):
        if tag in ("p", "li", "br", "div", "tr", "h1", "h2", "h3", "blockquote"):
            self.morceaux.append("\n")
        if tag in self.VIDES:
            return
        if self.ignore:
            if tag == self.ignore[0]:
                self.ignore[1] += 1
            return
        classes = dict(attrs).get("class") or ""
        if any(c in classes for c in self.IGNORES):
            self.ignore = [tag, 1]

    def handle_endtag(self, tag):
        if self.ignore and tag == self.ignore[0]:
            self.ignore[1] -= 1
            if self.ignore[1] == 0:
                self.ignore = None

    def handle_data(self, data):
        if not self.ignore:
            self.morceaux.append(data)

    def texte(self):
        brut = "".join(self.morceaux).replace("\xa0", " ")
        return re.sub(r"[ \t]+", " ", re.sub(r"\n\s*\n+", "\n", brut)).strip()


def texte_page(contenu_html):
    p = Texte()
    p.feed(contenu_html or "")
    return p.texte()


def section(texte, debut, fins):
    m = re.search(debut, texte, re.I)
    if not m:
        return ""
    reste = texte[m.end():]
    coupe = len(reste)
    for fin in fins:
        f = re.search(fin, reste, re.I)
        if f:
            coupe = min(coupe, f.start())
    return reste[:coupe].strip(" :\n")


def extrait(texte, longueur):
    texte = re.sub(r"\s+", " ", texte).strip()
    if len(texte) <= longueur:
        return texte
    coupe = texte[:longueur]
    fin_phrase = coupe.rfind(". ")
    if fin_phrase > longueur * 0.6:
        return coupe[:fin_phrase + 1]
    return coupe[:coupe.rfind(" ")] + "…"


def noms_depuis_hubs(hubs):
    """Lit les surnoms (« SCP-173 - The Sculpture ») dans les pages de séries."""
    noms = {}
    for cle, hub in hubs.items():
        if not (cle == "scp-series" or cle.startswith("scp-series-")):
            continue
        for li in re.findall(r"<li>(.*?)</li>", hub.get("raw_content", ""), re.S):
            lien = re.search(r'href="/(scp-[0-9]+[^"]*)"', li)
            if not lien:
                continue
            # « - <strong>The Original</strong> » : mention éditoriale, pas le surnom
            li = re.sub(r"\s*[-–—]\s*<strong>.*?</strong>\s*$", "", li.strip(), flags=re.S)
            txt = html.unescape(re.sub(r"<[^>]+>", "", li)).replace("\xa0", " ").strip()
            nom = re.sub(r"^SCP-[0-9]+\S*\s*[-–—]\s*", "", txt).strip()
            if nom and lien.group(1) not in noms:
                noms[lien.group(1)] = nom
    return noms


def liens_entrants(items, contes, hubs):
    """Nombre de pages du wiki qui citent chaque SCP (hors navigation entre numéros voisins)."""
    compte = {}
    for item in items.values():
        n = item.get("scp_number")
        for ref in set(item.get("references") or []):
            m = re.fullmatch(r"scp-([0-9]+)", ref)
            if m and n is not None and abs(int(m.group(1)) - n) == 1:
                continue
            compte[ref] = compte.get(ref, 0) + 1
    for page in list(contes.values()) + [h for k, h in hubs.items() if not k.startswith("scp-series")]:
        for ref in set(page.get("references") or []):
            compte[ref] = compte.get(ref, 0) + 1
    return compte


def auteurs(contenu_html, createur):
    m = re.search(r'</a>"\s*by\s+(.*?),\s*from the', contenu_html or "", re.S)
    if m:
        return html.unescape(re.sub(r"<[^>]+>", "", m.group(1))).strip()
    return createur or "Inconnu"


def nom_classe(texte, classe):
    """Pour les classes ésotériques, récupère le libellé réel (« Object Class: Archon »)."""
    if classe != "esoteric-class":
        return None
    m = re.search(r"(?:Object|Containment|Secondary) Class:\s*([A-Za-z][A-Za-z\- ]{1,24})", texte)
    if m:
        nom = m.group(1).strip().split("\n")[0].strip()
        if nom.lower() not in ("esoteric", "n/a", "none"):
            return nom.title()
    return "Esoteric"


def borne(v, bas=5, haut=99):
    return max(bas, min(haut, int(round(v))))


def titre_page(titre):
    return re.sub(r"\s*-\s*SCP Foundation\s*$", "", titre or "").strip()


def image_relative(images):
    img = (images or [None])[0]
    if img and img.startswith(PREFIXE_IMAGE):
        return img[len(PREFIXE_IMAGE):]
    if img and img.startswith("http"):
        return img
    return None


def tags_utiles(tags):
    return [t for t in tags or [] if t not in TAGS_EXCLUS and not t.startswith("_")][:10]


def contenu_principal(page_html):
    """Le bloc #page-content d'une page Wikidot complète."""
    debut = page_html.find('id="page-content"')
    if debut < 0:
        return ""
    debut = page_html.find(">", debut) + 1
    fin = len(page_html)
    for borne_fin in ('<div class="page-tags"', 'id="page-info"', 'id="page-options-bottom"', 'class="licensebox"'):
        i = page_html.find(borne_fin, debut)
        if 0 < i < fin:
            fin = i
    return page_html[debut:fin]


def decouper(bloc, niveau):
    """Découpe un bloc HTML en (titre, corps) sur les balises <hN>."""
    morceaux = re.split(rf"<h{niveau}[^>]*>(.*?)</h{niveau}>", bloc, flags=re.S)
    return [(html.unescape(re.sub(r"<[^>]+>", "", morceaux[i])).strip(), morceaux[i + 1])
            for i in range(1, len(morceaux) - 1, 2)]


def liens_internes(fragment):
    pages = set(re.findall(r'href="/([a-z0-9][a-z0-9:\-]*)"', fragment))
    tags = set(re.findall(r'href="/system:page-tags/tag/([a-z0-9\-]+)', fragment))
    return {p for p in pages if not p.startswith("system:")}, tags


def premiere_image(fragment):
    m = re.search(r'<img[^>]+src="([^"]+)"', fragment)
    if not m:
        return None
    return image_relative([m.group(1)])


def texte_paragraphes(fragment):
    """Texte des paragraphes seulement (évite listes de liens et tableaux)."""
    return " ".join(texte_page(p) for p in re.findall(r"<p[^>]*>.*?</p>", fragment, re.S))


GENRES = {"horror": "Horreur", "comedy": "Comédie", "fantasy": "Fantastique", "slice-of-life": "Tranche de vie",
          "action": "Action", "science-fiction": "Science-fiction", "mystery": "Mystère", "bleak": "Sombre",
          "spy-fiction": "Espionnage", "military-fiction": "Militaire", "romance": "Romance",
          "post-apocalyptic": "Post-apocalyptique", "poetry": "Poésie", "creepypasta": "Creepypasta",
          "crime-fiction": "Policier", "adventure": "Aventure", "surrealism": "Surréalisme",
          "absurdism": "Absurde", "bittersweet": "Doux-amer", "period-piece": "Historique",
          "religious-fiction": "Religieux", "worldbuilding": "Univers"}
CATEGORIES_PERSONNEL = {"Doctors": "Docteur", "Researchers": "Chercheur", "Agents": "Agent", "AICs": "IAC",
                        "Directors": "Directeur", "O5 Command": "Conseil O5", "D-Class": "Classe D",
                        "Other Personnel": "Personnel", "Former Personnel": "Ancien personnel",
                        "Persons of Interest": "Personne d'intérêt", "Pluripotent Entities": "Entité pluripotente"}
# Onglet du dossier du personnel qui recopie des SCP déjà présents comme cartes
ONGLETS_IGNORES = {"SCP Objects"}


def genre(tags):
    return next((GENRES[t] for t in tags or [] if t in GENRES), "Conte")


def slug(texte):
    return re.sub(r"[^a-z0-9]+", "-", texte.lower()).strip("-") or "x"


def fim(dossier):
    bloc = contenu_principal((dossier / "pages" / "task-forces.html").read_text(encoding="utf-8"))
    sortie, vues = [], set()
    # Les FIM principales sont en <h1>, les « Additional MTFs » et forces spéciales en <h2>/<h3>
    for titre, corps in decouper(bloc, 1) + decouper(bloc, 2) + decouper(bloc, 3):
        m = re.match(r"^MTF\s+(.+?)\s*\((.+)\)\s*$", titre)
        if not m or titre in vues:
            continue
        vues.add(titre)
        designation, surnom = m.group(1).strip(), m.group(2).strip(" “”\"'")
        pages, tags = liens_internes(corps)
        texte = texte_page(corps)
        mission = section(texte, r"(?:Task Force )?Mission\s*:",
                          [r"Assisting In Containment", r"\+ Open Entries", r"Notable Members", r"Assigned to"])
        sortie.append({"k": "f", "id": "fim:" + slug(designation), "num": "MTF " + designation, "nm": surnom,
                       "cat": re.split(r"[- ]", designation)[0], "u": "task-forces",
                       "x": extrait(mission or texte, 300), "img": premiere_image(corps),
                       "_pages": pages, "_tags": tags, "_mots": len(texte.split()),
                       "_scp": sorted(p for p in pages if re.fullmatch(r"scp-\d+", p))})
    return sortie


def groupes(dossier):
    bloc = contenu_principal((dossier / "pages" / "groups-of-interest.html").read_text(encoding="utf-8"))
    sortie, tag_vers_groupe = [], {}
    for titre, corps in decouper(bloc, 1):
        pages, tags = liens_internes(corps)
        texte = texte_paragraphes(corps) or texte_page(corps)
        for t in tags:
            tag_vers_groupe.setdefault(t, titre)
        sortie.append({"k": "g", "id": "gdi:" + slug(titre), "nm": titre, "cat": "Groupe d'intérêt",
                       "u": "groups-of-interest", "x": extrait(texte, 300), "img": premiere_image(corps),
                       "_pages": pages, "_tags": tags, "_mots": len(texte_page(corps).split())})
    return sortie, tag_vers_groupe


def canons(dossier):
    bloc = contenu_principal((dossier / "pages" / "canon-hub.html").read_text(encoding="utf-8"))
    sortie = []
    for titre, corps in decouper(bloc, 2):
        if not titre or titre.lower() == "unmaintained canons":
            continue
        pages, tags = liens_internes(corps)
        # Les pages d'un canon portent en général un tag à son nom (« no-return », « lampeter »…)
        tags |= {slug(titre)} | {re.sub(r"-hub$", "", p) for p in pages if p.endswith("-hub")}
        texte = texte_paragraphes(corps) or texte_page(corps)
        sortie.append({"k": "n", "id": "canon:" + slug(titre), "nm": titre, "cat": "Canon", "u": "canon-hub",
                       "x": extrait(texte, 300), "img": premiere_image(corps), "_pages": pages, "_tags": tags,
                       "_mots": len(texte_page(corps).split())})
    return sortie


def personnel(dossier, sous_dossier="pages"):
    brut = (dossier / sous_dossier / "personnel-and-character-dossier.html").read_text(encoding="utf-8", errors="replace")
    onglets = re.findall(r'<li[^>]*><a href="javascript:;"><em>(.*?)</em></a></li>', brut)
    sortie = []
    for i, onglet in enumerate(onglets):
        onglet = html.unescape(onglet)
        debut = brut.find(f'id="wiki-tab-0-{i}"')
        fin = brut.find(f'id="wiki-tab-0-{i + 1}"')
        if debut < 0 or onglet in ONGLETS_IGNORES:
            continue
        bloc = brut[debut:fin if fin > 0 else None]
        for entree in re.split(r"<hr\s*/?>", bloc):
            m = re.search(r"<p[^>]*>\s*<strong>(.*?)</strong>", entree, re.S)
            if not m:
                continue
            nom = html.unescape(re.sub(r"<[^>]+>", "", m.group(1))).replace("\xa0", " ").strip().rstrip(":").strip()
            if not nom or len(nom) > 80:
                continue
            pages, tags = liens_internes(entree)
            texte = texte_page(entree)
            texte = texte[len(nom):].lstrip(" :\n") if texte.startswith(nom) else texte
            sortie.append({"k": "p", "id": "perso:" + slug(nom), "nm": nom,
                           "cat": CATEGORIES_PERSONNEL.get(onglet, onglet), "u": "personnel-and-character-dossier",
                           "x": extrait(texte, 300), "img": premiere_image(entree), "_pages": pages, "_tags": tags,
                           "_mots": len(texte.split())})
    return sortie


def conseil_o5(dossier):
    """Les treize membres du Conseil O5, un onglet chacun dans le dossier O5."""
    brut = (dossier / "pages" / "o5-command-dossier.html").read_text(encoding="utf-8", errors="replace")
    onglets = [html.unescape(o) for o in re.findall(r'<li[^>]*><a href="javascript:;"><em>(.*?)</em></a></li>', brut)]
    sortie = []
    for i, onglet in enumerate(onglets):
        if not re.fullmatch(r"O5-\d+", onglet):
            continue
        debut = brut.find(f'id="wiki-tab-0-{i}"')
        if debut < 0:
            continue
        fin = brut.find(f'id="wiki-tab-0-{i + 1}"')
        bloc = brut[debut:fin if fin > 0 else None]
        pages, tags = liens_internes(bloc)
        texte = texte_paragraphes(bloc) or texte_page(bloc)
        sortie.append({"k": "p", "id": "perso:" + onglet.lower(), "num": onglet, "nm": onglet, "cat": "Conseil O5",
                       "u": "o5-command-dossier", "x": extrait(texte, 300), "img": premiere_image(bloc),
                       "_pages": pages, "_tags": tags, "_mots": len(texte.split())})
    return sortie


def charger_contenus(dossier, motif):
    contenus = {}
    for f in sorted(dossier.glob(motif)):
        contenus.update(json.loads(f.read_text(encoding="utf-8")))
    return contenus


def rarete_et_stats(cartes):
    """Classe chaque type de carte par popularité, puis calcule Menace et Confinement."""
    par_type = {}
    for c in cartes:
        par_type.setdefault(c["k"], []).append(c)
    for liste in par_type.values():
        liste.sort(key=lambda c: -c["_pop"])
        total = len(liste)
        for rang, c in enumerate(liste):
            c["ra"] = 4 - next((i for i, s in enumerate(SEUILS_RARETE) if rang / total < s), 4)
            c["p"] = rang + 1
            mult = 1 + 0.08 * c["ra"]
            mots = 8 + 11 * math.log1p(c["_mots"] / 60)
            if c["k"] == "s":
                menace = (mots + sum(BONUS_MENACE.get(t, 0) for t in c["t"] + [c["c"]])
                          + (BONUS_MENACE["uncontained"] if c["_unc"] else 0))
                confinement = (DEF_CLASSE[c["c"]] + 6 * math.log1p(c["_proc"] / 15)
                               + sum(BONUS_CONFINEMENT.get(t, 0) for t in c["t"]))
            elif c["k"] in ("c", "d"):
                menace = mots + 2
                confinement = 15 + 7 * math.log1p(max(c["r"], 0) / 5)
            else:
                # Fiches de référence : textes courts, l'influence (pages liées) compense
                menace = mots + 12 + 3 * math.log1p(len(c.get("_scp", [])))
                confinement = 18 + 6 * math.log1p(c["lp"] * 2)
            c["atk"] = borne(menace * mult)
            c["def"] = borne(confinement * mult)


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    dossier = Path(sys.argv[1])
    charger = lambda nom: json.loads((dossier / nom).read_text(encoding="utf-8"))

    items = charger("items_index.json")
    hubs = charger("hubs_index.json")
    contes = charger("tales_index.json")
    docs_gdi = charger("goi_index.json")
    contenus = {}
    for nom in CONTENUS:
        if (dossier / nom).exists():
            contenus.update(charger(nom))
    contenus_contes = charger_contenus(dossier, "tales/content_*.json")
    contenus_gdi = charger("content_goi.json") if (dossier / "content_goi.json").exists() else {}

    noms = noms_depuis_hubs(hubs)
    entrants = liens_entrants(items, contes, hubs)

    # Note de chaque page et pages portant chaque tag : mesure l'influence des fiches de référence
    notes, par_tag, par_hub = {}, {}, {}
    for page in list(items.values()) + list(contes.values()) + list(docs_gdi.values()):
        notes[page["link"]] = page.get("rating") or 0
        for t in page.get("tags") or []:
            par_tag.setdefault(t, set()).add(page["link"])
        for h in page.get("hubs") or []:
            par_hub.setdefault(h, set()).add(page["link"])

    brutes = []
    for cle, item in items.items():
        serie = SERIES.get(item.get("series"))
        if serie is None and item.get("series") == "scp-001":
            serie = 0
        if serie is None or item.get("scp_number") is None:
            continue
        page = contenus.get(cle, {})
        texte = texte_page(page.get("raw_content"))
        tags = item.get("tags") or []
        classe = next((c for c in CLASSES if c in tags), "pending")

        procedures = section(texte, r"Special Containment Procedures?\s*:?", [r"\bDescription\s*:", r"\bAddendum"])
        description = section(texte, r"\bDescription\s*:", [r"\bAddendum", r"\bAppendix", r"\bExperiment Log",
                                                             r"\bInterview", r"\bIncident", r"\bDocument", r"\bNote:"])
        if not description:
            description = texte[len(procedures):] if procedures else texte

        lien = item["link"]
        hubs_page = [h for h in item.get("hubs") or [] if not h.startswith("scp-series")]
        brutes.append({
            "k": "s",
            "id": lien,
            "num": item["scp"],
            "n": item["scp_number"],
            "s": serie,
            "nm": noms.get(lien) or ("Proposition SCP-001" if serie == 0 else "[DONNÉES EXPURGÉES]"),
            "c": classe,
            "ce": nom_classe(texte, classe),
            "r": item.get("rating") or 0,
            "y": int((item.get("created_at") or "2008")[:4]),
            "a": auteurs(page.get("raw_content"), item.get("creator")),
            "t": tags_utiles(tags),
            "img": image_relative(item.get("images")),
            "x": extrait(description, 300),
            "q": extrait(procedures, 220),
            "_mots": len(texte.split()),
            "_proc": len(procedures.split()),
            "_unc": "uncontained" in tags,
            # La note domine, les pages qui citent le SCP et les hubs départagent
            "_pop": (0.65 * math.log1p(max(item.get("rating") or 0, 0)) / 9.4
                     + 0.25 * math.log1p(entrants.get(lien, 0)) / 6
                     + 0.10 * math.log1p(len(hubs_page)) / 3),
        })

    # Contes et documents de Groupes d'intérêt : des pages notées, comme les SCP
    gdi, tag_vers_groupe = groupes(dossier)
    for source, contenu_source, k in ((contes, contenus_contes, "c"), (docs_gdi, contenus_gdi, "d")):
        for cle, conte in source.items():
            note = conte.get("rating") or 0
            if note < SEUIL_NOTE_CONTE:
                continue
            page = contenu_source.get(cle, {})
            texte = texte_page(page.get("raw_content"))
            tags = conte.get("tags") or []
            lien = conte["link"]
            if k == "c":
                categorie = genre(tags)
            else:
                categorie = next((tag_vers_groupe[t.lstrip("_")] for t in tags if t.lstrip("_") in tag_vers_groupe),
                                 "Groupe d'intérêt")
            brutes.append({
                "k": k, "id": lien, "nm": titre_page(conte.get("title")) or lien, "cat": categorie,
                "r": note, "y": int((conte.get("created_at") or "2008")[:4]),
                "a": auteurs(page.get("raw_content"), conte.get("creator")),
                "t": tags_utiles(tags), "img": image_relative(conte.get("images")),
                "x": extrait(texte, 260),
                "_mots": len(texte.split()),
                "_pop": 0.75 * math.log1p(max(note, 0)) / 7.7 + 0.25 * math.log1p(entrants.get(lien, 0)) / 6,
            })

    # Fiches de référence : équipes FIM, personnel et Conseil O5, Groupes d'intérêt, canons
    for c in fim(dossier) + personnel(dossier) + conseil_o5(dossier) + gdi + canons(dossier):
        pages = c.pop("_pages")
        liees = {p for p in pages if p in notes}
        for p in pages:
            # Un lien vers un hub (canon, série de contes) compte toutes les pages du hub
            liees |= par_hub.get(p, set())
        for t in c.pop("_tags"):
            liees |= par_tag.get(t, set())
        c["lp"] = len(liees)
        c["_pop"] = math.log1p(sum(max(notes[p], 0) for p in liees))
        if c["k"] == "f":
            c["_scp"] = sorted(c["_scp"], key=lambda p: -notes.get(p, 0))
            c["lie"] = [p.upper() for p in c["_scp"][:6]]
        brutes.append(c)

    # Identifiants uniques (deux FIM portent parfois la même désignation)
    vus = {}
    for c in brutes:
        if c["id"] in vus:
            vus[c["id"]] += 1
            c["id"] = f"{c['id']}-{vus[c['id']]}"
        else:
            vus[c["id"]] = 1

    rarete_et_stats(brutes)

    ordre = "sfpgndc"
    brutes.sort(key=lambda c: (ordre.index(c["k"]), c.get("s") or 0, c.get("n") or 0,
                               (c.get("num") or c["nm"]).lower()))
    cartes = [{k: v for k, v in c.items() if not k.startswith("_") and v not in (None, "", [])} for c in brutes]

    SORTIE.parent.mkdir(parents=True, exist_ok=True)
    sortie = {
        "genere": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "source": "https://scp-wiki.wikidot.com — CC BY-SA 3.0",
        "prefixeImage": PREFIXE_IMAGE,
        "cartes": cartes,
    }
    SORTIE.write_text(json.dumps(sortie, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    for k in ordre:
        sel = [c for c in cartes if c["k"] == k]
        print(k, len(sel), [sum(1 for c in sel if c["ra"] == i) for i in range(5)])
    print(f"{len(cartes)} cartes -> {SORTIE} ({SORTIE.stat().st_size / 1e6:.1f} Mo)")

    if (dossier / "fr").exists():
        traductions = traduire(dossier, brutes)
        SORTIE_FR.write_text(json.dumps(traductions, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        print(f"{len(traductions)} traductions -> {SORTIE_FR} ({SORTIE_FR.stat().st_size / 1e6:.1f} Mo)")


def traduire(dossier, cartes):
    """Surnoms, extraits et procédures en français, quand la branche FR a traduit la page."""
    fr = dossier / "fr"
    sortie, noms = {}, {}
    for f in fr.glob("scp-series*.html"):
        for li in re.findall(r"<li>(.*?)</li>", f.read_text(encoding="utf-8", errors="replace"), re.S):
            lien = re.search(r'<a (?![^>]*newpage)[^>]*href="/(scp-\d+)"', li)
            if not lien:
                continue
            li = re.sub(r"\s*[-–—]\s*<strong>.*?</strong>\s*$", "", li.strip(), flags=re.S)
            txt = html.unescape(re.sub(r"<[^>]+>", "", li)).replace("\xa0", " ").strip()
            nom = re.sub(r"^SCP-[0-9]+\S*\s*[-–—]\s*", "", txt).strip()
            if nom and nom != txt:
                noms[lien.group(1)] = nom
    for c in cartes:
        if c["k"] != "s":
            continue
        t = {}
        if c["id"] in noms:
            t["nm"] = noms[c["id"]]
        f = fr / f"{c['id']}.html"
        if f.exists() and f.stat().st_size:
            texte = texte_page(contenu_principal(f.read_text(encoding="utf-8", errors="replace")))
            proc = section(texte, r"Proc[ée]dures? de [Cc]onfinement [Ss]p[ée]ciales?\s*:?",
                           [r"\bDescription\s*:", r"\bAddendum"])
            desc = section(texte, r"\bDescription\s*:", [r"\bAddendum", r"\bAppendice", r"\bAnnexe", r"\bJournal",
                                                         r"\bEntretien", r"\bIncident", r"\bDocument", r"\bNote\s*:"])
            if desc:
                t["x"] = extrait(desc, 300)
            if proc:
                t["q"] = extrait(proc, 220)
        if t:
            sortie[c["id"]] = t
    sortie.update(traduire_references(dossier, cartes))
    return sortie


def traduire_references(dossier, cartes):
    """FIM et personnel : la branche FR reprend les mêmes pages, associées par désignation ou par nom."""
    sortie = {}
    f = dossier / "fr" / "task-forces.html"
    if f.exists():
        bloc = contenu_principal(f.read_text(encoding="utf-8", errors="replace"))
        par_designation = {}
        for niveau in (1, 2):
            for titre, corps in decouper(bloc, niveau):
                m = re.match(r"^\S+\s+(.+?)\s*[\(«]\s*(.+?)\s*[\)»]+\s*$", titre)
                if m:
                    texte = texte_page(corps)
                    mission = section(texte, r"Mission\s*(?:de la [^:]+)?:", [r"Participe", r"Assist", r"\+ ", r"Membres"])
                    par_designation[m.group(1).strip().lower()] = (m.group(2).strip(" “”\"'«»"), mission or texte)
        for c in cartes:
            if c["k"] == "f":
                trouve = par_designation.get(c["num"][4:].lower())
                if trouve:
                    sortie[c["id"]] = {"nm": trouve[0], "x": extrait(trouve[1], 300)}
    if (dossier / "fr" / "personnel-and-character-dossier.html").exists():
        index = {c["nm"].lower(): c for c in cartes if c["k"] == "p"}
        for c in personnel(dossier, "fr"):
            cible = index.get(c["nm"].lower())
            if cible and c["x"]:
                sortie[cible["id"]] = {"x": c["x"]}
    return sortie


if __name__ == "__main__":
    main()
