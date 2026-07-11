# Pilot Databank: Static GitHub Pages Edition

This edition runs entirely in the browser.

It does **not** require:

- FastAPI
- Neo4j while the site is running
- Cloudflare Tunnel
- CORS configuration
- a domain name

The included data file contains the supplied Neo4j export with 1,149 Entry
nodes.

## Local test

Install Node.js, open a terminal in this folder, and run:

```powershell
npm install
npm run dev
```

Open the local address printed by Vite.

Do not open `index.html` directly with `file://`, because browsers normally
block JavaScript from fetching the JSON file that way.

## Deploy to GitHub Pages

1. Create a GitHub repository.
2. Copy every file and folder from this package to the repository root.
3. Commit and push to the `main` branch.
4. In the repository, open:

```text
Settings
→ Pages
→ Build and deployment
→ Source
→ GitHub Actions
```

5. Open the Actions tab and wait for the Pages deployment to finish.

The included Vite configuration uses relative asset paths, so it works under
a project URL such as:

```text
https://YOUR_USERNAME.github.io/YOUR_REPOSITORY/
```

## Updating the data

Run this in Neo4j Browser:

```cypher
MATCH (n:Entry)
RETURN n
ORDER BY n.record_type, n.name
```

Download the result as JSON and replace:

```text
public/data/entries.json
```

The app accepts the raw Neo4j Browser wrapper format directly.

You may optionally compact the export:

```powershell
python tools/normalize_neo4j_export.py `
  neo4j_query_table_data.json `
  public/data/entries.json
```

Then commit and push the changed JSON file. GitHub Actions will redeploy the
site automatically.

## Static CLI search

The browser implements the same main filters locally:

```text
type:
record:
record_type:

faction:
fac:

class:
classification:
cls:

threat:
threat_class:
tc:
```

Examples:

```text
type:Unit
type:"Celestial Body"
faction:CROWN
class:FRAME
threat:III
type:Glossary -faction:UNAFFILIATED
cerebrax -"Class III"
```

Multiple values in one category are OR conditions:

```text
faction:CROWN faction:CINDRAL
```

Different categories are combined:

```text
type:Unit faction:CROWN class:FRAME
```

Autocomplete values are generated from `entries.json`.

## Images

The former `/api/raster-image` endpoint cannot exist on GitHub Pages.
`image_url` values are therefore loaded directly by the browser.

Use HTTPS image URLs. An HTTP image URL may be blocked as mixed content on
the HTTPS GitHub Pages site.

## Custom font

No font file is included. The site uses Courier New by default. To restore a
custom licensed font:

1. Put the font under `public/fonts/`.
2. Add an `@font-face` rule to `src/styles.css`.
3. Put the custom family name first in the existing `font-family` rules.
