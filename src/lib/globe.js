/* The 3D earth at the centre of a command screen.
 *
 * What separates an earth that looks expensive from one that looks like a blue
 * ball is not polygon count — it is these four, in order of how much they buy:
 *
 *   1. COASTLINES. A dot field alone has no edges, so the eye can't lock onto a
 *      continent. One line pass over the 110m outlines turns a texture into a
 *      map. This is the single biggest upgrade available and it costs one draw
 *      call.
 *   2. A DAY/NIGHT TERMINATOR. A uniformly lit sphere reads as a diagram. Once
 *      there is a lit limb and a dark side scattered with city lights, it reads
 *      as a planet — and the slow sweep gives the screen a clock.
 *   3. A TIGHT LIMB. The Fresnel shell is at 1.035R with a high exponent, not a
 *      1.16R halo. A wide halo is what makes these look like a soap bubble,
 *      and on a light background it reads as fog rather than air.
 *   4. RESTRAINT IN LIGHT MODE. On white, glow is noise. The same geometry
 *      becomes a porcelain globe with ink coastlines — driven entirely by
 *      tokens, so there is one earth, not two.
 *
 * three.js is vendored rather than pulled from a CDN: this is the hero element
 * of a screen meant to stay up on a wall, and a blank centre because a CDN
 * blipped is not an acceptable failure mode.
 */

import * as THREE from 'three';
import * as geo from './geo.js';
import {rgb, tok} from './fx.js';

const RM = matchMedia('(prefers-reduced-motion: reduce)');
const R = 1;
const rad = Math.PI / 180;
const HEAD = 14;    // vertices in a travelling arc head
const TAIL = .16;   // how far behind the head the trail reaches, in curve fraction

/** [lon,lat] → a point on the sphere of radius r. */
const toVec = ([lon, lat], r = R) => new THREE.Vector3(
  r * Math.cos(lat * rad) * Math.cos(lon * rad),
  r * Math.sin(lat * rad),
  -r * Math.cos(lat * rad) * Math.sin(lon * rad),
);

const col = name => new THREE.Color(...rgb(tok(name)).map(v => v / 255));
const num = (name, dflt) => { const v = parseFloat(tok(name)); return Number.isFinite(v) ? v : dflt };

export async function globe(host, {
  routes = [], markers = [], step = 1.5, spin = .03, tilt = .32,
  dayLength = 90, interactive = true, onPick = null,
} = {}) {
  await geo.load();

  const cv = document.createElement('canvas');
  cv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;' +
                     (interactive ? 'cursor:grab' : 'pointer-events:none');
  if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
  host.appendChild(cv);

  const renderer = new THREE.WebGLRenderer({canvas: cv, antialias: true, alpha: true});
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, .1, 100);
  camera.position.set(0, 0, 3.7);

  const world = new THREE.Group();
  world.rotation.x = tilt;
  scene.add(world);

  // The sun lives in world space so it does NOT rotate with the earth — that is
  // the whole point of a terminator: the ground turns underneath a fixed light.
  const sun = new THREE.Vector3(1, .22, .45).normalize();

  /* ── ocean ─────────────────────────────────────────────────────────────
     Lambert term for the terminator plus a Fresnel term for the wet sheen at
     the limb. Two dot products; no texture, and no lights in the scene. */
  const ocean = new THREE.Mesh(
    new THREE.SphereGeometry(R * .995, 96, 64),
    new THREE.ShaderMaterial({
      uniforms: {
        uDeep: {value: col('--globe-deep')}, uSea: {value: col('--globe-sea')},
        uSun: {value: sun}, uNight: {value: num('--globe-night-k', .32)},
      },
      vertexShader: `varying vec3 vN; varying vec3 vV; varying vec3 vW;
        void main(){
          vN = normalize(normalMatrix * normal);
          vW = normalize(mat3(modelMatrix) * normal);
          vec4 mv = modelViewMatrix * vec4(position,1.); vV = normalize(-mv.xyz);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `uniform vec3 uDeep, uSea, uSun; uniform float uNight;
        varying vec3 vN; varying vec3 vV; varying vec3 vW;
        void main(){
          // Soft terminator: a hard step looks like a broken shader, a wide
          // smoothstep looks like atmosphere scattering the edge of daylight.
          float day = smoothstep(-0.18, 0.32, dot(vW, uSun));
          float fres = pow(1.0 - max(dot(vN, vV), 0.0), 2.6);
          vec3 c = mix(uDeep * uNight, mix(uDeep, uSea, 0.55), day);
          c += uSea * fres * (0.25 + day * 0.5);
          gl_FragColor = vec4(c, 1.0);
        }`,
    }));
  world.add(ocean);

  /* ── atmosphere ────────────────────────────────────────────────────────
     Back-faced shell at 1.035R: seen from inside, the Fresnel term peaks exactly
     at the silhouette. Brightest where the sun grazes the limb, which is where a
     real atmosphere lights up. --globe-air-a lets a light theme turn it off. */
  const air = new THREE.Mesh(
    new THREE.SphereGeometry(R * 1.035, 64, 44),
    new THREE.ShaderMaterial({
      uniforms: {uCol: {value: col('--globe-air')}, uSun: {value: sun},
                 uA: {value: num('--globe-air-a', .9)}},
      vertexShader: `varying vec3 vN; varying vec3 vV; varying vec3 vW;
        void main(){
          vN = normalize(normalMatrix * normal);
          vW = normalize(mat3(modelMatrix) * normal);
          vec4 mv = modelViewMatrix * vec4(position,1.); vV = normalize(-mv.xyz);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `uniform vec3 uCol; uniform vec3 uSun; uniform float uA;
        varying vec3 vN; varying vec3 vV; varying vec3 vW;
        void main(){
          float rim = pow(max(1.0 - abs(dot(vN, vV)), 0.0), 5.5);
          float lit = smoothstep(-0.55, 0.45, dot(vW, uSun));
          gl_FragColor = vec4(uCol, rim * (0.22 + lit * 0.78) * uA);
        }`,
      side: THREE.BackSide, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
    }));
  world.add(air);

  /* ── land ──────────────────────────────────────────────────────────────
     ~14k points, one draw call. Each carries a stable pseudo-random weight so
     only about a third light up at night: a uniformly amber night side reads as
     a colour fill, a scattered one reads as cities. */
  const pts = geo.dots({step});
  const pos = new Float32Array(pts.length * 3);
  const cityW = new Float32Array(pts.length);
  pts.forEach((p, i) => {
    toVec(p, R * 1.002).toArray(pos, i * 3);
    const h = Math.abs(Math.sin(p[0] * 12.9898 + p[1] * 78.233) * 43758.5453) % 1;
    // Weighted by latitude: the inhabited band lights up, the tundra mostly doesn't.
    cityW[i] = h < .34 * (1 - Math.min(1, Math.abs(p[1]) / 72) * .75) ? 1 : 0;
  });
  const landGeo = new THREE.BufferGeometry();
  landGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  landGeo.setAttribute('aCity', new THREE.BufferAttribute(cityW, 1));
  const landMat = new THREE.ShaderMaterial({
    uniforms: {
      uDay: {value: col('--globe-land')}, uDark: {value: col('--globe-landnight')},
      uCity: {value: col('--globe-city')}, uSun: {value: sun},
      uSize: {value: 2.4 * Math.min(devicePixelRatio || 1, 2)},
    },
    vertexShader: `uniform float uSize; uniform vec3 uSun;
      attribute float aCity;
      varying float vFace; varying float vDay; varying float vCity;
      void main(){
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        // Dots on the far side sit behind the ocean sphere; fading rather than
        // clipping keeps the silhouette soft instead of a hard cut.
        vFace = smoothstep(-0.12, 0.5, normalize(mat3(modelViewMatrix) * position).z);
        vDay  = smoothstep(-0.14, 0.3, dot(normalize(mat3(modelMatrix) * position), uSun));
        vCity = aCity;
        gl_PointSize = uSize * (2.6 / -mv.z) * (1.0 + aCity * (1.0 - vDay) * 0.5);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `uniform vec3 uDay, uDark, uCity;
      varying float vFace; varying float vDay; varying float vCity;
      void main(){
        float d = length(gl_PointCoord - 0.5);
        if (d > 0.5) discard;
        float night = 1.0 - vDay;
        vec3 c = mix(uDark, uDay, vDay);
        float glow = vCity * night;
        c = mix(c, uCity, glow * 0.9);
        float a = (1.0 - d * 1.25) * vFace * (0.55 + vDay * 0.45 + glow * 0.6);
        gl_FragColor = vec4(c, a);
      }`,
    transparent: true, depthWrite: false,
  });
  world.add(new THREE.Points(landGeo, landMat));

  /* ── coastlines ────────────────────────────────────────────────────────
     The definition pass. Rings arrive as lon/lat polylines and are emitted as
     segment pairs, so the whole world is one LineSegments object. */
  const coast = (() => {
    const v = [];
    for (const ring of geo.rings()) {
      for (let i = 1; i < ring.length; i++) {
        // Rings wrap the antimeridian; a segment jumping 170°+ of longitude is a
        // seam artefact, not a coast, and would draw a line across the planet.
        if (Math.abs(ring[i][0] - ring[i - 1][0]) > 170) continue;
        const a = toVec(ring[i - 1], R * 1.006), b = toVec(ring[i], R * 1.006);
        v.push(a.x, a.y, a.z, b.x, b.y, b.z);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(v), 3));
    return new THREE.LineSegments(g, new THREE.ShaderMaterial({
      uniforms: {uCol: {value: col('--globe-coast')}, uSun: {value: sun},
                 uA: {value: num('--globe-coast-a', .85)}},
      vertexShader: `uniform vec3 uSun; varying float vFace; varying float vDay;
        void main(){
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vFace = smoothstep(-0.05, 0.42, normalize(mat3(modelViewMatrix) * position).z);
          vDay  = smoothstep(-0.2, 0.35, dot(normalize(mat3(modelMatrix) * position), uSun));
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `uniform vec3 uCol; uniform float uA; varying float vFace; varying float vDay;
        void main(){ gl_FragColor = vec4(uCol, vFace * (0.3 + vDay * 0.7) * uA); }`,
      transparent: true, depthWrite: false,
    }));
  })();
  world.add(coast);

  /* ── graticule ─────────────────────────────────────────────────────────
     Every 30°, very faint. Enough to say "globe", not enough to read as a cage. */
  const grat = new THREE.LineSegments(
    (() => {
      const v = [];
      const push = (a, b) => { v.push(a.x, a.y, a.z, b.x, b.y, b.z) };
      for (let lat = -60; lat <= 60; lat += 30)
        for (let i = 0; i < 120; i++)
          push(toVec([i * 3 - 180, lat], R * 1.003), toVec([(i + 1) * 3 - 180, lat], R * 1.003));
      for (let lon = -180; lon < 180; lon += 30)
        for (let i = 0; i < 60; i++)
          push(toVec([lon, i * 3 - 90], R * 1.003), toVec([lon, (i + 1) * 3 - 90], R * 1.003));
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(v), 3));
      return g;
    })(),
    new THREE.LineBasicMaterial({color: col('--globe-grid'), transparent: true,
                                 opacity: num('--globe-grid-a', .12), depthWrite: false}));
  world.add(grat);

  /* ── orbit ring ────────────────────────────────────────────────────────
     Sits OUTSIDE the world group, so it holds its own inclination while the
     earth turns under it. Three beads run along it at different rates. */
  const orbit = new THREE.Group();
  orbit.rotation.set(1.16, 0, .34);
  scene.add(orbit);
  {
    const N = 240, v = [];
    for (let i = 0; i <= N; i++) {
      const a = i / N * Math.PI * 2;
      v.push(Math.cos(a) * R * 1.42, 0, Math.sin(a) * R * 1.42);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(v), 3));
    orbit.add(new THREE.Line(g, new THREE.LineBasicMaterial({
      color: col('--accent'), transparent: true,
      opacity: num('--globe-orbit-a', .3), depthWrite: false})));
  }
  const beads = [0, .38, .71].map((phase, i) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(.016, 10, 8),
      new THREE.MeshBasicMaterial({color: col('--accent'), transparent: true, opacity: .95}));
    orbit.add(m);
    return {m, phase, speed: .06 + i * .017};
  });

  /* ── arcs ──────────────────────────────────────────────────────────────
     A dim static line for "this connection exists" plus a bright travelling head
     for "it is carrying something now". Both are needed — a static line reads as
     a diagram, a bare moving dot reads as noise. */
  const arcGroup = new THREE.Group(); world.add(arcGroup);
  const heads = [];
  function buildArcs(list) {
    arcGroup.clear(); heads.length = 0;
    list.forEach((r, i) => {
      const a = geo.CITY[r[0] ?? r.from], b = geo.CITY[r[1] ?? r.to];
      if (!a || !b) return;
      const raw = geo.greatCircle(a, b, 72, .58);
      // greatCircle works in a +Z-east frame; the globe is -Z-east.
      const curve = raw.map(([x, y, z]) => new THREE.Vector3(x, y, -z));
      const c = col(r.level === 'warn' ? '--warn' : '--accent');
      arcGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(curve),
        new THREE.LineBasicMaterial({color: c, transparent: true, opacity: .34, depthWrite: false})));
      // The travelling head is a fixed-length buffer written in place each frame.
      // setFromPoints() reallocates, and in r170 walks the *attribute* count, so
      // a shorter slice would read past the end of the array.
      const hg = new THREE.BufferGeometry();
      hg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(HEAD * 3), 3));
      const head = new THREE.Line(hg, new THREE.LineBasicMaterial({
        color: c, transparent: true, opacity: .95,
        blending: THREE.AdditiveBlending, depthWrite: false}));
      arcGroup.add(head);
      heads.push({head, curve, phase: (i * .173) % 1, speed: .16 + (i % 5) * .012});
    });
  }
  buildArcs(routes);

  /* ── markers ───────────────────────────────────────────────────────────
     Sprites, so they always face the camera. The ring's alpha falls with its
     radius, which is what makes it read as a ping and not a growing circle. */
  const markGroup = new THREE.Group(); world.add(markGroup);
  const sprite = draw => {
    const s = 64, c2 = document.createElement('canvas'); c2.width = c2.height = s;
    draw(c2.getContext('2d'), s);
    return new THREE.CanvasTexture(c2);
  };
  const ringTex = sprite((g, s) => {
    g.strokeStyle = '#fff'; g.lineWidth = 3.5;
    g.beginPath(); g.arc(s / 2, s / 2, s / 2 - 3, 0, 7); g.stroke();
  });
  const dotTex = sprite((g, s) => {
    const rg = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    rg.addColorStop(0, '#fff'); rg.addColorStop(.3, 'rgba(255,255,255,.9)');
    rg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = rg; g.fillRect(0, 0, s, s);
  });
  const pings = [];
  function buildMarkers(list) {
    markGroup.clear(); pings.length = 0;
    list.forEach((m, i) => {
      const p = geo.CITY[m.city]; if (!p) return;
      const v = toVec(p, R * 1.012);
      const c = col(m.level === 'warn' ? '--warn' : '--accent');
      const dot = new THREE.Sprite(new THREE.SpriteMaterial({
        map: dotTex, color: c, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending}));
      dot.position.copy(v); dot.scale.setScalar(.07 + (m.v || 0) / 100 * .05);
      dot.userData = m;
      markGroup.add(dot);
      const ring = new THREE.Sprite(new THREE.SpriteMaterial({
        map: ringTex, color: c, transparent: true, opacity: .7,
        depthWrite: false, blending: THREE.AdditiveBlending}));
      ring.position.copy(v);
      markGroup.add(ring);
      pings.push({ring, phase: (i * .29) % 1, base: .06 + (m.v || 0) / 100 * .06});
    });
  }
  buildMarkers(markers);

  /* ── run loop ──────────────────────────────────────────────────────────── */
  let raf = 0, live = false, t0 = performance.now(), drag = null, vel = 0, seen = true;
  const size = () => {
    const r = host.getBoundingClientRect();
    const w = Math.max(1, r.width), h = Math.max(1, r.height);
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
  };

  function tick(now) {
    raf = requestAnimationFrame(tick);
    const t = (now - t0) / 1000;
    if (!drag) { world.rotation.y += (RM.matches ? 0 : spin) * .016 + vel; vel *= .94 }

    // One full day per `dayLength` seconds — slow enough to be a clock, not a strobe.
    const sa = RM.matches ? .6 : t * (Math.PI * 2 / dayLength);
    sun.set(Math.cos(sa), .22, Math.sin(sa)).normalize();

    heads.forEach(h => {
      const n = h.curve.length, at = (t * h.speed + h.phase) % 1;
      const p = h.head.geometry.attributes.position;
      // Sampled continuously rather than by index, so the head glides instead of
      // stepping between vertices — visible at wall scale.
      for (let j = 0; j < HEAD; j++) {
        const u = Math.max(0, at - j * (TAIL / HEAD)) * (n - 1);
        const k = Math.min(n - 2, u | 0), f = u - k;
        const a = h.curve[k], b = h.curve[k + 1];
        p.setXYZ(j, a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f, a.z + (b.z - a.z) * f);
      }
      p.needsUpdate = true;
      h.head.material.opacity = .95 * Math.min(1, Math.sin(at * Math.PI) * 2.4);
    });

    pings.forEach(p => {
      const ph = (t * .5 + p.phase) % 1;
      p.ring.scale.setScalar(p.base * (1 + ph * 3.2));
      p.ring.material.opacity = (1 - ph) * .55;
    });

    beads.forEach(b => {
      const a = (t * b.speed + b.phase) % 1 * Math.PI * 2;
      b.m.position.set(Math.cos(a) * R * 1.42, 0, Math.sin(a) * R * 1.42);
    });

    renderer.render(scene, camera);
  }

  if (interactive) {
    cv.addEventListener('pointerdown', e => {
      drag = {x: e.clientX, y: e.clientY}; cv.style.cursor = 'grabbing'; cv.setPointerCapture(e.pointerId);
    });
    cv.addEventListener('pointermove', e => {
      if (!drag) return;
      const dx = (e.clientX - drag.x) * .006, dy = (e.clientY - drag.y) * .005;
      world.rotation.y += dx;
      world.rotation.x = Math.max(-1.1, Math.min(1.1, world.rotation.x + dy));
      vel = dx * .35; drag = {x: e.clientX, y: e.clientY};
    });
    const up = () => { drag = null; cv.style.cursor = 'grab' };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    if (onPick) {
      const ray = new THREE.Raycaster(); ray.params.Sprite = {threshold: .05};
      cv.addEventListener('click', e => {
        const r = cv.getBoundingClientRect();
        ray.setFromCamera(new THREE.Vector2((e.clientX - r.left) / r.width * 2 - 1,
                                            -((e.clientY - r.top) / r.height) * 2 + 1), camera);
        const hit = ray.intersectObjects(markGroup.children).find(h => h.object.userData?.city);
        if (hit) onPick(hit.object.userData);
      });
    }
  }

  const ro = new ResizeObserver(size); ro.observe(host);
  const io = new IntersectionObserver(e => { seen = e[0].isIntersecting; seen ? api.start() : api.stop() });
  io.observe(host);
  size();

  const api = {
    el: cv, scene, world, camera, renderer,
    start() { if (!live && seen) { live = true; raf = requestAnimationFrame(tick) } },
    stop() { live = false; cancelAnimationFrame(raf) },
    setRoutes(v) { routes = v; buildArcs(v) },
    setMarkers(v) { markers = v; buildMarkers(v) },
    /** Re-read every token after a theme flip. */
    retheme() {
      ocean.material.uniforms.uDeep.value = col('--globe-deep');
      ocean.material.uniforms.uSea.value = col('--globe-sea');
      ocean.material.uniforms.uNight.value = num('--globe-night-k', .32);
      air.material.uniforms.uCol.value = col('--globe-air');
      air.material.uniforms.uA.value = num('--globe-air-a', .9);
      landMat.uniforms.uDay.value = col('--globe-land');
      landMat.uniforms.uDark.value = col('--globe-landnight');
      landMat.uniforms.uCity.value = col('--globe-city');
      coast.material.uniforms.uCol.value = col('--globe-coast');
      coast.material.uniforms.uA.value = num('--globe-coast-a', .85);
      grat.material.color = col('--globe-grid');
      grat.material.opacity = num('--globe-grid-a', .12);
      orbit.children.forEach(o => { o.material.color = col('--accent') });
      buildArcs(routes); buildMarkers(markers);
    },
    /** Spin a named city round to face the camera. */
    focus(city) {
      const p = geo.CITY[city]; if (!p) return;
      const target = -p[0] * rad - Math.PI / 2;
      const cur = world.rotation.y;
      const delta = ((target - cur + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
      const t1 = performance.now();
      const ease = () => {
        const k = Math.min(1, (performance.now() - t1) / 900);
        world.rotation.y = cur + delta * (1 - (1 - k) ** 3);
        if (k < 1) requestAnimationFrame(ease);
      };
      RM.matches ? (world.rotation.y = target) : ease();
    },
    destroy() { api.stop(); ro.disconnect(); io.disconnect(); renderer.dispose(); cv.remove() },
  };
  addEventListener('kit:theme', () => api.retheme());
  /* Compile shaders on the driver's parallel thread when possible rather than
     blocking the main thread: the first render() compiles every program
     synchronously, the biggest freeze at startup. Drivers without support
     fall back to synchronous compilation on their own. */
  if (renderer.compileAsync) {
    try { await renderer.compileAsync(scene, camera) } catch (e) { /* first frame falls back to sync compilation */ }
  }
  api.start();
  return api;
}

export default globe;
