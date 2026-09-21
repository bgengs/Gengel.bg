/* World land geometry — the shared ground under the 2D map and the 3D globe.
 *
 * The land outline is the one asset here that can't be generated from noise, so
 * it ships in the repo (`land-110m.json`, 56 KB) rather than being fetched from a
 * CDN. A wall dashboard that loses its map because a CDN blipped is worse than a
 * dashboard 56 KB heavier, and it keeps the page openable from file://.
 *
 * TopoJSON, not GeoJSON, because the shared-arc encoding is roughly a quarter the
 * size and the decoder below is thirty lines. Everything downstream — the dotted
 * 2D map, the 3D globe's point cloud — is built by *rasterising* the polygons once
 * and sampling pixels, never by point-in-polygon testing tens of thousands of
 * candidate dots against 130 arcs.
 */

let _topo = null, _rings = null;
const _rasters = new Map();

export async function load(url = new URL('./land-110m.json', import.meta.url)) {
  if (_topo) return _topo;
  _topo = await (await fetch(url)).json();
  return _topo;
}

/** Decoded land as an array of lon/lat rings: [[[lon,lat], …], …]. */
export function rings(topo = _topo) {
  if (_rings) return _rings;
  const {scale: [sx, sy], translate: [tx, ty]} = topo.transform;
  // Arcs are quantised and delta-encoded — each point is an offset from the last.
  const arc = i => {
    const rev = i < 0, a = topo.arcs[rev ? ~i : i];
    let x = 0, y = 0;
    const pts = a.map(([dx, dy]) => [(x += dx) * sx + tx, (y += dy) * sy + ty]);
    return rev ? pts.reverse() : pts;
  };
  // Rings stitch arcs end to end; the shared endpoint is dropped on every join.
  const ring = idx => idx.reduce((acc, i) => acc.concat(acc.length ? arc(i).slice(1) : arc(i)), []);
  _rings = [];
  for (const g of topo.objects.land.geometries) {
    const polys = g.type === 'Polygon' ? [g.arcs] : g.arcs;
    for (const p of polys) for (const r of p) _rings.push(ring(r));
  }
  return _rings;
}

/** Equirectangular land mask, cached per width. Alpha>0 means land. */
export function raster(w = 1024) {
  if (_rasters.has(w)) return _rasters.get(w);
  const h = w / 2;
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const c = cv.getContext('2d', {willReadFrequently: true});
  c.fillStyle = '#fff';
  c.beginPath();
  for (const r of rings()) {
    r.forEach(([lon, lat], i) => {
      const x = (lon + 180) / 360 * w, y = (90 - lat) / 180 * h;
      i ? c.lineTo(x, y) : c.moveTo(x, y);
    });
    c.closePath();
  }
  c.fill('evenodd');
  const d = c.getImageData(0, 0, w, h).data;
  const hit = (lon, lat) => {
    const x = Math.min(w - 1, Math.max(0, (lon + 180) / 360 * w | 0));
    const y = Math.min(h - 1, Math.max(0, (90 - lat) / 180 * h | 0));
    return d[(y * w + x) * 4 + 3] > 90;
  };
  const out = {w, h, data: d, hit, canvas: cv};
  _rasters.set(w, out);
  return out;
}

/** Land dots on a lat/lon lattice, spaced evenly *in area* rather than in degrees
 *  — a fixed lon step piles dots up at the poles and looks like a mistake. */
export function dots({step = 1.6, latMax = 83} = {}) {
  const r = raster(2048), out = [];
  for (let lat = -latMax; lat <= latMax; lat += step) {
    const ring = Math.max(1, Math.round(360 / (step / Math.cos(lat * Math.PI / 180))));
    for (let i = 0; i < ring; i++) {
      const lon = -180 + i * 360 / ring;
      if (r.hit(lon, lat)) out.push([lon, lat]);
    }
  }
  return out;
}

/** Great-circle interpolation, lifted off the surface by `arc` at the midpoint —
 *  the parabola is what makes a flight path read as a flight path. */
export function greatCircle(a, b, steps = 64, arc = .28) {
  const rad = Math.PI / 180;
  const v = ([lon, lat]) => [Math.cos(lat * rad) * Math.cos(lon * rad),
                             Math.sin(lat * rad),
                             Math.cos(lat * rad) * Math.sin(lon * rad)];
  const p = v(a), q = v(b);
  const dot = Math.max(-1, Math.min(1, p[0] * q[0] + p[1] * q[1] + p[2] * q[2]));
  const om = Math.acos(dot), s = Math.sin(om) || 1e-6;
  return Array.from({length: steps + 1}, (_, i) => {
    const t = i / steps;
    const k0 = Math.sin((1 - t) * om) / s, k1 = Math.sin(t * om) / s;
    const x = p[0] * k0 + q[0] * k1, y = p[1] * k0 + q[1] * k1, z = p[2] * k0 + q[2] * k1;
    const len = Math.hypot(x, y, z) || 1;
    const lift = 1 + Math.sin(t * Math.PI) * arc * Math.sqrt(om / Math.PI);
    return [x / len * lift, y / len * lift, z / len * lift];
  });
}

/** One shared city table: a route naming Shanghai lands in the same place on
 *  the 2D map and the 3D globe. [lon, lat] */
export const CITY = {
  '北京': [116.4, 39.9], '上海': [121.5, 31.2], '深圳': [114.1, 22.5], '广州': [113.3, 23.1],
  '成都': [104.1, 30.7], '西安': [108.9, 34.3], '杭州': [120.2, 30.3], '武汉': [114.3, 30.6],
  '沈阳': [123.4, 41.8], '哈尔滨': [126.6, 45.8], '南京': [118.8, 32.1], '重庆': [106.5, 29.6],
  '天津': [117.2, 39.1], '长沙': [113.0, 28.2], '苏州': [120.6, 31.3], '昆明': [102.7, 25.0],
  '香港': [114.2, 22.3], '新加坡': [103.8, 1.3], '东京': [139.7, 35.7], '首尔': [127.0, 37.6],
  '曼谷': [100.5, 13.8], '孟买': [72.9, 19.1], '迪拜': [55.3, 25.3], '莫斯科': [37.6, 55.8],
  '法兰克福': [8.7, 50.1], '伦敦': [-0.1, 51.5], '巴黎': [2.4, 48.9], '阿姆斯特丹': [4.9, 52.4],
  '纽约': [-74.0, 40.7], '洛杉矶': [-118.2, 34.1], '芝加哥': [-87.6, 41.9], '圣保罗': [-46.6, -23.6],
  '悉尼': [151.2, -33.9], '约翰内斯堡': [28.0, -26.2], '开罗': [31.2, 30.0], '墨西哥城': [-99.1, 19.4],
  // English aliases for the same points — name the same city in English
  // without maintaining a second coordinate table.
  'Shanghai': [121.5, 31.2], 'Shenzhen': [114.1, 22.5], 'Beijing': [116.4, 39.9],
  'Guangzhou': [113.3, 23.1], 'Chengdu': [104.1, 30.7], "Xi'an": [108.9, 34.3],
  'Hangzhou': [120.2, 30.3], 'Wuhan': [114.3, 30.6], 'Shenyang': [123.4, 41.8],
  'Harbin': [126.6, 45.8], 'Nanjing': [118.8, 32.1], 'Chongqing': [106.5, 29.6],
  'Tianjin': [117.2, 39.1], 'Changsha': [113.0, 28.2], 'Suzhou': [120.6, 31.3],
  'Kunming': [102.7, 25.0], 'Rotterdam': [4.5, 51.9],
  'Hong Kong': [114.2, 22.3], 'Singapore': [103.8, 1.3], 'Tokyo': [139.7, 35.7],
  'Seoul': [127.0, 37.6], 'Bangkok': [100.5, 13.8], 'Mumbai': [72.9, 19.1],
  'Dubai': [55.3, 25.3], 'Moscow': [37.6, 55.8], 'Frankfurt': [8.7, 50.1],
  'London': [-0.1, 51.5], 'Paris': [2.4, 48.9], 'Amsterdam': [4.9, 52.4], 'Berlin': [13.4, 52.5],
  'New York': [-74.0, 40.7], 'Los Angeles': [-118.2, 34.1], 'Chicago': [-87.6, 41.9],
  'Toronto': [-79.4, 43.7], 'São Paulo': [-46.6, -23.6], 'Mexico City': [-99.1, 19.4],
  'Sydney': [151.2, -33.9], 'Johannesburg': [28.0, -26.2], 'Cairo': [31.2, 30.0],
};

export default {load, rings, raster, dots, greatCircle, CITY};
