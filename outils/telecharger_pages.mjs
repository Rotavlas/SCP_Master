// Télécharge les pages du wiki absentes de l'export scp-data : la liste des tags (départements, entités), les Sites
// et les propositions SCP-001 (titres complets dans la page du tag 001-proposal).
// Usage : node outils/telecharger_pages.mjs C:\chemin\scpdata
// (appelé par outils/telecharger_donnees.ps1 ; relançable, les propositions déjà présentes sont gardées)
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

const WIKI = 'https://scp-wiki.wikidot.com/'

if (!process.argv[2]) {
  console.error('Usage : node outils/telecharger_pages.mjs C:\\chemin\\scpdata')
  process.exit(1)
}
const pages = join(process.argv[2], 'pages')

async function telecharger(page, fichier, forcer = false) {
  if (!forcer && existsSync(fichier) && statSync(fichier).size) return readFileSync(fichier, 'utf8')
  const r = await fetch(WIKI + page, { headers: { 'user-agent': 'scp-masters (jeu de cartes non officiel)' } })
  if (!r.ok) throw new Error(`${page} : ${r.status}`)
  const texte = await r.text()
  mkdirSync(dirname(fichier), { recursive: true })
  writeFileSync(fichier, texte)
  await new Promise((ok) => setTimeout(ok, 400))
  return texte
}

// Pages qui changent : toujours rechargées
await telecharger('tag-list', join(pages, 'tag-list.html'), true)
await telecharger('scp-001', join(pages, 'scp-001.html'), true)
await telecharger('secure-facilities-locations', join(pages, 'secure-facilities-locations.html'), true)
await telecharger('system:page-tags/tag/001-proposal', join(pages, 'tags', '001-proposal.html'), true)
// Les propositions du hub SCP-001 (le tag couvre aussi les branches internationales et les pages -J)
const hub = readFileSync(join(pages, 'scp-001.html'), 'utf8')
const propositions = [...new Set([...hub.matchAll(/href="\/([a-z0-9\-:]+)"[^>]*>CODE NAME/g)].map((m) => m[1]))]
for (const p of propositions) await telecharger(p, join(pages, '001', `${p.replace(':', '_')}.html`))
console.log(`${propositions.length} propositions SCP-001 -> ${pages}`)
