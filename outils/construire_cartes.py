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
# Les types de fiches de référence sont petits (51 à 200 cartes) : 1 % y ferait un ou deux légendaires
SEUILS_REFERENCE = [0.04, 0.12, 0.27, 0.55]
# Icônes de la Fondation, légendaires d'office : leur notoriété vient surtout d'en dehors du wiki
# (jeux SCP: Containment Breach et Secret Laboratory), que les mentions dans le wiki ne mesurent pas.
# Rēsh-1 : choix du créateur du jeu
ICONES = {"fim:epsilon-11", "gdi:the-chaos-insurgency", "fim:r-sh-1"}
# Rareté Mythique (5), au-dessus de Légendaire : choisies à la main, hors du classement par popularité
MYTHIQUES = {"perso:aaron-siegel", "perso:the-administrator", "perso:o5-1", "entite:scarlet-king",
             "fim:alpha-1", "dr-clef-s-proposal", "perso:les-auteurs"}
# Tags de la section « Departments » qui désignent des équipes FIM, déjà des cartes
TAGS_FIM = {"last-hope", "samsara", "angle-grinders"}
# Noms que la description d'un tag ne donne pas proprement
NOMS_DEPARTEMENTS = {"delta-t": "Temporal Anomalies Department", "spicy-crust-pizzeria": "Spicy Crust Pizzeria"}
NOMS_ENTITES = {"the-serpent": "The Serpent", "hanged-king": "The Hanged King", "yaldabaoth": "Yaldabaoth",
                "nameless": "The Nameless", "mister": "Little Misters", "homo-sapiens-sidhe": "Homo sapiens sidhe", "malo": "MalO",
                "brothers-of-death": "The Three Brothers of Death", "anafabula": "Anafabula",
                "pattern-screamer": "Pattern Screamers", "with-many-voices": "With Many Voices"}
# Entités hors des sections d'entités de la liste des tags
ENTITES_EN_PLUS = {"scarlet-king": "The Scarlet King"}
TEXTE_AUTEURS_FR = ("En pataphysique, les Auteurs sont les êtres de la strate narrative située au-dessus de la "
                    "réalité de la Fondation : les écrivains dont les histoires sont l'univers lui-même. Chaque anomalie, "
                    "chaque brèche de confinement, chaque mort est une ligne qu'ils ont écrite, et de rares entités ont "
                    "tenté de remonter les strates pour les rencontrer.")
# Le nom sous lequel les joueurs connaissent certaines propositions SCP-001
NOMS_001 = {"dr-clef-s-proposal": "The Gate Guardian"}
TEXTE_AUTEURS = ("In pataphysics, the Authors are the beings of the narrative layer above the Foundation's "
                 "reality: the writers whose stories are the universe itself. Every anomaly, every containment "
                 "breach, every death is a line they wrote, and a few rare entities have tried to climb back "
                 "up the layers to meet them.")
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


def entrees_tags(dossier):
    """Liste des tags du wiki : {tag: (section, nom lié dans la description, page liée, description)}."""
    brut = (dossier / "pages" / "tag-list.html").read_text(encoding="utf-8", errors="replace")
    entrees = {}
    for titre, corps in re.findall(r"<h3[^>]*>(.*?)</h3>(.*?)(?=<h[23][^>]*>)", brut, re.S):
        titre = html.unescape(re.sub(r"<[^>]+>", "", titre)).strip()
        for tag, desc in re.findall(r'<li><strong><a href="[^"]*/tag/([a-z0-9\-]+)">.*?</strong>\s*&#8212;\s*(.*?)</li>', corps, re.S):
            lien = re.search(r'<a href="https?://(?:scpwiki\.com|scp-wiki\.wikidot\.com)/([^"#]+)"[^>]*>(.*?)</a>', desc)
            nom = html.unescape(re.sub(r"<[^>]+>", "", lien.group(2))).strip() if lien else None
            texte = html.unescape(re.sub(r"<[^>]+>", "", desc)).replace("\xa0", " ").strip()
            entrees.setdefault(tag, (titre, nom, lien.group(1) if lien else None, texte))
    return entrees


def nom_depuis_description(texte):
    m = re.search(r"(?:related to|relating to|Features)\s+(?:the Foundation's |the |The )?(.+?)(?:,| \(| or |\.$)", texte)
    return m.group(1).strip() if m else texte


def departements(dossier, entrees):
    """Départements de la Fondation, d'après la section « Departments » de la liste des tags."""
    sortie = []
    for tag, (section_tags, nom, page, texte) in entrees.items():
        if section_tags != "Departments" or tag in TAGS_FIM:
            continue
        nom = NOMS_DEPARTEMENTS.get(tag) or nom or nom_depuis_description(texte)
        sortie.append({"k": "e", "id": "dept:" + tag, "nm": nom, "cat": categorie_departement(nom),
                       "u": page or f"system:page-tags/tag/{tag}", "x": texte,
                       "_pages": set(), "_tags": {tag}, "_mots": len(texte.split()), "_scp": []})
    return sortie


def categorie_departement(nom):
    for mot, cat in (("Division", "Division"), ("Committee", "Comité"), ("Administration", "Administration"),
                     ("Authority", "Autorité"), ("Office", "Bureau"), ("Team", "Équipe de recherche")):
        if mot in nom:
            return cat
    return "Société-écran" if "Pizz" in nom else "Département"


def entites(dossier, entrees):
    """Entités pluripotentes et groupes d'entités anomales, d'après la liste des tags."""
    sortie = []
    for tag, (section_tags, nom, page, texte) in entrees.items():
        if section_tags not in ("Pluripotent Entities", "Anomalous Entities") and tag not in ENTITES_EN_PLUS:
            continue
        nom = ENTITES_EN_PLUS.get(tag) or NOMS_ENTITES.get(tag) or nom_depuis_description(texte)
        sortie.append({"k": "p", "id": "entite:" + tag, "nm": nom,
                       "cat": "Entités anomales" if section_tags == "Anomalous Entities" else "Entité pluripotente",
                       "u": f"system:page-tags/tag/{tag}", "x": texte,
                       "_pages": set(), "_tags": {tag}, "_mots": len(texte.split()), "_scp": []})
    return sortie


def fondateurs(dossier, entrees):
    """Figures absentes des dossiers du wiki : Aaron Siegel (dossier O5-1) et les Auteurs (pataphysique)."""
    brut = (dossier / "pages" / "o5-command-dossier.html").read_text(encoding="utf-8", errors="replace")
    texte = re.sub(r"\s+", " ", texte_page(contenu_principal(brut)))
    phrases = [p for p in re.split(r"(?<=\.)\s+", texte) if re.search(r"Siegel|Cornell", p)]
    pataphysique = entrees.get("pataphysics-dept")
    return [
        {"k": "p", "id": "perso:aaron-siegel", "nm": "Aaron Siegel", "cat": "Fondateur", "u": "o5-command-dossier",
         "x": extrait(" ".join(dict.fromkeys(phrases)), 300),
         "_pages": set(), "_tags": set(), "_mots": len(" ".join(phrases).split()), "_scp": []},
        {"k": "p", "id": "perso:les-auteurs", "nm": "The Authors", "cat": "Cosmologie",
         "u": pataphysique[2] if pataphysique and pataphysique[2] else "system:page-tags/tag/pataphysics-dept",
         "x": TEXTE_AUTEURS, "_pages": set(), "_tags": {"pataphysics-dept"}, "_mots": len(TEXTE_AUTEURS.split()),
         "_scp": []},
    ]


def propositions_001(dossier):
    """Les propositions du hub SCP-001, téléchargées par outils/telecharger_pages.mjs."""
    titres = dict(re.findall(r'<li[^>]*><a href="/([^"]+)">([^<]+)</a>',
                             (dossier / "pages" / "tags" / "001-proposal.html").read_text(encoding="utf-8")))
    hub = (dossier / "pages" / "scp-001.html").read_text(encoding="utf-8", errors="replace")
    sortie = []
    for lien in dict.fromkeys(re.findall(r'href="/([a-z0-9\-:]+)"[^>]*>CODE NAME', hub)):
        f = dossier / "pages" / "001" / f"{lien.replace(':', '_')}.html"
        if not f.exists():
            continue
        brut = f.read_text(encoding="utf-8", errors="replace")
        contenu = contenu_principal(brut)
        texte = texte_page(contenu)
        tags = re.findall(r'/system:page-tags/tag/([a-z0-9\-]+)#pages', brut)
        classe = next((c for c in CLASSES if c in tags), "pending")
        procedures = section(texte, r"Special Containment Procedures?\s*:?", [r"\bDescription\s*:", r"\bAddendum"])
        description = section(texte, r"\bDescription\s*:", [r"\bAddendum", r"\bAppendix", r"\bExperiment Log",
                                                             r"\bInterview", r"\bIncident", r"\bDocument", r"\bNote:"])
        note = re.search(r'class="number prw54353">([+\-]?\d+)', brut)
        images = [html.unescape(i) for i in re.findall(r'<img[^>]+src="([^"]+)"', contenu) if "wdfiles.com" in i]
        sortie.append({
            "k": "s", "id": lien, "num": "SCP-001", "n": 1, "s": 0,
            "nm": NOMS_001.get(lien) or html.unescape(titres.get(lien) or lien),
            "c": classe, "ce": nom_classe(texte, classe), "r": int(note.group(1)) if note else 0,
            "a": auteurs(html.unescape(brut), None), "t": tags_utiles(tags), "img": image_relative(images),
            "x": extrait(description or texte[len(procedures):], 300), "q": extrait(procedures, 220),
            "_mots": len(texte.split()), "_proc": len(procedures.split()), "_unc": "uncontained" in tags,
            "_pop": 0.65 * math.log1p(max(int(note.group(1)) if note else 0, 0)) / 9.4,
        })
    return sortie


def charger_contenus(dossier, motif):
    contenus = {}
    for f in sorted(dossier.glob(motif)):
        contenus.update(json.loads(f.read_text(encoding="utf-8")))
    return contenus


# ---------------------------------------------------------------------------
# Notoriété des fiches de référence (équipes FIM, personnel, Groupes d'intérêt)
# ---------------------------------------------------------------------------
GRECQUES = "Alpha|Beta|Gamma|Delta|Epsilon|Zeta|Eta|Theta|Iota|Kappa|Lambda|Mu|Nu|Xi|Omicron|Pi|Rho|Sigma|Tau|Upsilon|Phi|Chi|Psi|Omega"
RE_MTF = re.compile(rf"\b({GRECQUES})[- ](\d+)(?!\d)")
RE_O5 = re.compile(r"\bO5-(\d+)(?!\d)")
RE_TITRE = re.compile(r"\b(?:Dr\.?|Doctor|Agent|Director|Researcher|Professor)\s+([A-Z][A-Za-z'’-]+)")
RE_MOTS = re.compile(r"[A-Z][A-Za-z'’&-]+")
# Noms trop courants pour être comptés seuls dans un texte
MOTS_COURANTS = {"Factory", "Nobody"}
# Autres façons dont le wiki désigne certains Groupes d'intérêt
ALIAS = {
    "gdi:marshall-carter-and-dark-ltd": ["MC&D", "Marshall, Carter"],
    "gdi:church-of-the-broken-god": ["Broken God", "Maxwellism", "Mekhane"],
    "gdi:sarkic-cults": ["Sarkic", "Sarkicism"],
    "gdi:doctor-wondertainment": ["Wondertainment"],
    "gdi:the-chaos-insurgency": ["Insurgency"],
    "gdi:the-serpent-s-hand": ["Serpent's Hand", "Serpent’s Hand"],
    "gdi:global-occult-coalition-goc": ["GOC"],
    "gdi:the-children-of-the-scarlet-king": ["Scarlet King"],
}


def cles_mention(c):
    """Ce qui, dans le texte d'une page, signale une mention de la fiche : (genre, valeur)."""
    cles = []
    if c["k"] == "f":
        m = re.match(rf"MTF ({GRECQUES})[- ](\d+)", c["num"])
        if m:
            cles.append(("mtf", (m.group(1), m.group(2))))
        if len(c["nm"].split()) >= 2:
            cles.append(("phrase", c["nm"]))
    elif c["k"] == "p" and c["cat"] == "Cosmologie":
        # « Authors » figure dans les crédits de presque toutes les pages : seul le tag compte
        return []
    elif c["k"] == "p" and c["cat"] in ("Entité pluripotente", "Entités anomales", "Fondateur"):
        # Le dernier mot (« King », « Siegel ») ne suffit pas : on exige le nom complet
        cles.append(("phrase", re.sub(r"^The ", "", c["nm"])))
    elif c["k"] == "e":
        cles.append(("phrase", re.sub(r"^The ", "", c["nm"])))
    elif c["k"] == "p":
        if re.fullmatch(r"O5-\d+", c["nm"]):
            return [("o5", c["nm"][3:])]
        nom = re.sub(r"\s+AKA.*$", "", re.sub(r"\s*\(.*?\)|[\"“”]", "", c["nm"])).strip()
        mots = nom.split()
        if mots and len(mots[-1]) > 3:
            cles.append(("titre", mots[-1]))
        if len(mots) >= 2:
            cles.append(("phrase", nom))
    elif c["k"] == "g":
        nom = re.sub(r"\s*\(.*?\)", "", c["nm"]).strip()
        if nom.startswith('"'):
            # « "Nobody" » : le mot seul est trop courant, on exige les guillemets
            cles += [("phrase", nom), ("phrase", "“" + nom.strip('"') + "”")]
        else:
            nom = re.sub(r"^The ", "", nom)
            if nom not in MOTS_COURANTS:
                cles.append(("phrase", nom))
        for alias in ALIAS.get(c["id"], []):
            cles.append(("phrase", alias) if " " in alias else ("mot", alias))
        sigle = re.search(r"\(([A-Z&]{2,})\)", c["nm"])
        if sigle:
            cles.append(("mot", sigle.group(1)))
    return cles


def mentions_wiki(reference, sources):
    """Pour chaque fiche de référence, les pages du wiki dont le texte la mentionne. Une seule passe par page."""
    index_cles, phrases = {}, []
    for c in reference:
        for genre, valeur in cles_mention(c):
            if genre == "phrase":
                phrases.append((max(re.findall(r"[A-Za-z'’&-]+", valeur), key=len), valeur, c["id"]))
            else:
                index_cles.setdefault((genre, valeur), []).append(c["id"])
    mentions = {}
    for index, contenus_source in sources:
        for cle, page in contenus_source.items():
            if cle not in index:
                continue
            lien = index[cle]["link"]
            texte = re.sub(r"<[^>]+>", " ", page.get("raw_content") or "")
            mots = set(RE_MOTS.findall(texte))
            trouves = ({("mtf", m) for m in RE_MTF.findall(texte)} | {("o5", m) for m in RE_O5.findall(texte)}
                       | {("titre", m) for m in RE_TITRE.findall(texte)} | {("mot", m) for m in mots})
            for t in trouves:
                for cid in index_cles.get(t, ()):
                    mentions.setdefault(cid, set()).add(lien)
            for amorce, phrase, cid in phrases:
                if amorce in mots and phrase in texte:
                    mentions.setdefault(cid, set()).add(lien)
    return mentions


def rarete_et_stats(cartes):
    """Classe chaque type de carte par popularité, puis calcule Menace et Confinement."""
    par_type = {}
    for c in cartes:
        par_type.setdefault(c["k"], []).append(c)
    for liste in par_type.values():
        liste.sort(key=lambda c: -c["_pop"])
        total = len(liste)
        seuils = SEUILS_RARETE if liste[0]["k"] in ("s", "c", "d") else SEUILS_REFERENCE
        for rang, c in enumerate(liste):
            if c["id"] in MYTHIQUES:
                c["ra"] = 5
            elif c["id"] in ICONES or (c["k"] == "s" and c.get("s") == 0):
                # Toutes les propositions SCP-001 sont légendaires
                c["ra"] = 4
            else:
                c["ra"] = 4 - next((i for i, s in enumerate(seuils) if rang / total < s), 4)
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
            # Une Mythique domine toujours le combat, quelle que soit la longueur de sa fiche
            plancher = 82 if c["ra"] == 5 else 5
            c["atk"] = borne(max(menace * mult, plancher))
            c["def"] = borne(max(confinement * mult, plancher))


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

    # Propositions SCP-001 du hub : seule celle de qntm est dans l'export scp-data
    deja = {c["id"]: c for c in brutes}
    for c in propositions_001(dossier):
        if c["id"] in deja:
            deja[c["id"]]["nm"] = c["nm"]
        else:
            brutes.append(c)

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

    # Fiches de référence : équipes FIM, personnel et Conseil O5, Groupes d'intérêt, canons.
    # Leur notoriété : les pages qui les citent dans leur texte, portent leur tag ou font partie de leur hub.
    tags_wiki = entrees_tags(dossier)
    reference = (fim(dossier) + personnel(dossier) + conseil_o5(dossier) + gdi + canons(dossier)
                 + departements(dossier, tags_wiki) + entites(dossier, tags_wiki) + fondateurs(dossier, tags_wiki))
    mentions = mentions_wiki(reference, ((items, contenus), (contes, contenus_contes), (docs_gdi, contenus_gdi)))
    for c in reference:
        pages = c.pop("_pages")
        # Signal fort : pages écrites par des auteurs variés qui citent la fiche ou portent son tag.
        # Pour un canon, son hub est le canon lui-même : toutes les pages du hub comptent. Pour les
        # autres fiches, un lien vers un grand hub (concours d'art, série de contes) n'en dit rien.
        fortes = set(mentions.get(c["id"], set()))
        if c["k"] == "n":
            for p in pages:
                fortes |= par_hub.get(p, set())
        for t in c.pop("_tags"):
            fortes |= par_tag.get(t, set())
        # Signal faible : la liste de liens de sa propre section, choisie par un seul rédacteur
        de_la_section = {p for p in pages if p in notes} - fortes
        c["lp"] = len(fortes | de_la_section)
        # Chaque page compte selon sa note, sans qu'une seule page très notée écrase les autres
        c["_pop"] = (sum(math.log1p(max(notes[p], 0)) for p in fortes)
                     + 0.25 * sum(math.log1p(max(notes[p], 0)) for p in de_la_section))
        if "_scp" in c:
            # Départements et entités : les SCP qui portent leur tag
            scp = c["_scp"] or [p for p in fortes if re.fullmatch(r"scp-\d+", p)]
            c["_scp"] = sorted(scp, key=lambda p: -notes.get(p, 0))
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

    ordre = "sfpegndc"
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
        print(k, len(sel), [sum(1 for c in sel if c["ra"] == i) for i in range(6)])
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
    sortie["perso:les-auteurs"] = {"nm": "Les Auteurs", "x": TEXTE_AUTEURS_FR}
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
