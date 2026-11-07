// Caballo de fuego: una línea de luz lo recorre del hocico a la cola y lo deja hecho brasa, con grietas que laten
// con el tranco, ojos encendidos y llamas en la crin y la cola. El modelo no trae ojos ni crin separados:
// todo se ubica por zona sobre la malla, en unidades del modelo y sobre la pose base, para que se pegue al cuerpo.
import * as THREE from "three"
import { shared, toon } from "./caballo.js"

const EYES = [new THREE.Vector3(11.2, 156, 111), new THREE.Vector3(-12.6, 156, 111)]
const EYE_RADIUS = 3.3
const MANE = { fromZ: 26, toZ: 104, midline: 4.5 }
// En la pose base una pata trasera va estirada más atrás que la cola, pero mucho más abajo.
const TAIL = { behindZ: -146, aboveY: 105, midline: 9 }
const PARTICLES = 340
const EMIT_PER_SECOND = 720

// El frente de la línea se pasa un poco de los extremos para cubrir todo el cuerpo.
const frontOf = burn => burn * 1.3 - 0.15

const FIRE_GLSL = `
  uniform float uBurn, uFade, uPulse, uFireT, uUnit, uHead, uTail;
  uniform vec3 uEyes[2];
  varying vec3 vBase;
  vec3 h33(vec3 p) {
    p = vec3(dot(p, vec3(127.1, 311.7, 74.7)), dot(p, vec3(269.5, 183.3, 246.1)), dot(p, vec3(113.5, 271.9, 124.6)));
    return fract(sin(p) * 43758.5453);
  }
  float vn(vec3 p) {
    vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(h33(i).x, h33(i + vec3(1, 0, 0)).x, f.x), mix(h33(i + vec3(0, 1, 0)).x, h33(i + vec3(1, 1, 0)).x, f.x), f.y),
      mix(mix(h33(i + vec3(0, 0, 1)).x, h33(i + vec3(1, 0, 1)).x, f.x), mix(h33(i + vec3(0, 1, 1)).x, h33(i + vec3(1, 1, 1)).x, f.x), f.y),
      f.z);
  }
  // Distancia al borde entre dos placas: cero justo sobre la grieta.
  float plates(vec3 p) {
    vec3 i = floor(p), f = fract(p);
    float a = 8.0, b = 8.0;
    for (int z = -1; z <= 1; z++) for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
      vec3 g = vec3(float(x), float(y), float(z));
      vec3 r = g + h33(i + g) - f;
      float d = dot(r, r);
      if (d < a) { b = a; a = d; } else if (d < b) { b = d; }
    }
    return sqrt(b) - sqrt(a);
  }
`

const FIRE_APPLY = `
  float span = (uHead - vBase.z) / (uHead - uTail); // 0 en el hocico, 1 en la cola
  float front = uBurn * 1.3 - 0.15;
  float lit = smoothstep(0.0, 0.03, front - span) * step(0.001, uBurn);
  vec3 m = vBase * uUnit; // metros
  vec3 warp = vec3(vn(m * 6.0), vn(m * 6.0 + 7.3), vn(m * 6.0 + 13.1)) - 0.5;
  // Placas chicas y muy deformadas, con grietas finas que se cortan: si son parejas parece el pelaje de una jirafa.
  float edge = plates((m + warp * 0.2) * 6.4);
  float width = 0.05 + 0.1 * vn(m * 3.1 + uFireT * 0.25);
  float open = smoothstep(0.3, 0.62, vn(m * 3.7 + 11.0));
  float crack = (1.0 - smoothstep(0.0, width, edge)) * open;
  float core = (1.0 - smoothstep(0.0, width * 0.34, edge)) * open;
  float beat = 0.5 + 1.15 * uPulse;
  float flow = 0.62 + 0.38 * sin(m.z * 8.0 + uFireT * 8.0 + vn(m * 3.0) * 6.0);
  vec3 hot = mix(vec3(1.0, 0.12, 0.006) * 2.7, vec3(1.0, 0.6, 0.12) * 7.5, core) * crack * beat * flow;
  vec3 ember = vec3(0.075, 0.009, 0.003) * (0.2 + 1.5 * vn(m * 13.0)) * (0.45 + 0.7 * uPulse);
  float fresnel = pow(1.0 - saturate(dot(normal, normalize(vViewPosition))), 2.4);
  vec3 burned = ember + hot + vec3(1.0, 0.22, 0.02) * fresnel * (1.1 + 1.4 * uPulse);
  outgoingLight = mix(outgoingLight, burned, lit * uFade);
  // La línea de luz que transforma, blanca y con mucho brillo.
  float line = exp(-pow((span - front) / 0.032, 2.0)) * step(0.001, uBurn) * (1.0 - step(0.999, uBurn));
  outgoingLight += vec3(1.0, 0.84, 0.5) * line * 16.0 * uFade;
  // Ojos: se encienden cuando pasa la línea.
  float eye = 1.0 - smoothstep(${(EYE_RADIUS * 0.42).toFixed(2)}, ${EYE_RADIUS.toFixed(2)}, min(distance(vBase, uEyes[0]), distance(vBase, uEyes[1])));
  outgoingLight = mix(outgoingLight, vec3(1.0, 0.72, 0.24) * 11.0, eye * lit * uFade);
`

// Los puntos de la malla que arden: la cresta del cuello por tramos y la cola entera.
function findAnchors(position, head, tail) {
  const p = position.array
  const anchors = []
  const add = i => anchors.push({ i, span: (head - p[i * 3 + 2]) / (head - tail) })

  const bins = new Map()
  for (let i = 0; i < position.count; i++) {
    const x = p[i * 3], y = p[i * 3 + 1], z = p[i * 3 + 2]
    if (Math.abs(x) > MANE.midline || z < MANE.fromZ || z > MANE.toZ) continue
    const bin = Math.floor(z / 4)
    if (!bins.has(bin) || y > p[bins.get(bin) * 3 + 1]) bins.set(bin, i)
  }
  bins.forEach(add)
  const manes = anchors.length

  const behind = []
  for (let i = 0; i < position.count; i++) {
    if (p[i * 3 + 2] < TAIL.behindZ && p[i * 3 + 1] > TAIL.aboveY && Math.abs(p[i * 3]) < TAIL.midline) behind.push(i)
  }
  const step = Math.max(1, Math.floor(behind.length / Math.max(manes, 20)))
  for (let k = 0; k < behind.length; k += step) add(behind[k])
  return anchors
}

function buildFlames(model, head, tail) {
  const geometry = new THREE.BufferGeometry()
  const positions = new Float32Array(PARTICLES * 3)
  const lifes = new Float32Array(PARTICLES).fill(1)
  const sizes = new Float32Array(PARTICLES)
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute("aLife", new THREE.BufferAttribute(lifes, 1))
  geometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1))

  const points = new THREE.Points(geometry, new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uViewHeight: shared.uViewHeight },
    vertexShader: `
      attribute float aLife, aSize; varying float vLife; uniform float uViewHeight;
      void main() {
        vLife = aLife;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        float grow = 0.4 + 0.6 * smoothstep(0.0, 0.22, aLife);
        // Con el foco de la cámara: en las tomas de lente larga las llamas no se achican.
        gl_PointSize = uViewHeight * 0.5 * projectionMatrix[1][1] * aSize * grow * (1.0 - 0.6 * aLife) / max(0.2, -mv.z);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      varying float vLife;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        if (d > 0.5 || vLife >= 1.0) discard;
        float a = pow(1.0 - d * 2.0, 1.8) * (1.0 - vLife * vLife) * 0.62;
        vec3 color = mix(vec3(1.0, 0.72, 0.3) * 2.3, vec3(1.0, 0.28, 0.03) * 1.5, smoothstep(0.0, 0.3, vLife));
        color = mix(color, vec3(0.55, 0.04, 0.006) * 0.7, smoothstep(0.3, 0.82, vLife));
        gl_FragColor = vec4(color, a);
      }`
  }))
  points.frustumCulled = false

  const anchors = findAnchors(model.geometry.attributes.position, head, tail)
  const base = model.geometry.attributes.position.array
  const deltas = model.geometry.morphAttributes.position.map(attribute => attribute.array)
  const velocity = new Float32Array(PARTICLES * 3)
  const ages = new Float32Array(PARTICLES)
  const durations = new Float32Array(PARTICLES).fill(1)
  let cursor = 0
  let due = 0

  // Dónde está ese punto ahora, con la animación aplicada, medido desde el centro del caballo.
  const place = (vertex, slot, influences) => {
    let x = base[vertex * 3], y = base[vertex * 3 + 1], z = base[vertex * 3 + 2]
    for (let j = 0; j < influences.length; j++) {
      const w = influences[j]
      if (w < 0.001) continue
      x += w * deltas[j][vertex * 3]
      y += w * deltas[j][vertex * 3 + 1]
      z += w * deltas[j][vertex * 3 + 2]
    }
    const s = model.scale, jitter = () => (Math.random() - 0.5) * 0.09
    positions[slot * 3] = (z - model.centerZ) * s + jitter()
    positions[slot * 3 + 1] = y * s + jitter()
    positions[slot * 3 + 2] = -x * s + jitter()
  }

  const spawn = (front, metersPerSecond, influences) => {
    let anchor = null
    for (let tries = 0; tries < 6 && !anchor; tries++) {
      const pick = anchors[Math.floor(Math.random() * anchors.length)]
      if (pick.span < front) anchor = pick
    }
    if (!anchor) return
    const slot = cursor++ % PARTICLES
    place(anchor.i, slot, influences)
    const spark = Math.random() < 0.14
    const drag = 0.7 + metersPerSecond * (spark ? 0.15 : 0.1)
    velocity[slot * 3] = -drag * (0.65 + Math.random() * 0.7)
    velocity[slot * 3 + 1] = spark ? 1.6 + Math.random() * 3.2 : 0.9 + Math.random() * 1.5
    velocity[slot * 3 + 2] = (Math.random() - 0.5) * (spark ? 2.2 : 0.7)
    ages[slot] = 0
    durations[slot] = spark ? 0.55 + Math.random() * 0.45 : 0.22 + Math.random() * 0.22
    sizes[slot] = spark ? 0.035 + Math.random() * 0.03 : 0.16 + Math.random() * 0.2
    lifes[slot] = 0
  }

  return {
    points,
    update(dt, burn, fade, metersPerSecond, influences) {
      if (burn > 0 && fade > 0.02 && dt > 0) {
        due += EMIT_PER_SECOND * fade * dt
        const front = frontOf(burn)
        while (due >= 1) { due -= 1; spawn(front, metersPerSecond, influences) }
      }
      for (let i = 0; i < PARTICLES; i++) {
        if (lifes[i] >= 1) continue
        ages[i] += dt
        lifes[i] = Math.min(1, ages[i] / durations[i])
        positions[i * 3] += velocity[i * 3] * dt
        positions[i * 3 + 1] += velocity[i * 3 + 1] * dt
        positions[i * 3 + 2] += velocity[i * 3 + 2] * dt
      }
      geometry.attributes.position.needsUpdate = true
      geometry.attributes.aLife.needsUpdate = true
      geometry.attributes.aSize.needsUpdate = true
    }
  }
}

export function buildFire(model, element, rim) {
  const box = new THREE.Box3().setFromBufferAttribute(model.geometry.attributes.position)
  const head = box.max.z, tail = box.min.z
  const uniforms = {
    uBurn: { value: 0 }, uFade: { value: 1 }, uPulse: { value: 0 }, uFireT: shared.uTime,
    uUnit: { value: model.scale }, uHead: { value: head }, uTail: { value: tail }, uEyes: { value: EYES }
  }

  const material = toon(element.inner, { rim })
  const patchToon = material.onBeforeCompile
  material.onBeforeCompile = shader => {
    patchToon(shader)
    Object.assign(shader.uniforms, uniforms)
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vBase;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvBase = position;")
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\n${FIRE_GLSL}`)
      .replace("#include <opaque_fragment>", `${FIRE_APPLY}\n#include <opaque_fragment>`)
  }
  material.customProgramCacheKey = () => "toon-fuego"

  const flames = buildFlames(model, head, tail)
  let burn = 0, fade = 1

  return {
    material,
    flames: flames.points,
    // burn: 0 sin empezar, 1 transformación completa. fade: 1 encendido, 0 apagado.
    set(nextBurn, nextFade) {
      burn = nextBurn
      fade = nextFade
      uniforms.uBurn.value = burn
      uniforms.uFade.value = fade
    },
    update(dt, phase, metersPerSecond, influences) {
      uniforms.uPulse.value = Math.pow(0.5 + 0.5 * Math.sin(phase * Math.PI * 2), 2)
      flames.update(dt, burn, fade, metersPerSecond, influences)
    }
  }
}
