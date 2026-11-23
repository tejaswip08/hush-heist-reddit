import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { HorizontalTiltShiftShader } from 'three/addons/shaders/HorizontalTiltShiftShader.js';
import { VerticalTiltShiftShader } from 'three/addons/shaders/VerticalTiltShiftShader.js';
import {
  type Dir,
  type GameState,
  type Level,
  type Pos,
  isDog,
  isLit,
  isWall,
  samePos,
  sightTiles,
  tileAt,
} from '../../shared/sim';
import { makeCanvas } from '../art';
import { type CharacterRig, loadAssets } from './assets';
import { makeGuard, makeThief } from './characters';
import { Rain, makeCity } from './city';
import { THEMES } from './themes';
import {
  type DoorProp,
  type ExitProp,
  type Guard,
  type KeyProp,
  type RackProp,
  type LampPost,
  type PaintingProp,
  type SwitchProp,
  type Thief,
  MAT,
  TERRACE_HEIGHT,
  WALL_HEIGHT,
  floorCanvas,
  makeCoatRack,
  makeDoor,
  makeDog,
  makeExit,
  makeKey,
  makeLampPost,
  makePainting,
  makePlant,
  makeRailing,
  makeSwitch,
  makeTerrace,
  makeVent,
  rbox,
  setBeamReach,
  setDoorOpen,
  setExitActive,
  setPaintingTaken,
  setSwitchOn,
  tileKey,
} from './models';

/** Cold, desaturated grade: teal shadows, slightly warm highlights. */
const HORROR_GRADE = {
  uniforms: { tDiffuse: { value: null } },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      float l = dot(c.rgb, vec3(0.299, 0.587, 0.114));
      vec3 grey = mix(c.rgb, vec3(l), 0.32);
      vec3 tint = mix(vec3(0.82, 0.95, 1.12), vec3(1.06, 1.0, 0.9), smoothstep(0.0, 0.9, l));
      gl_FragColor = vec4(grey * tint, c.a);
    }
  `,
};

export type BoardInput = { kind: 'tap'; tile: Pos } | { kind: 'swipe'; dir: Dir };

const YAW: Record<Dir, number> = {
  right: 0,
  up: Math.PI / 2,
  left: Math.PI,
  down: -Math.PI / 2,
};

const HOP_MS = 240;
const SLAB_DEPTH = 0.45;
const BG = 0x0a0d13;
const PIECE_SCALE = 1.55;

type Motion = {
  from: THREE.Vector3;
  to: THREE.Vector3;
  fromYaw: number;
  toYaw: number;
  start: number;
  hop: number;
};

type RoomLamp = { lamp: LampPost; tiles: Pos[] };

const DIRS: { d: Dir; x: number; y: number }[] = [
  { d: 'right', x: 1, y: 0 },
  { d: 'left', x: -1, y: 0 },
  { d: 'down', x: 0, y: 1 },
  { d: 'up', x: 0, y: -1 },
];

/** The game board as a scale-model diorama on a table, seen from a corner. */
export class Board3D {
  /** Resolves once the 3D models have loaded. */
  readonly ready: Promise<void> = loadAssets();
  onInput: (input: BoardInput) => void = () => {};
  /** Called on each lightning flash so the game can play thunder. */
  onLightning: () => void = () => {};
  /** Called as a shower starts or eases off (0 dry … 1 heavy). */
  onRain: (amount: number) => void = () => {};

  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(30, 1, 0.1, 120);
  private key: THREE.DirectionalLight;
  private boardGroup = new THREE.Group();
  private fxGroup = new THREE.Group();

  private level: Level | null = null;
  private state: GameState | null = null;
  private cols = 1;
  private rows = 1;

  private floorMat: THREE.MeshStandardMaterial | null = null;
  private floorBase: HTMLCanvasElement | null = null;
  private glowCanvas: HTMLCanvasElement | null = null;
  private glowTex: THREE.CanvasTexture | null = null;

  private thief: Thief | null = null;
  private guards = new Map<string, Guard>();
  private painting: PaintingProp | null = null;
  private exit: ExitProp | null = null;
  private switches: { group: string; prop: SwitchProp }[] = [];
  private racks: RackProp[] = [];
  private keyProps: { color: string; prop: KeyProp }[] = [];
  private doorProps: { color: string; prop: DoorProp }[] = [];
  private lamps: RoomLamp[] = [];
  private dangerTiles: THREE.Mesh[] = [];
  private dangerTexture: THREE.CanvasTexture | null = null;
  private coinRings: THREE.Mesh[] = [];
  private motions = new Map<THREE.Object3D, Motion>();
  private playerFacing: Dir = 'right';
  private shakeUntil = 0;
  private downAt: { x: number; y: number } | null = null;
  private raycaster = new THREE.Raycaster();
  private ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private cameraBase = new THREE.Vector3();
  private lookAt = new THREE.Vector3();

  private composer: EffectComposer;
  private gtao: GTAOPass | null = null;
  private bloom: UnrealBloomPass;
  private tiltH: ShaderPass;
  private tiltV: ShaderPass;
  private introStart = 0;
  private mobile = false;
  private hemi: THREE.HemisphereLight;
  private rain: Rain;
  private rainAmount = 0;
  private rainTarget = 0;
  /** When the weather next changes: showers come and go. */
  private nextWeather = 0;
  private lastFrame = 0;
  private nextLightning = 0;
  private lightningStart = -1e9;
  private flicker = new Map<THREE.PointLight, number>();
  /** Animated rigs for each piece's group, and when a one-off animation ends. */
  private rigs = new Map<THREE.Object3D, CharacterRig[]>();
  private holdAnim = new Map<THREE.Object3D, number>();
  private outroStart = 0;
  private benched = new Set<string>();
  private topples = new Map<THREE.Object3D, { start: number; from: THREE.Vector3; to: THREE.Vector3; yaw: number }>();
  private dust: { mesh: THREE.Mesh; vel: THREE.Vector3; start: number }[] = [];
  private dustGeo = new THREE.SphereGeometry(0.025, 6, 4);
  private dustMat = new THREE.MeshBasicMaterial({ color: 0xe8dfcf, transparent: true, depthWrite: false });

  constructor(private container: HTMLElement) {
    const mobile = Math.min(window.innerWidth, window.innerHeight) < 600;
    this.mobile = mobile;
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobile ? 1.75 : 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);

    // Soft studio reflections so gold, brass, varnish and marble actually shine.
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.08;
    pmrem.dispose();

    // Post-processing: anti-aliased HDR render, contact shadows (desktop),
    // glow on lights, and a tilt-shift blur for the miniature look.
    const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: mobile ? 2 : 4 });
    this.composer = new EffectComposer(this.renderer, target);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    if (!mobile) {
      this.gtao = new GTAOPass(this.scene, this.camera, 1, 1);
      this.gtao.blendIntensity = 0.85;
      this.gtao.updateGtaoMaterial({ radius: 0.35, thickness: 1.5, scale: 1.2 });
      this.composer.addPass(this.gtao);
    }
    // High threshold: only true light sources (lamps, lantern, EXIT, lenses) glow.
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), mobile ? 0.3 : 0.4, 0.45, 2.2);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new ShaderPass(HORROR_GRADE));
    this.tiltH = new ShaderPass(HorizontalTiltShiftShader);
    this.tiltV = new ShaderPass(VerticalTiltShiftShader);
    this.composer.addPass(this.tiltH);
    this.composer.addPass(this.tiltV);
    this.composer.addPass(new OutputPass());

    this.scene.background = new THREE.Color(BG);
    this.scene.fog = new THREE.Fog(BG, 20, 40);

    // Stormy night: a cold moon behind clouds, a faint sky fill.
    this.hemi = new THREE.HemisphereLight(0x7d92c0, 0x1e1814, 0.5);
    this.scene.add(this.hemi);
    this.key = new THREE.DirectionalLight(0xa8bcff, 0.7);
    this.key.position.set(-6, 11, 4);
    this.key.castShadow = true;
    const size = mobile ? 1024 : 2048;
    this.key.shadow.mapSize.set(size, size);
    this.key.shadow.bias = -0.0003;
    this.key.shadow.normalBias = 0.015;
    this.key.shadow.radius = 3;
    this.scene.add(this.key, this.key.target);

    this.rain = new Rain(mobile ? 450 : 1400, -SLAB_DEPTH);
    this.rain.setAmount(0);
    // Start dry; the first shower rolls in after a while.
    this.nextWeather = performance.now() + 25000 + Math.random() * 20000;
    this.scene.add(this.boardGroup, this.fxGroup, this.rain.mesh);
    this.nextLightning = performance.now() + 4000 + Math.random() * 5000;

    const ro = new ResizeObserver(() => this.resize());
    ro.observe(container);
    this.resize();

    const el = this.renderer.domElement;
    el.addEventListener('pointerdown', (e) => {
      this.downAt = { x: e.clientX, y: e.clientY };
    });
    el.addEventListener('pointerup', (e) => this.onPointerUp(e));

    this.renderer.setAnimationLoop((t) => this.frame(t));
  }

  /* ------------------------------------------------------------ public */

  setLevel(level: Level, state: GameState) {
    const sameLevel = this.level?.id === level.id;
    this.level = level;
    this.state = state;
    this.playerFacing = 'right';
    this.motions.clear();
    this.topples.clear();
    this.benched.clear();
    this.outroStart = 0;
    if (!sameLevel) this.build(level);
    this.applyState(state, false);
  }

  setState(state: GameState) {
    const prev = this.state;
    this.state = state;
    if (prev && !samePos(prev.player, state.player)) {
      const dx = state.player.x - prev.player.x;
      const dy = state.player.y - prev.player.y;
      this.playerFacing =
        Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
    }
    this.applyState(state, true);
    if (state.noise) this.pingNoise(state.noise);
    if (state.status === 'escaped') {
      this.outroStart = performance.now();
      this.playOnce(this.thief?.group, 'Cheer', 2500);
    }
    if (prev && state.hasPainting && !prev.hasPainting) this.playOnce(this.thief?.group, 'PickUp', 900);
    if (state.status === 'caught') {
      this.shakeUntil = performance.now() + 380;
      this.container.classList.remove('flash');
      void this.container.offsetWidth;
      this.container.classList.add('flash');
    }
  }

  setCoinTargets(targets: Pos[]) {
    while (this.coinRings.length < targets.length) {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.15, 0.21, 32),
        new THREE.MeshBasicMaterial({ color: 0xe0a92c, transparent: true, opacity: 0.95, depthWrite: false })
      );
      ring.rotation.x = -Math.PI / 2;
      this.coinRings.push(ring);
      this.fxGroup.add(ring);
    }
    this.coinRings.forEach((ring, i) => {
      const p = targets[i];
      ring.visible = Boolean(p);
      if (p) ring.position.copy(this.world(p, 0.03));
    });
  }

  isNextTo(p: Pos): Dir | 'self' | null {
    const s = this.state;
    if (!s) return null;
    if (samePos(p, s.player)) return 'self';
    const dx = p.x - s.player.x;
    const dy = p.y - s.player.y;
    if (Math.abs(dx) + Math.abs(dy) !== 1) return null;
    if (dx === 1) return 'right';
    if (dx === -1) return 'left';
    return dy === 1 ? 'down' : 'up';
  }

  /* ------------------------------------------------------------- build */

  private world(p: Pos, y = 0): THREE.Vector3 {
    return new THREE.Vector3(p.x - this.cols / 2 + 0.5, y, p.y - this.rows / 2 + 0.5);
  }

  private isBorder(p: Pos) {
    return p.x === 0 || p.y === 0 || p.x === this.cols - 1 || p.y === this.rows - 1;
  }

  private inside(p: Pos) {
    return p.x >= 0 && p.y >= 0 && p.x < this.cols && p.y < this.rows;
  }

  private clearBoard() {
    this.boardGroup.traverse((o) => {
      if (o instanceof THREE.Mesh) o.geometry.dispose();
    });
    this.boardGroup.clear();
    this.glowTex?.dispose();
    this.floorMat?.map?.dispose();
    this.floorMat?.dispose();
    this.guards.clear();
    this.rigs.clear();
    this.holdAnim.clear();
    this.switches = [];
    this.racks = [];
    this.keyProps = [];
    this.doorProps = [];
    this.lamps = [];
    this.thief = null;
    this.painting = null;
    this.exit = null;
    for (const m of this.dangerTiles) m.geometry.dispose();
    this.dangerTiles = [];
    for (const r of this.coinRings) r.geometry.dispose();
    this.coinRings = [];
    this.fxGroup.clear();
  }

  private build(level: Level) {
    this.clearBoard();
    this.cols = level.map[0]?.length ?? 1;
    this.rows = level.map.length;
    const { cols, rows } = this;
    const style = THEMES[level.theme];

    // The model's slab, with a trim line like a scale-model base
    const slab = new THREE.Mesh(rbox(cols + 0.1, SLAB_DEPTH, rows + 0.1, 0.07), MAT.slab);
    slab.position.y = -SLAB_DEPTH / 2;
    slab.castShadow = true;
    slab.receiveShadow = true;
    const band = new THREE.Mesh(new THREE.BoxGeometry(cols + 0.12, 0.05, rows + 0.12), MAT.slabDark);
    band.position.y = -SLAB_DEPTH + 0.06;
    this.boardGroup.add(slab, band);

    // The theme's floor with the path network, plus an emissive copy for lamp pools
    this.floorBase = floorCanvas(level, style.floor, style.ink);
    const [glowCanvas] = makeCanvas(this.floorBase.width, this.floorBase.height);
    this.glowCanvas = glowCanvas;
    const floorTex = new THREE.CanvasTexture(this.floorBase);
    floorTex.colorSpace = THREE.SRGBColorSpace;
    floorTex.anisotropy = 8;
    this.glowTex = new THREE.CanvasTexture(glowCanvas);
    this.glowTex.colorSpace = THREE.SRGBColorSpace;
    this.floorMat = new THREE.MeshStandardMaterial({
      map: floorTex,
      emissive: 0xffffff,
      emissiveMap: this.glowTex,
      emissiveIntensity: 0.7,
      roughness: 0.32,
    });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(cols, rows), this.floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0.001;
    floor.receiveShadow = true;
    this.boardGroup.add(floor);

    // Architecture
    const lampSpots = this.chooseLampSpots(level);
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const p = { x, y };
        if (!isWall(level, p)) continue;
        const open = (dx: number, dy: number) => {
          const n = { x: x + dx, y: y + dy };
          return this.inside(n) && !isWall(level, n);
        };
        if (!this.isBorder(p)) {
          const wall = style.obstacle(
            { up: open(0, -1), down: open(0, 1), left: open(-1, 0), right: open(1, 0) },
            y * 31 + x
          );
          wall.position.copy(this.world(p));
          this.boardGroup.add(wall);
          continue;
        }

        // Terrace ring: slab, balustrade facing the floor, and some decor
        const t = makeTerrace();
        t.material = style.terrace;
        t.position.copy(this.world(p, 0));
        t.position.y = TERRACE_HEIGHT / 2;
        this.boardGroup.add(t);
        const rails: [boolean, number][] = [
          [open(1, 0), 0],
          [open(0, -1), Math.PI / 2],
          [open(-1, 0), Math.PI],
          [open(0, 1), -Math.PI / 2],
        ];
        for (const [isOpen, rot] of rails) {
          if (!isOpen) continue;
          const rail = style.rail?.(rot, x * 17 + y * 5) ?? makeRailing(rot);
          rail.position.copy(this.world(p));
          this.boardGroup.add(rail);
        }
        if (lampSpots.has(tileKey(p))) continue;
        // Keep tall decor off the camera-side row so it never hides the board.
        const decor = style.decor(x * 13 + y * 7 + level.id.length, y < rows - 1);
        if (decor) {
          if (x === 0 || x === cols - 1) decor.rotation.y += Math.PI / 2;
          decor.position.add(this.world(p));
          this.boardGroup.add(decor);
        }
      }
    }

    // Lamp posts, one per lit room
    for (const [key, tiles] of lampSpots) {
      const [lx, ly] = key.split(',').map(Number);
      if (lx === undefined || ly === undefined) continue;
      const lamp = makeLampPost();
      lamp.group.position.copy(this.world({ x: lx, y: ly }));
      if (!this.isBorder({ x: lx, y: ly })) lamp.group.position.y = WALL_HEIGHT + 0.03 - TERRACE_HEIGHT;
      lamp.light.distance = 2.6 + Math.sqrt(tiles.length) * 1.2;
      this.boardGroup.add(lamp.group);
      this.lamps.push({ lamp, tiles });
    }

    // Props on the floor
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const ch = tileAt(level, { x, y });
        if (ch === 'P') {
          this.painting = makePainting();
          this.painting.group.position.copy(this.world({ x, y }));
          this.boardGroup.add(this.painting.group);
        } else if (ch === 'U') {
          const rack = makeCoatRack();
          rack.group.position.copy(this.world({ x, y }));
          this.boardGroup.add(rack.group);
          this.racks.push(rack);
        } else if (ch === 'H') {
          const plant = makePlant(false, x * 7 + y * 3);
          plant.scale.set(1.5, 1.6, 1.5);
          plant.position.copy(this.world({ x, y }, -TERRACE_HEIGHT * 1.6));
          this.boardGroup.add(plant);
        } else if (ch === 'E') {
          this.exit = makeExit();
          this.exit.group.position.copy(this.world({ x, y }));
          this.boardGroup.add(this.exit.group);
        }
      }
    }
    for (const [a, b] of level.vents) {
      for (const p of [a, b]) {
        const v = makeVent();
        v.position.copy(this.world(p));
        this.boardGroup.add(v);
      }
    }
    for (const k of level.keys ?? []) {
      const prop = makeKey();
      prop.group.position.copy(this.world(k.at));
      this.boardGroup.add(prop.group);
      this.keyProps.push({ color: k.color, prop });
    }
    for (const d of level.doors ?? []) {
      const wallLeft = isWall(level, { x: d.at.x - 1, y: d.at.y });
      const wallRight = isWall(level, { x: d.at.x + 1, y: d.at.y });
      const prop = makeDoor(wallLeft && wallRight);
      prop.group.position.copy(this.world(d.at));
      this.boardGroup.add(prop.group);
      this.doorProps.push({ color: d.color, prop });
    }
    for (const sw of level.switches) {
      const prop = makeSwitch();
      prop.group.position.copy(this.world(sw.at));
      this.boardGroup.add(prop.group);
      this.switches.push({ group: sw.group, prop });
    }

    // Pieces
    this.thief = makeThief();
    this.thief.group.scale.setScalar(PIECE_SCALE);
    this.boardGroup.add(this.thief.group);
    this.rigs.set(this.thief.group, this.thief.rigs);
    for (const g of level.guards) {
      const guard = g.dog ? makeDog() : makeGuard();
      guard.group.scale.setScalar(PIECE_SCALE);
      this.guards.set(g.id, guard);
      this.rigs.set(guard.group, guard.rigs);
      this.boardGroup.add(guard.group);
    }

    const half = Math.max(cols, rows) / 2 + 1.5;
    const sc = this.key.shadow.camera;
    sc.left = -half;
    sc.right = half;
    sc.top = half;
    sc.bottom = -half;
    sc.near = 1;
    sc.far = 40;
    sc.updateProjectionMatrix();

    this.fitCamera();
    const toCamera = new THREE.Vector2(
      this.cameraBase.x - this.lookAt.x,
      this.cameraBase.z - this.lookAt.z
    ).normalize();
    this.boardGroup.add(makeCity(cols, rows, -SLAB_DEPTH, toCamera, this.mobile));
    this.introStart = performance.now();
  }

  /**
   * Each room that can ever be lit gets a lamp post on the nearest wall tile,
   * preferring the outer terrace. Keyed by tile, valued by the room's tiles.
   */
  private chooseLampSpots(level: Level): Map<string, Pos[]> {
    const seen = new Set<string>();
    const spots = new Map<string, Pos[]>();
    for (let y = 0; y < this.rows; y++) {
      for (let x = 0; x < this.cols; x++) {
        const start = { x, y };
        if (seen.has(tileKey(start)) || isWall(level, start) || !isLit(level, [], start)) continue;
        const room: Pos[] = [];
        const queue = [start];
        seen.add(tileKey(start));
        while (queue.length) {
          const p = queue.pop();
          if (!p) break;
          room.push(p);
          for (const d of DIRS) {
            const n = { x: p.x + d.x, y: p.y + d.y };
            if (seen.has(tileKey(n)) || isWall(level, n) || !isLit(level, [], n)) continue;
            seen.add(tileKey(n));
            queue.push(n);
          }
        }
        const cx = room.reduce((a, p) => a + p.x, 0) / room.length;
        const cy = room.reduce((a, p) => a + p.y, 0) / room.length;
        let best: Pos | null = null;
        let bestScore = Infinity;
        for (let wy = 0; wy < this.rows; wy++) {
          for (let wx = 0; wx < this.cols; wx++) {
            const w = { x: wx, y: wy };
            if (!isWall(level, w) || spots.has(tileKey(w))) continue;
            const touches = room.some((t) => Math.abs(t.x - wx) <= 1 && Math.abs(t.y - wy) <= 1);
            if (!touches) continue;
            const score = Math.hypot(wx - cx, wy - cy) + (this.isBorder(w) ? 0 : 1.5) + (wy === this.rows - 1 ? 1 : 0);
            if (score < bestScore) {
              bestScore = score;
              best = w;
            }
          }
        }
        if (best) spots.set(tileKey(best), room);
      }
    }
    return spots;
  }

  /* -------------------------------------------------------------- state */

  private applyState(state: GameState, animate: boolean) {
    const level = this.level;
    if (!level) return;

    this.paintGlow(level, state);
    for (const { lamp, tiles } of this.lamps) {
      const on = tiles.some((t) => isLit(level, state.switchesOff, t));
      lamp.light.intensity = on ? Math.min(9, 4 + tiles.length * 0.45) : 0;
      lamp.light.userData.base = lamp.light.intensity;
      lamp.glow.emissiveIntensity = on ? 2.2 : 0.05;
    }
    if (this.painting) setPaintingTaken(this.painting, state.hasPainting);
    if (this.exit) setExitActive(this.exit, state.hasPainting);
    for (const s of this.switches) setSwitchOn(s.prop, !state.switchesOff.includes(s.group));
    for (const r of this.racks) r.uniform.visible = !state.disguised;
    for (const k of this.keyProps) k.prop.key.visible = !state.keys.includes(k.color);
    for (const d of this.doorProps) setDoorOpen(d.prop, state.keys.includes(d.color));
    this.thief?.setDisguise(state.disguised);

    if (this.thief) this.move(this.thief.group, state.player, this.playerFacing, animate, 0.18);
    let benched = 0;
    for (const gs of state.guards) {
      const guard = this.guards.get(gs.id);
      if (!guard) continue;
      if (gs.out) {
        // Knocked out: topples over, then is set aside next to the model.
        guard.beam.visible = false;
        guard.spot.intensity = 0;
        guard.alert.visible = false;
        const spot = new THREE.Vector3(this.cols / 2 + 0.55, -SLAB_DEPTH, -this.rows / 2 + 0.6 + benched * 0.55);
        benched += 1;
        if (this.benched.has(gs.id)) continue;
        this.benched.add(gs.id);
        this.motions.delete(guard.group);
        const rigs = this.rigs.get(guard.group) ?? [];
        for (const r of rigs) r.play(animate ? 'Death_A' : 'Death_A_Pose', { once: true });
        if (animate) {
          this.topples.set(guard.group, {
            start: performance.now() + 120,
            from: this.world(gs),
            to: spot,
            yaw: guard.group.rotation.y,
          });
        } else {
          guard.group.position.copy(spot);
          guard.group.rotation.set(0, Math.PI / 2, rigs.length ? 0 : Math.PI / 2);
        }
        continue;
      }
      guard.group.rotation.x = 0;
      guard.group.rotation.z = 0;
      if (!animate) for (const r of this.rigs.get(guard.group) ?? []) r.play('Idle');
      if (!guard.dog) guard.spot.intensity = 7;
      setBeamReach(guard, sightTiles(level, gs, state.keys).length, PIECE_SCALE);
      guard.alert.visible = gs.stunned > 0;
      this.move(guard.group, gs, gs.facing, animate, 0.1);
    }
    this.drawDanger(level, state);
    this.setCoinTargets([]);
  }

  /** Warm lamp pools baked into the floor's emissive map. */
  private paintGlow(level: Level, state: GameState) {
    const base = this.floorBase;
    const canvas = this.glowCanvas;
    const tex = this.glowTex;
    if (!base || !canvas || !tex) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const s = canvas.width / this.cols;

    const [mask, m] = makeCanvas(canvas.width, canvas.height);
    for (let y = 0; y < this.rows; y++) {
      for (let x = 0; x < this.cols; x++) {
        const p = { x, y };
        if (isWall(level, p) || !isLit(level, state.switchesOff, p)) continue;
        const cx = x * s + s / 2;
        const cy = y * s + s / 2;
        const g = m.createRadialGradient(cx, cy, 0, cx, cy, s * 1.1);
        g.addColorStop(0, 'rgba(0,0,0,0.6)');
        g.addColorStop(0.6, 'rgba(0,0,0,0.4)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        m.fillStyle = g;
        m.fillRect(cx - s * 1.1, cy - s * 1.1, s * 2.2, s * 2.2);
      }
    }

    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(base, 0, 0);
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = 'rgba(255,150,60,0.55)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.globalCompositeOperation = 'destination-in';
    ctx.drawImage(mask, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    tex.needsUpdate = true;
  }

  private drawDanger(level: Level, state: GameState) {
    if (!this.dangerTexture) {
      const [canvas, ctx] = makeCanvas(128, 128);
      ctx.fillStyle = 'rgba(230,40,30,0.25)';
      ctx.fillRect(12, 12, 104, 104);
      ctx.strokeStyle = 'rgba(230,50,40,1)';
      ctx.lineWidth = 6;
      ctx.strokeRect(12, 12, 104, 104);
      this.dangerTexture = new THREE.CanvasTexture(canvas);
      this.dangerTexture.colorSpace = THREE.SRGBColorSpace;
    }
    const tiles: Pos[] = [];
    for (const guard of state.guards) {
      // In uniform, guards look straight past you; only dogs still threaten.
      if (state.disguised && !isDog(level, guard)) continue;
      sightTiles(level, guard, state.keys).forEach((p, i) => {
        if (i === 0 || isDog(level, guard) || isLit(level, state.switchesOff, p)) tiles.push(p);
      });
    }
    while (this.dangerTiles.length < tiles.length) {
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(0.9, 0.9),
        new THREE.MeshBasicMaterial({
          map: this.dangerTexture,
          transparent: true,
          depthWrite: false,
          toneMapped: false,
        })
      );
      m.rotation.x = -Math.PI / 2;
      m.renderOrder = 3;
      this.dangerTiles.push(m);
      this.fxGroup.add(m);
    }
    this.dangerTiles.forEach((m, i) => {
      const p = tiles[i];
      m.visible = Boolean(p);
      if (p) m.position.copy(this.world(p, 0.012));
    });
  }

  /* ---------------------------------------------------------- animation */

  private move(obj: THREE.Object3D, at: Pos, facing: Dir, animate: boolean, hop: number) {
    const to = this.world(at);
    const toYaw = YAW[facing];
    if (!animate) {
      obj.position.copy(to);
      obj.rotation.y = toYaw;
      this.motions.delete(obj);
      return;
    }
    let delta = toYaw - obj.rotation.y;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    this.motions.set(obj, {
      from: obj.position.clone().setY(0),
      to,
      fromYaw: obj.rotation.y,
      toYaw: obj.rotation.y + delta,
      start: performance.now(),
      hop: obj.position.distanceTo(to) > 0.01 ? hop : 0,
    });
    // Animated characters walk to the next tile (and only bob a little).
    const rigs = this.rigs.get(obj) ?? [];
    if (rigs.length && obj.position.distanceTo(to) > 0.01 && !this.holding(obj)) {
      for (const r of rigs) r.play('Walking_A', { fade: 0.08 });
      const m = this.motions.get(obj);
      if (m) m.hop = hop * 0.25;
    }
  }

  private pingNoise(p: Pos) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.1, 0.15, 32),
      new THREE.MeshBasicMaterial({ color: 0xe0a92c, transparent: true, depthWrite: false })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.copy(this.world(p, 0.04));
    const coin = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.012, 20), MAT.gold);
    coin.position.copy(this.world(p, 0.015));
    this.fxGroup.add(ring, coin);
    const start = performance.now();
    const tick = () => {
      const t = (performance.now() - start) / 800;
      if (t >= 1) {
        this.fxGroup.remove(ring, coin);
        ring.geometry.dispose();
        coin.geometry.dispose();
        return;
      }
      ring.scale.setScalar(1 + t * 4);
      if (ring.material instanceof THREE.MeshBasicMaterial) ring.material.opacity = 1 - t;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  private frame(time: number) {
    const now = performance.now();
    const dt = Math.min(0.05, (now - (this.lastFrame || now)) / 1000);
    this.lastFrame = now;
    this.weather(now, dt);
    this.rain.update(dt);
    this.storm(now);
    for (const [obj, m] of this.motions) {
      const t = Math.min(1, (now - m.start) / HOP_MS);
      const e = 1 - Math.pow(1 - t, 3);
      obj.position.lerpVectors(m.from, m.to, e);
      obj.position.y = Math.sin(Math.PI * t) * m.hop;
      obj.rotation.y = m.fromYaw + (m.toYaw - m.fromYaw) * e;
      if (t >= 1) {
        this.motions.delete(obj);
        if (m.hop > 0) this.puff(m.to);
        if (!this.holding(obj)) for (const r of this.rigs.get(obj) ?? []) r.play('Idle', { fade: 0.15 });
      }
    }
    this.animateTopples(now);
    for (const [obj, list] of this.rigs) {
      for (const r of list) r.mixer.update(dt);
      const until = this.holdAnim.get(obj);
      if (until !== undefined && now > until && !this.topples.has(obj)) {
        this.holdAnim.delete(obj);
        if (!this.state || this.state.status === 'playing') for (const r of list) r.play('Idle', { fade: 0.25 });
      }
    }
    this.animateDust(now);
    if (this.thief) {
      this.thief.lantern.intensity = 1.2 + Math.sin(time * 0.011) * 0.1 + Math.sin(time * 0.027) * 0.06;
    }
    for (const k of this.keyProps) k.prop.key.rotation.y = time * 0.002;
    for (const g of this.guards.values()) {
      if (g.alert.visible) g.alert.position.y = 1.1 + Math.sin(time * 0.008) * 0.04;
    }

    this.camera.position.copy(this.cameraPose(now));
    if (now < this.shakeUntil) {
      const k = (this.shakeUntil - now) / 380;
      this.camera.position.x += (Math.random() - 0.5) * 0.12 * k;
      this.camera.position.y += (Math.random() - 0.5) * 0.12 * k;
    }
    this.camera.lookAt(this.lookAt);
    this.composer.render();
  }

  /** Showers of 15–30 s with 45–90 s dry spells, fading in and out over a few seconds. */
  private weather(now: number, dt: number) {
    if (now > this.nextWeather) {
      const raining = this.rainTarget > 0;
      this.rainTarget = raining ? 0 : 0.6 + Math.random() * 0.4;
      this.nextWeather = now + (raining ? 45000 + Math.random() * 45000 : 15000 + Math.random() * 15000);
    }
    const before = this.rainAmount;
    const step = dt / 4;
    this.rainAmount += Math.max(-step, Math.min(step, this.rainTarget - this.rainAmount));
    if (Math.abs(this.rainAmount - before) > 0.0001) {
      this.rain.setAmount(this.rainAmount);
      this.onRain(this.rainAmount);
    }
  }

  /**
   * Lightning every so often (a double flash that lights the whole city),
   * and lamps that now and then stutter.
   */
  private storm(now: number) {
    if (now > this.nextLightning) {
      this.lightningStart = now;
      this.nextLightning = now + 7000 + Math.random() * 9000;
      this.onLightning();
    }
    const t = now - this.lightningStart;
    let flash = 0;
    if (t < 90) flash = 1;
    else if (t < 170) flash = 0.15;
    else if (t < 260) flash = 0.75;
    else if (t < 700) flash = 0.75 * (1 - (t - 260) / 440);
    this.key.intensity = 0.7 + flash * 4;
    this.hemi.intensity = 0.5 + flash * 1.2;
    if (this.scene.background instanceof THREE.Color) {
      this.scene.background.setHex(BG).lerp(new THREE.Color(0x5a6a88), flash * 0.6);
    }
    if (this.scene.fog instanceof THREE.Fog) this.scene.fog.color.setHex(BG).lerp(new THREE.Color(0x5a6a88), flash * 0.6);

    for (const { lamp } of this.lamps) {
      const base = typeof lamp.light.userData.base === 'number' ? lamp.light.userData.base : 0;
      if (base === 0) continue;
      const until = this.flicker.get(lamp.light) ?? 0;
      if (now < until) {
        const on = Math.random() < 0.35;
        lamp.light.intensity = on ? base : base * 0.08;
        lamp.glow.emissiveIntensity = on ? 2.2 : 0.2;
      } else {
        lamp.light.intensity = base;
        lamp.glow.emissiveIntensity = 2.2;
        if (Math.random() < 0.0025) this.flicker.set(lamp.light, now + 250 + Math.random() * 500);
      }
    }
  }

  /** Glide in when a level opens; drift back and around after an escape. */
  private cameraPose(now: number): THREE.Vector3 {
    const offset = this.cameraBase.clone().sub(this.lookAt);
    const ease = (t: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);
    let scale = 1;
    let turn = 0;
    let lift = 0;
    const intro = ease((now - this.introStart) / 1600);
    if (intro < 1) {
      scale += 0.55 * (1 - intro);
      turn += 0.55 * (1 - intro);
      lift += 1.2 * (1 - intro);
    }
    if (this.outroStart > 0) {
      const outro = ease((now - this.outroStart) / 1800);
      scale += 0.22 * outro;
      turn -= 0.35 * outro;
    }
    offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), turn).multiplyScalar(scale);
    offset.y += lift;
    return offset.add(this.lookAt);
  }

  /** A little ring of dust where a piece lands. */
  private puff(at: THREE.Vector3) {
    const now = performance.now();
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + Math.random() * 0.4;
      const mesh = new THREE.Mesh(this.dustGeo, this.dustMat.clone());
      mesh.position.set(at.x, at.y + 0.03, at.z);
      this.fxGroup.add(mesh);
      this.dust.push({
        mesh,
        vel: new THREE.Vector3(Math.cos(a) * 0.55, 0.25 + Math.random() * 0.15, Math.sin(a) * 0.55),
        start: now,
      });
    }
  }

  private animateDust(now: number) {
    this.dust = this.dust.filter((d) => {
      const t = (now - d.start) / 450;
      if (t >= 1) {
        this.fxGroup.remove(d.mesh);
        if (d.mesh.material instanceof THREE.Material) d.mesh.material.dispose();
        return false;
      }
      const dt = 1 / 60;
      d.mesh.position.addScaledVector(d.vel, dt);
      d.vel.multiplyScalar(0.9);
      d.mesh.scale.setScalar(1 + t * 1.5);
      if (d.mesh.material instanceof THREE.MeshBasicMaterial) d.mesh.material.opacity = 0.7 * (1 - t);
      return true;
    });
  }

  /** Play a one-off animation on a piece and keep it from snapping back to idle for `ms`. */
  private playOnce(obj: THREE.Object3D | undefined, clip: string, ms: number) {
    if (!obj) return;
    const rigs = this.rigs.get(obj) ?? [];
    if (!rigs.length) return;
    for (const r of rigs) r.play(clip, { once: true, fade: 0.12 });
    this.holdAnim.set(obj, performance.now() + ms);
  }

  private holding(obj: THREE.Object3D) {
    return (this.holdAnim.get(obj) ?? 0) > performance.now();
  }

  /** Knocked-out guards fall over, then hop off the board to the side. */
  private animateTopples(now: number) {
    for (const [obj, a] of this.topples) {
      const t = now - a.start;
      if (t < 0) continue;
      // Animated guards play their own fall; plain figurines tip over.
      const animated = (this.rigs.get(obj) ?? []).length > 0;
      const fallMs = animated ? 1000 : 260;
      if (t < fallMs) {
        if (!animated) obj.rotation.z = (t / 260) ** 2 * (Math.PI / 2);
        continue;
      }
      const e = Math.min(1, (t - fallMs - 120) / 520);
      if (e < 0) continue;
      const k = 1 - Math.pow(1 - e, 3);
      obj.position.lerpVectors(a.from, a.to, k);
      obj.position.y += Math.sin(Math.PI * e) * 0.7;
      obj.rotation.set(0, a.yaw + (Math.PI / 2 - a.yaw) * k, animated ? 0 : Math.PI / 2);
      if (e >= 1) {
        this.topples.delete(obj);
        this.puff(a.to.clone());
      }
    }
  }

  /* ------------------------------------------------------- camera/input */

  private resize() {
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.composer.setSize(w, h);
    const pr = this.renderer.getPixelRatio();
    const set = (pass: ShaderPass, name: string, value: number) => {
      const u = pass.uniforms[name];
      if (u) u.value = value;
    };
    // Blur strength in CSS pixels, so phones and desktops look the same.
    set(this.tiltH, 'h', 1.4 / (w * pr));
    set(this.tiltV, 'v', 1.4 / (h * pr));
    set(this.tiltH, 'r', 0.5);
    set(this.tiltV, 'r', 0.5);
    this.fitCamera();
  }

  /** Corner view like a photo of a scale model; pull back until it all fits. */
  private fitCamera() {
    const portrait = this.camera.aspect < 0.9;
    const elevation = THREE.MathUtils.degToRad(portrait ? 62 : 50);
    const yaw = THREE.MathUtils.degToRad(portrait ? 18 : 28);
    const halfW = this.cols / 2 + 0.1;
    const halfD = this.rows / 2 + 0.1;
    const corners: THREE.Vector3[] = [];
    for (const x of [-halfW, halfW]) {
      for (const z of [-halfD, halfD]) {
        for (const y of [-SLAB_DEPTH, WALL_HEIGHT]) corners.push(new THREE.Vector3(x, y, z));
      }
    }
    this.lookAt.set(0, -0.1, 0.2);
    const dir = new THREE.Vector3(
      Math.sin(yaw) * Math.cos(elevation),
      Math.sin(elevation),
      Math.cos(yaw) * Math.cos(elevation)
    );
    let dist = 4;
    for (; dist < 80; dist += 0.1) {
      this.camera.position.copy(this.lookAt).addScaledVector(dir, dist);
      this.camera.lookAt(this.lookAt);
      this.camera.updateMatrixWorld();
      const fits = corners.every((c) => {
        const p = c.clone().project(this.camera);
        return Math.abs(p.x) < 0.98 && Math.abs(p.y) < 0.94;
      });
      if (fits) break;
    }
    this.cameraBase.copy(this.camera.position);
    if (this.scene.fog instanceof THREE.Fog) {
      this.scene.fog.near = dist + 2;
      this.scene.fog.far = dist + 30;
    }
  }

  /** Screen point → ground point (y = 0), or null if it misses. */
  private groundAt(clientX: number, clientY: number): THREE.Vector3 | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1
    );
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = new THREE.Vector3();
    return this.raycaster.ray.intersectPlane(this.ground, hit);
  }

  private onPointerUp(e: PointerEvent) {
    const start = this.downAt;
    this.downAt = null;
    if (!start) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) > 28) {
      // The camera is turned, so read the swipe as a direction on the floor.
      const a = this.groundAt(start.x, start.y);
      const b = this.groundAt(e.clientX, e.clientY);
      let dir: Dir;
      if (a && b) {
        const wx = b.x - a.x;
        const wz = b.z - a.z;
        dir = Math.abs(wx) > Math.abs(wz) ? (wx > 0 ? 'right' : 'left') : wz > 0 ? 'down' : 'up';
      } else {
        dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
      }
      this.onInput({ kind: 'swipe', dir });
      return;
    }
    const hit = this.groundAt(e.clientX, e.clientY);
    if (!hit) return;
    this.onInput({
      kind: 'tap',
      tile: { x: Math.floor(hit.x + this.cols / 2), y: Math.floor(hit.z + this.rows / 2) },
    });
  }
}
