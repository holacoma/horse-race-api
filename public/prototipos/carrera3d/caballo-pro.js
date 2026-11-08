// Caballo con galope hecho por un artista (tres.js, Horse.glb; licencia sin confirmar: solo para probar).
// El modelo trae pocos polígonos, así que se subdivide y se suaviza cada cuadro de su animación.
import * as THREE from "three"
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js"
import { buildFire } from "./fuego.js"
import { outline } from "./caballo.js"

// Cada caballo es un elemento y arde en su color. Los colores son de la identidad visual (/css/identidad.css,
// --caballo-<elemento>): el mismo en la escena, la lista, el mapa y las etiquetas. Sin ese CSS, cae al de respaldo.
const identity = name => {
  const value = getComputedStyle(document.documentElement).getPropertyValue(`--caballo-${name.toLowerCase()}`).trim()
  return /^#[0-9a-f]{6}$/i.test(value) ? parseInt(value.slice(1), 16) : null
}
export const ELEMENTS = [
  ["Fuego", 0xfe6a00], ["Hielo", 0x00e5fe], ["Electricidad", 0xb96ff7], ["Agua", 0x00abff],
  ["Viento", 0x00f3cd], ["Roca", 0xfeb200], ["Sombra", 0xfa5576], ["Luz", 0xffffff],
  ["Veneno", 0xd9db00], ["Metal", 0x7a8cff], ["Naturaleza", 0x76f173], ["Cosmos", 0xe45cbf]
].map(([name, fallback]) => ({ name, outer: identity(name) ?? fallback }))

const HEIGHT = 2.5 // metros, de los cascos a las orejas
const LEVELS = 2
const HEADING = Math.PI / 2 // el modelo mira hacia +z; la carrera corre hacia +x
const LEG_CUT = 75 // altura de la panza en unidades del modelo

// Reposo, en unidades del modelo sobre la pose original: dónde gira el cuello y dónde nace la cola.
const REST = {
  neck: { fromZ: 45, toZ: 85, aboveY: 85, pivotY: 120, pivotZ: 50 },
  tail: { fromZ: -118, toZ: -150, aboveY: 100, pivotY: 140, pivotZ: -122 }
}

// Parado, el caballo no se queda quieto: sube y baja la cabeza, mira a los lados y a veces la sacude;
// la cola cuelga y espanta moscas; cada tanto patea el suelo con una mano. Pesos por zona en aRest.
const REST_GLSL = `
  attribute vec3 aRest;
  uniform float uRest, uRestT;
  uniform vec2 uNeck, uTailRoot;
  uniform vec4 uPaw; // codo (y, z) y rodilla (y, z)
  vec2 restTurn(vec2 v, float a) { float c = cos(a), s = sin(a); return vec2(c * v.x - s * v.y, s * v.x + c * v.y); }
  // point: 1 para posiciones, 0 para normales (solo giran).
  vec3 restBend(vec3 p, float point) {
    if (uRest <= 0.0) return p;
    float t = uRestT;
    float paw = uRest * aRest.z * smoothstep(0.45, 1.0, sin(t * 0.43)) * (0.5 - 0.5 * cos(t * 6.0));
    if (paw > 0.0) {
      float lower = smoothstep(uPaw.z + 6.0, uPaw.z - 6.0, position.y);
      vec2 knee = uPaw.zw * point;
      p.yz = knee + restTurn(p.yz - knee, 1.3 * paw * lower);
      vec2 elbow = uPaw.xy * point;
      p.yz = elbow + restTurn(p.yz - elbow, -0.45 * paw);
    }
    float head = uRest * aRest.x;
    if (head > 0.0) {
      float down = 0.1 + 0.07 * sin(t * 1.1) + 0.38 * smoothstep(0.3, 1.0, sin(t * 0.19 + 2.0));
      float shake = 0.16 * pow(max(0.0, sin(t * 0.57 + 1.0)), 40.0) * sin(t * 17.0);
      float look = 0.32 * sin(t * 0.31) + 0.06 * sin(t * 1.7);
      vec2 neck = uNeck * point;
      p.yz = neck + restTurn(p.yz - neck, (down + shake) * head);
      vec2 neckXZ = vec2(0.0, uNeck.y) * point;
      p.xz = neckXZ + restTurn(p.xz - neckXZ, look * head);
    }
    float tail = uRest * aRest.y;
    if (tail > 0.0) {
      float swish = 0.55 * sin(t * 2.3 + 1.5 * sin(t * 0.7)) * (0.5 + 0.5 * sin(t * 0.37));
      vec2 root = uTailRoot * point;
      p.yz = root + restTurn(p.yz - root, -1.05 * tail);
      vec2 rootXZ = vec2(0.0, uTailRoot.y) * point;
      p.xz = rootXZ + restTurn(p.xz - rootXZ, swish * tail);
    }
    return p;
  }
`

// El mismo reposo en JS, para los puntos de la crin y la cola de donde salen las llamas (sin la mano que patea).
const turn = (p, a, b, pa, pb, angle) => {
  const c = Math.cos(angle), s = Math.sin(angle), u = p[a] - pa, v = p[b] - pb
  p[a] = pa + c * u - s * v
  p[b] = pb + s * u + c * v
}
function restPoint(p, headWeight, tailWeight, rest, t) {
  const head = rest * headWeight
  if (head > 0) {
    const down = 0.1 + 0.07 * Math.sin(t * 1.1) + 0.38 * smoothstep(0.3, 1, Math.sin(t * 0.19 + 2))
    const shake = 0.16 * Math.pow(Math.max(0, Math.sin(t * 0.57 + 1)), 40) * Math.sin(t * 17)
    const look = 0.32 * Math.sin(t * 0.31) + 0.06 * Math.sin(t * 1.7)
    turn(p, 1, 2, REST.neck.pivotY, REST.neck.pivotZ, (down + shake) * head)
    turn(p, 0, 2, 0, REST.neck.pivotZ, look * head)
  }
  const tail = rest * tailWeight
  if (tail > 0) {
    const swish = 0.55 * Math.sin(t * 2.3 + 1.5 * Math.sin(t * 0.7)) * (0.5 + 0.5 * Math.sin(t * 0.37))
    turn(p, 1, 2, REST.tail.pivotY, REST.tail.pivotZ, -1.05 * tail)
    turn(p, 0, 2, 0, REST.tail.pivotZ, swish * tail)
  }
}

// Se suma a lo que ya hace el material (fuego, contorno), después de aplicar el galope.
function withRest(material, uniforms) {
  const previous = material.onBeforeCompile
  const key = material.customProgramCacheKey
  material.onBeforeCompile = (shader, renderer) => {
    previous.call(material, shader, renderer)
    Object.assign(shader.uniforms, uniforms)
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\n${REST_GLSL}`)
      .replace("#include <morphnormal_vertex>", "#include <morphnormal_vertex>\nobjectNormal = restBend(objectNormal, 0.0);")
      .replace("#include <morphtarget_vertex>", "#include <morphtarget_vertex>\ntransformed = restBend(transformed, 1.0);")
  }
  material.customProgramCacheKey = () => `${key.call(material)}-reposo`
  return material
}

// Une los vértices repetidos: si no, la subdivisión abre grietas en las costuras.
function weld(poses, index) {
  const count = poses[0].length / 3
  const seen = new Map()
  const remap = new Int32Array(count)
  const kept = []
  for (let i = 0; i < count; i++) {
    const key = [poses[0], poses[1]].flatMap(p => [p[i * 3], p[i * 3 + 1], p[i * 3 + 2]].map(v => Math.round(v * 100))).join()
    if (!seen.has(key)) {
      seen.set(key, kept.length)
      kept.push(i)
    }
    remap[i] = seen.get(key)
  }
  const welded = poses.map(pose => {
    const out = new Float32Array(kept.length * 3)
    kept.forEach((old, i) => out.set(pose.subarray(old * 3, old * 3 + 3), i * 3))
    return out
  })
  return { poses: welded, index: Array.from(index, i => remap[i]) }
}

// Una pasada de subdivisión de Loop, con los mismos pesos en todos los cuadros de la animación.
function loopSubdivide({ poses, index }) {
  const count = poses[0].length / 3
  const edges = new Map()
  const neighbors = Array.from({ length: count }, () => new Set())
  const edge = (a, b, opposite) => {
    const key = a < b ? a * count + b : b * count + a
    let e = edges.get(key)
    if (!e) {
      e = { id: count + edges.size, a, b, opposite: [] }
      edges.set(key, e)
    }
    e.opposite.push(opposite)
    neighbors[a].add(b)
    neighbors[b].add(a)
    return e.id
  }
  const nextIndex = []
  for (let t = 0; t < index.length; t += 3) {
    const a = index[t], b = index[t + 1], c = index[t + 2]
    const ab = edge(a, b, c), bc = edge(b, c, a), ca = edge(c, a, b)
    nextIndex.push(a, ab, ca, b, bc, ab, c, ca, bc, ab, bc, ca)
  }
  const list = [...edges.values()]
  const nextPoses = poses.map(pose => {
    const out = new Float32Array((count + list.length) * 3)
    for (let v = 0; v < count; v++) {
      const k = neighbors[v].size
      const beta = k > 3 ? 3 / (8 * k) : 3 / 16
      for (let axis = 0; axis < 3; axis++) {
        let sum = 0
        neighbors[v].forEach(n => { sum += pose[n * 3 + axis] })
        out[v * 3 + axis] = pose[v * 3 + axis] * (1 - k * beta) + sum * beta
      }
    }
    list.forEach(e => {
      for (let axis = 0; axis < 3; axis++) {
        const a = pose[e.a * 3 + axis], b = pose[e.b * 3 + axis]
        out[e.id * 3 + axis] = e.opposite.length === 2
          ? 0.375 * (a + b) + 0.125 * (pose[e.opposite[0] * 3 + axis] + pose[e.opposite[1] * 3 + axis])
          : 0.5 * (a + b)
      }
    })
    return out
  })
  return { poses: nextPoses, index: nextIndex }
}

function vertexNormals(pose, index) {
  const normals = new Float32Array(pose.length)
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3()
  for (let t = 0; t < index.length; t += 3) {
    const i = index[t], j = index[t + 1], k = index[t + 2]
    a.fromArray(pose, i * 3)
    b.fromArray(pose, j * 3).sub(a)
    c.fromArray(pose, k * 3).sub(a)
    n.crossVectors(b, c)
    for (const v of [i, j, k]) {
      normals[v * 3] += n.x
      normals[v * 3 + 1] += n.y
      normals[v * 3 + 2] += n.z
    }
  }
  for (let v = 0; v < normals.length; v += 3) {
    n.fromArray(normals, v).normalize().toArray(normals, v)
  }
  return normals
}

export async function loadHorseModel(url = "/prototipos/modelos/Horse.glb") {
  const gltf = await new GLTFLoader().loadAsync(url)
  let source
  gltf.scene.traverse(node => { if (node.isMesh) source = node })
  const geo = source.geometry
  const base = geo.attributes.position.array
  const relative = geo.morphTargetsRelative
  const poses = [
    Float32Array.from(base),
    ...geo.morphAttributes.position.map(target => {
      const out = new Float32Array(base.length)
      for (let i = 0; i < base.length; i++) out[i] = target.array[i] + (relative ? base[i] : 0)
      return out
    })
  ]

  let mesh = weld(poses, geo.index.array)

  // La pose base pasa a ser la de pie: parado, con el galope apagado, queda así. La original se guarda como
  // referencia (aRef): las zonas del fuego y del reposo se ubican sobre ella.
  const ref = mesh.poses[0]
  const stand = standingPose(mesh.poses, mesh.index)
  const restWeights = new Float32Array(ref.length)
  for (let i = 0; i < ref.length / 3; i++) {
    const y = ref[i * 3 + 1], z = ref[i * 3 + 2]
    restWeights[i * 3] = smoothstep(REST.neck.fromZ, REST.neck.toZ, z) * smoothstep(REST.neck.aboveY, REST.neck.aboveY + 25, y)
    restWeights[i * 3 + 1] = smoothstep(REST.tail.fromZ, REST.tail.toZ, z) * smoothstep(REST.tail.aboveY, REST.tail.aboveY + 18, y)
  }
  stand.paw.weights.forEach((w, i) => { restWeights[i * 3 + 2] = w })
  mesh.poses = [stand.pose, ...mesh.poses.slice(1), ref, restWeights]

  for (let level = 0; level < LEVELS; level++) mesh = loopSubdivide(mesh)
  const weights = mesh.poses.pop()
  const reference = mesh.poses.pop()
  const normals = mesh.poses.map(pose => vertexNormals(pose, mesh.index))

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute("position", new THREE.BufferAttribute(mesh.poses[0], 3))
  geometry.setAttribute("normal", new THREE.BufferAttribute(normals[0], 3))
  geometry.setAttribute("aRef", new THREE.BufferAttribute(reference, 3))
  geometry.setAttribute("aRest", new THREE.BufferAttribute(weights, 3))
  geometry.setIndex(mesh.index)
  geometry.morphTargetsRelative = true
  const delta = (pose, from) => {
    const out = new Float32Array(pose.length)
    for (let i = 0; i < pose.length; i++) out[i] = pose[i] - from[i]
    return new THREE.BufferAttribute(out, 3)
  }
  geometry.morphAttributes.position = mesh.poses.slice(1).map(pose => delta(pose, mesh.poses[0]))
  geometry.morphAttributes.normal = normals.slice(1).map(normal => delta(normal, normals[0]))
  geometry.computeBoundingSphere()
  geometry.boundingSphere.radius *= 1.3 // las patas salen de la pose base al galopar

  // Medido sobre la pose original: el cálculo de three suma las deformaciones de la animación y da de más.
  const box = new THREE.Box3().setFromBufferAttribute(geometry.attributes.aRef)
  // La animación apunta a la malla original del archivo; sin esto, en las mallas nuevas no mueve nada.
  const clip = gltf.animations[0]
  clip.tracks.forEach(track => { track.name = ".morphTargetInfluences" })
  return {
    geometry,
    clip,
    joints: {
      uNeck: { value: new THREE.Vector2(REST.neck.pivotY, REST.neck.pivotZ) },
      uTailRoot: { value: new THREE.Vector2(REST.tail.pivotY, REST.tail.pivotZ) },
      uPaw: { value: stand.paw.joints }
    },
    stand: stand.report,
    scale: HEIGHT / (box.max.y - box.min.y),
    centerZ: (box.max.z + box.min.z) / 2
  }
}

const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

// Debajo de la panza cada pata es una pieza aparte de la malla.
function legPieces(ref, index) {
  const count = ref.length / 3
  const parent = Int32Array.from({ length: count }, (_, i) => i)
  const find = i => {
    while (parent[i] !== i) i = parent[i] = parent[parent[i]]
    return i
  }
  const low = i => ref[i * 3 + 1] < LEG_CUT
  for (let t = 0; t < index.length; t += 3) {
    const tri = [index[t], index[t + 1], index[t + 2]]
    for (let k = 0; k < 3; k++) {
      const a = tri[k], b = tri[(k + 1) % 3]
      if (low(a) && low(b)) parent[find(a)] = find(b)
    }
  }
  const groups = new Map()
  for (let i = 0; i < count; i++) {
    if (!low(i)) continue
    const root = find(i)
    if (!groups.has(root)) groups.set(root, [])
    groups.get(root).push(i)
  }
  return [...groups.values()].sort((a, b) => b.length - a.length).slice(0, 4)
}

// Ningún cuadro del galope tiene las cuatro patas apoyadas. La pose de pie usa el cuerpo de la pose original y
// cada pata del cuadro en que queda más vertical y llega al suelo, corrida para que siga pegada al cuerpo.
function standingPose(poses, index) {
  const ref = poses[0]
  const out = Float32Array.from(ref)
  const y = (pose, i) => pose[i * 3 + 1]
  let ground = Infinity
  for (let i = 1; i < ref.length; i += 3) ground = Math.min(ground, ref[i])
  const mean = (pose, ids) => [0, 1, 2].map(axis => ids.reduce((s, i) => s + pose[i * 3 + axis], 0) / ids.length)
  const report = []
  const legs = legPieces(ref, index).map(leg => {
    const topY = Math.max(...leg.map(i => y(ref, i)))
    const top = leg.filter(i => y(ref, i) > topY - 12)
    const anchor = mean(ref, top)
    let best = null
    poses.forEach((pose, frame) => {
      const hoof = leg.reduce((a, b) => (y(pose, b) < y(pose, a) ? b : a))
      const at = mean(pose, top)
      const shift = anchor.map((v, axis) => v - at[axis])
      const reach = ground - (y(pose, hoof) + shift[1]) // cuánto hay que estirarla (+) o encogerla (-) para que apoye
      const lean = Math.atan2(pose[hoof * 3 + 2] - at[2], at[1] - y(pose, hoof)) * 57.3
      const score = Math.abs(lean) + Math.abs(reach) * 1.5
      if (!best || score < best.score) best = { score, pose, frame, hoof, at, shift, reach, lean }
    })
    const { pose, hoof, at, shift, reach } = best
    const span = Math.max(1, at[1] - y(pose, hoof))
    const blend = []
    leg.forEach(i => {
      const along = Math.min(1, Math.max(0, (y(pose, i) - y(pose, hoof)) / span)) // 0 en el casco, 1 arriba
      const keep = smoothstep(topY - 22, topY - 4, y(ref, i)) // pegada al cuerpo, sin costura
      blend.push(1 - keep)
      for (let axis = 0; axis < 3; axis++) {
        const moved = pose[i * 3 + axis] + shift[axis] + (axis === 1 ? reach * (1 - along) : 0)
        out[i * 3 + axis] = moved + (ref[i * 3 + axis] - moved) * keep
      }
    })
    report.push(`cuadro ${best.frame} inclinación ${best.lean.toFixed(0)}° ajuste ${reach.toFixed(1)}`)
    return { leg, blend, z: mean(ref, leg)[2], x: mean(ref, leg)[0] }
  })

  // La mano que patea: la delantera izquierda. Codo arriba de la pata y rodilla a 4 de 10 desde el casco.
  const front = legs.filter(l => l.z > 0).sort((a, b) => b.x - a.x)[0]
  const elbow = mean(out, front.leg.filter(i => y(ref, i) > Math.max(...front.leg.map(j => y(ref, j))) - 12))
  const hoofY = Math.min(...front.leg.map(i => y(out, i)))
  const kneeY = hoofY + (elbow[1] - hoofY) * 0.4
  const nearKnee = front.leg.filter(i => Math.abs(y(out, i) - kneeY) < 6)
  const weights = new Float32Array(ref.length / 3)
  front.leg.forEach((i, k) => { weights[i] = front.blend[k] })
  return {
    pose: out,
    report,
    paw: { weights, joints: new THREE.Vector4(elbow[1], elbow[2], kneeY, mean(out, nearKnee)[2]) }
  }
}

export function buildProHorse(model, index) {
  const element = ELEMENTS[index % ELEMENTS.length]
  const root = new THREE.Group()
  const holder = new THREE.Group()
  holder.rotation.y = HEADING
  holder.scale.setScalar(model.scale)
  holder.position.x = -model.centerZ * model.scale
  root.add(holder)

  const fire = buildFire(model, element)
  // Cada caballo descansa a su ritmo: el reloj arranca corrido.
  const rest = { uRest: { value: 1 }, uRestT: { value: index * 7.3 }, ...model.joints }
  const weights = model.geometry.attributes.aRest.array
  const bend = (vertex, p) => restPoint(p, weights[vertex * 3], weights[vertex * 3 + 1], rest.uRest.value, rest.uRestT.value)
  const mesh = new THREE.Mesh(model.geometry, withRest(fire.material, rest))
  holder.add(mesh)
  root.add(fire.flames)
  root.add(fire.eyes)
  const hull = new THREE.Mesh(model.geometry, withRest(outline({ width: 0.02 / model.scale, color: fire.edge.clone().multiplyScalar(0.9), grow: true }), rest))
  hull.morphTargetInfluences = mesh.morphTargetInfluences
  hull.morphTargetDictionary = mesh.morphTargetDictionary
  mesh.add(hull)

  const mixer = new THREE.AnimationMixer(mesh)
  const action = mixer.clipAction(model.clip)
  action.play()
  action.time = (index * 0.37) % model.clip.duration

  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(1, 28),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false })
  )
  shadow.rotation.x = -Math.PI / 2
  shadow.scale.set(1.9, 0.6, 1)
  shadow.position.y = 0.04
  root.add(shadow)

  return {
    root, silk: element.outer, element: element.name.toLowerCase(), stride: 0,
    // El tranco sigue a la velocidad, con tope para que se lea a 400 km/h. Parado, el galope se apaga y queda
    // la pose de pie, con el reposo encima.
    animate(dt, _stride, _speed, _excite, metersPerSecond) {
      const moving = Math.min(1, metersPerSecond / 4)
      action.setEffectiveWeight(moving)
      action.setEffectiveTimeScale(Math.min(2.2, Math.max(0.4, metersPerSecond / 14)))
      mixer.update(dt)
      rest.uRest.value = 1 - moving
      rest.uRestT.value += dt
      fire.update(dt, action.time / model.clip.duration, metersPerSecond, mesh.morphTargetInfluences, bend)
    },
    setFire: fire.set
  }
}
