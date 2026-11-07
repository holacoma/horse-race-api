// Caballo con galope hecho por un artista (tres.js, Horse.glb; licencia sin confirmar: solo para probar).
// El modelo trae pocos polígonos, así que se subdivide y se suaviza cada cuadro de su animación.
import * as THREE from "three"
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js"
import { buildFire } from "./fuego.js"
import { outline, toon } from "./caballo.js"

// Cada caballo es un elemento, con un color adentro y otro afuera. Por ahora, solo color.
export const ELEMENTS = [
  { name: "Fuego", inner: 0x3a0800, outer: 0xff7a14, fire: true },
  { name: "Hielo", inner: 0x0a2c5c, outer: 0x86ecff },
  { name: "Electricidad", inner: 0x170838, outer: 0xb78cff },
  { name: "Agua", inner: 0x00284a, outer: 0x2fa0ff },
  { name: "Viento", inner: 0x0a3026, outer: 0x6dffbe },
  { name: "Roca", inner: 0x221712, outer: 0xe0aa62 },
  { name: "Sombra", inner: 0x0c0614, outer: 0xff2d6f },
  { name: "Luz", inner: 0x4a3606, outer: 0xfff0a6 },
  { name: "Veneno", inner: 0x102e06, outer: 0xb0ff1c },
  { name: "Metal", inner: 0x1c2230, outer: 0xdbe7f5 },
  { name: "Naturaleza", inner: 0x113012, outer: 0x58dc40 },
  { name: "Cosmos", inner: 0x180c36, outer: 0xff6ae6 }
]

const HEIGHT = 2.5 // metros, de los cascos a las orejas
const LEVELS = 2
const HEADING = Math.PI / 2 // el modelo mira hacia +z; la carrera corre hacia +x

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

  // Pose de reposo: el cuadro del galope con las patas más juntas. Parado no se queda a mitad de un salto.
  const stride = pose => {
    let min = Infinity, max = -Infinity
    for (let i = 2; i < pose.length; i += 3) { min = Math.min(min, pose[i]); max = Math.max(max, pose[i]) }
    return max - min
  }
  const lengths = mesh.poses.map(stride)
  const idle = lengths.indexOf(Math.min(...lengths)) - 1 // -1 es la pose base, que no es un cuadro

  for (let level = 0; level < LEVELS; level++) mesh = loopSubdivide(mesh)
  const normals = mesh.poses.map(pose => vertexNormals(pose, mesh.index))

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute("position", new THREE.BufferAttribute(mesh.poses[0], 3))
  geometry.setAttribute("normal", new THREE.BufferAttribute(normals[0], 3))
  geometry.setIndex(mesh.index)
  geometry.morphTargetsRelative = true
  const delta = (pose, reference) => {
    const out = new Float32Array(pose.length)
    for (let i = 0; i < pose.length; i++) out[i] = pose[i] - reference[i]
    return new THREE.BufferAttribute(out, 3)
  }
  geometry.morphAttributes.position = mesh.poses.slice(1).map(pose => delta(pose, mesh.poses[0]))
  geometry.morphAttributes.normal = normals.slice(1).map(normal => delta(normal, normals[0]))
  geometry.computeBoundingSphere()
  geometry.boundingSphere.radius *= 1.3 // las patas salen de la pose base al galopar

  // Medido sobre la pose base: el cálculo de three suma las deformaciones de la animación y da de más.
  const box = new THREE.Box3().setFromBufferAttribute(geometry.attributes.position)
  // La animación apunta a la malla original del archivo; sin esto, en las mallas nuevas no mueve nada.
  const clip = gltf.animations[0]
  clip.tracks.forEach(track => { track.name = ".morphTargetInfluences" })
  return {
    geometry,
    clip,
    idle,
    scale: HEIGHT / (box.max.y - box.min.y),
    centerZ: (box.max.z + box.min.z) / 2
  }
}

export function buildProHorse(model, index) {
  const element = ELEMENTS[index % ELEMENTS.length]
  const outer = new THREE.Color(element.outer)
  const root = new THREE.Group()
  const holder = new THREE.Group()
  holder.rotation.y = HEADING
  holder.scale.setScalar(model.scale)
  holder.position.x = -model.centerZ * model.scale
  root.add(holder)

  const fire = element.fire ? buildFire(model, element, outer) : null
  const mesh = new THREE.Mesh(model.geometry, fire ? fire.material : toon(element.inner, { rim: outer }))
  holder.add(mesh)
  if (fire) root.add(fire.flames)
  let idleAdded = 0
  const hull = new THREE.Mesh(model.geometry, outline({ width: 0.02 / model.scale, color: outer.clone().multiplyScalar(1.8), grow: true }))
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
    root, silk: element.outer, stride: 0,
    // El tranco sigue a la velocidad, con tope para que se lea a 400 km/h. Parado, pasa a la pose de reposo.
    animate(dt, _stride, _speed, _excite, metersPerSecond) {
      const moving = Math.min(1, metersPerSecond / 4)
      action.setEffectiveWeight(moving)
      action.setEffectiveTimeScale(Math.min(2.2, Math.max(0.4, metersPerSecond / 14)))
      // Si el resultado no cambia, el mezclador no reescribe las influencias: lo sumado antes hay que sacarlo a mano.
      // Sin esto, parado se acumula cuadro a cuadro y el caballo se infla sin límite.
      if (model.idle >= 0) mesh.morphTargetInfluences[model.idle] -= idleAdded
      mixer.update(dt)
      idleAdded = 1 - moving
      if (model.idle >= 0) mesh.morphTargetInfluences[model.idle] += idleAdded
      fire?.update(dt, action.time / model.clip.duration, metersPerSecond, mesh.morphTargetInfluences)
    },
    setFire: fire?.set
  }
}
