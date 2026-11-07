// Caballo 3D hecho por código: cada parte es una superficie suave "esculpida" con anillos a lo largo
// de una curva. Sin texturas ni modelos externos; la geometría se comparte entre todos los caballos.
import * as THREE from "three"
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js"

// Uniformes compartidos con la escena: el brillo de borde y el viento cambian en la recta final.
export const shared = {
  uTime: { value: 0 },
  uRimColor: { value: new THREE.Color(0x000000) },
  uHorseRim: { value: 0.4 } // fuerza del brillo de borde propio de cada caballo
}

const OUTLINE_COLOR = 0x1a1020
const OUTLINE_WIDTH = 0.014

const toonRamp = new THREE.DataTexture(new Uint8Array([105, 105, 190, 255, 255]), 5, 1, THREE.RedFormat)
toonRamp.minFilter = toonRamp.magFilter = THREE.NearestFilter
toonRamp.needsUpdate = true

const HAIR_WAVE = `
  transformed.x -= 0.16 * aW * aW;
  transformed.y += sin(uTime * 11.0 + position.x * 5.0) * 0.045 * aW;
  transformed.z += cos(uTime * 8.0 + position.x * 4.0 + position.z * 9.0) * 0.07 * aW;
`

function patchVertex(shader, hair, extra = "") {
  if (!hair && !extra) return
  shader.uniforms.uTime = shared.uTime
  shader.vertexShader = shader.vertexShader
    .replace("#include <common>", `#include <common>\n${hair ? "attribute float aW;" : ""}\nuniform float uTime;`)
    .replace("#include <begin_vertex>", `#include <begin_vertex>\n${hair ? HAIR_WAVE : ""}\n${extra}`)
}

export function toon(color, { hair = false, vertexColors = false, map = null, side = THREE.FrontSide, rim = null } = {}) {
  const material = new THREE.MeshToonMaterial({ color, gradientMap: toonRamp, vertexColors, map, side })
  material.onBeforeCompile = shader => {
    patchVertex(shader, hair)
    shader.uniforms.uRimColor = rim ? { value: rim } : shared.uRimColor
    shader.uniforms.uRimGain = rim ? shared.uHorseRim : { value: 1 }
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform vec3 uRimColor;\nuniform float uRimGain;")
      .replace("#include <opaque_fragment>",
        "outgoingLight += uRimColor * uRimGain * pow(1.0 - saturate(dot(normal, normalize(vViewPosition))), 2.2);\n#include <opaque_fragment>")
  }
  material.customProgramCacheKey = () => `toon-${hair}`
  return material
}

export function outline({ hair = false, width = OUTLINE_WIDTH, color = OUTLINE_COLOR } = {}) {
  const material = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide })
  material.onBeforeCompile = shader => patchVertex(shader, hair, `transformed += normal * ${width.toFixed(3)};`)
  material.customProgramCacheKey = () => `outline-${hair}-${width}`
  return material
}
const OUTLINE = outline()
const OUTLINE_HAIR = outline({ hair: true })

const catmull = (a, b, c, d, t) => 0.5 * ((2 * b) + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (3 * b - a - 3 * c + d) * t * t * t)

// Anillos elípticos a lo largo de una curva en el plano XY.
// Cada punto: x, y, z (opcional), h (radio en el plano de la curva), w (radio lateral), t (tono).
function loft(points, { radial = 24, sub = 6, under = 0 } = {}) {
  const key = (p, k, fallback) => p[k] ?? fallback
  const rings = []
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[Math.max(0, i - 1)], b = points[i], c = points[i + 1], d = points[Math.min(points.length - 1, i + 2)]
    for (let s = 0; s < sub; s++) {
      const t = s / sub
      const at = (k, fallback) => catmull(key(a, k, fallback), key(b, k, fallback), key(c, k, fallback), key(d, k, fallback), t)
      rings.push({ x: at("x", 0), y: at("y", 0), z: at("z", 0), h: Math.max(0.001, at("h", 0)), w: Math.max(0.001, at("w", 0)), t: at("t", 1) })
    }
  }
  const last = points[points.length - 1]
  rings.push({ x: last.x ?? 0, y: last.y ?? 0, z: last.z ?? 0, h: Math.max(0.001, last.h), w: Math.max(0.001, last.w), t: last.t ?? 1 })

  const positions = []
  const colors = []
  const weights = []
  rings.forEach((ring, r) => {
    const prev = rings[Math.max(0, r - 1)], next = rings[Math.min(rings.length - 1, r + 1)]
    let tx = next.x - prev.x, ty = next.y - prev.y
    const len = Math.hypot(tx, ty) || 1
    tx /= len; ty /= len
    const nx = -ty, ny = tx
    for (let a = 0; a < radial; a++) {
      const th = (a / radial) * Math.PI * 2
      const c = Math.cos(th), s = Math.sin(th)
      positions.push(ring.x + nx * ring.h * c, ring.y + ny * ring.h * c, ring.z + ring.w * s)
      const shade = ring.t * (1 - under * Math.max(0, c))
      colors.push(shade, shade, shade)
      weights.push(r / (rings.length - 1))
    }
  })

  const indices = []
  for (let r = 0; r < rings.length - 1; r++) {
    for (let a = 0; a < radial; a++) {
      const v = (ring, step) => ring * radial + (step % radial)
      indices.push(v(r, a), v(r, a + 1), v(r + 1, a), v(r, a + 1), v(r + 1, a + 1), v(r + 1, a))
    }
  }
  // Tapas en los extremos.
  const addCap = (ringIndex, flip) => {
    const ring = rings[ringIndex]
    const center = positions.length / 3
    positions.push(ring.x, ring.y, ring.z)
    colors.push(ring.t, ring.t, ring.t)
    weights.push(ringIndex ? 1 : 0)
    for (let a = 0; a < radial; a++) {
      const p = ringIndex * radial + a, q = ringIndex * radial + (a + 1) % radial
      if (flip) indices.push(center, p, q)
      else indices.push(center, q, p)
    }
  }
  addCap(0, false)
  addCap(rings.length - 1, true)

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3))
  geometry.setAttribute("aW", new THREE.Float32BufferAttribute(weights, 1))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

// Mechón curvo y afilado: base en (x, y), cae hacia atrás.
function lock(x, y, z, length, width, drop = 0.55, back = 0.8) {
  const pts = []
  const steps = 5
  for (let i = 0; i <= steps; i++) {
    const u = i / steps
    pts.push({
      x: x - back * length * u,
      y: y - drop * length * u * u + 0.1 * length * Math.sin(u * Math.PI),
      z,
      h: width * (1 - u * u) * (0.55 + 0.45 * Math.sin(Math.PI * Math.min(1, u + 0.25))) + 0.002,
      w: width * 0.55 * (1 - u) + 0.002
    })
  }
  return loft(pts, { radial: 8, sub: 3 })
}

let G = null
function geometries() {
  if (G) return G
  G = {}
  G.torso = loft([
    { x: -1.23, y: 1.54, h: 0.05, w: 0.05 },
    { x: -1.2, y: 1.52, h: 0.2, w: 0.18 },
    { x: -1.08, y: 1.5, h: 0.36, w: 0.34 },
    { x: -0.86, y: 1.5, h: 0.46, w: 0.44 },
    { x: -0.55, y: 1.53, h: 0.47, w: 0.45 },
    { x: -0.2, y: 1.5, h: 0.42, w: 0.42 },
    { x: 0.12, y: 1.47, h: 0.45, w: 0.43 },
    { x: 0.46, y: 1.46, h: 0.52, w: 0.41 },
    { x: 0.76, y: 1.5, h: 0.5, w: 0.35 },
    { x: 0.96, y: 1.56, h: 0.34, w: 0.26 },
    { x: 1.05, y: 1.6, h: 0.05, w: 0.05 }
  ], { radial: 36, sub: 7, under: 0.1 })

  G.neck = loft([
    { x: -0.12, y: -0.22, h: 0.4, w: 0.27 },
    { x: 0.08, y: 0.02, h: 0.37, w: 0.25 },
    { x: 0.28, y: 0.3, h: 0.29, w: 0.2 },
    { x: 0.46, y: 0.58, h: 0.22, w: 0.16 },
    { x: 0.6, y: 0.8, h: 0.17, w: 0.13 },
    { x: 0.68, y: 0.92, h: 0.04, w: 0.04 }
  ], { radial: 28, sub: 7, under: 0.07 })

  G.head = loft([
    { x: -0.2, y: 0.03, h: 0.03, w: 0.03 },
    { x: -0.15, y: 0.03, h: 0.15, w: 0.12 },
    { x: 0.0, y: 0.04, h: 0.2, w: 0.165 },
    { x: 0.18, y: 0.02, h: 0.2, w: 0.165 },
    { x: 0.36, y: 0.0, h: 0.155, w: 0.13 },
    { x: 0.52, y: -0.03, h: 0.12, w: 0.105 },
    { x: 0.66, y: -0.05, h: 0.105, w: 0.1 }
  ], { radial: 28, sub: 6 })

  // Hocico en un tono más claro: se pinta aparte.
  G.muzzle = loft([
    { x: 0.5, y: -0.03, h: 0.115, w: 0.1 },
    { x: 0.66, y: -0.05, h: 0.118, w: 0.112 },
    { x: 0.78, y: -0.06, h: 0.113, w: 0.11 },
    { x: 0.86, y: -0.07, h: 0.075, w: 0.08 },
    { x: 0.885, y: -0.07, h: 0.01, w: 0.01 }
  ], { radial: 24, sub: 5 })

  G.jaw = loft([
    { x: -0.02, y: -0.01, h: 0.02, w: 0.02 },
    { x: 0.06, y: -0.02, h: 0.065, w: 0.085 },
    { x: 0.26, y: -0.04, h: 0.05, w: 0.08 },
    { x: 0.4, y: -0.04, h: 0.04, w: 0.07 },
    { x: 0.46, y: -0.03, h: 0.008, w: 0.01 }
  ], { radial: 18, sub: 4 })

  G.tongue = loft([
    { x: 0.04, y: 0.02, h: 0.015, w: 0.04 },
    { x: 0.26, y: 0.02, h: 0.018, w: 0.05 },
    { x: 0.42, y: 0.0, h: 0.012, w: 0.035 }
  ], { radial: 10, sub: 3 })

  G.ear = loft([
    { x: 0, y: -0.02, h: 0.05, w: 0.035 },
    { x: 0.0, y: 0.08, h: 0.068, w: 0.042 },
    { x: -0.01, y: 0.19, h: 0.04, w: 0.027 },
    { x: -0.03, y: 0.27, h: 0.004, w: 0.004 }
  ], { radial: 12, sub: 4 })

  // Patas: hombro y brazo anchos que se afinan hasta la caña.
  G.foreUpper = loft([
    { x: -0.02, y: 0.28, h: 0.07, w: 0.08 },
    { x: 0, y: 0.1, h: 0.25, w: 0.15 },
    { x: 0, y: -0.12, h: 0.19, w: 0.125 },
    { x: 0, y: -0.36, h: 0.105, w: 0.085 },
    { x: 0, y: -0.56, h: 0.082, w: 0.07 }
  ], { radial: 18, sub: 5 })
  G.hindUpper = loft([
    { x: 0.02, y: 0.34, h: 0.08, w: 0.08 },
    { x: 0.04, y: 0.12, h: 0.3, w: 0.17 },
    { x: 0, y: -0.14, h: 0.25, w: 0.14 },
    { x: 0, y: -0.42, h: 0.12, w: 0.09 },
    { x: 0, y: -0.66, h: 0.08, w: 0.065 }
  ], { radial: 18, sub: 5 })
  G.cannon = loft([
    { x: 0.01, y: 0.05, h: 0.075, w: 0.07 },
    { x: 0.01, y: -0.03, h: 0.082, w: 0.072 },
    { x: 0, y: -0.14, h: 0.052, w: 0.05 },
    { x: 0, y: -0.34, h: 0.048, w: 0.046 },
    { x: 0, y: -0.43, h: 0.066, w: 0.058 },
    { x: 0, y: -0.48, h: 0.03, w: 0.03 }
  ], { radial: 14, sub: 4 })
  G.pastern = loft([
    { x: 0, y: 0.03, h: 0.056, w: 0.052 },
    { x: 0.03, y: -0.09, h: 0.06, w: 0.056 },
    { x: 0.05, y: -0.13, h: 0.05, w: 0.05 }
  ], { radial: 14, sub: 3 })
  G.hoof = loft([
    { x: 0.04, y: -0.09, h: 0.064, w: 0.066 },
    { x: 0.06, y: -0.15, h: 0.09, w: 0.085 },
    { x: 0.065, y: -0.2, h: 0.102, w: 0.092 },
    { x: 0.065, y: -0.215, h: 0.01, w: 0.01 }
  ], { radial: 14, sub: 3 })

  const locks = []
  const crest = [[-0.1, 0.2], [0.02, 0.34], [0.14, 0.48], [0.26, 0.62], [0.38, 0.75], [0.48, 0.87], [0.56, 0.97], [0.64, 1.06]]
  crest.forEach(([x, y], i) => {
    const len = 0.52 + (i % 2) * 0.1 + i * 0.012
    locks.push(lock(x, y, 0.05, len, 0.085, 0.5, 0.95))
    locks.push(lock(x + 0.05, y + 0.05, -0.05, len * 0.92, 0.078, 0.42, 1))
  })
  G.mane = mergeGeometries(locks)

  G.forelock = mergeGeometries([
    lock(0.0, 0.2, 0.03, 0.34, 0.06, -0.7, -0.75),
    lock(-0.02, 0.21, -0.03, 0.3, 0.055, -0.6, -0.85)
  ])

  const tailLocks = []
  for (let i = 0; i < 11; i++) {
    const a = (i / 11) * Math.PI * 2
    tailLocks.push(lock(0.02, Math.cos(a) * 0.05, Math.sin(a) * 0.05, 1.15 + (i % 3) * 0.1, 0.075, 0.95, 0.8))
  }
  G.tail = mergeGeometries(tailLocks)

  G.eyeSlit = new THREE.SphereGeometry(0.05, 14, 10)
  G.nostril = new THREE.SphereGeometry(0.024, 10, 8)

  return G
}

function add(parent, geometry, material, { hull = OUTLINE, x = 0, y = 0, z = 0 } = {}) {
  const mesh = new THREE.Mesh(geometry, material)
  mesh.position.set(x, y, z)
  if (hull) mesh.add(new THREE.Mesh(geometry, hull))
  parent.add(mesh)
  return mesh
}

function buildLeg(g, materials, { x, y, z, front }) {
  const top = new THREE.Group()
  top.position.set(x, y, z)
  add(top, front ? g.foreUpper : g.hindUpper, materials.coat)
  const mid = new THREE.Group()
  mid.position.y = front ? -0.56 : -0.66
  top.add(mid)
  add(mid, g.cannon, materials.sock)
  const low = new THREE.Group()
  low.position.y = -0.46
  mid.add(low)
  add(low, g.pastern, materials.sock)
  add(low, g.hoof, materials.hoof)
  return { top, mid, low, front }
}

export const COATS = [0xa8602a, 0x3a2620, 0xe9d8bd, 0xc98a3c, 0x6f7a8c, 0x8c3f2e, 0x54382a, 0xf0e6d6, 0x7a5c8e, 0xb5733f, 0x2c3a44, 0xd9a35c]
const MANES = [0x2a1a14, 0x0f0c12, 0xf7ecd6, 0xfff0c4, 0x2a2f3a, 0x21140f, 0x120d0c, 0xc9b79a, 0xf2d6ff, 0x2a1a14, 0xcfe3ee, 0x5a3418]
export const SILKS = [0xff2d6f, 0x18c5b6, 0xffc61a, 0x7b2ff7, 0x2f7bff, 0xff7a0f, 0x06d68c, 0xef476f, 0x1192c4, 0xf15bb5, 0x8fdc12, 0xfb5607]
const SOCKS = [true, false, false, true, false, true, false, false, true, false, true, true]

export function buildHorse(index) {
  const g = geometries()
  const coat = COATS[index % COATS.length]
  const mane = MANES[index % MANES.length]
  const silk = SILKS[index % SILKS.length]

  const coatColor = new THREE.Color(coat)
  const paler = coatColor.clone().lerp(new THREE.Color(0xfff4e2), 0.55).getHex()
  const materials = {
    coat: toon(coat, { vertexColors: true }),
    sock: toon(SOCKS[index % SOCKS.length] ? 0xfff6e8 : coat, { vertexColors: true }),
    hoof: toon(0x2b1c16, { vertexColors: true }),
    muzzle: toon(paler, { vertexColors: true }),
    mane: toon(mane, { hair: true, vertexColors: true })
  }

  const root = new THREE.Group()
  const body = new THREE.Group()
  root.add(body)
  add(body, g.torso, materials.coat)

  const neck = new THREE.Group()
  neck.position.set(0.72, 1.72, 0)
  neck.scale.set(0.88, 0.88, 1)
  body.add(neck)
  add(neck, g.neck, materials.coat)
  add(neck, g.mane, materials.mane, { hull: OUTLINE_HAIR })

  const head = new THREE.Group()
  head.position.set(0.66, 0.92, 0)
  head.rotation.z = -0.62
  neck.add(head)
  add(head, g.head, materials.coat)
  add(head, g.muzzle, materials.muzzle)
  add(head, g.forelock, materials.mane, { hull: OUTLINE_HAIR })

  // Mandíbula con pivote: la boca se abre en la recta final.
  const jaw = new THREE.Group()
  jaw.position.set(0.42, -0.135, 0)
  head.add(jaw)
  add(jaw, g.jaw, materials.muzzle)

  for (const side of [-1, 1]) {
    const ear = add(head, g.ear, materials.coat, { x: -0.1, y: 0.21, z: side * 0.1 })
    ear.rotation.x = side * 0.22
    ear.rotation.z = -0.15
    const nostril = new THREE.Mesh(g.nostril, new THREE.MeshBasicMaterial({ color: 0x2a161c }))
    nostril.position.set(0.81, -0.03, side * 0.083)
    nostril.scale.set(1.4, 0.9, 0.5)
    head.add(nostril)
  }

  // Ranuras brillantes del color del caballo: ojos de criatura, no de dibujo animado.
  const eyeMaterial = new THREE.MeshBasicMaterial({ color: new THREE.Color(silk).multiplyScalar(3.2) })
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(g.eyeSlit, eyeMaterial)
    eye.position.set(0.12, 0.07, side * 0.15)
    eye.scale.set(1.7, 0.5, 0.45)
    eye.rotation.z = 0.28
    head.add(eye)
  }

  const tail = new THREE.Group()
  tail.position.set(-1.2, 1.74, 0)
  body.add(tail)
  add(tail, g.tail, materials.mane, { hull: OUTLINE_HAIR })

  const legs = [
    { ...buildLeg(g, materials, { x: 0.68, y: 1.2, z: 0.23, front: true }), offset: 0.0 },
    { ...buildLeg(g, materials, { x: 0.68, y: 1.2, z: -0.23, front: true }), offset: 0.14 },
    { ...buildLeg(g, materials, { x: -0.82, y: 1.36, z: 0.25, front: false }), offset: 0.55 },
    { ...buildLeg(g, materials, { x: -0.82, y: 1.36, z: -0.25, front: false }), offset: 0.69 }
  ]
  legs.forEach(leg => body.add(leg.top))

  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(1, 28),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false })
  )
  shadow.rotation.x = -Math.PI / 2
  shadow.scale.set(1.7, 0.62, 1)
  shadow.position.y = 0.04
  root.add(shadow)

  root.rotation.y = 0
  const horse = { root, body, neck, head, jaw, tail, legs, shadow, silk, stride: index * 1.7 }
  horse.animate = (_dt, stride, speed, excite) => poseHorse(horse, stride, speed, excite)
  return horse
}

const lerp = (a, b, t) => a + (b - a) * t

// speed: 0 parado, 1 galope pleno. excite: 0 tranquilo, 1 desesperado.
export function poseHorse(h, stride, speed, excite) {
  const k = Math.min(1, speed)
  h.legs.forEach(leg => {
    const th = stride + leg.offset * Math.PI * 2
    if (leg.front) {
      leg.top.rotation.z = lerp(0.02, -0.08 + 0.72 * Math.sin(th), k)
      leg.mid.rotation.z = lerp(0, -Math.pow(Math.max(0, Math.sin(th + 1.25)), 1.4) * 1.55, k)
      leg.low.rotation.z = lerp(0, -Math.max(0, Math.sin(th + 2.1)) * 0.75 + 0.18 * Math.max(0, Math.sin(th - 0.7)), k)
    } else {
      leg.top.rotation.z = lerp(-0.2, -0.28 + 0.62 * Math.sin(th), k)
      leg.mid.rotation.z = lerp(0.2, 0.18 + Math.pow(Math.max(0, Math.sin(th + 1.0)), 1.4) * 1.05, k)
      leg.low.rotation.z = lerp(0, -Math.max(0, Math.sin(th + 2.2)) * 0.8 + 0.15 * Math.max(0, Math.sin(th - 0.4)), k)
    }
  })
  h.body.position.y = Math.abs(Math.sin(stride)) * 0.3 * k
  h.body.rotation.z = Math.sin(stride + 0.7) * 0.075 * k
  h.neck.rotation.z = lerp(0.05, -0.5 - Math.sin(stride + 1.3) * 0.16 - excite * 0.14, k)
  h.head.rotation.z = lerp(-0.62, -0.28 + Math.sin(stride + 0.5) * 0.1, k)
  h.tail.rotation.z = lerp(0.1, 0.55 + Math.sin(stride * 0.5) * 0.14, k)
  h.jaw.rotation.z = -(0.06 + excite * 0.55 + Math.max(0, Math.sin(stride)) * 0.1 * k)
  h.shadow.scale.x = 1.7 - h.body.position.y * 0.7
}
