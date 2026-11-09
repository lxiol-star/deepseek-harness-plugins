/* ============================================================================
 * layout.js — the shared geometry contract for the whole miniature harbour.
 * Owned by the Lead. Read-only for world builders.
 *
 * World conventions
 *   - Units: 1 world unit = 10 real metres.  Base disc radius 15.6 units (~312 m).
 *   - Water surface: y = 0.  Quay deck / land base: y = 1.1.
 *   - +x = east (right), +z = south (towards the default camera), +y = up.
 *   - The island sits inside a circular water basin (r = 14.9); the wooden
 *     plinth rim is at r = 14.9 … 15.6.
 *
 * Every builder must place things on the same terrain: use heightAt(x, z)
 * for anything standing on land.  The island polygon, quay lines, hills and
 * the height function below are the single source of truth.
 * ========================================================================= */
(function () {
  const P = (window.PORT = window.PORT || {});
  const L = (P.layout = {});
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smoothstep = (a, b, x) => {
    const t = clamp((x - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
  };

  /* ---------------------------------------------------------------- constants */
  L.W = {
    unitMeters: 10,
    baseRadius: 15.6,
    waterRadius: 14.9,
    waterY: 0,
    deckY: 1.1,
    baseRimTopY: 0.16,
    baseBottomY: -1.9,
    floorY: -2.02,
    quayZ: -4.4,
    quayLeftX: -9.6,
    quayRightX: 12.6,
    breakwaterWalkY: 0.95,
  };
  const W = L.W;

  /* ------------------------------------------------------------ island shape */
  // Clockwise (seen from above, x right, z down).  This is the coastline.
  L.landOutline = [
    [12.6, -4.4], // right corner of cargo quay
    [12.2, -6.0],
    [10.4, -8.8],
    [7.4, -11.0],
    [3.2, -12.6],
    [-1.6, -12.9],
    [-6.4, -11.9],
    [-9.8, -9.4],
    [-11.6, -6.2],
    [-12.4, -3.0],
    [-12.2, 1.0],
    [-11.3, 3.9],
    [-10.0, 4.6],
    [-9.6, 2.4], // north end of fishing-quay wall
    [-9.6, -4.4], // west corner of cargo quay
  ];
  L.quays = [
    { id: 'cargo', a: [-9.6, -4.4], b: [12.6, -4.4], kind: 'cargo' },
    { id: 'fishing', a: [-9.6, -4.4], b: [-9.6, 2.4], kind: 'fishing' },
  ];

  /* -------------------------------------------------------------- breakwater */
  // Centre line of the protective mole, rooted on the east coast, tip SW of
  // the lighthouse.  Terrain builds the rock body from this line.
  L.breakwater = {
    points: [
      [12.25, -5.85],
      [13.35, -3.4],
      [13.75, -0.9],
      [13.25, 1.85],
      [12.35, 4.05],
      [11.15, 5.95],
      [9.9, 7.25],
    ],
    width: 1.15,
    walkY: 0.95,
    parapetH: 0.28,
  };

  /* --------------------------------------------------------------------- roads */
  // Terrain builds these ribbons (draped with heightAt).  People/vehicles use
  // them for placement; effects may drive along them.
  L.roads = [
    {
      id: 'quay',
      points: [[-9.15, -5.35], [12.35, -5.35]],
      width: 0.62,
      style: 'asphalt',
      markings: 'center',
      level: 'deck',
    },
    {
      id: 'east',
      points: [[11.95, -5.55], [11.95, -9.9], [12.0, -11.55]],
      width: 0.52,
      style: 'asphalt',
      markings: 'edge',
      level: 'deck',
    },
    {
      id: 'back',
      points: [[-8.9, -11.55], [11.95, -11.55]],
      width: 0.56,
      style: 'asphalt',
      markings: 'edge',
      level: 'deck',
    },
    {
      id: 'town-street',
      points: [[-9.85, -3.65], [-10.15, -2.1], [-10.55, -0.45], [-10.95, 1.15], [-11.35, 2.55]],
      width: 0.52,
      style: 'cobble',
      level: 'terrain',
    },
    {
      id: 'town-lane',
      points: [[-10.35, -0.9], [-11.15, -1.25], [-11.65, -2.4]],
      width: 0.4,
      style: 'cobble',
      level: 'terrain',
    },
  ];

  /* ---------------------------------------------------------------------- rail */
  L.rail = {
    track: { id: 'main', z: -10.35, x0: -8.4, x1: 12.15 },
    gauge: 0.26,
    ballastWidth: 0.95,
    level: 1.12,
  };

  /* --------------------------------------------------------------------- hills */
  // Soft mounds added on top of deck level.  The terminal/back strip is kept
  // flat, the old town climbs the western peninsula.
  L.hills = [
    { x: -11.9, z: -3.5, r: 3.5, h: 2.05 },
    { x: -12.1, z: -8.9, r: 2.7, h: 1.15 },
    { x: -10.9, z: 2.2, r: 1.9, h: 0.55 },
    { x: -8.6, z: -13.4, r: 3.2, h: 0.55 },
    { x: 6.8, z: -13.6, r: 3.0, h: 0.4 },
  ];
  L.flatPads = [
    { x0: -9.5, x1: 12.75, z0: -12.98, z1: -4.45, y: W.deckY, feather: 0.18 },
    { x0: -10.65, x1: -9.5, z0: -4.45, z1: 2.65, y: W.deckY, feather: 0.22 },
  ];

  /* --------------------------------------------- point / distance utilities */
  function pointInPoly(x, z, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i][0], zi = poly[i][1];
      const xj = poly[j][0], zj = poly[j][1];
      const intersect = zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi;
      if (intersect) inside = !inside;
    }
    return inside;
  }
  function distToSegment(px, pz, ax, az, bx, bz) {
    const vx = bx - ax, vz = bz - az;
    const wx = px - ax, wz = pz - az;
    const L2 = vx * vx + vz * vz;
    let t = L2 > 0 ? (wx * vx + wz * vz) / L2 : 0;
    t = clamp(t, 0, 1);
    const dx = px - (ax + t * vx), dz = pz - (az + t * vz);
    return Math.sqrt(dx * dx + dz * dz);
  }
  function distToPolyline(px, pz, pts) {
    let best = Infinity;
    for (let i = 0; i < pts.length - 1; i++) {
      const d = distToSegment(px, pz, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]);
      if (d < best) best = d;
    }
    return best;
  }
  L.pointInLand = (x, z) => pointInPoly(x, z, L.landOutline);
  L.distToCoast = (x, z) => {
    let best = Infinity;
    const p = L.landOutline;
    for (let i = 0; i < p.length; i++) {
      const a = p[i], b = p[(i + 1) % p.length];
      const d = distToSegment(x, z, a[0], a[1], b[0], b[1]);
      if (d < best) best = d;
    }
    return best;
  };
  L.distToHarbourWall = (x, z) => {
    let best = Infinity;
    for (const q of L.quays) {
      const d = distToSegment(x, z, q.a[0], q.a[1], q.b[0], q.b[1]);
      if (d < best) best = d;
    }
    return best;
  };

  /* ---------------------------------------------------------- terrain height */
  // heightAt(x, z) — ground surface height on land.  At the coast it drops to
  // a rocky shore; at the harbour quay walls it stays at deck level because
  // the wall itself is vertical.
  function heightAt(x, z) {
    let h = W.deckY;

    for (const hill of L.hills) {
      const d = Math.hypot(x - hill.x, z - hill.z);
      let t = 1 - smoothstep(hill.r * 0.18, hill.r, d);
      h += hill.h * t * t * (3 - 2 * t);
    }

    // Flat working pads (terminal, rail corridor, fishing quay strip).
    for (const pad of L.flatPads) {
      const inside =
        x > pad.x0 - pad.feather && x < pad.x1 + pad.feather &&
        z > pad.z0 - pad.feather && z < pad.z1 + pad.feather;
      if (!inside) continue;
      const fx =
        1 - Math.max(0, Math.max(pad.x0 - x, x - pad.x1)) / pad.feather;
      const fz =
        1 - Math.max(0, Math.max(pad.z0 - z, z - pad.z1)) / pad.feather;
      const m = smoothstep(0, 1, Math.min(fx, fz));
      h = lerp(h, pad.y, m);
    }

    // Coast falloff to a low rocky shore, except along vertical quay walls.
    const dEdge = L.distToCoast(x, z);
    const shore = lerp(0.2, h, smoothstep(0, 1.05, dEdge));
    const dWall = L.distToHarbourWall(x, z);
    const wallMask = 1 - smoothstep(0.55, 0.95, dWall);
    h = lerp(shore, W.deckY, wallMask);

    return Math.max(0.16, h);
  }
  L.heightAt = heightAt;

  // A gentle "the town is old and uneven" wobble for stone plazas.
  L.townGroundAt = (x, z) => heightAt(x, z);

  /* ------------------------------------------------------------ breakwater poly */
  // Build a ribbon polygon around the mole centre line (used for the foam mask).
  L.breakwaterPolygon = (() => {
    const pts = L.breakwater.points;
    const hw = L.breakwater.width / 2;
    const left = [], right = [];
    for (let i = 0; i < pts.length; i++) {
      const prev = pts[Math.max(0, i - 1)], next = pts[Math.min(pts.length - 1, i + 1)];
      let dx = next[0] - prev[0], dz = next[1] - prev[1];
      const len = Math.hypot(dx, dz) || 1;
      dx /= len; dz /= len;
      const nx = -dz, nz = dx;
      left.push([pts[i][0] + nx * hw, pts[i][1] + nz * hw]);
      right.push([pts[i][0] - nx * hw, pts[i][1] - nz * hw]);
    }
    return right.concat(left.reverse());
  })();

  /* --------------------------------------------------------------------- zones */
  // Disjoint write zones for the Agent Team.  Builders stay inside their own
  // zone unless a shared landmark is explicitly assigned.
  L.zones = {
    terrain: {
      note: 'island ground, coasts, quay walls, roads, rail bed, breakwater, lighthouse, pontoon, rocks, retaining walls, stairs',
    },
    terminal: {
      cranes: [-6.4, -2.0, 2.4, 6.8],
      craneZ: -5.35,
      yard: { x0: -8.2, x1: 7.45, z0: -9.75, z1: -6.0 },
      quayApron: { x0: -8.6, x1: 12.5, z0: -6.05, z1: -4.45 },
      support: { x0: 8.15, x1: 11.55, z0: -9.9, z1: -6.1 },
      railYard: { x0: -8.35, x1: 12.1, z0: -11.15, z1: -9.8 },
      note: 'STS cranes, containers, RTGs, straddle carriers, terminal buildings, rail wagons/shunter, fences, floodlights',
    },
    fleet: {
      ship: { cx: 0.6, cz: -2.55, length: 13.6, beam: 2.5 },
      tug: { x: 5.85, z: 4.95, heading: -0.9 },
      sailboat: { x: -4.35, z: 8.9, heading: 2.3 },
      fishingQuay: { x: -9.3, z0: -0.7, z1: 3.0 },
      buoys: [
        { x: -2.4, z: 11.4, kind: 'green' },
        { x: 2.4, z: 12.1, kind: 'red' },
      ],
      note: 'container ship, tug, pilot boat, fishing boats, sailboat, buoys, moorings, fenders on hulls',
    },
    town: {
      peninsula: { x0: -12.5, x1: -9.62, z0: -12.9, z1: 4.55 },
      backRow: { x0: -9.55, x1: 8.0, z0: -12.9, z1: -11.9 },
      note: 'old town on the west hill, fishing village, market, church, back-street houses/warehouses, vehicles, people, trees, props',
    },
    effects: {
      note: 'seagulls, smoke, motes, lighthouse beam, beacon blinks, harbour flag animation — no static architecture',
    },
  };

  /* --------------------------------------------------------------- placements */
  L.placements = {
    lighthouse: { x: 10.05, z: 7.5, baseY: W.breakwaterWalkY },
    peninsulaLight: { x: -10.55, z: 4.35, baseY: 0.95 },
    pontoon: { x0: -9.5, x1: -8.15, z0: 1.35, z1: 2.55 },
    fishingBoats: [
      { x: -8.62, z: -0.15, heading: Math.PI / 2, len: 1.5 },
      { x: -8.68, z: 1.05, heading: Math.PI / 2, len: 1.35 },
      { x: -8.7, z: 2.25, heading: Math.PI / 2, len: 1.2 },
    ],
    channelBuoys: [
      { x: -2.4, z: 11.4, kind: 'green' },
      { x: 2.4, z: 12.1, kind: 'red' },
    ],
    // Approximate anchor points shared across modules (effects attaches smoke,
    // beams and beacons here; owners may refine them in PORT.anchors).
    anchors: {
      shipFunnel: [5.15, 3.05, -2.55],
      tugFunnel: [5.85, 1.15, 4.95],
      locoStack: [0.0, 2.1, -10.35],
      bakeryChimney: [-11.15, 2.6, -6.4],
      lighthouseLamp: [10.05, 2.65, 7.5],
      peninsulaBeacon: [-10.55, 1.45, 4.35],
      flagpoleQuay: [9.5, 2.2, -5.7],
    },
  };

  /* ------------------------------------------------------------------- routes */
  // Closed polylines for slow-moving things; effects/fleet may follow them.
  L.routes = {
    pilotLoop: {
      closed: true,
      points: [
        [-1.2, 5.2], [1.6, 5.4], [3.2, 6.9], [3.0, 9.1],
        [0.8, 10.2], [-1.8, 9.7], [-3.3, 7.7], [-3.0, 5.9],
      ],
      speed: 1.0,
    },
    gullLoops: [
      { cx: 1, cz: 2, r: 7.5, y: 7.2, speed: 0.35, phase: 0.0 },
      { cx: -4, cz: 7, r: 5.2, y: 6.0, speed: 0.28, phase: 2.1 },
      { cx: 6, cz: 5, r: 4.4, y: 8.0, speed: 0.4, phase: 4.0 },
    ],
  };

  /* ---------------------------------------------------------------- helpers */
  L.samplePolyline = function (points, u) {
    // u in [0,1) along the polyline (used by vehicles/boats).
    const n = points.length;
    const segLens = [];
    let total = 0;
    for (let i = 0; i < n - 1; i++) {
      const d = Math.hypot(points[i + 1][0] - points[i][0], points[i + 1][1] - points[i][1]);
      segLens.push(d);
      total += d;
    }
    let target = ((u % 1) + 1) % 1 * total;
    for (let i = 0; i < n - 1; i++) {
      if (target <= segLens[i]) {
        const t = segLens[i] > 0 ? target / segLens[i] : 0;
        return {
          x: lerp(points[i][0], points[i + 1][0], t),
          z: lerp(points[i][1], points[i + 1][1], t),
          angle: Math.atan2(points[i + 1][0] - points[i][0], points[i + 1][1] - points[i][1]),
        };
      }
      target -= segLens[i];
    }
    const last = points[n - 1];
    return { x: last[0], z: last[1], angle: 0 };
  };

  // Palette lives in kit.js (PORT.kit.palette); layout only carries geometry.
})();
