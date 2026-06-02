import React, { Suspense, useLayoutEffect, useMemo, useRef } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { Billboard, Center, Grid, OrbitControls, SpotLight, Text3D } from '@react-three/drei'
import helvetikerFontUrl from 'three/examples/fonts/helvetiker_regular.typeface.json?url'
import { Bloom, EffectComposer } from '@react-three/postprocessing'
import * as THREE from 'three'
import {
  LightingConfiguration,
  DmxFixture,
  FixtureTypes,
  RgbMovingHeadDmxChannels,
  RgbwMovingHeadDmxChannels,
  ConfigStrobeType,
} from '../../../photonics-dmx/types'
import { getDmxPreviewLightColor } from './dmxPreviewLightColor'
import {
  panTiltDmxToStageVector,
  staticWashBeamDirection,
  type StageVector3,
} from './lightsDmxPreview3DMath'

export interface LightsDmxPreview3DProps {
  lightingConfig: LightingConfiguration
  dmxValues: Record<number, number>
}

const MH_TYPES = new Set([FixtureTypes.RGBMH, FixtureTypes.RGBWMH])

function isMovingHead(light: DmxFixture): boolean {
  return MH_TYPES.has(light.fixture)
}

function masterDimmer01(light: DmxFixture, dmxValues: Record<number, number>): number {
  const d = dmxValues[light.channels.masterDimmer] ?? 0
  return Math.max(0, Math.min(1, d / 255))
}

function fixtureMount(light: DmxFixture): 'floor' | 'ceiling' {
  return light.mount === 'ceiling' ? 'ceiling' : 'floor'
}

function rgbToThreeColor(rgb: { r: number; g: number; b: number }): THREE.Color {
  return new THREE.Color(rgb.r / 255, rgb.g / 255, rgb.b / 255)
}

function createFlareTexture(): THREE.Texture {
  const size = 128
  if (typeof document === 'undefined') {
    const data = new Uint8Array([255, 255, 255, 200])
    const tex = new THREE.DataTexture(data, 1, 1, THREE.RGBAFormat)
    tex.needsUpdate = true
    return tex
  }
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    return new THREE.CanvasTexture(canvas)
  }
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  g.addColorStop(0, 'rgba(255,255,255,0.95)')
  g.addColorStop(0.15, 'rgba(255,255,255,0.35)')
  g.addColorStop(0.45, 'rgba(255,255,255,0.08)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  const tex = new THREE.CanvasTexture(canvas)
  tex.needsUpdate = true
  return tex
}

let sharedFlareTexture: THREE.Texture | null = null
/**
 * One shared flare texture for all preview instances, built on first use. It is stateless and
 * lives for the module's lifetime — a single bounded GPU allocation that every mount reuses.
 */
function getFlareTexture(): THREE.Texture {
  if (sharedFlareTexture === null) {
    sharedFlareTexture = createFlareTexture()
  }
  return sharedFlareTexture
}

/** Align local +Y with world direction `dir`. */
function quatFromYToDir(dir: THREE.Vector3): THREE.Quaternion {
  const up = new THREE.Vector3(0, 1, 0)
  const d = dir.clone().normalize()
  if (d.lengthSq() < 1e-10) return new THREE.Quaternion()
  return new THREE.Quaternion().setFromUnitVectors(up, d)
}

const vec3 = (v: StageVector3) => new THREE.Vector3(v.x, v.y, v.z)

/** White extruded text on the floor; legible from above; side labels yaw to run along the stage edge. */
const FloorLabel: React.FC<{
  text: string
  position: [number, number, number]
  /** Rotation about Y so side labels run along their edge. */
  yawRad?: number
}> = ({ text, position, yawRad = 0 }) => (
  <group position={position} rotation={[-Math.PI / 2, 0, yawRad]}>
    <Center disableY>
      <Text3D font={helvetikerFontUrl} size={0.32} height={0.1} bevelEnabled={false}>
        {text}
        <meshStandardMaterial color="#ffffff" roughness={0.6} metalness={0.1} />
      </Text3D>
    </Center>
  </group>
)

const BeamFallback: React.FC<{
  direction: THREE.Vector3
  color: THREE.Color
  opacity: number
  length: number
  radius: number
}> = ({ direction, color, opacity, length, radius }) => {
  const group = useRef<THREE.Group>(null)
  useLayoutEffect(() => {
    if (!group.current) return
    group.current.quaternion.copy(quatFromYToDir(direction))
  }, [direction])

  const matProps = {
    color,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  } as const

  return (
    <group ref={group}>
      <mesh position={[0, length * 0.5, 0]}>
        <cylinderGeometry args={[radius, 0, length, 16, 1, true]} />
        <meshBasicMaterial {...matProps} />
      </mesh>
      {/* Wide end is open in the cylinder; a disk so the cone face is visible head-on. */}
      <mesh position={[0, length, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[radius, 24]} />
        <meshBasicMaterial {...matProps} />
      </mesh>
    </group>
  )
}

const LensFlareBillboard: React.FC<{
  color: THREE.Color
  opacity: number
  texture: THREE.Texture
}> = ({ color, opacity, texture }) => (
  <Billboard follow lockX={false} lockY={false} lockZ={false}>
    <mesh>
      <planeGeometry args={[0.45, 0.45]} />
      <meshBasicMaterial
        map={texture}
        color={color}
        transparent
        opacity={opacity}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </mesh>
  </Billboard>
)

type FixtureBeamProps = {
  position: [number, number, number]
  direction: StageVector3
  rgb: { r: number; g: number; b: number }
  dimmer01: number
  isMovingHead: boolean
  flareTexture: THREE.Texture
}

/**
 * Value-equality for the beam props. The parent recomputes rgb/direction/position arrays every
 * DMX frame, so reference comparison never matches; comparing by value lets a fixture whose
 * channels did not change skip re-rendering (and re-allocating its THREE objects) that frame.
 */
const beamPropsEqual = (a: FixtureBeamProps, b: FixtureBeamProps): boolean =>
  a.isMovingHead === b.isMovingHead &&
  a.flareTexture === b.flareTexture &&
  a.dimmer01 === b.dimmer01 &&
  a.position[0] === b.position[0] &&
  a.position[1] === b.position[1] &&
  a.position[2] === b.position[2] &&
  a.direction.x === b.direction.x &&
  a.direction.y === b.direction.y &&
  a.direction.z === b.direction.z &&
  a.rgb.r === b.rgb.r &&
  a.rgb.g === b.rgb.g &&
  a.rgb.b === b.rgb.b

const FixtureBeam = React.memo(function FixtureBeam({
  position,
  direction,
  rgb,
  dimmer01,
  isMovingHead,
  flareTexture,
}: FixtureBeamProps) {
  const { scene } = useThree()
  const { r, g, b } = rgb
  const { x: dx, y: dy, z: dz } = direction
  const color = useMemo(() => rgbToThreeColor({ r, g, b }), [r, g, b])
  const dir = useMemo(() => vec3({ x: dx, y: dy, z: dz }).normalize(), [dx, dy, dz])
  const targetPos = useMemo(() => {
    const d = 12
    return new THREE.Vector3(
      position[0] + dir.x * d,
      position[1] + dir.y * d,
      position[2] + dir.z * d,
    )
  }, [position, dir])

  const lightRef = useRef<THREE.SpotLight>(null)

  useLayoutEffect(() => {
    const L = lightRef.current
    if (!L) return
    L.target.position.copy(targetPos)
    scene.add(L.target)
    return () => {
      scene.remove(L.target)
    }
  }, [scene, targetPos])

  const intensity =
    (isMovingHead ? 2.2 : 1.4) * dimmer01 * Math.max(0.12, (rgb.r + rgb.g + rgb.b) / (3 * 255))
  const flareOpacity = 0.55 * dimmer01 * Math.min(1, (rgb.r + rgb.g + rgb.b) / (3 * 255))
  const beamOpacity = 0.22 * dimmer01
  const angle = isMovingHead ? 0.15 : 0.26
  const distance = 18

  return (
    <group position={position}>
      <SpotLight
        ref={lightRef}
        position={[0, 0, 0]}
        color={`#${color.getHexString()}`}
        angle={angle}
        distance={distance}
        intensity={intensity}
        penumbra={0.35}
        castShadow={false}
        volumetric
        opacity={0.35 * dimmer01 + 0.08}
        attenuation={12}
        anglePower={4}
      />
      <BeamFallback
        direction={dir}
        color={color}
        opacity={beamOpacity}
        length={10}
        radius={isMovingHead ? 0.12 : 0.18}
      />
      <LensFlareBillboard color={color} opacity={flareOpacity} texture={flareTexture} />
    </group>
  )
}, beamPropsEqual)

/**
 * Static scene elements (background, ambient lights, floor, grid, labels, TV, audience, truss bar).
 * None depend on DMX values, so this is memoized on the layout-derived scalars and does not
 * re-render on every DMX frame the way the fixtures do.
 */
const StaticStage = React.memo(function StaticStage({
  isStacked,
  audienceZ,
  downstageLabelZ,
  audienceLabelZ,
}: {
  isStacked: boolean
  audienceZ: number
  downstageLabelZ: number
  audienceLabelZ: number
}) {
  return (
    <>
      <color attach="background" args={['#0a0a12']} />
      <ambientLight intensity={0.35} />
      <hemisphereLight args={['#606080', '#202020', 0.4]} />

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[24, 24]} />
        <meshStandardMaterial color="#1a1a22" roughness={0.85} metalness={0.05} />
      </mesh>

      <Grid
        position={[0, 0.01, 0]}
        args={[20, 20]}
        cellSize={0.5}
        cellThickness={0.4}
        sectionSize={2}
        sectionThickness={0.8}
        fadeDistance={22}
        fadeStrength={1}
        infiniteGrid
        sectionColor="#444466"
        cellColor="#2a2a38"
      />

      <Suspense fallback={null}>
        <FloorLabel text="Upstage" position={[0, 0.02, -3]} />
        <FloorLabel text="Downstage" position={[0, 0.02, downstageLabelZ]} />
        <FloorLabel text="Audience" position={[0, 0.02, audienceLabelZ]} />
        <FloorLabel text="Stage Right" position={[-3.2, 0.02, 0]} yawRad={Math.PI / 2} />
        <FloorLabel text="Stage Left" position={[3.2, 0.02, 0]} yawRad={-Math.PI / 2} />
      </Suspense>

      {isStacked && (
        <mesh position={[0, 2.35, 0]} castShadow>
          <boxGeometry args={[9, 0.22, 0.42]} />
          <meshStandardMaterial color="#5a5a6a" roughness={0.55} metalness={0.12} />
        </mesh>
      )}

      <group position={[0, 0, -1]}>
        <mesh position={[0, 1.5, -0.02]} castShadow>
          <boxGeometry args={[2.9, 1.5, 0.06]} />
          <meshStandardMaterial color="#1c1c24" roughness={0.75} metalness={0.1} />
        </mesh>
        <mesh position={[0, 1.5, 0]} castShadow>
          <boxGeometry args={[2.8, 1.4, 0.08]} />
          <meshStandardMaterial
            color="#1a2840"
            emissive="#1a2840"
            emissiveIntensity={0.6}
            roughness={0.4}
          />
        </mesh>
        <mesh position={[0, 0.45, 0]} castShadow>
          <cylinderGeometry args={[0.06, 0.06, 0.9, 12]} />
          <meshStandardMaterial color="#1c1c24" roughness={0.75} metalness={0.1} />
        </mesh>
      </group>

      {[0, 1, 2, 3, 4].map((i) => (
        <mesh key={`aud-${i}`} position={[-1.8 + i * 0.9, 0.35, audienceZ]}>
          <cylinderGeometry args={[0.14, 0.16, 0.7, 10]} />
          <meshStandardMaterial color="#7a7a8c" roughness={0.65} metalness={0.08} />
        </mesh>
      ))}
    </>
  )
})

function StageContent({ lightingConfig, dmxValues }: LightsDmxPreview3DProps) {
  const layoutId = lightingConfig.lightLayout?.id ?? 'front'
  const isStacked = layoutId === 'stacked'
  /** TV group at z = -1; gap along +z to audience centre is 4 m in front-back, 5 m otherwise. */
  const audienceZ = layoutId === 'front-back' ? 3 : 4
  const audienceLabelZ = audienceZ + 0.8
  const downstageLabelZ = audienceZ - 1.5
  const flareTex = useMemo(() => getFlareTexture(), [])

  const items = useMemo(() => {
    type RowKey = 'front' | 'back' | 'top' | 'bottom'
    type Item = {
      key: string
      light: DmxFixture
      position: [number, number, number]
      rowKey: RowKey
      stacked: 'top' | 'bottom' | null
    }
    const out: Item[] = []

    const spreadX = (n: number, i: number): number => {
      if (n <= 1) return 0
      const step = 0.9
      const total = (n - 1) * step
      return -total / 2 + i * step
    }

    if (isStacked) {
      const BAR_Z = 0
      const BAR_Y = 2.35
      const topY = BAR_Y + 0.11
      const botY = BAR_Y - 0.11
      const front = lightingConfig.frontLights
      const back = [...lightingConfig.backLights].reverse()
      front.forEach((light, i) => {
        out.push({
          key: `top-${light.id ?? i}`,
          light,
          position: [spreadX(front.length, i), topY, BAR_Z],
          rowKey: 'top',
          stacked: 'top',
        })
      })
      back.forEach((light, i) => {
        out.push({
          key: `bottom-${light.id ?? i}`,
          light,
          position: [spreadX(back.length, i), botY, BAR_Z],
          rowKey: 'bottom',
          stacked: 'bottom',
        })
      })
    } else {
      const frontZ = 0
      const backZ = layoutId === 'front-back' ? audienceZ + 2 : 1
      const front = lightingConfig.frontLights
      const back = [...lightingConfig.backLights].reverse()
      front.forEach((light, i) => {
        out.push({
          key: `front-${light.id ?? i}`,
          light,
          position: [spreadX(front.length, i), 0.2, frontZ],
          rowKey: 'front',
          stacked: null,
        })
      })
      back.forEach((light, i) => {
        out.push({
          key: `back-${light.id ?? i}`,
          light,
          position: [spreadX(back.length, i), 0.2, backZ],
          rowKey: 'back',
          stacked: null,
        })
      })
    }
    return out
  }, [isStacked, layoutId, lightingConfig, audienceZ])

  const adjustedItems = useMemo(() => {
    return items.map((it) => {
      const mount = fixtureMount(it.light)
      let y = it.position[1]
      if (!isStacked) {
        y = mount === 'floor' ? 0.18 : 2.92
      }
      const pos: [number, number, number] = [it.position[0], y, it.position[2]]
      const fixtureOrientation: 'up' | 'down' =
        it.stacked === 'bottom' ||
        (isMovingHead(it.light) && mount === 'ceiling' && it.stacked === null)
          ? 'down'
          : 'up'
      return { ...it, position: pos, mount, fixtureOrientation }
    })
  }, [items, isStacked])

  return (
    <>
      <StaticStage
        isStacked={isStacked}
        audienceZ={audienceZ}
        downstageLabelZ={downstageLabelZ}
        audienceLabelZ={audienceLabelZ}
      />

      {adjustedItems.map((it) => {
        const rgb = getDmxPreviewLightColor(it.light, dmxValues, true)
        const dim = masterDimmer01(it.light, dmxValues)
        let dir: StageVector3
        if (isMovingHead(it.light)) {
          const ch = it.light.channels as RgbMovingHeadDmxChannels | RgbwMovingHeadDmxChannels
          const pan = dmxValues[ch.pan] ?? 0
          const tilt = dmxValues[ch.tilt] ?? 0
          dir = panTiltDmxToStageVector(pan, tilt, it.light.config)
        } else {
          dir = staticWashBeamDirection(it.mount, {
            flipUsDs: layoutId === 'front-back' && it.rowKey === 'back',
          })
        }
        const headOffset = isMovingHead(it.light) ? 0.2 : 0
        const yOffset = it.fixtureOrientation === 'down' ? -headOffset : headOffset
        const beamPosition: [number, number, number] = [
          it.position[0],
          it.position[1] + yOffset,
          it.position[2],
        ]
        return (
          <group key={it.key}>
            <FixtureBody
              position={it.position}
              rgb={rgb}
              movingHead={isMovingHead(it.light)}
              fixtureOrientation={it.fixtureOrientation}
            />
            {dim > 0 && (
              <FixtureBeam
                position={beamPosition}
                direction={dir}
                rgb={rgb}
                dimmer01={dim}
                isMovingHead={isMovingHead(it.light)}
                flareTexture={flareTex}
              />
            )}
          </group>
        )
      })}

      {lightingConfig.strobeType === ConfigStrobeType.Dedicated &&
        lightingConfig.strobeLights.map((sl, i) => {
          const rgb = getDmxPreviewLightColor(sl, dmxValues, true)
          const dim = masterDimmer01(sl, dmxValues)
          const pos: [number, number, number] = [2.4 + (i % 3) * 0.4, 0.35, 2.2]
          return (
            <group key={sl.id ?? `strobe-${i}`} position={pos}>
              <mesh castShadow>
                <boxGeometry args={[0.55, 0.28, 0.2]} />
                <meshStandardMaterial
                  color={rgbToThreeColor(rgb)}
                  emissive={rgbToThreeColor(rgb)}
                  emissiveIntensity={0.4 * dim}
                />
              </mesh>
              <LensFlareBillboard
                color={rgbToThreeColor(rgb)}
                opacity={0.4 * dim}
                texture={flareTex}
              />
            </group>
          )
        })}
    </>
  )
}

type FixtureBodyProps = {
  position: [number, number, number]
  rgb: { r: number; g: number; b: number }
  movingHead: boolean
  /** Upside-down for truss / bottom-of-bar so the body reads as hanging. */
  fixtureOrientation?: 'up' | 'down'
}

/** Value-equality for the fixture body; see {@link beamPropsEqual} for why reference compare is insufficient. */
const bodyPropsEqual = (a: FixtureBodyProps, b: FixtureBodyProps): boolean =>
  a.movingHead === b.movingHead &&
  (a.fixtureOrientation ?? 'up') === (b.fixtureOrientation ?? 'up') &&
  a.position[0] === b.position[0] &&
  a.position[1] === b.position[1] &&
  a.position[2] === b.position[2] &&
  a.rgb.r === b.rgb.r &&
  a.rgb.g === b.rgb.g &&
  a.rgb.b === b.rgb.b

const FixtureBody = React.memo(function FixtureBody({
  position,
  rgb,
  movingHead,
  fixtureOrientation = 'up',
}: FixtureBodyProps) {
  const c = rgbToThreeColor(rgb)
  const flip = fixtureOrientation === 'down' ? Math.PI : 0
  return (
    <group position={position}>
      <group rotation={[flip, 0, 0]}>
        {movingHead ? (
          <>
            <mesh position={[0, 0.06, 0]} castShadow>
              <cylinderGeometry args={[0.14, 0.16, 0.12, 16]} />
              <meshStandardMaterial
                color={c}
                emissive={c}
                emissiveIntensity={0.35}
                roughness={0.45}
              />
            </mesh>
            <mesh position={[0, 0.2, 0]} castShadow>
              <sphereGeometry args={[0.12, 16, 16]} />
              <meshStandardMaterial
                color={c}
                emissive={c}
                emissiveIntensity={0.25}
                roughness={0.5}
              />
            </mesh>
          </>
        ) : (
          <mesh castShadow>
            <sphereGeometry args={[0.16, 16, 16]} />
            <meshStandardMaterial color={c} emissive={c} emissiveIntensity={0.3} roughness={0.4} />
          </mesh>
        )}
      </group>
    </group>
  )
}, bodyPropsEqual)

function SceneEffects() {
  return (
    <EffectComposer enableNormalPass={false}>
      <Bloom luminanceThreshold={0.15} intensity={0.85} mipmapBlur radius={0.45} />
    </EffectComposer>
  )
}

const LightsDmxPreview3D: React.FC<LightsDmxPreview3DProps> = ({ lightingConfig, dmxValues }) => {
  return (
    <div className="w-full min-w-0 max-w-full aspect-video max-h-[min(420px,55vh)] rounded-md overflow-hidden border border-gray-400/40 dark:border-gray-600/50">
      <Canvas
        resize={{ scroll: false, offsetSize: true }}
        camera={{ position: [0, 2.2, 9], fov: 42, near: 0.1, far: 80 }}
        gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping }}
        dpr={[1, 2]}>
        <StageContent lightingConfig={lightingConfig} dmxValues={dmxValues} />
        <OrbitControls
          enablePan
          minPolarAngle={0.15}
          maxPolarAngle={Math.PI / 2 + 0.2}
          minDistance={3.5}
          maxDistance={18}
          target={[0, 1.2, 0]}
        />
        <SceneEffects />
      </Canvas>
    </div>
  )
}

export default LightsDmxPreview3D
