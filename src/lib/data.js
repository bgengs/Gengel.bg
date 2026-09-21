import * as echarts from 'echarts';

/* The screen's data and chart options: the figures are fixed demo numbers. */
/* Hoisted to the top: the data definitions below read design tokens at module
   evaluation, so declaring this any later would hit the TDZ. */
const css = v => getComputedStyle(document.body).getPropertyValue(v).trim();

/* ── data ─────────────────────────────────────────────────────────────── */
/* Bernie's personal fleet: everything below is placeholder demo data —
   swap in real repo names, site URLs and metrics when they're known. */
let s = 5150921;
const rnd = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
const yi = n => (n / 1e8).toFixed(2);

/* Fleet groups (drill-down level 0): v = health score, q = target (100) */
const REGIONS = [
  {n: 'GitHub', v: 96, q: 100, hub: 'San Francisco'},
  {n: 'Live Sites', v: 98, q: 100, hub: 'New York'},
  {n: 'Planned', v: 22, q: 100, hub: 'Grand Goave'}
];
/* Apps per group (drill-down level 1): each app names the node that hosts it */
const APPS = {
  'GitHub': [
    {n: 'personal-cockpit', hub: 'San Francisco'},
    {n: 'drone-telemetry', hub: 'San Francisco'},
    {n: 'haiti-field-tools', hub: 'Boston'}
  ],
  'Live Sites': [
    {n: 'Bernie HQ (this cockpit)', hub: 'New York'},
    {n: 'Project status page', hub: 'Ashburn'}
  ],
  'Planned': [
    {n: 'Drone Photo Gallery', hub: 'Miami'},
    {n: 'Blog + Private Network', hub: 'Grand Goave'}
  ]
};
const CATS = [
  {n: 'GitHub repos', v: 3}, {n: 'Live sites', v: 2},
  {n: 'In planning', v: 2}, {n: 'This cockpit', v: 1}
];

/* Links: arcs on the earth and the right-rail table are the same data —
   v = round-trip latency in ms, d = 30-day change, warn = degraded/unbuilt */
const ROUTES = [
  {from: 'Grand Goave', to: 'San Francisco', v: 84.2, d: -1.2},
  {from: 'Grand Goave', to: 'New York', v: 52.8, d: +0.4},
  {from: 'Grand Goave', to: 'Ashburn', v: 61.6, d: -0.8},
  {from: 'Grand Goave', to: 'Boston', v: 48.5, d: +2.1},
  {from: 'Grand Goave', to: 'Miami', v: 21.4, d: +8.6, level: 'warn'},
  {from: 'Grand Goave', to: 'London', v: 112.3, d: +0.9},
];

const HUBS = [
  {city: 'Grand Goave', v: 100},          // home base
  {city: 'San Francisco', v: 96},         // GitHub
  {city: 'New York', v: 97}, {city: 'Ashburn', v: 99},
  {city: 'Boston', v: 92}, {city: 'Miami', v: 88},
  {city: 'London', v: 66, level: 'warn'}, // future CDN node
];

/* One echarts instance per host id, so a rescale can resize them all. */
export const charts = {};
const draw = (id, opt) => {
  charts[id] = charts[id] || echarts.init(document.getElementById(id));
  charts[id].setOption(opt, true);
};
/* A function, not a const: the colours come from CSS variables and must be
   re-read on every rebuild, or a theme change leaves the axes on the old palette. */
const AXIS = () => ({
  axisLine: {lineStyle: {color: css('--line')}},
  axisTick: {show: false},
  axisLabel: {color: css('--muted'), fontSize: 14},
  splitLine: {lineStyle: {color: css('--line-soft')}}
});

/* ── alerts (auto-scrolling, no hover needed) ─────────────────────────── */
const ALERTS = [
  ['09:42', 'personal-cockpit deploy succeeded · GitHub Pages', 'b'],
  ['09:31', 'Drone gallery site: placeholder only — DNS not configured yet', 'a'],
  ['09:18', 'Miami backhaul latency +8.6% above baseline this week', 'a'],
  ['08:56', 'haiti-field-tools: 2 new issues opened by contributor', 'b'],
  ['08:44', 'Blog + private network: sign-in deferred to v2 — keep it simple', 'a'],
  ['08:20', 'Human uptime nominal · caffeine dependence: HIGH', 'b'],
  ['07:58', 'drone-telemetry: CI pipeline green, 14 deploys this month', 'b'],
  ['07:31', 'Weekly mission review complete · purpose recalibrated', 'b']
];

/* ── auto tour when idle, paused by any interaction ─────────────────── */
const TOUR = [
  {level: 0, region: null, city: null, hub: 'Grand Goave'},
  {level: 1, region: 'GitHub', city: null, hub: 'San Francisco'},
  {level: 1, region: 'Live Sites', city: null, hub: 'New York'},
  {level: 1, region: 'Planned', city: null, hub: 'Grand Goave'}
];

/* Human Configuration File — excerpt shown on the left rail */
const HUMAN_CFG = [
  ['entity', 'Bernard "Bernie" Gengel', ''],
  ['system_status', 'OPERATIONAL', 'ok'],
  ['base_of_operations', 'Grand Goave, Haiti', ''],
  ['self_concept', 'Builder · Protector · Realist', 'ok'],
  ['moral_framework', 'Service + accountability', 'ok'],
  ['caffeine_dependence', 'HIGH', 'warn'],
  ['sleep_target', '7.5 h (variable)', 'warn'],
  ['burnout_signals', 'Irritability · Silence · Isolation', 'warn'],
  ['firewall_status', 'Enabled (grace exceptions)', 'ok'],
  ['long_term_mission', 'Sustain love through structure', 'ok'],
];

export { css, rnd, yi, REGIONS, APPS, CATS, ROUTES, HUBS, draw, AXIS, ALERTS, TOUR, HUMAN_CFG };
