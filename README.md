# Gengel.bg — Bernie's Command Cockpit

A 1920×1080 bigscreen "command cockpit" personal status board: a draggable,
clickable 3D earth (day/night terminator, link arcs from Grand Goave, Haiti
to hosting nodes) flanked by data rails — fleet health drill-down
(GitHub → Live Sites → Planned), fleet mix, a Human Configuration panel,
service links, a scrolling event log, commit-activity trend and build
activity charts. Live clock, connection pill, dark/light theme toggle,
auto-tour when idle.

Built with React 19 + TypeScript + Vite + Tailwind tokens + ECharts + three.js
(procedural globe, no textures).

## Run

```bash
npm install
npm run dev      # dev server
npm run build    # production build to dist/
```

## Fonts

The Geist variable fonts are referenced from `public/fonts/`
(`geist-latin-wght.woff2`, `geist-mono-latin-wght.woff2`). They are binary
assets and were not included in the initial source push — drop the Geist
variable woff2 files into `public/fonts/` (available from the `geist` npm
package or vercel.com/font) or the UI falls back to system fonts.

## Customize

All demo data (apps, nodes, links, alerts, human-config rows, KPIs) lives in
`src/lib/data.js` — swap in real repo names, site URLs and metrics there.
