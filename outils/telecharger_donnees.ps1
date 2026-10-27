# Télécharge l'export scp-data (https://scp-data.tedivm.com) et les pages de référence du wiki
# (équipes FIM, personnel, Conseil O5, Groupes d'intérêt, canons) dans le dossier donné.
# Usage : powershell -File outils/telecharger_donnees.ps1 C:\chemin\scpdata
# puis   : npm run fr -- C:\chemin\scpdata      (traductions de la branche française, facultatif)
#          npm run cartes -- C:\chemin\scpdata
param([Parameter(Mandatory = $true)][string]$Dossier)
$ProgressPreference = 'SilentlyContinue'
$base = 'https://scp-data.tedivm.com/data/scp'
New-Item -ItemType Directory -Force $Dossier, (Join-Path $Dossier 'tales'), (Join-Path $Dossier 'pages') | Out-Null

$fichiers = @{
  'items/index.json'         = 'items_index.json'
  'items/content_index.json' = 'content_index.json'
  'hubs/index.json'          = 'hubs_index.json'
  'tales/index.json'         = 'tales_index.json'
  'tales/content_index.json' = 'tales_content_index.json'
  'goi/index.json'           = 'goi_index.json'
  'goi/content_goi.json'     = 'content_goi.json'
}
foreach ($f in $fichiers.Keys) {
  Invoke-WebRequest -UseBasicParsing -Uri "$base/$f" -OutFile (Join-Path $Dossier $fichiers[$f])
}

# Contenus des SCP, puis des contes (l'index des contes donne des chemins absolus : on garde le nom du fichier)
$contenus = (Get-Content (Join-Path $Dossier 'content_index.json') -Raw | ConvertFrom-Json).PSObject.Properties.Value
foreach ($c in $contenus) {
  Invoke-WebRequest -UseBasicParsing -Uri "$base/items/$c" -OutFile (Join-Path $Dossier $c)
}
$contes = (Get-Content (Join-Path $Dossier 'tales_content_index.json') -Raw | ConvertFrom-Json).PSObject.Properties.Value |
  ForEach-Object { Split-Path $_ -Leaf } | Sort-Object -Unique
foreach ($c in $contes) {
  Invoke-WebRequest -UseBasicParsing -Uri "$base/tales/$c" -OutFile (Join-Path $Dossier "tales\$c")
}

foreach ($p in @('task-forces', 'personnel-and-character-dossier', 'o5-command-dossier', 'groups-of-interest', 'canon-hub')) {
  Invoke-WebRequest -UseBasicParsing -Uri "https://scp-wiki.wikidot.com/$p" -OutFile (Join-Path $Dossier "pages\$p.html")
}
# Liste des tags (départements, entités) et propositions SCP-001, absentes de l'export scp-data
node (Join-Path $PSScriptRoot 'telecharger_pages.mjs') $Dossier
Write-Host "Données SCP téléchargées dans $Dossier"
