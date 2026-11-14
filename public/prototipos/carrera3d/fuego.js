// Caballos de fuego, a lo Tron: cuerpo casi negro con líneas de luz finas y saturadas que laten con el tranco,
// borde nítido, ojos encendidos y llamas en la crin y la cola. Arden desde el principio; al largar, la llama se aviva.
// El modelo no trae ojos ni crin separados: todo se ubica por zona sobre la pose original (aRef), en unidades del modelo.
import * as THREE from "three"
import { shared, toon } from "./caballo.js"

// Los ojos, a esta altura y profundidad de la cabeza, sobre la superficie de cada lado. La cabeza del modelo no es
// simétrica (un lado llega a x 11 y el otro a -9,5): espejar un ojo deja el otro flotando fuera de la cara, sin pintarse.
const EYE_AT = { y: 156, z: 111, window: 3.5 }
const EYE_RADIUS = 3.6
const EYE_GLOW = 15
const MANE = { fromZ: 26, toZ: 104, midline: 4.5 }
// En la pose original una pata trasera va estirada más atrás que la cola, pero mucho más abajo.
const TAIL = { behindZ: -146, aboveY: 105, midline: 9 }
const PARTICLES = 1100
const EMIT_PER_SECOND = 720
const FLARE_GAIN = 3 // en la llamarada salen hasta cuatro veces más partículas

// Cada parte del fuego en el tono del elemento, con luminancia fija: sin compensar, los azules y violetas se verían
// apagados al lado del naranja. Saturado siempre: el contraste sale del color puro sobre negro, no del blanco.
const ROLES = {
  line: { l: 0.5, lum: 0.3 }, core: { l: 0.6, lum: 0.42 }, rim: { l: 0.52, lum: 0.3 }, eye: { l: 0.72, lum: 0.6 },
  body: { l: 0.5, lum: 0.004 }, spark: { l: 0.6, lum: 0.4 }, flame: { l: 0.5, lum: 0.24 }, smoke: { l: 0.4, lum: 0.05 }
}
function paletteOf(element) {
  const hsl = new THREE.Color(element.outer).getHSL({}, THREE.SRGBColorSpace)
  const luminance = c => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b
  // Primero se aclara el tono (el azul puro, multiplicado, es una mancha con el bloom) y recién después se escala.
  return Object.fromEntries(Object.entries(ROLES).map(([role, { l, lum }]) => {
    const c = new THREE.Color()
    for (let light = l; light <= 0.8; light += 0.02) {
      c.setHSL(hsl.h, hsl.s, light, THREE.SRGBColorSpace)
      if (luminance(c) * 1.4 >= lum) break
    }
    return [role, c.multiplyScalar(Math.min(1.4, lum / Math.max(1e-4, luminance(c))))]
  }))
}

const FIRE_GLSL = `
  uniform float uPulse, uFireT, uUnit;
  uniform vec3 uEyes[2];
  uniform vec3 uLine, uCore, uRim, uEye, uBody;
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
  // Distancia al borde entre dos placas: cero justo sobre la línea.
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
  vec3 m = vBase * uUnit; // metros
  vec3 warp = vec3(vn(m * 6.0), vn(m * 6.0 + 7.3), vn(m * 6.0 + 13.1)) - 0.5;
  // Líneas finas de ancho parejo y borde nítido, cortadas por tramos: circuitos, no manchas.
  float edge = plates((m + warp * 0.2) * 6.4);
  float open = smoothstep(0.32, 0.5, vn(m * 3.7 + 11.0));
  float line = (1.0 - smoothstep(0.028, 0.042, edge)) * open;
  float core = (1.0 - smoothstep(0.0, 0.016, edge)) * open;
  float beat = 0.55 + 1.0 * uPulse;
  float flow = 0.6 + 0.4 * sin(m.z * 8.0 + uFireT * 8.0 + vn(m * 3.0) * 6.0);
  vec3 lit = mix(uLine * 3.4 * line, uCore * 5.0, core) * beat * flow;
  // Borde fino: solo donde la superficie ya casi no mira a la cámara.
  float rim = pow(1.0 - saturate(dot(normal, normalize(vViewPosition))), 5.0);
  vec3 burned = uBody * (0.5 + vn(m * 13.0)) + lit + uRim * rim * (1.5 + 1.1 * uPulse);
  float eye = 1.0 - smoothstep(${(EYE_RADIUS * 0.45).toFixed(2)}, ${EYE_RADIUS.toFixed(2)}, min(distance(vBase, uEyes[0]), distance(vBase, uEyes[1])));
  outgoingLight = mix(burned, uEye * ${EYE_GLOW.toFixed(1)}, eye);
`

// Los puntos de la malla que arden: la cresta del cuello por tramos y la cola entera.
function findAnchors(position) {
  const p = position.array
  const anchors = []
  const bins = new Map()
  for (let i = 0; i < position.count; i++) {
    const x = p[i * 3], y = p[i * 3 + 1], z = p[i * 3 + 2]
    if (Math.abs(x) > MANE.midline || z < MANE.fromZ || z > MANE.toZ) continue
    const bin = Math.floor(z / 4)
    if (!bins.has(bin) || y > p[bins.get(bin) * 3 + 1]) bins.set(bin, i)
  }
  bins.forEach(i => anchors.push(i))
  const manes = anchors.length

  const behind = []
  for (let i = 0; i < position.count; i++) {
    if (p[i * 3 + 2] < TAIL.behindZ && p[i * 3 + 1] > TAIL.aboveY && Math.abs(p[i * 3]) < TAIL.midline) behind.push(i)
  }
  const step = Math.max(1, Math.floor(behind.length / Math.max(manes, 20)))
  for (let k = 0; k < behind.length; k += step) anchors.push(behind[k])
  return anchors
}

function buildFlames(model, palette) {
  const geometry = new THREE.BufferGeometry()
  const positions = new Float32Array(PARTICLES * 3)
  const lifes = new Float32Array(PARTICLES).fill(1)
  const sizes = new Float32Array(PARTICLES)
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute("aLife", new THREE.BufferAttribute(lifes, 1))
  geometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1))

  const points = new THREE.Points(geometry, new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: {
      uViewHeight: shared.uViewHeight,
      uSpark: { value: palette.spark }, uFlame: { value: palette.flame }, uSmoke: { value: palette.smoke }
    },
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
      uniform vec3 uSpark, uFlame, uSmoke;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        if (d > 0.5 || vLife >= 1.0) discard;
        float a = pow(1.0 - d * 2.0, 1.8) * (1.0 - vLife * vLife) * 0.62;
        vec3 color = mix(uSpark * 2.3, uFlame * 1.5, smoothstep(0.0, 0.3, vLife));
        color = mix(color, uSmoke * 0.7, smoothstep(0.3, 0.82, vLife));
        gl_FragColor = vec4(color, a);
      }`
  }))
  points.frustumCulled = false

  // Las zonas se eligen sobre la pose original; dónde están ahora sale de la pose de pie más el galope y el reposo.
  const anchors = findAnchors(model.geometry.attributes.aRef)
  const base = model.geometry.attributes.position.array
  const deltas = model.geometry.morphAttributes.position.map(attribute => attribute.array)
  const velocity = new Float32Array(PARTICLES * 3)
  const ages = new Float32Array(PARTICLES)
  const durations = new Float32Array(PARTICLES).fill(1)
  const point = [0, 0, 0]
  let cursor = 0
  let due = 0

  // Dónde está ese punto ahora, con la animación aplicada, medido desde el centro del caballo.
  const place = (vertex, slot, influences, bend) => {
    point[0] = base[vertex * 3]; point[1] = base[vertex * 3 + 1]; point[2] = base[vertex * 3 + 2]
    for (let j = 0; j < influences.length; j++) {
      const w = influences[j]
      if (w < 0.001) continue
      for (let axis = 0; axis < 3; axis++) point[axis] += w * deltas[j][vertex * 3 + axis]
    }
    bend(vertex, point)
    const s = model.scale, jitter = () => (Math.random() - 0.5) * 0.09
    positions[slot * 3] = (point[2] - model.centerZ) * s + jitter()
    positions[slot * 3 + 1] = point[1] * s + jitter()
    positions[slot * 3 + 2] = -point[0] * s + jitter()
  }

  const spawn = (flare, metersPerSecond, influences, bend) => {
    const slot = cursor++ % PARTICLES
    place(anchors[Math.floor(Math.random() * anchors.length)], slot, influences, bend)
    const spark = Math.random() < 0.14
    const drag = 0.7 + metersPerSecond * (spark ? 0.15 : 0.1)
    const lift = 1 + 0.9 * flare
    velocity[slot * 3] = -drag * (0.65 + Math.random() * 0.7)
    velocity[slot * 3 + 1] = (spark ? 1.6 + Math.random() * 3.2 : 0.9 + Math.random() * 1.5) * lift
    velocity[slot * 3 + 2] = (Math.random() - 0.5) * (spark ? 2.2 : 0.7) * lift
    ages[slot] = 0
    durations[slot] = (spark ? 0.55 + Math.random() * 0.45 : 0.22 + Math.random() * 0.22) * (1 + 0.5 * flare)
    sizes[slot] = (spark ? 0.035 + Math.random() * 0.03 : 0.16 + Math.random() * 0.2) * (1 + 0.3 * flare)
    lifes[slot] = 0
  }

  return {
    points,
    update(dt, flare, metersPerSecond, influences, bend) {
      if (dt > 0) {
        due += EMIT_PER_SECOND * (1 + FLARE_GAIN * flare) * dt
        while (due >= 1) { due -= 1; spawn(flare, metersPerSecond, influences, bend) }
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

// El punto más afuera de cada lado de la cabeza, a la altura del ojo, sobre la malla ya suavizada (aRef).
function eyesOn(ref) {
  const p = ref.array
  const right = new THREE.Vector3(-Infinity, EYE_AT.y, EYE_AT.z)
  const left = new THREE.Vector3(Infinity, EYE_AT.y, EYE_AT.z)
  for (let i = 0; i < ref.count; i++) {
    const x = p[i * 3], y = p[i * 3 + 1], z = p[i * 3 + 2]
    if (Math.abs(y - EYE_AT.y) > EYE_AT.window || Math.abs(z - EYE_AT.z) > EYE_AT.window) continue
    if (x > right.x) right.set(x, y, z)
    if (x < left.x) left.set(x, y, z)
  }
  return [right, left]
}

// Destello de cada ojo: un punto brillante apenas afuera de la cara, que sigue a la cabeza. Pintado sobre la piel, el
// ojo queda de canto y de frente casi no se ve; el destello se ve desde cualquier ángulo (la cabeza tapa el de atrás).
const EYE_OUT = 0.35 // unidades del modelo hacia afuera de la cara: apenas, para que no parezcan salidos
const EYE_SPRITE = 0.1 // metros
function buildEyeGlow(model, palette) {
  const ref = model.geometry.attributes.aRef
  const nearest = target => {
    let best = Infinity, index = 0
    for (let i = 0; i < ref.count; i++) {
      const d = (ref.getX(i) - target.x) ** 2 + (ref.getY(i) - target.y) ** 2 + (ref.getZ(i) - target.z) ** 2
      if (d < best) { best = d; index = i }
    }
    return index
  }
  const vertices = model.eyes.map(nearest)
  const sides = model.eyes.map(e => Math.sign(e.x))
  const base = model.geometry.attributes.position.array
  const deltas = model.geometry.morphAttributes.position.map(attribute => attribute.array)
  const positions = new Float32Array(6)
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3))
  const points = new THREE.Points(geometry, new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uViewHeight: shared.uViewHeight, uEye: { value: palette.eye } },
    vertexShader: `
      uniform float uViewHeight;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = uViewHeight * 0.5 * projectionMatrix[1][1] * ${EYE_SPRITE.toFixed(3)} / max(0.2, -mv.z);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform vec3 uEye;
      void main() {
        float d = length(gl_PointCoord - 0.5) * 2.0;
        if (d > 1.0) discard;
        float core = 1.0 - smoothstep(0.0, 0.35, d);
        float halo = pow(1.0 - d, 2.2);
        gl_FragColor = vec4(uEye * (6.0 * core + 2.2 * halo) + vec3(core), core + halo * 0.8);
      }`
  }))
  points.frustumCulled = false
  const point = [0, 0, 0]
  return {
    points,
    update(influences, bend) {
      vertices.forEach((vertex, k) => {
        point[0] = base[vertex * 3]; point[1] = base[vertex * 3 + 1]; point[2] = base[vertex * 3 + 2]
        for (let j = 0; j < influences.length; j++) {
          const w = influences[j]
          if (w < 0.001) continue
          for (let axis = 0; axis < 3; axis++) point[axis] += w * deltas[j][vertex * 3 + axis]
        }
        bend(vertex, point)
        point[0] += sides[k] * EYE_OUT
        const s = model.scale
        positions[k * 3] = (point[2] - model.centerZ) * s
        positions[k * 3 + 1] = point[1] * s
        positions[k * 3 + 2] = -point[0] * s
      })
      geometry.attributes.position.needsUpdate = true
    }
  }
}

export function buildFire(model, element) {
  model.eyes ||= eyesOn(model.geometry.attributes.aRef)
  const palette = paletteOf(element)
  const uniforms = {
    uPulse: { value: 0 }, uFireT: shared.uTime, uUnit: { value: model.scale }, uEyes: { value: model.eyes },
    uLine: { value: palette.line }, uCore: { value: palette.core }, uRim: { value: palette.rim },
    uEye: { value: palette.eye }, uBody: { value: palette.body }
  }

  const material = toon(0x000000)
  const patchToon = material.onBeforeCompile
  material.onBeforeCompile = shader => {
    patchToon(shader)
    Object.assign(shader.uniforms, uniforms)
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute vec3 aRef;\nvarying vec3 vBase;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvBase = aRef;")
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\n${FIRE_GLSL}`)
      .replace("#include <opaque_fragment>", `${FIRE_APPLY}\n#include <opaque_fragment>`)
  }
  material.customProgramCacheKey = () => "toon-fuego"

  const flames = buildFlames(model, palette)
  const eyes = buildEyeGlow(model, palette)
  let flare = 0

  return {
    material,
    flames: flames.points,
    eyes: eyes.points,
    edge: palette.line, // color del contorno
    // flare: 0 llama normal, 1 llamarada (al largar).
    set(next) { flare = next },
    update(dt, phase, metersPerSecond, influences, bend) {
      uniforms.uPulse.value = Math.pow(0.5 + 0.5 * Math.sin(phase * Math.PI * 2), 2)
      flames.update(dt, flare, metersPerSecond, influences, bend)
      eyes.update(influences, bend)
    }
  }
}
