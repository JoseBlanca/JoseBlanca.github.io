// ==========================================================================
// Solar System Simulation
// Newtonian gravity in SI units. Velocity-Verlet integrator with substepping.
// All physics is in real units (m, kg, s); the camera maps meters to pixels.
// ==========================================================================

const G = 6.674e-11;
const AU = 1.495978707e11;
const DAY = 86400;
const YEAR = 365.25 * DAY;
const SOLAR_MASS = 1.98892e30;

// --- Initial body data --------------------------------------------------
// Distances are semi-major axes (assume circular orbit for initial conditions:
// v_circ = sqrt(G * M_sun / r)). Display sizes are not to scale (for visibility).

const PLANET_DATA = [
  { name: "Sun",     mass: SOLAR_MASS,  a: 0,        color: "#ffd84a", glow: "#ffaa1c", radius: 16, isStar: true },
  { name: "Mercury", mass: 3.3011e23,   a: 0.387 * AU, color: "#a89c8c", radius: 3 },
  { name: "Venus",   mass: 4.8675e24,   a: 0.723 * AU, color: "#e8c98a", radius: 4 },
  { name: "Earth",   mass: 5.97237e24,  a: 1.000 * AU, color: "#5aa9ff", radius: 4.5 },
  { name: "Mars",    mass: 6.4171e23,   a: 1.524 * AU, color: "#d96a4f", radius: 3.5 },
  { name: "Jupiter", mass: 1.8982e27,   a: 5.203 * AU, color: "#d6a973", radius: 10 },
  { name: "Saturn",  mass: 5.6834e26,   a: 9.537 * AU, color: "#e8d59a", radius: 9, ring: true },
  { name: "Uranus",  mass: 8.6810e25,   a: 19.191 * AU, color: "#9ee0e6", radius: 7 },
  { name: "Neptune", mass: 1.02413e26,  a: 30.069 * AU, color: "#5b8ef0", radius: 7 },
];

class Body {
  constructor(d, angle = 0) {
    this.name = d.name;
    this.mass = d.mass;
    this.color = d.color;
    this.glow = d.glow || null;
    this.displayRadius = d.radius;
    this.isStar = !!d.isStar;
    this.hasRing = !!d.ring;
    this.orbitRadius = d.a;

    this.x = d.a * Math.cos(angle);
    this.y = d.a * Math.sin(angle);

    // Circular orbital velocity around the Sun (set tangentially, counterclockwise).
    if (d.a > 0) {
      const v = Math.sqrt(G * SOLAR_MASS / d.a);
      this.vx = -v * Math.sin(angle);
      this.vy =  v * Math.cos(angle);
    } else {
      this.vx = 0; this.vy = 0;
    }

    this.ax = 0; this.ay = 0;

    this.trail = [];
    this.maxTrail = 600;

    // initial state is captured after the system-wide momentum correction below.
    this.initial = null;
  }

  speed() { return Math.hypot(this.vx, this.vy); }

  reset() {
    const i = this.initial;
    this.mass = i.mass;
    this.x = i.x; this.y = i.y;
    this.vx = i.vx; this.vy = i.vy;
    this.trail.length = 0;
  }
}

// --- Initialize bodies with spread starting angles ---------------------
const bodies = PLANET_DATA.map((d, i) => {
  // Spread non-Sun bodies around so trails build up nicely from the start.
  const angle = d.a > 0 ? (i * 0.7) : 0;
  return new Body(d, angle);
});

// Cancel the system's net momentum so the whole solar system doesn't drift.
{
  let px = 0, py = 0, M = 0;
  for (const b of bodies) { px += b.mass * b.vx; py += b.mass * b.vy; M += b.mass; }
  const vcmx = px / M, vcmy = py / M;
  for (const b of bodies) { b.vx -= vcmx; b.vy -= vcmy; }
}

// Capture initial state for per-body / global resets.
for (const b of bodies) {
  b.initial = { mass: b.mass, x: b.x, y: b.y, vx: b.vx, vy: b.vy };
}

// --- Physics integrator (velocity Verlet) ------------------------------
function computeAccelerations() {
  for (const b of bodies) { b.ax = 0; b.ay = 0; }
  for (let i = 0; i < bodies.length; i++) {
    const a = bodies[i];
    for (let j = i + 1; j < bodies.length; j++) {
      const b = bodies[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const r2 = dx * dx + dy * dy;
      const r = Math.sqrt(r2);
      // Avoid singularity if two bodies overlap.
      if (r < 1e3) continue;
      const invR3 = 1 / (r2 * r);
      a.ax += G * b.mass * dx * invR3;
      a.ay += G * b.mass * dy * invR3;
      b.ax -= G * a.mass * dx * invR3;
      b.ay -= G * a.mass * dy * invR3;
    }
  }
}

function step(dt) {
  computeAccelerations();
  for (const b of bodies) {
    b.x += b.vx * dt + 0.5 * b.ax * dt * dt;
    b.y += b.vy * dt + 0.5 * b.ay * dt * dt;
    b._oldAx = b.ax;
    b._oldAy = b.ay;
  }
  computeAccelerations();
  for (const b of bodies) {
    b.vx += 0.5 * (b._oldAx + b.ax) * dt;
    b.vy += 0.5 * (b._oldAy + b.ay) * dt;
  }
}

// --- Canvas / Camera ---------------------------------------------------
const canvas = document.getElementById("sim");
const ctx = canvas.getContext("2d");

const camera = {
  // World-space center (meters). Following the Sun keeps it framed.
  cx: 0, cy: 0,
  // Base scale: how many AU fit in the smaller canvas dimension at zoom = 1.
  baseAU: 4,
  zoom: 1,            // user multiplier
  zoomExp: 0,         // -2..2 from slider
};

let canvasWidth = 0, canvasHeight = 0;
let dpr = window.devicePixelRatio || 1;

function resizeCanvas() {
  dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
  canvasWidth = rect.width;
  canvasHeight = rect.height;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener("resize", resizeCanvas);

function pixelsPerMeter() {
  const minDim = Math.min(canvasWidth, canvasHeight);
  // viewWidthAU = baseAU / zoom -> larger zoom = more zoomed in
  return (minDim / (camera.baseAU * AU)) * camera.zoom;
}

function worldToScreen(x, y) {
  const ppm = pixelsPerMeter();
  return [
    canvasWidth / 2 + (x - camera.cx) * ppm,
    canvasHeight / 2 + (y - camera.cy) * ppm,
  ];
}

function screenToWorld(sx, sy) {
  const ppm = pixelsPerMeter();
  return [
    camera.cx + (sx - canvasWidth / 2) / ppm,
    camera.cy + (sy - canvasHeight / 2) / ppm,
  ];
}

// --- Rendering ---------------------------------------------------------
let starField = [];
function generateStarField() {
  starField = [];
  const count = 220;
  for (let i = 0; i < count; i++) {
    starField.push({
      // Stored in normalized [0,1] canvas coordinates so they don't move with pan.
      x: Math.random(),
      y: Math.random(),
      r: Math.random() * 1.1 + 0.2,
      a: Math.random() * 0.6 + 0.2,
    });
  }
}

function drawStars() {
  ctx.save();
  for (const s of starField) {
    ctx.globalAlpha = s.a;
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(s.x * canvasWidth, s.y * canvasHeight, s.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawOrbitGuides() {
  if (!ui.showOrbits) return;
  const [sunSx, sunSy] = worldToScreen(bodies[0].x, bodies[0].y);
  const ppm = pixelsPerMeter();
  ctx.strokeStyle = "rgba(120, 140, 200, 0.18)";
  ctx.lineWidth = 1;
  for (const b of bodies) {
    if (b.orbitRadius <= 0) continue;
    const r = b.orbitRadius * ppm;
    if (r < 4 || r > 50000) continue;
    ctx.beginPath();
    ctx.arc(sunSx, sunSy, r, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function drawTrails() {
  if (!ui.showTrails) return;
  for (const b of bodies) {
    if (b.trail.length < 2) continue;
    ctx.lineWidth = 1.4;
    // Fading polyline.
    for (let i = 1; i < b.trail.length; i++) {
      const p0 = b.trail[i - 1];
      const p1 = b.trail[i];
      const t = i / b.trail.length;
      ctx.strokeStyle = hexWithAlpha(b.color, t * 0.7);
      const [x0, y0] = worldToScreen(p0[0], p0[1]);
      const [x1, y1] = worldToScreen(p1[0], p1[1]);
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
    }
  }
}

function hexWithAlpha(hex, alpha) {
  // hex like #rrggbb
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function drawBodies() {
  for (const b of bodies) {
    const [sx, sy] = worldToScreen(b.x, b.y);
    if (b.isStar) {
      // Glow.
      const grad = ctx.createRadialGradient(sx, sy, 0, sx, sy, b.displayRadius * 4);
      grad.addColorStop(0, hexWithAlpha(b.color, 1));
      grad.addColorStop(0.4, hexWithAlpha(b.glow || b.color, 0.5));
      grad.addColorStop(1, hexWithAlpha(b.glow || b.color, 0));
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(sx, sy, b.displayRadius * 4, 0, Math.PI * 2);
      ctx.fill();
    }
    if (b.hasRing) {
      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(-0.4);
      ctx.scale(1, 0.35);
      ctx.strokeStyle = hexWithAlpha(b.color, 0.7);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(0, 0, b.displayRadius * 1.9, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    ctx.fillStyle = b.color;
    ctx.beginPath();
    ctx.arc(sx, sy, b.displayRadius, 0, Math.PI * 2);
    ctx.fill();

    // Soft outline so dark planets stay visible.
    ctx.strokeStyle = "rgba(255,255,255,0.15)";
    ctx.lineWidth = 0.5;
    ctx.stroke();
  }
}

function drawHoverDecorations() {
  if (!hoveredBody) return;
  const b = hoveredBody;
  const [sx, sy] = worldToScreen(b.x, b.y);

  // Highlight ring.
  ctx.strokeStyle = "rgba(255,255,255,0.85)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(sx, sy, b.displayRadius + 5, 0, Math.PI * 2);
  ctx.stroke();

  // Velocity arrow: scale by a fixed pixels-per-(km/s) factor so faster = longer.
  const speed = b.speed();
  if (speed > 0) {
    const PX_PER_KMS = 2.2;
    const len = (speed / 1000) * PX_PER_KMS;
    const ux = b.vx / speed;
    const uy = b.vy / speed;
    const ex = sx + ux * len;
    const ey = sy + uy * len;
    drawArrow(sx, sy, ex, ey, "#7fe1a8");
  }
}

function drawArrow(x0, y0, x1, y1, color) {
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
  // Arrowhead.
  const angle = Math.atan2(y1 - y0, x1 - x0);
  const ah = 7;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x1 - ah * Math.cos(angle - 0.4), y1 - ah * Math.sin(angle - 0.4));
  ctx.lineTo(x1 - ah * Math.cos(angle + 0.4), y1 - ah * Math.sin(angle + 0.4));
  ctx.closePath();
  ctx.fill();
}

function render() {
  ctx.clearRect(0, 0, canvasWidth, canvasHeight);
  drawStars();
  drawOrbitGuides();
  drawTrails();
  drawBodies();
  drawHoverDecorations();
}

// --- UI state ----------------------------------------------------------
const ui = {
  paused: false,
  daysPerSecond: 10,
  showTrails: true,
  showOrbits: true,
};

let hoveredBody = null;
let mouseScreen = { x: 0, y: 0 };

// --- Tooltip -----------------------------------------------------------
const tooltipEl = document.getElementById("tooltip");

function fmtSci(x, digits = 3) {
  if (x === 0) return "0";
  return x.toExponential(digits);
}

function updateTooltip() {
  if (!hoveredBody) {
    tooltipEl.classList.add("hidden");
    return;
  }
  const b = hoveredBody;
  const speed = b.speed();
  const [sxSun, sySun] = [bodies[0].x, bodies[0].y];
  const distFromSun = Math.hypot(b.x - sxSun, b.y - sySun);

  tooltipEl.innerHTML = `
    <div class="name" style="color:${b.color}">${b.name}</div>
    <div class="row"><span class="label">Mass</span><span>${fmtSci(b.mass, 3)} kg</span></div>
    <div class="row"><span class="label">|v|</span><span>${(speed/1000).toFixed(2)} km/s</span></div>
    <div class="row"><span class="label">v</span><span>(${(b.vx/1000).toFixed(2)}, ${(b.vy/1000).toFixed(2)}) km/s</span></div>
    <div class="row"><span class="label">r from Sun</span><span>${(distFromSun/AU).toFixed(3)} AU</span></div>
    <div class="row"><span class="label">pos</span><span>(${(b.x/AU).toFixed(3)}, ${(b.y/AU).toFixed(3)}) AU</span></div>
  `;
  tooltipEl.classList.remove("hidden");

  // Position tooltip near cursor but keep it on-screen.
  const pad = 14;
  let tx = mouseScreen.x + pad;
  let ty = mouseScreen.y + pad;
  const tw = tooltipEl.offsetWidth;
  const th = tooltipEl.offsetHeight;
  if (tx + tw > canvasWidth - 4) tx = mouseScreen.x - tw - pad;
  if (ty + th > canvasHeight - 4) ty = mouseScreen.y - th - pad;
  tooltipEl.style.left = tx + "px";
  tooltipEl.style.top  = ty + "px";
}

// --- Hit detection -----------------------------------------------------
function findHoveredBody(sx, sy) {
  let best = null;
  let bestD = Infinity;
  for (const b of bodies) {
    const [bx, by] = worldToScreen(b.x, b.y);
    const d = Math.hypot(bx - sx, by - sy);
    const tolerance = b.displayRadius + 8;
    if (d < tolerance && d < bestD) {
      best = b;
      bestD = d;
    }
  }
  return best;
}

// --- Mouse handling ----------------------------------------------------
let isDragging = false;
let dragLast = null;

canvas.addEventListener("mousemove", (e) => {
  const rect = canvas.getBoundingClientRect();
  mouseScreen.x = e.clientX - rect.left;
  mouseScreen.y = e.clientY - rect.top;

  if (isDragging && dragLast) {
    const dx = mouseScreen.x - dragLast.x;
    const dy = mouseScreen.y - dragLast.y;
    const ppm = pixelsPerMeter();
    camera.cx -= dx / ppm;
    camera.cy -= dy / ppm;
    dragLast = { x: mouseScreen.x, y: mouseScreen.y };
  } else {
    hoveredBody = findHoveredBody(mouseScreen.x, mouseScreen.y);
  }
});

canvas.addEventListener("mouseleave", () => {
  hoveredBody = null;
  isDragging = false;
  dragLast = null;
});

canvas.addEventListener("mousedown", (e) => {
  isDragging = true;
  dragLast = { x: mouseScreen.x, y: mouseScreen.y };
});
window.addEventListener("mouseup", () => {
  isDragging = false;
  dragLast = null;
});

canvas.addEventListener("wheel", (e) => {
  e.preventDefault();
  // Zoom relative to mouse position so the point under the cursor stays put.
  const [wx, wy] = screenToWorld(mouseScreen.x, mouseScreen.y);
  const factor = Math.exp(-e.deltaY * 0.001);
  setZoom(camera.zoom * factor);
  const [wx2, wy2] = screenToWorld(mouseScreen.x, mouseScreen.y);
  camera.cx += wx - wx2;
  camera.cy += wy - wy2;
}, { passive: false });

function setZoom(z) {
  camera.zoom = Math.max(0.005, Math.min(500, z));
  // Sync zoom slider (use logarithmic mapping).
  const slider = document.getElementById("zoom");
  slider.value = Math.log10(camera.zoom).toFixed(2);
  document.getElementById("zoomLabel").textContent = camera.zoom.toFixed(2) + "×";
}

// --- Controls wiring ---------------------------------------------------
const speedSlider = document.getElementById("speed");
const speedLabel = document.getElementById("speedLabel");
speedSlider.addEventListener("input", () => {
  ui.daysPerSecond = parseFloat(speedSlider.value);
  speedLabel.textContent = `${ui.daysPerSecond.toFixed(1)} days/s`;
});

const zoomSlider = document.getElementById("zoom");
zoomSlider.addEventListener("input", () => {
  const exp = parseFloat(zoomSlider.value);
  setZoom(Math.pow(10, exp));
});

document.getElementById("playPause").addEventListener("click", (e) => {
  ui.paused = !ui.paused;
  e.target.textContent = ui.paused ? "Play" : "Pause";
});

document.getElementById("resetAll").addEventListener("click", () => {
  for (const b of bodies) b.reset();
  camera.cx = 0; camera.cy = 0;
});

document.getElementById("showTrails").addEventListener("change", (e) => {
  ui.showTrails = e.target.checked;
});
document.getElementById("showOrbits").addEventListener("change", (e) => {
  ui.showOrbits = e.target.checked;
});

document.querySelectorAll("button[data-view]").forEach(btn => {
  btn.addEventListener("click", () => {
    const view = btn.dataset.view;
    camera.cx = 0; camera.cy = 0;
    if (view === "inner") setZoom(1);
    else setZoom(0.05);  // ~80 AU view
  });
});

// --- Edit body widget --------------------------------------------------
const bodySelect = document.getElementById("bodySelect");
const massInput = document.getElementById("massInput");
const speedInput = document.getElementById("speedInput");

for (const b of bodies) {
  const opt = document.createElement("option");
  opt.value = b.name;
  opt.textContent = b.name;
  bodySelect.appendChild(opt);
}
bodySelect.value = "Earth";

function refreshEditFields() {
  const b = bodies.find(x => x.name === bodySelect.value);
  if (!b) return;
  massInput.value = b.mass.toExponential(4);
  speedInput.value = b.speed().toExponential(4);
}
bodySelect.addEventListener("change", refreshEditFields);
refreshEditFields();

document.getElementById("applyEdit").addEventListener("click", () => {
  const b = bodies.find(x => x.name === bodySelect.value);
  if (!b) return;

  const newMass = parseFloat(massInput.value);
  if (isFinite(newMass) && newMass >= 0) {
    b.mass = newMass;
  }

  const newSpeed = parseFloat(speedInput.value);
  if (isFinite(newSpeed) && newSpeed >= 0) {
    const cur = b.speed();
    if (cur > 0) {
      const k = newSpeed / cur;
      b.vx *= k;
      b.vy *= k;
    } else if (newSpeed > 0) {
      // No previous direction: kick tangentially around the Sun.
      const sun = bodies[0];
      const rx = b.x - sun.x;
      const ry = b.y - sun.y;
      const rmag = Math.hypot(rx, ry);
      if (rmag > 0) {
        b.vx = -ry / rmag * newSpeed;
        b.vy =  rx / rmag * newSpeed;
      }
    }
    b.trail.length = 0;
  }
  refreshEditFields();
});

document.getElementById("resetBody").addEventListener("click", () => {
  const b = bodies.find(x => x.name === bodySelect.value);
  if (!b) return;
  b.reset();
  refreshEditFields();
});

// --- Main loop ---------------------------------------------------------
let lastTime = performance.now();
let trailAccum = 0;

function frame(now) {
  const dtReal = Math.min(0.05, (now - lastTime) / 1000); // cap at 50 ms
  lastTime = now;

  if (!ui.paused) {
    const simSeconds = ui.daysPerSecond * DAY * dtReal;
    // Keep dt per substep small enough for stable Mercury orbit (~1 hour).
    const targetDt = 3600;
    let substeps = Math.max(1, Math.ceil(simSeconds / targetDt));
    substeps = Math.min(substeps, 400);
    const dt = simSeconds / substeps;
    for (let k = 0; k < substeps; k++) step(dt);

    // Add to trails at most a few times per frame.
    trailAccum += dtReal;
    if (trailAccum >= 0.02) {
      trailAccum = 0;
      for (const b of bodies) {
        if (b.isStar) continue;
        b.trail.push([b.x, b.y]);
        if (b.trail.length > b.maxTrail) b.trail.shift();
      }
    }
  }

  updateTooltip();
  render();
  requestAnimationFrame(frame);
}

// --- Boot --------------------------------------------------------------
resizeCanvas();
generateStarField();
setZoom(1);
requestAnimationFrame(frame);
