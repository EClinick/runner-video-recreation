// Deterministic composition: window.seek(t) renders the frame at time t (seconds).
'use strict';

// ---------- math helpers ----------
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, k) => a + (b - a) * k;
const smooth = (a, b, x) => { const k = clamp((x - a) / (b - a)); return k * k * (3 - 2 * k); };
const ease = {
  lin: k => k,
  inOut: k => k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2,
  out: k => 1 - Math.pow(1 - k, 3),
  out5: k => 1 - Math.pow(1 - k, 5),
  in: k => k * k * k,
  expo: k => k === 1 ? 1 : 1 - Math.pow(2, -10 * k),
};
const ramp = (t, t0, t1, e = ease.inOut) => e(clamp((t - t0) / (t1 - t0)));
// Damped spring from 0 to 1 starting at t0.
function spring(t, t0, freq = 3.2, damp = 0.55) {
  const x = t - t0;
  if (x <= 0) return 0;
  const w = 2 * Math.PI * freq;
  return 1 - Math.exp(-damp * w * x) * Math.cos(w * Math.sqrt(1 - damp * damp) * x);
}
// Monotone cubic (Fritsch-Carlson) track through [[t, v], ...].
function track(pts) {
  const n = pts.length, xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  const d = [], m = new Array(n);
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = m[i + 1] = 0; continue; }
    const a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b;
    if (s > 9) { const tau = 3 / Math.sqrt(s); m[i] = tau * a * d[i]; m[i + 1] = tau * b * d[i]; }
  }
  return t => {
    if (t <= xs[0]) return ys[0];
    if (t >= xs[n - 1]) return ys[n - 1];
    let i = 0; while (t > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i], k = (t - xs[i]) / h, k2 = k * k, k3 = k2 * k;
    return (2 * k3 - 3 * k2 + 1) * ys[i] + (k3 - 2 * k2 + k) * h * m[i] + (-2 * k3 + 3 * k2) * ys[i + 1] + (k3 - k2) * h * m[i + 1];
  };
}
// Several parallel tracks from rows [t, a, b, c].
const tr3k = pts => [1, 2, 3].map(j => track(pts.map(p => [p[0], p[j]])));
const $ = id => document.getElementById(id);
const css = (el, o) => { for (const k in o) el.style[k] = o[k]; };
const tf = (x, y, s = 1, extra = '') => `translate(${x}px,${y}px) scale(${s}) ${extra}`;

// ---------- icons ----------
const S = 'fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"';
const ICON = {
  layers: `<svg viewBox="0 0 24 24" ${S} stroke-width="1.6"><rect x="2.5" y="2.5" width="10" height="10" rx="2.6"/><rect x="7" y="7" width="10" height="10" rx="2.6"/><rect x="11.5" y="11.5" width="10" height="10" rx="2.6"/></svg>`,
  scope: `<svg viewBox="0 0 24 24" ${S} stroke-width="1.8"><path d="M4.5 13.5l1.6 2.8 12.8-7.4-2.5-4.3-12.8 7.4z"/><path d="M15.5 5l3.4-2 2.5 4.3-3.4 2"/><path d="M11 14.5l-3 6.5M12.5 14l3 6.5"/></svg>`,
  link: `<svg viewBox="0 0 24 24" ${S} stroke-width="1.8"><path d="M9.5 14.5l5-5"/><path d="M11 6.5l1.2-1.2a4 4 0 0 1 5.6 5.6L16.5 12"/><path d="M13 17.5l-1.2 1.2a4 4 0 0 1-5.6-5.6L7.5 12"/></svg>`,
  rocket: `<svg viewBox="0 0 24 24" ${S} stroke-width="1.8"><path d="M5 19c.5-2 1.5-3 3-3.5"/><path d="M9 15l-2-2c1.5-5 5.5-9 12-10-1 6.5-5 10.5-10 12z"/><circle cx="14.5" cy="9.5" r="1.6"/><path d="M8.5 11.5L5 11l2.5-3H11"/><path d="M12.5 15.5l.5 3.5 3-2.5V13"/></svg>`,
  image: `<svg viewBox="0 0 24 24" ${S} stroke-width="1.6"><rect x="3.5" y="3.5" width="17" height="17" rx="4.5"/><circle cx="15.5" cy="8.5" r="1.7"/><path d="M3.8 17.5l4.6-5 3.6 3.8 2.4-2.4 6 5.4"/></svg>`,
  phone: `<svg viewBox="0 0 24 24" ${S} stroke-width="1.8"><rect x="6.5" y="2.8" width="11" height="18.4" rx="2.6"/><circle cx="12" cy="17.6" r=".9" fill="currentColor" stroke="none"/></svg>`,
  cal: `<svg viewBox="0 0 24 24"><path d="M6 3h12a3 3 0 0 1 3 3v11l-4 4H6a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3z" fill="#fff"/><path d="M3 9V6a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v3z" fill="#4285F4"/><rect x="3" y="9" width="3.2" height="9" fill="#4285F4"/><rect x="17.8" y="9" width="3.2" height="8" fill="#FBBC04"/><path d="M3 18a3 3 0 0 0 3 3h11v-3.6H3z" fill="#34A853"/><path d="M17 21l4-4h-4z" fill="#EA4335"/><text x="12" y="16.6" font-size="7" font-family="Geist" font-weight="700" text-anchor="middle" fill="#4285F4">31</text></svg>`,
  drive: `<svg viewBox="0 0 24 24"><path d="M8.6 3h6.8l6.4 11.1h-6.8z" fill="#FBBC04"/><path d="M8.6 3L2.2 14.1l3.4 5.9 6.4-11.1z" fill="#0F9D58"/><path d="M5.6 20h12.8l3.4-5.9H9z" fill="#4285F4"/></svg>`,
  gmail: `<svg viewBox="0 0 24 24"><path d="M3 7.2v11.3c0 .8.6 1.5 1.5 1.5H7v-8.7l5 3.7z" fill="#4285F4"/><path d="M21 7.2v11.3c0 .8-.6 1.5-1.5 1.5H17v-8.7l-5 3.7z" fill="#34A853"/><path d="M17 5.6v5.7l4-3V6.6c0-1.8-2-2.8-3.4-1.7z" fill="#FBBC04"/><path d="M7 11.3V5.6L12 9.3l5-3.7v5.7l-5 3.7z" fill="#EA4335"/><path d="M3 6.6v1.7l4 3V5.6l-.6-.4C5 4.1 3 5 3 6.6z" fill="#C5221F"/></svg>`,
  chev: `<svg viewBox="0 0 24 24" ${S} stroke-width="2.2"><path d="M7 10l5 5 5-5"/></svg>`,
  chevR: `<svg viewBox="0 0 24 24" ${S} stroke-width="2.2"><path d="M10 7l5 5-5 5"/></svg>`,
  arrow: `<svg viewBox="0 0 24 24" ${S} stroke-width="2.2"><path d="M5.5 12h13M13 6.5l5.5 5.5-5.5 5.5"/></svg>`,
  card: `<svg viewBox="0 0 24 24" ${S} stroke-width="1.8"><rect x="3.5" y="3.5" width="17" height="17" rx="4"/><circle cx="12" cy="12" r="3.5"/></svg>`,
};
// Runner logo: six spheres on a ring, joined in three pairs.
function logoSVG(id, spin = 0, stops = ['#f4f4f4', '#c9c9c9', '#8d8d8d']) {
  const R = 36, r = 15, pairs = [[240, 180], [300, 0], [60, 120]];
  let body = '';
  for (const [a0, a1] of pairs) {
    const p = a => [50 + R * Math.cos(a * Math.PI / 180), 50 + R * Math.sin(a * Math.PI / 180)];
    const [x0, y0] = p(a0), [x1, y1] = p(a1);
    const mx = (x0 + x1) / 2, my = (y0 + y1) / 2, ang = Math.atan2(y1 - y0, x1 - x0) * 180 / Math.PI, L = Math.hypot(x1 - x0, y1 - y0);
    body += `<g transform="translate(${mx} ${my}) rotate(${ang})"><path d="M${-L / 2} ${-r * .75} Q0 ${-r * .45} ${L / 2} ${-r * .75} L${L / 2} ${r * .75} Q0 ${r * .45} ${-L / 2} ${r * .75}Z" fill="url(#${id})"/></g>`;
    body += `<circle cx="${x0}" cy="${y0}" r="${r}" fill="url(#${id})"/><circle cx="${x1}" cy="${y1}" r="${r}" fill="url(#${id})"/>`;
  }
  return `<svg viewBox="0 0 100 100"><defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${stops[0]}"/><stop offset=".55" stop-color="${stops[1]}"/><stop offset="1" stop-color="${stops[2]}"/></linearGradient></defs><g transform="rotate(${spin} 50 50)">${body}</g></svg>`;
}

// ---------- Scene A: metaballs (WebGL) ----------
const gl = $('gl').getContext('webgl', { premultipliedAlpha: true, preserveDrawingBuffer: true, antialias: false });
const VS = 'attribute vec2 p; void main(){ gl_Position = vec4(p, 0., 1.); }';
const FS = `
precision highp float;
uniform vec2 res;
uniform vec4 balls[8];   // x, y, r, group  (pairs: 0-1, 2-3, 4-5, 6-7)
uniform vec3 ex[8];      // per-ball: emissive, edge blur (px), brightness multiplier
uniform float pk[4];     // smooth-union k inside each pair
uniform float gk;        // smooth-union k between pairs
uniform vec2 blur;       // edge softness per group (px)
uniform vec2 bright;     // diffuse gain per group
uniform vec3 lpos;       // point light (screen px, height px)
uniform float latt;      // light attenuation radius (px)
uniform float lexp;      // 1 = exponential falloff, 0 = inverse square
uniform float emCut;     // emissive drains above this screen y
uniform float dexp;      // diffuse exponent
uniform float rim;       // grazing rim boost
uniform float flatk;
uniform float matte;
uniform float wrap;     // 0 = shaded spheres, 1 = flat colour
uniform vec3 flatc;
uniform float halo;
uniform float flash;
uniform float alpha;
uniform float seed;
uniform vec3 colE;
// Smooth union of everything in group g; also blends centre, radius and emissive so shading stays seamless across necks.
void field(vec2 p, float g, out float d, out vec2 c, out float r, out vec3 e){
  d = 1e5; c = p; r = 100.; e = vec3(0., 2., 1.);
  for (int i = 0; i < 4; i++) {
    vec4 a = balls[2 * i], b = balls[2 * i + 1];
    bool ua = a.z > 0. && abs(a.w - g) < .5, ub = b.z > 0. && abs(b.w - g) < .5;
    if (!ua && !ub) continue;
    float da = ua ? length(p - a.xy) - a.z : 1e5;
    float db = ub ? length(p - b.xy) - b.z : 1e5;
    float k = max(pk[i], 1.);
    float h = clamp(.5 + .5 * (db - da) / k, 0., 1.);
    float dp = mix(db, da, h) - k * h * (1. - h);
    vec2 cp = ua && ub ? mix(b.xy, a.xy, h) : (ua ? a.xy : b.xy);
    float rp = ua && ub ? mix(b.z, a.z, h) : (ua ? a.z : b.z);
    vec3 ep = ua && ub ? mix(ex[2 * i + 1], ex[2 * i], h) : (ua ? ex[2 * i] : ex[2 * i + 1]);
    float kg = max(gk, 1.);
    float hg = d > 1e4 ? 0. : clamp(.5 + .5 * (dp - d) / kg, 0., 1.);
    c = mix(cp, c, hg); r = mix(rp, r, hg); e = d > 1e4 ? ep : mix(ep, e, hg);
    d = d > 1e4 ? dp : mix(dp, d, hg) - kg * hg * (1. - hg);
  }
}
float hash(vec2 q){ return fract(sin(dot(q, vec2(12.9898, 78.233)) + seed) * 43758.5453); }
vec3 ramp3(float v){
  vec3 c0 = vec3(33., 40., 40.) / 255., c1 = vec3(100., 133., 133.) / 255., c2 = vec3(220., 248., 248.) / 255.;
  return v < .4 ? mix(c0, c1, clamp(v / .4, 0., 1.)) : mix(c1, c2, clamp((v - .4) / .6, 0., 1.2));
}
vec4 shade(vec2 p, float g, float bl0, float br){
  float d, r; vec2 c; vec3 e;
  field(p, g, d, c, r, e);
  float bl = max(bl0, e.y);
  vec3 Lv = lpos - vec3(p, 0.);
  float dl = length(Lv.xy);
  float att = lexp > .5 ? exp(-dl / latt) : 1. / (1. + pow(dl / latt, 2.));
  float hl = halo * att * exp(-max(d, 0.) / 35.);
  if (d > bl + 2.) return vec4(vec3(hl), hl);
  float ee = 10., dx0, dx1, dy0, dy1, rr_; vec2 cc_; vec3 xx_;
  field(p + vec2(ee, 0.), g, dx1, cc_, rr_, xx_); field(p - vec2(ee, 0.), g, dx0, cc_, rr_, xx_);
  field(p + vec2(0., ee), g, dy1, cc_, rr_, xx_); field(p - vec2(0., ee), g, dy0, cc_, rr_, xx_);
  vec2 gr = vec2(dx1 - dx0, dy1 - dy0) / (2. * ee);
  float rho = clamp(1. + d / max(r, 1.), 0., .999);
  vec2 nxy = gr * rho;
  vec3 n = normalize(vec3(nxy, sqrt(max(1. - dot(nxy, nxy), 0.))));
  vec3 L = normalize(Lv);
  float dif = pow(clamp((dot(n, L) + wrap) / (1. + wrap), 0., 1.), dexp);
  dif = mix(pow(clamp(L.z, 0., 1.), dexp), dif, matte);
  float graze = pow(clamp(1. - n.z, 0., 1.), 2.) * clamp(dot(normalize(n.xy + 1e-5), normalize(L.xy + 1e-5)), 0., 1.);
  vec3 col = ramp3(clamp(dif * br * e.z * att + graze * rim * att, 0., 1.2));
  col = mix(col, flatc, flatk);
  float em = e.x * smoothstep(emCut + 30., emCut - 30., p.y);
  col = mix(col, colE, clamp(em, 0., 1.));
  col += (hash(p) - .5) * .045;                      // grain lives on the shapes only
  float a = 1. - smoothstep(-bl, bl, d);
  return vec4(col * a + vec3(hl) * (1. - a), a + hl * (1. - a));
}
void main(){
  vec2 p = vec2(gl_FragCoord.x, res.y - gl_FragCoord.y);
  vec4 back = shade(p, 1., blur.y, bright.y);
  vec4 front = shade(p, 0., blur.x, bright.x);
  vec4 col = front + back * (1. - front.a);
  // flash backdrop: cool light plateau top-left falling off toward bottom-right
  float R = clamp(194. - .087 * max(0., p.x + 1.08 * p.y - 1000.), 27., 194.);
  vec3 fl = vec3(R, R + min(20., R * .2), R + min(27., R * .27)) / 255.;
  col.rgb = col.rgb + fl * flash * (1. - col.a);
  col.a = col.a + flash * (1. - col.a);
  gl_FragColor = col * alpha;
}`;
function mkProg() {
  const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
  const p = gl.createProgram();
  gl.attachShader(p, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(p);
  gl.useProgram(p);
  const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(p, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  return p;
}
const prog = mkProg();
const U = n => gl.getUniformLocation(prog, n);
gl.uniform2f(U('res'), 1920, 1080);

// Logo ring layout (screen space). Pair order: top-left, top-right, bottom.
function logoBalls(cx, cy, R, r, rot, group = [0, 0, 1]) {
  const pairs = [[240, 180], [300, 0], [60, 120]], out = [];
  pairs.forEach(([a0, a1], i) => {
    for (const a of [a0, a1]) {
      const ang = (a + rot) * Math.PI / 180;
      out.push([cx + R * Math.cos(ang), cy + R * Math.sin(ang), r, group[i]]);
    }
  });
  return out;
}
// Per-ball tracks: [t, x, y, r] measured from the reference.
const tr3 = pts => { const x = track(pts.map(p => [p[0], p[1]])), y = track(pts.map(p => [p[0], p[2]])), r = track(pts.map(p => [p[0], p[3]])); return t => [x(t), y(t), r(t)]; };
const ballA = tr3([[0, 958, 537, 48], [0.042, 959, 535, 197], [0.083, 962, 535, 253], [0.125, 965, 538, 290], [0.167, 970, 550, 310], [0.208, 971, 555, 327],
  [0.25, 972, 560, 339], [0.292, 971, 555, 352], [0.333, 968, 550, 361], [0.375, 961, 542, 369], [0.417, 966, 544, 368], [0.5, 961, 547, 371], [0.583, 956, 543, 368],
  [0.667, 950, 534, 358], [0.75, 938, 528, 351], [0.833, 919, 518, 339], [0.875, 904, 510, 330], [0.917, 885, 500, 316], [0.958, 862, 481, 293], [1.0, 851, 418, 225],
  [1.042, 840, 395, 196], [1.083, 831, 389, 186], [1.125, 829, 379, 172], [1.25, 836, 332, 112]]);
const ballB = tr3([[0.42, 930, 560, 300], [0.5, 829, 621, 370], [0.583, 430, 925, 370], [0.708, 250, 1015, 350], [0.875, 230, 1060, 350], [0.958, 280, 1000, 300],
  [1.0, 538, 772, 150], [1.083, 605, 650, 150], [1.25, 684, 544, 112]]);
// Emissive sphere -> right pair. Before the split both balls share the track.
const ballE = tr3([[1.042, 1351, 859, 24], [1.083, 1316, 771, 91], [1.125, 1291, 709, 112], [1.167, 1273, 673, 118], [1.208, 1259, 646, 120]]);
// Bottom pair rising in from the frame bottom: centroid, half spacing, radius.
const botP = [[1.0, 590, 1150, 0, 120], [1.042, 686, 1047, 0, 162], [1.083, 800, 1010, 50, 175], [1.125, 862, 933, 115, 120], [1.167, 839, 905, 70, 118], [1.208, 860, 878, 92, 112],
  [1.25, 880, 861, 126, 105], [1.292, 900, 838, 133, 103], [1.333, 920, 821, 135, 103], [1.375, 935, 810, 135, 103], [1.417, 948, 803, 135, 103]];
const [botX, botY, botH] = tr3k(botP), botR = track(botP.map(p => [p[0], p[4]]));
const Z = [960, 540, 0, 0];
const logoR = track([[1.5, 246], [1.667, 236], [1.833, 233], [2.0, 229], [2.167, 219], [2.25, 212], [2.333, 205], [2.417, 190], [2.458, 182], [2.5, 173]]);
const logoCX = track([[1.5, 965], [1.9, 958]]);
const CB = [2.458, 2.5, 2.542, 2.583, 2.625, 2.667, 2.708, 2.77];
const CP = [
  [[974, 375], [982, 394], [1003, 421], [1017, 433], [975, 483], [985, 530], [958, 548], [961, 544]],
  [[838, 428], [950, 404], [1003, 421], [1017, 433], [975, 483], [985, 530], [958, 548], [961, 544]],
  [[1124, 482], [1120, 508], [1104, 535], [1083, 567], [1050, 575], [1010, 600], [958, 548], [961, 544]],
  [[1094, 685], [1060, 700], [1018, 709], [967, 708], [883, 675], [905, 620], [958, 548], [961, 544]],
  [[919, 719], [839, 621], [840, 537], [917, 475], [975, 483], [930, 560], [958, 548], [961, 544]],
  [[783, 611], [795, 574], [840, 537], [917, 475], [975, 483], [930, 560], [958, 548], [961, 544]]];
const CPt = CP.map(b => [0, 1].map(j => track(b.map((q, i) => [CB[i], q[j]]))));
const CR = track([[2.458, 84], [2.625, 84], [2.667, 80], [2.708, 68], [2.75, 60], [2.77, 56]]);
// merged partners shrink away so coincident balls don't inflate the union
const CRk = [() => 1, t => 1 - ramp(t, 2.5, 2.542), () => 1, t => 1 - ramp(t, 2.667, 2.708), t => 1 - ramp(t, 2.583, 2.625), t => 1 - ramp(t, 2.5, 2.542)];
function collapseBalls(t) {
  const r = CR(t);
  return CPt.map(([fx, fy], i) => [fx(t), fy(t), r * CRk[i](t), 0]).concat([Z, Z]);
}
const logoRot = track([[2.27, 0], [2.333, 14], [2.417, 31], [2.458, 41], [2.5, 62]]);
// Collapse: each pair coalesces (staggered), then the three blobs fold into one disc.
const pairSep = [track([[2.42, 1], [2.5, 0]]), track([[2.42, 1], [2.5, 1], [2.56, 0]]), track([[2.42, 1], [2.5, 0]])];
const pairMid = [
  tr3k([[2.5, 963, 400, 0], [2.542, 985, 432, 0], [2.583, 1000, 461, 0], [2.625, 962, 598, 0], [2.667, 948, 548, 0], [2.708, 958, 548, 0], [2.77, 961, 544, 0]]),
  tr3k([[2.5, 1085, 629, 0], [2.542, 1080, 660, 0], [2.583, 1072, 704, 0], [2.625, 1022, 680, 0], [2.667, 968, 585, 0], [2.708, 958, 548, 0], [2.77, 961, 544, 0]]),
  tr3k([[2.5, 826, 620, 0], [2.542, 837, 538, 0], [2.583, 935, 560, 0], [2.625, 905, 515, 0], [2.667, 942, 560, 0], [2.708, 958, 548, 0], [2.77, 961, 544, 0]])];
function ballsAt(t) {
  const em = new Array(8).fill(0), bl = new Array(8).fill(2.2), bm = new Array(8).fill(1);
  let balls;
  if (t < 1.25) {
    const a = ballA(t), b = t < 0.42 ? [a[0], a[1], 0] : ballB(t);
    balls = [[...a, 0], [...b, 0], Z, Z, Z, Z, Z, Z];
    if (t >= 1.03) {
      const e = ballE(t);
      balls[2] = [...e, 0]; balls[3] = [...e, 0]; em[2] = em[3] = 1; bl[2] = bl[3] = 15;
    }
    if (t >= 1.0) {
      // bottom pair rises out of frame bottom, defocused, behind (index 4 = right, 5 = left)
      const bx = botX(t), by = botY(t), bh = botH(t), br = botR(t);
      balls[4] = [bx + bh, by + 8, br, 1]; balls[5] = [bx - bh, by - 8, br, 1];
    }
    // the trailing lobe is dimmer and defocused
    bl[1] = track([[0.5, 4], [0.75, 18], [1.0, 30], [1.15, 12]])(t); bm[1] = track([[0.5, 1], [0.75, .4], [1.0, .35], [1.15, .8]])(t);
  } else if (t < 1.5) {
    // settle from the flash layout into the ring
    const k = ramp(t, 1.25, 1.5, ease.out);
    const from = [[836, 332, 112], [684, 544, 112], [1205, 525, 100], [1265, 650, 100], [990, 880, 118], [750, 880, 118]];
    const lb = logoBalls(965, 552, 246, 0.415 * 246, 0);
    balls = lb.map((b, i) => [lerp(from[i][0], b[0], k), lerp(from[i][1], b[1], k), lerp(from[i][2], b[2], k), b[3]]).concat([Z, Z]);
    // bottom pair keeps its measured flash spacing, then eases into the ring
    const tb = Math.min(t, 1.417), k2 = ramp(t, 1.417, 1.5, ease.out);
    const bp = [[botX(tb) + botH(tb), botY(tb) + 8, botR(tb)], [botX(tb) - botH(tb), botY(tb) - 8, botR(tb)]];
    for (const j of [4, 5]) { const q = bp[j - 4]; balls[j] = [lerp(q[0], lb[j][0], k2), lerp(q[1], lb[j][1], k2), lerp(q[2], lb[j][2], k2), 1]; }
    // the right pair stays emissive while it drains from the bottom up (emCut)
    em[2] = em[3] = 1;
  } else {
    const R = logoR(t), r = t < 2.333 ? 0.415 * R : track([[2.333, 85], [2.5, 94], [2.583, 85], [2.625, 88], [2.667, 85], [2.708, 75], [2.75, 68], [2.77, 64]])(t);
    balls = logoBalls(logoCX(t), 552, R, r, logoRot(t), t > 2.42 ? [0, 0, 0] : [0, 0, 1]).concat([Z, Z]);
    if (t >= 2.458) { balls = collapseBalls(t); }
    else if (t > 2.42) for (let i = 0; i < 3; i++) {
      const a = balls[2 * i], b = balls[2 * i + 1];
      let mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
      if (t > 2.5) { mx = pairMid[i][0](t); my = pairMid[i][1](t); }
      const sp = pairSep[i](t), hx = (a[0] - b[0]) / 2 * sp, hy = (a[1] - b[1]) / 2 * sp;
      balls[2 * i] = [mx + hx, my + hy, r, 0]; balls[2 * i + 1] = [mx - hx, my - hy, sp > .01 ? r : 0, 0];
    }
  }
  return { balls, em, bl, bm };
}
function drawA(t) {
  const vis = t < 2.77;
  $('gl').style.opacity = vis ? 1 : 0;
  if (!vis) return;
  const { balls, em, bl, bm } = ballsAt(t);
  const flat = new Float32Array(32); balls.forEach((b, i) => flat.set(b, i * 4));
  gl.uniform4fv(U('balls'), flat);
  gl.uniform3fv(U('ex'), new Float32Array(em.flatMap((e, i) => [e, bl[i], bm[i]])));
  gl.uniform1f(U('emCut'), track([[1.25, 760], [1.292, 640], [1.333, 460], [1.375, 340], [1.417, 275], [1.44, 200]])(t));
  const join = track([[0.42, 150], [0.6, 300], [0.75, 430], [0.917, 430], [0.958, 380], [1.0, 250], [1.083, 220], [1.167, 130], [1.25, 130], [1.5, 95], [2.333, 95], [2.6, 95], [2.68, 10]])(t);
  gl.uniform1fv(U('pk'), [join, t < 1.25 ? 1 : join, Math.max(join, track([[1.1, 0], [1.15, 230], [1.45, 230], [1.6, 0]])(t)), 0]);
  gl.uniform1f(U('gk'), t < 2.52 ? 0 : 32);
  gl.uniform2f(U('blur'), 2.2, track([[1.0, 18], [1.25, 14], [1.5, 12], [1.6, 8], [1.75, 2.2]])(t));
  const intro = t < 1.15;
  // intro: low-key, light grazing from lower-right; logo: matte, light near top-left with strong falloff
  const flashOn = t >= 1.146 && t < 1.4375;
  // intro: far key light from the lower right; flash: top-down; logo: matte with an exponential falloff from the top-left
  if (intro && !flashOn) { gl.uniform3f(U('lpos'), 7.5e4, 5.3e4, 4.5e4); gl.uniform1f(U('latt'), 1e7); gl.uniform1f(U('lexp'), 0); }
  else if (flashOn) { gl.uniform3f(U('lpos'), 850, 150, 300); gl.uniform1f(U('latt'), 250); gl.uniform1f(U('lexp'), 1); }
  else { gl.uniform3f(U('lpos'), track([[1.44, 880], [1.7, 700]])(t), track([[1.44, 200], [1.7, 300]])(t), 400); gl.uniform1f(U('latt'), 259); gl.uniform1f(U('lexp'), 1); }
  gl.uniform1f(U('dexp'), 1);
  gl.uniform1f(U('rim'), intro ? track([[0.5, 0], [0.7, .9], [0.95, 1.1], [1.05, .4]])(t) : 0);
  const br = intro ? track([[0, 0], [0.125, .05], [0.25, .1], [0.375, .19], [0.5, .24], [0.75, .33], [1.0, .4]])(t) : 1.22;
  gl.uniform2f(U('bright'), br, intro ? br * .5 : br * track([[1.5, .5], [1.75, 1]])(t));
  gl.uniform3f(U('colE'), 222 / 255, 253 / 255, 252 / 255);
  const fc = [[2.5, 60, 71, 72], [2.583, 130, 146, 145], [2.625, 159, 167, 167], [2.667, 181, 186, 187], [2.708, 201, 204, 203]];
  const fk = track([[2.42, 0], [2.5, .85], [2.56, 1]])(t);
  gl.uniform1f(U('flatk'), fk);
  gl.uniform1f(U('matte'), flashOn ? 0 : intro ? 1 : .25);
  gl.uniform1f(U('wrap'), intro && !flashOn ? .6 : 0);
  gl.uniform3f(U('flatc'), ...[1, 2, 3].map(j => track(fc.map(r => [r[0], r[j]]))(t) / 255));
  gl.uniform1f(U('halo'), intro ? .02 : .09);
  gl.uniform1f(U('flash'), flashOn ? 1 : 0);
  gl.uniform1f(U('alpha'), 1);
  gl.uniform1f(U('seed'), Math.floor(t * 24) * 1.37);
  if (flashOn) gl.uniform2f(U('bright'), 1.5, .03);
  gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}

// ---------- Scene B: icon morph (face -> spinning rounded rect -> chat bubble) ----------
// Rounded rect (centre frame) with an optional tail on the bottom edge. Units are px.
function bubblePath(w, h, rx, tail, k) {
  const hw = w / 2, hh = h / 2;
  rx = Math.min(rx, hw, hh);
  const x0 = Math.max(-24 * k, -hw + rx), x1 = Math.max(2 * k, x0), xt = -16 * k, tl = 11 * k * tail;
  let d = `M${x1} ${hh} L${hw - rx} ${hh} A${rx} ${rx} 0 0 0 ${hw} ${hh - rx} L${hw} ${-hh + rx} A${rx} ${rx} 0 0 0 ${hw - rx} ${-hh} L${-hw + rx} ${-hh} A${rx} ${rx} 0 0 0 ${-hw} ${-hh + rx} L${-hw} ${hh - rx} A${rx} ${rx} 0 0 0 ${-hw + rx} ${hh} L${x0} ${hh}`;
  if (tail > 0.02) d += ` L${xt - 2.2 * k} ${hh + tl - 1.2 * k} Q${xt} ${hh + tl + 1.6 * k} ${xt + 2.6 * k} ${hh + tl - 1.6 * k} Z`;
  else d += ' Z';
  return d;
}
const B = {
  W: track([[2.792, 129], [2.833, 179], [2.875, 215], [2.917, 232], [2.958, 243], [3.0, 249], [3.083, 256], [3.125, 252], [3.167, 236], [3.208, 213], [3.25, 193], [3.292, 177]]),
  bubbleW: track([[3.417, 230], [3.458, 266], [3.5, 289], [3.542, 299], [3.583, 295], [3.625, 276], [3.667, 267], [3.708, 264]]),
  rot: track([[3.292, -90], [3.333, -78], [3.375, -32], [3.417, -12], [3.458, -5], [3.5, -2], [3.542, 0]]),
  cx: track([[3.292, 958], [3.333, 970], [3.375, 965], [3.417, 960], [3.5, 958], [3.75, 958], [3.792, 953], [3.833, 942], [3.875, 921]]),
  aspect: () => .935,
  faceRot: track([[3.0, 0], [3.042, -2], [3.083, -5], [3.125, -9.5], [3.167, -16], [3.208, -25], [3.25, -39], [3.292, -63]]),
  rEye: track([[3.48, 1], [3.5, .77], [3.542, .88], [3.583, .9], [3.625, 1]]),
  // eyes: [t, lx, ly, rx, ry, w, h] (screen px)
  eyes: [[2.792, 941, 527, 978, 523, 19, 28], [2.833, 934, 527, 985, 520, 26, 39], [2.875, 929, 535, 990, 518, 31, 46], [2.917, 926, 543, 992, 516, 34, 50], [3.0, 924, 549, 995, 538, 37, 54],
    [3.083, 925, 543, 994, 540, 37, 43], [3.125, 926, 539, 993, 539, 36, 36], [3.25, 929, 537, 989, 537, 28, 28], [3.292, 935, 537, 984, 537, 25, 25], [3.333, 936, 538, 983, 538, 25, 25], [3.375, 934, 538, 985, 538, 25, 25], [3.417, 930, 538, 989, 538, 31, 31],
    [3.5, 922, 539, 994, 539, 40, 62], [3.542, 922, 539, 994, 539, 42, 70], [3.583, 922, 539, 994, 539, 39, 60], [3.625, 922, 539, 994, 539, 37, 51],
    [3.708, 922, 539, 994, 539, 37, 43], [3.75, 922, 539, 994, 539, 37, 37]],
};
B.eyeT = [1, 2, 3, 4, 5, 6].map(j => track(B.eyes.map(e => [e[0], e[j]])));
function drawB(t) {
  const el = $('iconB');
  const vis = t >= 2.77 && t < 3.86;
  el.style.opacity = vis ? 1 : 0;
  if (!vis) return;
  let w, h, rx, rot, tail, k, sw, cy;
  if (t < 3.292) {                       // face squircle, wider than tall
    const W = B.W(t), Hh = W * (t < 3.0 ? .93 : B.aspect(t)); sw = .088 * W; w = W - sw; h = Hh - sw; rx = .46 * Math.min(w, h); rot = t < 3.0 ? 0 : B.faceRot(t); tail = 0; k = W / 87; cy = t < 3.0 ? 541 : track([[3.0, 541], [3.292, 537.5]])(t);
  } else {
    // frame of the final bubble (w = screen width when rot = 0); before 3.375 the tall rect spins into place
    const W = t < 3.417 ? track([[3.292, 189], [3.333, 195], [3.375, 185], [3.417, 230]])(t) : B.bubbleW(t);
    const H = t < 3.417 ? track([[3.292, 183], [3.333, 160], [3.375, 160], [3.417, 230 * .815]])(t) : W * .815;
    sw = .085 * W; w = W - sw; h = H - sw; k = w / 80;
    rx = t < 3.417 ? track([[3.292, 82], [3.333, 50], [3.375, 40], [3.417, .17 * 230]])(t) : .17 * W;
    rot = B.rot(t); tail = track([[3.36, 0], [3.375, .25], [3.4, .1], [3.417, .5], [3.5, 1.66], [3.542, 1.9], [3.583, 1.77], [3.625, 1.3], [3.667, 1.14], [3.75, 1]])(t);
    cy = track([[3.292, 541], [3.5, 553]])(t);
  }
  const cx = B.cx(t);
  const [lx, ly, ex, ey, ew, eh] = B.eyeT.map(f => f(t));
  const dy = 0;
  const eye = (x, y, m = 1) => `<rect x="${x - ew / 2}" y="${y - eh * m / 2 + dy}" width="${ew}" height="${eh * m}" rx="${ew / 2}" fill="currentColor"/>`;
  const dx = cx - 958;
  el.innerHTML = `<svg width="1920" height="1080" viewBox="0 0 1920 1080" style="position:absolute;left:0;top:0">
    <g transform="translate(${cx} ${cy}) rotate(${rot})"><path d="${bubblePath(w, h, rx, tail, k)}" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linejoin="round"/></g>
    <g transform="translate(${dx} 0)">${eye(lx, ly)}${eye(ex, ey, B.rEye(t))}</g></svg>`;
  css(el, { width: '1920px', height: '1080px', color: '#c8caca', transform: 'none',
    filter: 'drop-shadow(0 0 6px rgba(255,255,255,.3)) drop-shadow(0 0 40px rgba(255,255,255,.16))' });
}

// ---------- Scene C: "Ask about anything" ----------
// Chat bubble for the headline: same geometry as the end of scene B. eye = [dx, dy, right-eye scale].
function bubbleSVGc(eye = [0, 0, 1]) {
  const [dx, dy, rs] = eye;
  return `<svg viewBox="0 0 100 100" fill="none" stroke="currentColor"><g transform="translate(50 43)"><path d="${bubblePath(80, 64, 16, 1, 1)}" stroke-width="7.64" stroke-linejoin="round"/></g>
    <circle cx="38" cy="37.5" r="6" fill="currentColor" stroke="none"/><circle cx="${62 + dx}" cy="${37.5 + dy}" r="${6 * rs}" fill="currentColor" stroke="none"/></svg>`;
}
const C = { built: false };
function buildC() {
  const line = $('lineC');
  line.innerHTML = `<span class="w" id="cB"></span><span class="w" id="cW0">Ask</span><span class="w" id="cS0">&nbsp;</span><span class="w" id="cW1">about</span><span class="w" id="cS1">&nbsp;</span><span class="w" id="cW2">anything</span>`;
  // tighter word gaps than the font's space (reference: 65 / 71 px at 190 px caps)
  const sp = $('cS0').getBoundingClientRect().width;
  $('cS0').style.width = `${sp - 19}px`; $('cS1').style.width = `${sp - 13}px`;
  C.offAny = $('cW2').getBoundingClientRect().left - $('cB').getBoundingClientRect().left - 18.6;
  C.built = true;
}
// Screen x of the bubble's outer-left edge, headline scale (1 = 190px caps) and the "A" left edge while "Ask" lands.
const C_bl = track([[3.86, 789], [3.875, 790], [3.917, 748], [4.0, 561], [4.083, 521], [4.167, 517], [4.25, 523], [4.333, 562], [4.417, 754], [4.5, 776], [4.583, 767], [4.667, 743],
  [4.75, 711], [4.833, 671], [4.917, 619], [5.0, 550], [5.083, 457], [5.167, 320], [5.25, 89], [5.333, -282], [5.417, -519], [5.5, -634], [5.583, -698], [5.667, -729],
  [5.75, -667], [5.792, -576], [5.833, -332], [5.875, -78], [5.917, 48], [6.0, 176], [6.083, 242], [6.25, 293], [7.0, 297], [7.167, 294], [7.25, 282], [7.333, 264], [7.375, 258], [7.417, 244], [7.458, 226], [7.5, 203]]);
const C_s = track([[5.667, 1], [5.708, .983], [5.75, .953], [5.792, .889], [5.833, .728], [5.875, .564], [5.917, .485], [5.958, .436], [6.0, .40], [6.083, .359], [6.25, .326], [7.0, .326], [7.167, .322], [7.25, .321], [7.333, .320], [7.375, .315], [7.417, .312], [7.5, .310]]);
const C_A = track([[3.79, 2150], [3.833, 1882], [3.875, 1672], [3.917, 1027], [3.958, 888], [4.0, 825], [4.083, 775], [4.167, 772], [4.25, 823], [4.333, 1001], [4.417, 1068], [4.5, 1084]]);
function drawC(t) {
  const el = $('sceneC');
  const vis = t > 3.81 && t < 7.55;
  el.style.opacity = vis ? 1 : 0;
  if (!vis) return;
  if (!C.built) buildC();
  const s = C_s(t);
  // during the fast zoom-out the left edge of "anything" stays pinned at x≈797
  const wnd = ramp(t, 5.75, 5.792, ease.lin) * (1 - ramp(t, 5.958, 6.0, ease.lin));
  const bl = lerp(C_bl(Math.max(t, 3.86)), 797 - C.offAny * s, wnd);
  css($('lineC'), { transform: `translate(${bl - 18.6 * s}px, ${541 + 13 * s - 132.5}px) scale(${s})`, height: '265px' });
  // bubble: tilts and glances when "Ask" slams into it
  const tilt = track([[3.9, 0], [3.95, -6], [4.2, -6], [4.3, 0]])(t);
  const gl = track([[4.04, 0], [4.083, .12], [4.125, .4], [4.167, .95], [4.208, 1], [4.25, .75], [4.292, 0]])(t);
  $('cB').innerHTML = bubbleSVGc([-8.3 * gl, -5 * gl, 1 - .36 * gl]);
  // "Ask": accelerates in from the right, overlaps the bubble, recoils, settles
  const dxA = t < 4.5 ? C_A(t) - bl - 301 : 0;
  // "about" / "anything": expo-out slides, displacement roughly halving per frame
  const dx1 = 184 * Math.pow(2, -(t - 4.75) / 0.041);
  const dx2 = 387 * Math.pow(0.605, (t - 5.333) / 0.0417);
  const fade = (a, b) => 1 - ramp(t, a, b, ease.lin);
  css($('cB'), { opacity: (t < 3.86 ? 0 : 1) * fade(7.09, 7.40), transform: `translateY(21px) rotate(${tilt}deg)` });
  css($('cW0'), { opacity: (t < 3.81 ? 0 : 1) * fade(7.20, 7.36), transform: `translateX(${dxA}px)` });
  css($('cS0'), { opacity: 1 });
  css($('cW1'), { opacity: (t < 4.71 ? 0 : 1) * fade(7.27, 7.45), transform: `translateX(${dx1}px)` });
  css($('cS1'), { opacity: 1 });
  css($('cW2'), { opacity: (t < 5.30 ? 0 : 1) * fade(7.35, 7.52), transform: `translateX(${dx2}px)` });
}

// ---------- Scene D: suggestion wheel ----------
const ITEMS = [
  ['layers', 'Create an animation'], ['scope', 'Research anything'], ['cal', 'Schedule a meeting'], ['drive', 'Find a file in my Drive'],
  ['gmail', 'Summarize my unread emails'], ['image', 'Create Images'], ['cal', "Check today's calendar"], ['phone', 'Prototype a screen'],
];
const D = { built: false, els: [] };
function buildD() {
  const root = $('sceneD');
  for (const [ic, label] of ITEMS) {
    const el = document.createElement('div'); el.className = 'item';
    el.innerHTML = `<span class="ic">${ICON[ic]}</span><span class="lb">${label}</span>`;
    root.appendChild(el); D.els.push(el);
  }
  D.built = true;
}
const scrollD = track([[5.98, 0.16], [6.083, 0.21], [6.167, 0.30], [6.25, 0.45], [6.333, 0.66], [6.417, 0.97], [6.5, 1.41], [6.583, 2.05], [6.667, 2.97], [6.75, 3.98],
  [6.833, 4.83], [6.917, 5.46], [7.0, 5.93], [7.083, 6.26], [7.167, 6.5], [7.292, 6.75], [7.375, 6.87], [7.5, 6.98]]);
const baseXD = track([[5.98, 1240], [7.083, 1240], [7.167, 1225], [7.25, 1212], [7.292, 1201], [7.333, 1188]]);
const [selX, selY, selS] = tr3k([[7.04, 1325, 0, 1.0], [7.083, 1283, 0, 1.09], [7.125, 1249, 0, 1.08], [7.167, 1227, 0, 1.075], [7.208, 1211, 0, 1.08], [7.25, 1210, 0, 1.105], [7.29, 1205, 580, 1.13], [7.375, 1188, 564, 1.153], [7.458, 1154, 553, 1.175], [7.5, 1128, 550, 1.183], [7.583, 1032, 544, 1.13],
  [7.625, 964, 543, 1.096], [7.667, 870, 543, 1.066], [7.708, 728, 543, .98]]);
const D_T = [5.978, 6.165, 6.331, 6.498, 6.665, 6.831, 6.956, 7.04];
function drawD(t) {
  const root = $('sceneD');
  const vis = t >= 5.98 && t < 7.75;
  root.style.opacity = vis ? 1 : 0;
  if (!vis) return;
  if (!D.built) buildD();
  const c = scrollD(t), bx = baseXD(t);
  const pick = ramp(t, 7.11, 7.27, ease.lin);
  D.els.forEach((el, i) => {
    const o = i - c, ao = Math.abs(o), isSel = i === 7;
    let x = bx, y = 548 + o * 127;
    let sc = ao < 1 ? lerp(1, .78, ao) : .78;
    let grey = ao < 1 ? lerp(250, 150, ao) : lerp(150, 128, Math.min(ao - 1, 1));
    // items enter one at a time, snapping in from the right; a fade line sweeps down the top
    const Ti = D_T[i];
    let op = t >= Ti ? (o < 0 ? clamp(y / 90) : 1) : 0;
    x += t >= Ti ? 125 * Math.exp(-(t - Ti) / 0.045) : 0;
    if (isSel && t >= 7.04) { x = selX(t); sc = selS(t); if (t >= 7.29) y = selY(t); }
    if (!isSel) op *= clamp(.47 + (y - (20 + 780 * (t - 6.75))) / 265);
    let color = `rgb(${grey},${grey},${grey})`, glow = ao < .5 ? '0 0 18px rgba(255,255,255,.18), 0 0 50px rgba(255,255,255,.08)' : 'none';
    if (isSel && pick > 0) {
      color = `rgb(${Math.round(lerp(grey, 50, pick))},${Math.round(lerp(grey, 246, pick))},${Math.round(lerp(grey, 239, pick))})`;
      glow = `0 0 24px rgba(50,246,239,${.4 * pick}), 0 0 50px rgba(50,246,239,${.08 * pick})`;
    }
    css(el, { opacity: op, color, textShadow: glow, transform: `translate(${x}px, ${y - 31}px) scale(${sc})` });
  });
}

// ---------- Scene E: prompt box, typing, zoom, click ----------
const PROMPT = ['Prototype a screen for a premium AI-powered Personal CFO app that helps ', 'users manage their entire financial life'];
const nType = track([[7.708, 18], [7.75, 34], [7.792, 36], [7.833, 39], [7.875, 41], [7.958, 45], [8.0, 47], [8.083, 52], [8.167, 56], [8.292, 63], [8.375, 67], [8.458, 71], [8.542, 76], [8.625, 80], [8.708, 84], [8.792, 89], [8.875, 93], [8.958, 97], [9.042, 102], [9.125, 106], [9.208, 110], [9.25, 112.01]]);
const E = { built: false };
function buildE() {
  $('runnerE').innerHTML = `<span id="lgEw" style="width:40px;height:40px;display:inline-block;position:relative">${logoSVG('lgE')}<span id="lgEt" style="position:absolute;inset:0">${logoSVG('lgEteal', 0, ['#7ff8fa', '#2fefF3', '#1aa9ad'])}</span></span><span id="rnE">Runner</span><span id="chE" style="width:24px;height:24px;display:flex;margin-left:-3px">${ICON.chev.replace('M7 10l5 5 5-5', 'M3 8l9 7 9-7').replace('stroke-width="2.2"', 'stroke-width="2.6"')}</span>`;
  $('send').innerHTML = `<span style="width:38px;height:38px;display:inline-block">${ICON.arrow.replace('stroke-width="2.2"', 'stroke-width="1.6"')}</span>`;
  // flat light-grey arrowhead with a thin bright rim; tip at (50,0)
  $('cursor').innerHTML = `<svg viewBox="0 0 100 120" width="211" height="253"><path d="M50 1.5 L1.5 118.5 L50 102 L98.5 118.5 Z" fill="#dadbdb" stroke="#f8f8f8" stroke-width="1.2" stroke-linejoin="round"/></svg>`;
  E.built = true;
}
const [camEs, camEx, camEy] = tr3k([[7.75, 1.22, 427, -4], [7.792, 1.13, 227, 37], [7.833, 1.08, 125, 59], [7.917, 1.03, 30, 82], [8.0, 1.016, -9, 89], [8.083, 1.008, -21, 92],
  [8.167, 1, -19, 94], [8.333, 1, -16, 73], [8.5, 1, -12, 45], [8.667, 1, -8, 27], [8.75, 1, -6, 16], [9.0, 1, 1, 1]].concat([[9.083, 1.0, 0, -11], [9.167, 1.005, -10, -16], [9.25, 1.012, -28, -23], [9.292, 1.018, -41, -27.5], [9.333, 1.025, -55, -32], [9.5, 1.07, -158, -60], [9.583, 1.116, -255, -91], [9.667, 1.163, -361, -125],
  [9.75, 1.256, -556, -190], [9.833, 1.407, -876, -294], [9.875, 1.523, -1122, -375], [9.917, 1.686, -1468, -488], [9.958, 1.849, -1810, -601], [10.0, 1.942, -2008, -666],
  [10.042, 2.0, -2132, -706], [10.083, 2.047, -2229, -738], [10.125, 2.07, -2285, -756], [10.167, 2.07, -2285, -756], [10.85, 2.05, -2254, -748], [11.2, 2.05, -2254, -748]]
  .map(([t, s, x, y]) => [t, s, x, y + 8 * s])));  // keys were measured with the button at world y 624; it now sits at 616
const cursorPath = tr3k([[9.83, -160, 941, 33], [9.875, 50, 905, 33], [9.917, 419, 850, 33], [9.958, 690, 776, 25], [10.0, 869, 723, 18], [10.042, 985, 667, 13], [10.083, 1063, 634, 10],
  [10.125, 1115, 609, 4], [10.167, 1148, 580, 1], [10.208, 1169, 574, 0], [10.25, 1182, 565, 0], [10.29, 1186, 562, 1], [10.333, 1186, 562, 2], [10.375, 1196, 562, 3], [10.417, 1207, 562, 3],
  [10.458, 1215, 562, 4], [10.5, 1209, 562, 4], [10.542, 1200, 562, 5], [10.583, 1193, 562, 5], [10.625, 1197, 562, 6], [10.667, 1205, 562, 7], [10.708, 1219, 562, 8], [10.75, 1239, 562, 9],
  [10.792, 1267, 562, 10], [10.833, 1304, 562, 12], [10.875, 1353, 560, 14], [10.917, 1418, 556, 17], [10.958, 1504, 542, 20], [11.0, 1621, 510, 24], [11.042, 1784, 437, 27], [11.083, 1930, 400, 30], [11.125, 2080, 330, 32]]);
const cursorIn = track([[9.958, .89], [10.0, .91], [10.042, .93], [10.083, .945], [10.167, .965], [10.25, .99], [10.29, 1]]);
const sxE = (t, s, cx) => t < 10.708 ? 1713 : (track([[10.708, 1221], [10.75, 1221], [10.792, 1226], [10.833, 1237], [10.875, 1256], [10.917, 1284], [10.958, 1325], [11.0, 1386], [11.042, 1480], [11.083, 1638], [11.125, 1925], [11.167, 2200]])(t) - cx) / s;
const panE = track([[10.083, 0], [10.125, 10], [10.167, -2], [10.208, -10], [10.25, -15], [10.333, -19], [10.5, -25], [10.667, -31], [10.708, -33], [11.2, -33]]);
function drawE(t) {
  const root = $('sceneE');
  const vis = t >= 7.75 && t < 11.2;
  root.style.opacity = vis ? 1 : 0;
  if (!vis) { $('sendGlow').style.opacity = 0; $('cursor').style.opacity = 0; return; }
  if (!E.built) buildE();
  const s = camEs(t), cx = camEx(t) + panE(t), cy = camEy(t);
  css($('worldE'), { transform: tf(cx, cy, s) });
  // typing
  const n = Math.floor(nType(t) + 0.1);
  const full = PROMPT[0] + PROMPT[1];
  const typed = full.slice(0, n);
  const l0 = typed.slice(0, PROMPT[0].length), l1 = typed.slice(PROMPT[0].length);
  const caretOn = t < 9.44 && (((t - 8.018) % .3125) + .3125) % .3125 < 0.16;
  const caret = caretOn ? '<span class="caret"></span>' : '';
  $('ptext').innerHTML = l1.length ? `${l0}\n${l1}${t >= 9.29 ? ' ' : ''}${caret}` : `${l0.replace(/ $/, ' ')}${caret}`;
  const g = track([[9.21, 255], [9.583, 219], [9.667, 202], [9.75, 185], [9.833, 166], [9.917, 144], [10.0, 115], [10.083, 97]])(t);
  const lt = ramp(t, 8.10, 8.40, ease.lin);
  const col = t >= 8.40 ? [g, g, g] : [lerp(62, 155, lt), lerp(246, 255, lt), lerp(240, 255, lt)].map(Math.round);
  const white = t >= 8.40 ? 1 : 0;
  const rise = track([[10.833, 0], [10.875, -5], [10.917, -10], [10.958, -18], [11.0, -26], [11.042, -40], [11.083, -63], [11.125, -100], [11.167, -140]])(t);
  css($('ptext'), { left: '150px', top: `${448 - 36 + 6 + rise}px`, color: `rgb(${col})`, opacity: 1 - ramp(t, 11.08, 11.17, ease.lin),
    textShadow: white > .5 ? `0 0 18px rgba(255,255,255,${.25 * (g - 96) / 159}), 0 0 55px rgba(255,255,255,${.14 * (g - 96) / 159})` : '0 0 18px rgba(50,246,239,.4), 0 0 55px rgba(50,246,239,.14)' });
  // box geometry (grows right/down as the button pushes out at the hand-off)
  const bw = track([[7.75, 963], [7.917, 1017], [8.0, 1192], [8.083, 1402], [8.167, 1590], [8.25, 1720], [8.5, 1707], [8.833, 1688], [9.0, 1680], [10.833, 1680], [10.875, 1686], [10.958, 1731], [11.0, 1790], [11.042, 1874], [11.083, 1950]])(t);
  const bb = track([[8.42, 523], [8.5, 555], [8.583, 586], [8.667, 637], [8.75, 671], [8.833, 687], [8.917, 693], [10.833, 693], [11.042, 759], [11.083, 798], [11.125, 857]])(t);
  const bo = 1 - ramp(t, 11.08, 11.17, ease.lin);
  const bwE = t < 10.79 ? bw : Math.max(bw, sxE(t, s, cx) + 84 - 110);
  css($('box'), { left: '115px', top: `${390 + rise}px`, width: (bwE - 5) + 'px', height: (bb - 390 - rise) + 'px', opacity: bo });
  css($('rowE'), { clipPath: `inset(385px ${3000 - 110 - bwE}px ${3000 - bb}px 110px round 30px)` });
  // bottom row
  // bottom row rises from inside the growing box, staggered left to right
  const riseP = track([[8.70, 55], [8.75, 42], [8.792, 30], [8.833, 21], [8.875, 15], [8.917, 11], [9.0, 5], [9.083, 1.5], [9.167, 0]])(t), riseR = track([[8.75, 60], [8.79, 44], [8.83, 27], [8.92, 9], [9.0, 0]])(t);
  const sendIn = track([[8.833, 97 / 87], [8.875, 93 / 87], [8.917, 89 / 87], [8.958, 1]])(t);
  const riseS = track([[8.79, 90], [8.833, 74], [8.875, 38], [8.917, 26], [9.0, 8], [9.083, 0.5], [9.125, 0]])(t);
  const pc = [[8.75, 68, 220, 216], [8.833, 78, 187, 190], [8.917, 88, 155, 160], [9.0, 94, 131, 130], [9.083, 94, 97, 100]];
  css($('plus'), { left: '172px', top: `${616 + riseP}px`, color: `rgb(${[1, 2, 3].map(j => Math.round(track(pc.map(r => [r[0], r[j]]))(t)))})`, opacity: t >= 8.70 ? 1 - ramp(t, 10.6, 10.9) : 0 });
  const sendW = ramp(t, 9.15, 9.42, ease.lin);
  const lc = [[8.917, 49, 236, 236], [9.0, 80, 223, 222], [9.083, 102, 216, 220], [9.167, 149, 202, 212], [9.25, 184, 192, 200], [9.292, 187, 193, 200], [9.6, 200, 200, 202]];
  const lcol = [1, 2, 3].map(j => Math.round(track(lc.map(r => [r[0], r[j]]))(t)));
  $('lgEt').style.opacity = 1 - ramp(t, 8.917, 9.25, ease.lin);
  // label grows about its text centre into the header of the next scene
  const ls = track([[10.83, 1], [10.875, 1.04], [10.917, 1.075], [10.958, 1.13], [11.0, 1.24], [11.042, 1.48], [11.083, 1.67], [11.167, 1.735]])(t);
  css($('runnerE'), { left: '1403px', top: `${616 + riseR}px`, color: `rgb(${lcol})`, transformOrigin: '122.5px 50%', transform: `translateY(-50%) scale(${ls})`,
    opacity: t >= 8.75 && t < 11.125 ? 1 : 0 });
  $('rowE').style.clipPath = t > 10.8 ? 'none' : $('rowE').style.clipPath;
  const ck = ramp(t, 10.85, 11.1);
  css($('chE'), { opacity: 1 - .2 * ck, transform: `rotate(${-45 * ck}deg) scale(${1 - .6 * ck}, ${1 - .8 * ck})` });
  const tealFill = track([[10.333, 0], [10.375, .11], [10.417, .6], [10.458, .8], [10.5, .98], [10.542, 1], [10.583, .75], [10.625, .55], [10.667, .1], [10.708, 0]])(t);
  let sc = [1, 2, 3].map(j => track([[9.1, 170, 252, 253], [9.29, 222, 254, 255], [9.42, 255, 255, 255]].map(r => [r[0], r[j]]))(t));
  sc = sc.map((v, i) => Math.round(lerp(v, [40, 250, 250][i], tealFill)));
  const sx = sxE(t, s, cx);
  const go = track([[9.85, 0], [9.9, 1], [10.583, 1], [10.708, .6], [10.75, .35], [10.79, .15], [10.833, 0]])(t);
  const sweep = track([[9.875, 0], [9.958, 20], [10.0, 50], [10.042, 105], [10.083, 185], [10.125, 245], [10.167, 285], [10.208, 320], [10.25, 380]])(t);
  const press = track([[10.333, 1], [10.375, .84], [10.417, .73], [10.458, .63], [10.5, .72], [10.542, .88], [10.583, 1]])(t);
  css($('send'), { left: `${sx - 43.5}px`, top: `${616 - 43.5 + riseS}px`, background: `rgb(${sc})`, color: `rgb(${[1, 2, 3].map(j => Math.round(lerp(track([[9.0, 72, 157, 156], [9.167, 83, 144, 145], [9.292, 95, 129, 131], [9.6, 118, 118, 118]].map(r => [r[0], r[j]]))(t), [41, 255, 252][j - 1], Math.min(1, tealFill * 1.1))))})`,
    opacity: t >= 8.833 && t < 11.15 ? 1 : 0, transform: `scale(${press * sendIn})`, boxShadow: `0 0 12px rgba(130,255,248,${.9 * go * (sweep >= 375 ? 1 : .3)}), 0 0 ${20 + 40 * tealFill}px rgba(60,255,250,${.6 * tealFill})` });
  // button glow (screen space)
  const mask = sweep >= 375 ? 'none' : `conic-gradient(from 90deg, #000 0deg ${sweep}deg, rgba(0,0,0,.25) ${sweep + 15}deg)`;
  css($('sendGlow'), { opacity: go, transform: tf(sx - 195, 616 - 195), maskImage: mask, webkitMaskImage: mask });
  // cursor (screen space; tip coordinates, rotation about the tip, press squash)
  const [tx0, ty, rot] = cursorPath.map(f => f(t));
  const tx = tx0;
  const cs = 1.03 * cursorIn(t) * (1 - 0.23 * Math.sin(Math.PI * clamp((t - 10.333) / 0.25)));
  const sy = 1;
  css($('cursor'), { opacity: t > 9.83 && t < 11.125 ? 1 : 0, transform: `translate(${tx}px, ${ty}px) rotate(${rot}deg) scale(${cs}, ${cs * sy}) translate(-105.5px, -3px)` });
}

// ---------- Scene F/G: Runner thinking, response, prototype card ----------
const MSG = 'Let me start by reading the interactive skill to ensure I build this correctly.';
const HERE = "Here's a premium AI-powered Personal CFO prototype — Prism.v";
const F = { built: false };
function buildF() {
  $('hdr').innerHTML = `<span id="hdrLogo" style="width:48px;height:48px;display:inline-block"></span><span style="color:#c2c2c2;font-weight:350">Runner</span>`;
  $('think').innerHTML = [...'Thinking...'].map(c => `<span>${c}</span>`).join('');
  $('cardHdr').innerHTML = `<span class="cic"><svg viewBox="0 0 42 41" width="42" height="41"><rect x="1.5" y="1.5" width="39" height="38" rx="10" fill="none" stroke="#5f5f5f" stroke-width="2.4"/><circle cx="21" cy="20.5" r="7.5" fill="none" stroke="#5f5f5f" stroke-width="2.2" stroke-dasharray="3 2.4"/></svg></span>
    <span class="ctl">Prototype</span><span class="pill">HTML</span>`;
  F.built = true;
}
const [camFs, camFx, camFy0] = tr3k([[11.1, 3.03, -323, -186], [11.167, 3.03, -323, -186], [11.333, 2.99, -309, -185], [11.417, 2.94, -292, -185], [11.5, 2.78, -234, -191],
  [11.583, 2.48, -126, -219], [11.667, 2.43, -111, -298], [11.75, 2.41, -112, -306], [11.917, 2.34, -105, -294], [12.0, 2.30, -105, -283], [12.083, 2.23, -98, -264],
  [12.167, 2.14, -93, -245], [12.25, 2.0, -82, -215], [12.333, 1.76, -63, -164], [12.417, 1.39, -33, -85], [12.5, 1.18, -16, -39], [12.583, 1.076, -7, -17], [12.667, 1.028, -4, -7], [12.75, 1, 0, 0]]);
const scrollF = track([[13.29, 0], [13.33, -9], [13.375, -46], [13.417, -159], [13.458, -175], [13.5, -181], [13.54, -183], [14.125, -183], [14.167, -185], [14.208, -194], [14.25, -212],
  [14.292, -250], [14.333, -483], [14.375, -716], [14.417, -754], [14.458, -772], [14.5, -780], [14.54, -782], [14.58, -783]]);
const GW = 1571, GH = 886;
function hash2(a, b, c = 0) { let h = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453; return h - Math.floor(h); }
function drawGrid(t) {
  const cv = $('grid'), ctx = cv.getContext('2d');
  const fr = Math.floor(t * 24);
  // near-black base with a soft teal haze
  ctx.fillStyle = 'rgb(0,3,5)'; ctx.fillRect(0, 0, GW, GH);
  const hz = ctx.createRadialGradient(768, 402, 0, 768, 402, 520);
  hz.addColorStop(0, 'rgba(8,31,31,1)'); hz.addColorStop(.6, 'rgba(4,17,18,.8)'); hz.addColorStop(1, 'rgba(0,2,4,0)');
  ctx.save(); ctx.translate(768, 402); ctx.scale(1, 0.78); ctx.translate(-768, -402); ctx.fillStyle = hz; ctx.fillRect(0, 0, GW, GH / .78); ctx.restore();
  for (let x = 0; x < GW; x += 19.84) if (hash2(x, 7) < .25) { ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(x, 0, 6, GH); }
  const pitch = track([[14.333, 15.6], [14.375, 16.3], [14.417, 17.0], [14.458, 17.75], [14.5, 18.45], [14.54, 19.1], [14.58, 19.85]])(t);
  ctx.font = '300 17.6px Inter'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.shadowColor = 'rgba(70,200,195,.3)'; ctx.shadowBlur = 3;
  ctx.font = `300 ${17.6 * pitch / 19.85}px Inter`;
  const ncol = Math.ceil((GW - 10.5) / pitch);
  for (let r = 0; 4 + r * pitch < GH; r++) for (let c = 0; c < ncol; c++) {
    const gx = 10.5 + c * pitch, gy = 4 + r * pitch + 6, dr = Math.hypot(gx - 1261, gy - 332);
    if (t >= 14.575 && dr > 25 && dr < 50 && hash2(c, r, 9) < .85) continue;   // ring mark: cells omitted
    const ch = hash2(c, r) < .80 ? '0' : '1';
    const dim = (gx > GW - 160 ? .8 : 1) * (hash2(c, r, fr) < .03 ? .4 : 1);
    const v = .9 + .1 * hash2(c, r, 3);
    ctx.fillStyle = `rgb(${Math.round(150 * v * dim)},${Math.round(216 * v * dim)},${Math.round(211 * v * dim)})`;
    ctx.fillText(ch, gx, 4 + r * pitch - 2);
  }
  ctx.shadowBlur = 0;
  const bloom = 1 - ramp(t, 14.333, 14.583, ease.lin);
  ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = `rgb(0,${Math.round(16 * bloom)},${Math.round(15 * bloom)})`; ctx.fillRect(0, 0, GW, GH); ctx.globalCompositeOperation = 'source-over';
  if (t >= 14.575) {
    // phone silhouette and broken ring mark
    ctx.save(); ctx.filter = 'blur(4px)'; ctx.fillStyle = 'rgba(0,0,0,.6)';
    ctx.beginPath(); ctx.roundRect(508, 330, 76, 195, 14); ctx.fill(); ctx.restore();
    ctx.fillStyle = 'rgb(8,16,18)'; ctx.beginPath(); ctx.roundRect(516, 338, 60, 179, 10); ctx.fill();
  }
  // frame: top hairline + corner glints
  ctx.fillStyle = 'rgb(40,48,50)'; ctx.fillRect(6, 0, GW - 12, 1);
  ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.fillRect(GW - 3, 8, 2, 8); ctx.fillRect(GW - 3, GH - 16, 2, 8);
}
// Runner logo with neck and radius controls (for the split -> spinner -> merge loader).
function logoSVG2(id, rot, neck, rs, grow3 = null) {
  const R = 36, pairs = [[240, 180], [300, 0], [60, 120]];
  const r = 15 * rs;
  let body = '';
  const p = a => [50 + R * Math.cos(a * Math.PI / 180), 50 + R * Math.sin(a * Math.PI / 180)];
  for (const [a0, a1] of pairs) {
    const [x0, y0] = p(a0), [x1, y1] = p(a1);
    if (neck > 0.02) {
      const mx = (x0 + x1) / 2, my = (y0 + y1) / 2, ang = Math.atan2(y1 - y0, x1 - x0) * 180 / Math.PI, L = Math.hypot(x1 - x0, y1 - y0);
      const hw = r * .75 * neck, pinch = r * .6 * neck;
      body += `<g transform="translate(${mx} ${my}) rotate(${ang})"><path d="M${-L / 2} ${-hw} Q0 ${-pinch} ${L / 2} ${-hw} L${L / 2} ${hw} Q0 ${pinch} ${-L / 2} ${hw}Z" fill="url(#${id})"/></g>`;
    }
    body += `<circle cx="${x0}" cy="${y0}" r="${r}" fill="url(#${id})"/><circle cx="${x1}" cy="${y1}" r="${r}" fill="url(#${id})"/>`;
  }
  return `<svg viewBox="0 0 100 100"><defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f6f6f6"/><stop offset=".55" stop-color="#d8d8d8"/><stop offset="1" stop-color="#a2a2a2"/></linearGradient></defs><g transform="rotate(${rot} 50 50)">${body}</g></svg>`;
}
// Gooey logo: circles through a blur + alpha-threshold mask, so pairs fuse with fat necks.
function gooLogo(balls, rot) {
  const c = balls.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#fff"/>`).join('');
  return `<svg viewBox="0 0 100 100"><defs><filter id="gf" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="3.6"/><feColorMatrix values="1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 26 -11"/></filter>
    <linearGradient id="gg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e6e6e6"/><stop offset=".55" stop-color="#b8b8b8"/><stop offset="1" stop-color="#7e7e7e"/></linearGradient>
    <mask id="gm" maskUnits="userSpaceOnUse" x="-20" y="-20" width="140" height="140"><g filter="url(#gf)" transform="rotate(${rot} 50 50)">${c}</g></mask></defs>
    <rect x="-20" y="-20" width="140" height="140" fill="url(#gg)" mask="url(#gm)"/></svg>`;
}
// Logo -> three orbiting blobs [11, 8, 5] -> logo. sep: 1 = pairs apart, 0 = coalesced at the pair midpoint.
function loaderSVG(t) {
  const R = 36, pairs = [[240, 180], [300, 0], [60, 120]];
  const P = a => [50 + R * Math.cos(a * Math.PI / 180), 50 + R * Math.sin(a * Math.PI / 180)];
  const split = ramp(t, 11.2, 11.45), back = ramp(t, 11.67, 11.875, ease.out);
  const k = Math.max(0, split - back);                       // 0 = logo, 1 = loader
  const sep = 1 - k, sizes = [14, 9.5, 4];
  const balls = [];
  pairs.forEach(([a0, a1], i) => {
    const [x0, y0] = P(a0), [x1, y1] = P(a1), mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
    const r = lerp(15, sizes[i], k);
    const orbit = k * 9 * Math.sin((t - 11.33) * 9 + i * 2.1);  // blobs drift in and out so they merge and split
    const ox = (mx - 50) / 31 * orbit, oy = (my - 50) / 31 * orbit;
    balls.push([mx + (x0 - mx) * sep + ox, my + (y0 - my) * sep + oy, r], [mx + (x1 - mx) * sep + ox, my + (y1 - my) * sep + oy, r * (1 - .5 * k)]);
    if (k < .98) balls.push([mx + ox, my + oy, 9 * (1 - k)]);   // neck bridge so pairs read as fused dumbbells
  });
  const rot = 400 * ramp(t, 11.2, 11.67, ease.inOut) + lerp(0, 320, back);
  return gooLogo(balls, rot);
}
function drawF(t) {
  const root = $('sceneF');
  const vis = t >= 11.125;
  root.style.opacity = vis ? 1 : 0;
  if (!vis) return;
  if (!F.built) buildF();
  const s = camFs(t), x = camFx(t), y = camFy0(t) + scrollF(t);
  css($('worldF'), { transform: tf(x, y, s) });
  $('hdrLogo').innerHTML = loaderSVG(t);
  css($('hdr'), { left: '237px', top: '235px', transform: 'translateY(-50%)' });
  // "Thinking..." with a sweeping white highlight
  const thVis = t >= 11.58 && t < 12.04;
  const nTh = t < 11.625 ? 7 : 8;
  const nDots = t < 11.70 ? 0 : t < 11.79 ? 1 : t < 11.87 ? 2 : 3;
  const hi = track([[11.58, 4.5], [11.75, 5], [11.83, 6.5], [11.92, 8.5], [12.04, 10]])(t);
  [...$('think').children].forEach((sp, i) => {
    const on = i < nTh || (i >= 8 && i < 8 + nDots);
    const v = Math.round(98 + lerp(157, 95, ramp(t, 11.8, 12.0, ease.lin)) * Math.exp(-Math.pow((i + .5 - hi) / 1.3, 2)));
    css(sp, { opacity: on ? 1 : 0, color: `rgb(${v},${v},${v})` });
  });
  const gap = track([[11.583, 164], [11.625, 137], [11.667, 123], [11.75, 117], [12.0, 115]])(t);
  css($('think'), { left: '247px', top: `${230 + gap}px`, transform: 'translateY(-50%)', opacity: thVis ? 1 : 0, background: 'none', color: 'inherit' });
  // message
  const nm = Math.floor(track([[12.0, 0], [12.042, 8], [12.125, 15], [12.25, 26], [12.375, 38], [12.458, 57], [12.542, 74], [12.667, 78], [12.71, 80]])(t));
  $('msg').textContent = MSG.slice(0, nm);
  css($('msg'), { left: '230px', top: '346px', transform: 'translateY(-50%)' });
  const steps = [[12.417, 'Compl'], [12.458, 'Comple'], [12.5, 'Complet'], [12.542, 'Complete'], [12.583, 'Completed'], [12.73, 'Completed 1'], [12.79, 'Completed 1 st'], [12.875, 'Completed 1 ste'], [12.96, 'Completed 1 steps'], [13.125, 'Completed 2 steps']];
  let txt = ''; for (const [st, v] of steps) if (t >= st) txt = v;
  $('done').innerHTML = txt + (t >= 13.04 ? '<span class="chv"><svg viewBox="0 0 15 20" width="15" height="20"><path d="M3.5 2.5L11.5 10l-8 7.5" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg></span>' : '');
  const ddx = t < 12.417 ? 0 : 83 * Math.pow(2, -(t - 12.417) / 0.066), ddy = 6.5 * (1 - ramp(t, 12.71, 12.83));
  css($('done'), { left: '230px', top: '478px', transform: `translate(${ddx}px, ${ddy}px) translateY(-50%)` });
  // "Here's ..." pops in with 27 characters, then types on
  const nh = Math.floor(track([[13.458, 27], [13.5, 29], [13.54, 31], [13.58, 34], [13.67, 38], [13.75, 43], [13.83, 47], [13.92, 52], [14.0, 58], [14.04, 60]])(t));
  $('here').textContent = t < 13.458 ? '' : HERE.slice(0, nh);
  const hp = lerp(.955, 1, ramp(t, 13.458, 13.56, ease.out));
  css($('here'), { left: '232px', top: '651px', transformOrigin: '300px 50%', transform: `translateY(-50%) scale(${hp})` });
  // prototype card pops in
  css($('card'), { left: '232px', top: '848px', opacity: t >= 14.31 ? 1 : 0 });
  if (t >= 14.31) drawGrid(t);
}

// ---------- main ----------
window.seek = function (t) {
  drawA(t); drawB(t); drawC(t); drawD(t); drawE(t); drawF(t);
  return new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
};
window.ready = Promise.all(['400 40px Geist', '300 40px Geist', '400 40px Figtree', '400 34px "Open Sans"', '300 18px Inter'].map(f => document.fonts.load(f))).then(() => document.fonts.ready);
