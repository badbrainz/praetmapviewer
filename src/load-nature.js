import {
  DoubleSide,
  Group,
  InstancedMesh,
  Object3D,
  Uniform
} from './three.module.js'

import loadNatureGeometry from './load-nature-geometry.js'
import loadNatureMaterial from './load-nature-material.js'
import loadNatureTexture from './load-nature-texture.js'
import loadNatureWind from './load-nature-wind.js'

import parseMOB from './parse-mob.js'
import parsePBA, { MaterialType } from './parse-pba.js'
import parsePTX from './parse-ptx.js'

import Registry from './registry.js'
import Viewer from './viewer.js'

export default async function() {
  const objects = parseMOB(await Registry.read(Viewer.mission.OBJETOS))

  const pbaMap = new Map()
  const ptxMap = new Map()
  const ptxNames = new Set()

  const instanceMap = new Map()
  const instanceNames = new Set(objects.map(o => o.name.toLowerCase()))

  for (const name of instanceNames) {
    pbaMap.set(name, Registry.read(`/${name}.pba`).then(parsePBA))
    instanceMap.set(name, [])
  }

  for (const obj of objects) {
    instanceMap.get(obj.name.toLowerCase()).push(obj)
  }

  for (const [name, value] of pbaMap) {
    const pba = await value
    pba.textures.forEach(t => ptxNames.add(t.toLowerCase()))
    pbaMap.set(name, pba)
  }

  for (const name of ptxNames) {
    ptxMap.set(name, Registry.read(`/${name}.ptx`).then(parsePTX).then(loadNatureTexture))
  }

  const opaqueGroup = new Group()
  const shadowGroup = new Group()
  const alphaGroup = new Group()
  const alphaTestGroup = new Group()

  const nodes = [
    shadowGroup,
    opaqueGroup,
    alphaTestGroup,
    alphaGroup
  ]

  nodes.forEach((n, i) => n.renderOrder = i)

  const meshDummy = new Object3D()
  const instanceDummy = new Object3D()

  const modelNames = [...pbaMap.keys()]
  modelNames.sort()

  for (const modelName of modelNames) {
    const model = pbaMap.get(modelName)

    const pbaMesh = model.meshes[0]
    const pbaGeom = pbaMesh.geometry
    const transform = model.transforms.find(t => t.name == pbaMesh.name)
    const textures = model.textures.map(t => ptxMap.get(t.toLowerCase()))

    if (transform) {
      const [x, y, z] = transform.translation
      const [rw, rx, ry, rz] = transform.rotation
      meshDummy.position.set(x, y, z)
      meshDummy.quaternion.set(rx, ry, rz, rw)
      meshDummy.updateMatrix()
    }

    const instanceObject = instanceMap.get(modelName)
    const instanceCount = instanceObject.length
    const instanceWind = loadNatureWind(instanceObject)

    const instances = [...instanceObject]
    instances.sort((a, b) => b.position[2] - a.position[2])

    for (const [index, surface] of pbaGeom.surfaces.entries()) {
      const texture = await (textures[surface.textureID] || textures[0])

      const material = loadNatureMaterial()
      material.uniforms.uTime = Viewer.timeUniform
      material.uniforms.uTexture = new Uniform(texture)
      material.side = DoubleSide
      material.transparent = true

      const geometry = loadNatureGeometry(pbaGeom.vertices[index], surface.indices)
      geometry.setAttribute('aWind', instanceWind)

      const mesh = new InstancedMesh(geometry, material, instanceCount)
      mesh.name = pbaMesh.name

      for (const [i, obj] of instances.entries()) {
        instanceDummy.position.set(...obj.position)
        instanceDummy.rotation.y = obj.orientation
        instanceDummy.updateMatrix()
        instanceDummy.matrix.multiply(meshDummy.matrix)
        mesh.setMatrixAt(i, instanceDummy.matrix)
      }

      switch (surface.materialFlags) {
        case MaterialType.ALPHATEST:
        alphaTestGroup.add(mesh)
        break
        case MaterialType.ALPHA:
        alphaGroup.add(mesh)
        material.depthTest = false
        break
        case MaterialType.SHADOW:
        shadowGroup.add(mesh)
        material.depthWrite = false
        material.depthTest = false
        break
        default:
        opaqueGroup.add(mesh)
        break
      }

      Viewer.resources.add(texture)
      Viewer.resources.add(material)
      Viewer.resources.add(geometry)
    }
  }

  return nodes
}
