import { Mesh, Uniform } from './three.module.js'

import loadWaterGeometry from './load-water-geometry.js'
import loadWaterMaterial from './load-water-material.js'
import loadWaterTexture from './load-water-texture.js'

import parseH2O from './parse-h2o.js'

import Registry from './registry.js'
import Viewer from './viewer.js'

export default async function() {
  const meshes = []

  if (Viewer.mission.AGUA) {
    const data = parseH2O(await Registry.read(Viewer.mission.AGUA))
    const texture = loadWaterTexture(data.textures[0].image)

    for (const geom of data.geometries) {
      const material = loadWaterMaterial()
      material.transparent = true
      material.depthWrite = false
      material.uniforms.uTime = Viewer.timeUniform
      material.uniforms.uTexture = new Uniform(texture)
      material.uniforms.uDirection = new Uniform(geom.direction.subarray(0, 2))

      const geometry = loadWaterGeometry(geom.vertices, geom.indices)
      const mesh = new Mesh(geometry, material)

      meshes.push(mesh)

      Viewer.resources.add(texture)
      Viewer.resources.add(material)
      Viewer.resources.add(geometry)
    }
  }

  return meshes
}
