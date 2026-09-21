import { Fragment, useEffect, useRef, useState } from 'react'
import Kit from './lib/kit.js'
import { constellation } from './lib/fx.js'
import * as geo from './lib/geo.js'
import { ALERTS, APPS, HUBS, HUMAN_CFG, REGIONS, ROUTES, TOUR, charts, draw } from './lib/data.js'
import { renderRest, trendOpt } from './lib/charts.js'

interface Region { n: string; v: number; q: number; hub: string }
interface Route { from: string; to: string; v: number; d: number; level?: string }
interface Earth { focus: (city: string) => void }

// Network nodes not in the shared city table: home base, hosting regions, GitHub.
Object.assign(geo.CITY, {
  'Grand Goave': [-72.77, 18.43],
  'San Francisco': [-122.4, 37.8],
  'Boston': [-71.1, 42.4],
  'Ashburn': [-77.5, 39.0],
  'Miami': [-80.2, 25.8],
})

const KPI = [
  { l: 'Apps monitored', v: '8', u: '', d: +14.3 },
  { l: 'Fleet uptime', v: '99.2', u: '%', d: +0.4 },
  { l: 'Avg latency', v: '58', u: 'ms', d: -6.1, good: 1 },
  { l: 'Deploys · 30 days', v: '14', u: '', d: +27.3 },
  { l: 'Open issues', v: '2', u: '', d: -33.3, good: 1 },
]

export default function App() {
  const [level, setLevel] = useState(0)
  const [curRegion, setCurRegion] = useState<string | null>(null)
  const [curCity, setCurCity] = useState<string | null>(null)
  const [curRoute, setCurRoute] = useState(-1)
  const [pick, setPick] = useState<{ city: string; v: number | null } | null>(null)
  const [rtHint, setRtHint] = useState('Click to locate')
  const [clock, setClock] = useState({ t: '', d: '' })
  const [online, setOnline] = useState(true)
  const [lastOk, setLastOk] = useState(() => Date.now())
  const [tourIdx, setTourIdx] = useState(0)
  const [paused, setPaused] = useState(false)
  const [theme, setTheme] = useState(0)

  const stage = useRef<HTMLDivElement>(null)
  const space = useRef<HTMLDivElement>(null)
  const earthHost = useRef<HTMLDivElement>(null)
  const top = useRef<HTMLDivElement>(null)
  const earth = useRef<Earth | null>(null)
  const idle = useRef(0)

  /* The earth starts a beat late: the first paint (KPIs and charts) comes
     first, and the 3D module's evaluation and scene build (a few hundred ms)
     stays off the critical path. Until the globe is ready, focus() calls from
     drill-down and the tour are guarded and skipped. */
  useEffect(() => {
    constellation(space.current, { count: 90, link: 118, speed: .05, alpha: .5 })
    const t = setTimeout(() => {
      import('./lib/globe.js').then(({ globe }) => globe(earthHost.current, {
        routes: ROUTES.map((r: Route) => ({ from: r.from, to: r.to, level: r.level })),
        markers: HUBS,
        onPick: (m: { city: string; v: number }) => {
          setPick({ city: m.city, v: m.v })
          const i = ROUTES.findIndex((r: Route) => r.from === m.city || r.to === m.city)
          if (i >= 0) setCurRoute(i)
        },
      })).then((g: Earth) => { earth.current = g })
    }, 0)
    return () => clearTimeout(t)
  }, [])

  /* ── proportional scaling: change the scale only, never reflow ────────── */
  useEffect(() => {
    const fit = () => {
      const k = Math.min(innerWidth / 1920, innerHeight / 1080)
      // At this k one axis lands exactly on the design size and the other has slack;
      // the stage takes that slack as extra design units so it covers the viewport.
      // Clamped, because a phone-shaped window would otherwise stretch a 432px rail
      // into a third of a very tall screen — past the clamp we accept a band and
      // centre, which is the honest failure for a screen designed to hang on a wall.
      const W = Math.min(2560, Math.max(1920, innerWidth / k))
      const H = Math.min(1600, Math.max(1080, innerHeight / k))
      const st = stage.current!
      st.style.width = W + 'px'
      st.style.height = H + 'px'
      // Translate first, then scale, both from the top-left: the offset is computed
      // from the *scaled* size, so the stage is always fully inside the viewport.
      st.style.transform =
        `translate(${(innerWidth - W * k) / 2}px, ${(innerHeight - H * k) / 2}px) scale(${k})`
      Object.values(charts).forEach((c) => (c as { resize: () => void }).resize())
    }
    addEventListener('resize', fit); fit()
    /* Theme flip: chart colours are resolved and baked in at setOption time, so a reskin rebuilds the options rather than replaying them. */
    Kit.themeToggle(() => { setTheme(n => n + 1); requestAnimationFrame(fit) }, top.current)
    return () => removeEventListener('resize', fit)
  }, [])

  useEffect(() => { renderRest() }, [theme])
  useEffect(() => { draw('trend', trendOpt(level, curRegion, curCity)) }, [level, curRegion, curCity, theme])

  /* ── clock + disconnect notice ────────────────────────────────────── */
  useEffect(() => {
    const tick = () => {
      const d = new Date()
      setClock({
        t: d.toTimeString().slice(0, 8),
        d: d.toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'long' }),
      })
      // A disconnect never passes stale data off as live: swap the copy and show the last-update time
      setOnline((Date.now() - lastOk) / 1000 <= 12)
    }
    const a = setInterval(tick, 1000); tick()
    const b = setInterval(() => setLastOk(Date.now()), 5000)
    return () => { clearInterval(a); clearInterval(b) }
  }, [lastOk])

  /* ── auto tour when idle, paused by any interaction ─────────────────── */
  useEffect(() => {
    const id = setInterval(() => {
      idle.current++
      if (paused && idle.current > 30) setPaused(false)
      if (paused || idle.current % 12) return
      setTourIdx(i => {
        const next = (i + 1) % TOUR.length, t = TOUR[next]
        setLevel(t.level); setCurRegion(t.region); setCurCity(t.city)
        earth.current?.focus(t.hub)
        return next
      })
    }, 1000)
    const onAct = () => { idle.current = 0; setPaused(true) }
    const evs = ['click', 'keydown', 'wheel'] as const
    evs.forEach(ev => addEventListener(ev, onAct))
    return () => { clearInterval(id); evs.forEach(ev => removeEventListener(ev, onAct)) }
  }, [paused])

  /* ── ranking (the drill-down entry) ────────────────────────────────── */
  const list: { n: string; v: number; q: number; hub: string }[] = level === 0
    ? REGIONS.map((r: Region) => ({ n: r.n, v: r.v, q: r.q, hub: r.hub }))
    : (APPS[curRegion!] as { n: string; hub: string }[]).map((a, i) => {
        const base = REGIONS.find((r: Region) => r.n === curRegion)!.v
        const v = Math.min(100, base * (.55 + ((i * 37) % 17) / 17 * .9))
        return { n: a.n, v, q: 100, hub: a.hub }
      })
  const max = Math.max(...list.map(r => r.v))
  const drill = (n: string, hub: string) => {
    if (level === 0) { setLevel(1); setCurRegion(n); setCurCity(null) }
    else if (level === 1) { setLevel(2); setCurCity(n) }
    // Drilling also turns the earth to that app's host node — both views tell the same story
    if (hub && geo.CITY[hub]) { earth.current?.focus(hub); setPick({ city: hub, v: null }) }
  }

  const crumbs = ['Fleet', ...(curRegion ? [curRegion] : []), ...(curCity ? [curCity] : [])]

  return (
    <div id="stage" ref={stage}>
      <div id="space" ref={space} />

      <div className="top" ref={top}>
        <div className="title">BERNIE // COMMAND COCKPIT<small>PERSONAL APP &amp; SITE STATUS BOARD</small></div>
        <div className="crumb" id="crumb">
          {level > 0 && <button id="back" onClick={() => {
            if (level === 2) { setLevel(1); setCurCity(null) } else { setLevel(0); setCurRegion(null) }
          }}>← Back one level</button>}
          {crumbs.map((p, i) => (
            <Fragment key={p}>
              {i ? <span>›</span> : null}
              <span className={i === crumbs.length - 1 ? 'cur' : ''}>{p}</span>
            </Fragment>
          ))}
        </div>
        <div className="spacer" />
        <div className={'live' + (online ? '' : ' off')} id="live">
          <span className="blip" />
          <span id="liveTxt">
            {online ? 'LIVE' : 'DISCONNECTED · LAST UPDATE ' + new Date(lastOk).toTimeString().slice(0, 5)}</span>
        </div>
        <div className="clock"><span id="clk">{clock.t}</span><small id="dte">{clock.d}</small></div>
      </div>

      <div className="body">
        {/* left rail */}
        <div className="col">
          <div className="card">
            <h2>Fleet health<span className="r" id="rankHint">
              {level === 0 ? 'Click to drill into apps' : 'Click an app for its trend'}</span></h2>
            <div className="rank" id="rank">
              {list.map((r, i) => {
                const pct = r.v / r.q * 100
                return (
                  <div className={'rk ' + ((curCity === r.n || curRegion === r.n) ? 'sel' : '')}
                       data-n={r.n} data-hub={r.hub || ''} key={r.n}
                       onClick={() => drill(r.n, r.hub)}>
                    <div className={'no ' + (i < 3 ? 't3' : '')}>{i + 1}</div>
                    <div className="nm">{r.n}</div>
                    <div className="track"><div className="fill" style={{ width: r.v / max * 100 + '%' }} /></div>
                    <div className="v">{r.v.toFixed(0)}</div>
                    <div className="p" style={{ color: pct >= 95 ? 'var(--c3)' : pct >= 70 ? 'var(--c4)' : 'var(--c5)' }}>
                      {pct.toFixed(0) + '%'}</div>
                  </div>
                )
              })}
            </div>
          </div>
          <div className="card"><h2>Fleet mix</h2><div className="chart" id="mix" /></div>
          <div className="card">
            <h2>Human configuration<span className="r">v2.4 · self-aware</span></h2>
            <div className="cfg">
              {HUMAN_CFG.map(([k, v, lv]: string[]) => (
                <div className="row" key={k}>
                  <span className="k">{k}</span>
                  <span className={'val ' + lv}>{v}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* centre: the 3D earth */}
        <div className="mid">
          <div className="kpibar" id="kpibar">
            {KPI.map(k => {
              const up = k.d >= 0, good = k.good ? !up : up
              return (
                <div className="kpi" key={k.l}>
                  <div className="l">{k.l}</div>
                  <div className="v">{k.v}<u>{k.u}</u></div>
                  <div className={'d ' + (good ? 'up' : 'down')}>
                    {(up ? '▲' : '▼') + ' ' + Math.abs(k.d) + '%'}<span>30d</span></div>
                </div>
              )
            })}
          </div>

          <div className="globe">
            <div id="earth" ref={earthHost} />
            <div className="hud"><i /><i /><i /><i /></div>
            <div className="gtitle"><b>PERSONAL NETWORK MAP</b><small>BASE · HOSTS · LINKS</small></div>
            <div className="readout" id="readout">
              {pick ? <>
                <span>Selected node</span><b>{pick.city}</b><span className="k">{'Node load ' + (pick.v ?? '—')}</span>
              </> : <>
                <span>Nodes</span><b>{HUBS.length}</b><span>· Links</span><b>{ROUTES.length}</b>
                <span className="k">
                  {'Avg latency ' + (ROUTES.reduce((a: number, r: Route) => a + r.v, 0) / ROUTES.length).toFixed(0) + ' ms'}</span>
              </>}
            </div>
            <div className="ghint">Drag to rotate · click a node to inspect</div>
          </div>

          <div className="card">
            <h2>Commit activity &amp; goal<span className="r" id="trendScope">{curCity || curRegion || 'Fleet'}</span></h2>
            <div className="chart" id="trend" />
          </div>
        </div>

        {/* right rail */}
        <div className="col">
          <div className="card">
            <h2>Service links<span className="r" id="rtHint">{rtHint}</span></h2>
            <div className="routes" id="routes">
              {ROUTES.map((r: Route, i: number) => (
                <div className={'rt ' + (i === curRoute ? 'sel' : '')} data-i={i} key={i}
                     onClick={() => {
                       setCurRoute(i); earth.current?.focus(r.from)
                       setPick({ city: r.from, v: null }); setRtHint(`${r.from} → ${r.to}`)
                     }}>
                  <span className="pair">{r.from}<em>→</em>{r.to}</span>
                  <span className="amt" style={{ color: r.level === 'warn' ? 'var(--c4)' : 'var(--ink)' }}>
                    {r.v.toFixed(1) + ' ms'}</span>
                  <span className="dl" style={{ color: r.d >= 0 ? 'var(--c3)' : 'var(--c5)' }}>
                    {(r.d >= 0 ? '+' : '') + r.d + '%'}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="card">
            <h2>Event log<span className="r" id="alCount">
              {ALERTS.filter((a: string[]) => a[2] === 'a').length + ' flagged'}</span></h2>
            <div className="alerts"><div className="lane" id="alerts">
              {ALERTS.concat(ALERTS).map(([t, x, lv]: string[], i: number) => (
                <div className={'al ' + (lv === 'a' ? 'hi' : '')} key={i}>
                  <span className="t">{t}</span>
                  <span className="x">{x}</span>
                  <span className={'lv ' + lv}>{lv === 'a' ? 'HIGH' : 'MED'}</span>
                </div>
              ))}
            </div></div>
          </div>
          <div className="card"><h2>Build activity</h2><div className="chart" id="cash" /></div>
        </div>
      </div>

      <div className="dots" id="dots">
        <span id="tourTxt">{paused ? 'TOUR PAUSED' : 'AUTO TOUR'}</span>
        {TOUR.map((_: unknown, i: number) => <i className={i === tourIdx ? 'on' : ''} key={i} />)}
      </div>
    </div>
  )
}
