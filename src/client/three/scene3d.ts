import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  type Dir,
  type GameState,
  type Level,
  type Pos,
  isDog,
  isLit,
  objectiveDone,
  SAFE_TURNS,
  isWall,
  samePos,
  sightTiles,
  tileAt,
} from '../../shared/sim';
import { makeCanvas } from '../art';
import { paintTarget } from '../paintings';
import { type CharacterRig, loadAssets } from './assets';
import { USE_CHARACTER_MODELS, makeGuard, makeThief } from './characters';
import { bossFigure } from './figures';
import { FACADE_HEIGHT, PARAPET_HEIGHT, facadeCorner, facadeTile, parapetTile, wallLantern } from './architecture';
import { type Mood, moodFor } from './moods';
import { APRON, holdingSpot, makeApron } from './apron';
import { bakeInPlace } from './bake';
import type { Civilian } from './figures';
import { THEMES } from './themes';
import {
  type DeskProp,
  type DoorProp,
  type SafeProp,
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
  makeCash,
  makeCoatRack,
  makeDesk,
  makeDoor,
  makeDog,
  makeExit,
  makeForgery,
  makeKey,
  makeLampPost,
  makePainting,
  makePlant,
  makeSafe,
  makeSwitch,
  makeVent,
  rbox,
  setBeamReach,
  setDoorOpen,
  setExitActive,
  setPaintingTaken,
  setSafe,
  setSwitchOn,
  tileKey,
} from './models';

export type BoardInput = { kind: 'tap'; tile: Pos };

const YAW: Record<Dir, number> = {
  right: 0,
  up: Math.PI / 2,
  left: Math.PI,
  down: -Math.PI / 2,
};

const HOP_MS = 240;
/** Camera limits for the player's own view. */
const MIN_ELEV = THREE.MathUtils.degToRad(18);
const MAX_ELEV = THREE.MathUtils.degToRad(86);
const MIN_ZOOM = 0.45;
const MAX_ZOOM = 1.7;
/** Pixels a press must move before it counts as a drag rather than a tap. */
const DRAG_THRESHOLD = 8;
const SLAB_DEPTH = 0.45;
const BG = 0x3a414d;
const PIECE_SCALE = 1.65;
/** Height of the wooden display base under the model. */
const BASE_HEIGHT = 0.55;

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
  readonly ready: Promise<void> = loadAssets(USE_CHARACTER_MODELS);
  onInput: (input: BoardInput) => void = () => {};
  /** Called on each lightning flash so the game can play thunder. */

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
  private cashProps = new Map<string, THREE.Object3D>();
  private safeProp: SafeProp | null = null;
  private forgeryProp: THREE.Object3D | null = null;
  private deskProp: DeskProp | null = null;
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
  /** Active pointers, for drag-to-turn and pinch-to-zoom. */
  private pointers = new Map<number, { x: number; y: number }>();
  private dragged = false;
  private pinchStart = 0;
  /** The default framing, worked out by fitCamera. */
  private baseYaw = 0;
  private baseElev = 0;
  private baseDist = 10;
  /** The player's own view on top of it: current values ease towards targets. */
  private view = { yaw: 0, pitch: 0, zoom: 1 };
  private viewTarget = { yaw: 0, pitch: 0, zoom: 1 };
  private raycaster = new THREE.Raycaster();
  private ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private cameraBase = new THREE.Vector3();
  private lookAt = new THREE.Vector3();

  private introStart = 0;
  private hemi: THREE.HemisphereLight;
  private skyTex: THREE.CanvasTexture | null = null;
  private lastFrame = 0;
  /** Animated rigs for each piece's group, and when a one-off animation ends. */
  private rigs = new Map<THREE.Object3D, CharacterRig[]>();
  private holdAnim = new Map<THREE.Object3D, number>();
  private outroStart = 0;
  private benched = new Set<string>();
  /** Knocked-out pieces in the holding area, glaring at Wren. */
  private angry = new Map<THREE.Object3D, { mark: THREE.Sprite; phase: number }>();
  private angerTex: THREE.CanvasTexture | null = null;
  private civilians: { c: Civilian; yaw: number; phase: number }[] = [];
  private episode = 1;
  private topples = new Map<THREE.Object3D, { start: number; from: THREE.Vector3; to: THREE.Vector3; yaw: number }>();
  private dust: { mesh: THREE.Mesh; vel: THREE.Vector3; start: number }[] = [];
  private dustGeo = new THREE.SphereGeometry(0.025, 6, 4);
  private dustMat = new THREE.MeshBasicMaterial({ color: 0xe8dfcf, transparent: true, depthWrite: false });

  constructor(private container: HTMLElement) {
    const mobile = Math.min(window.innerWidth, window.innerHeight) < 600;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    // Capped resolution keeps phones smooth.
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);

    // Soft studio reflections so gold, brass, varnish and marble actually shine.
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.12;
    pmrem.dispose();


    this.scene.background = new THREE.Color(BG);

    // Dusk: a cool sky fill and a soft key light casting gentle shadows.
    this.hemi = new THREE.HemisphereLight(0xaebfe6, 0x3c342c, 0.62);
    this.scene.add(this.hemi);
    this.key = new THREE.DirectionalLight(0xc9d6ff, 0.72);
    this.key.position.set(-6, 11, 4);
    this.key.castShadow = true;
    const size = mobile ? 1024 : 1536;
    this.key.shadow.mapSize.set(size, size);
    this.key.shadow.bias = -0.0008;
    this.key.shadow.normalBias = 0.035;
    this.key.shadow.radius = 3;
    this.scene.add(this.key, this.key.target);

    // A plain backdrop that only catches the model's soft shadow.
    const shadowCatcher = new THREE.Mesh(
      new THREE.PlaneGeometry(90, 90),
      new THREE.ShadowMaterial({ opacity: 0.35 })
    );
    shadowCatcher.rotation.x = -Math.PI / 2;
    shadowCatcher.position.y = -SLAB_DEPTH;
    shadowCatcher.receiveShadow = true;
    this.scene.add(shadowCatcher, this.boardGroup, this.fxGroup);

    const ro = new ResizeObserver(() => this.resize());
    ro.observe(container);
    this.resize();

    const el = this.renderer.domElement;
    el.addEventListener('pointerdown', (e) => this.onPointerDown(e));
    el.addEventListener('pointermove', (e) => this.onPointerMove(e));
    el.addEventListener('pointerup', (e) => this.onPointerUp(e));
    el.addEventListener('pointercancel', (e) => this.onPointerUp(e, true));
    el.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.zoomBy(Math.exp(e.deltaY * 0.0012));
      },
      { passive: false }
    );

    this.renderer.setAnimationLoop((t) => this.frame(t));

    // ?debug logs draw calls and triangles every few seconds (local testing).
    if (new URLSearchParams(window.location.search).has('debug')) {
      window.setInterval(() => {
        const { calls, triangles } = this.renderer.info.render;
        console.info(`[hush] draw calls ${calls}, triangles ${triangles}`);
      }, 2000);
    }
  }

  /* ------------------------------------------------------------ public */

  /** Show a level. `episode` (the night number) picks the sky and light. */
  setLevel(level: Level, state: GameState, episode = 1) {
    const sameLevel = this.level?.id === level.id;
    this.episode = episode;
    this.applyMood(moodFor(episode));
    this.level = level;
    this.state = state;
    this.playerFacing = 'right';
    this.motions.clear();
    this.topples.clear();
    this.benched.clear();
    for (const { mark } of this.angry.values()) mark.visible = false;
    this.angry.clear();
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
    this.cashProps.clear();
    this.safeProp = null;
    this.forgeryProp = null;
    this.deskProp = null;
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
    const slab = new THREE.Mesh(rbox(cols + 0.1, SLAB_DEPTH, rows + 0.1, 0.05), MAT.plasterBase);
    slab.position.y = -SLAB_DEPTH / 2;
    slab.castShadow = true;
    slab.receiveShadow = true;
    this.boardGroup.add(slab);
    // Everything that never moves goes here and is merged into a few meshes.
    const statics = new THREE.Group();

    // The non-playable apron with bystanders, café tables, palms and a car
    const apron = makeApron(cols, rows, level.theme, SLAB_DEPTH, cols * 13 + rows * 7 + level.id.length);
    statics.add(apron.group);

    // A chunky moulded wooden display base under it all, with a brass plaque
    const W = cols + APRON + 0.6;
    const D = rows + APRON + 0.6;
    const cx = APRON / 2;
    const cz = APRON / 2;
    const base = new THREE.Mesh(rbox(W, BASE_HEIGHT, D, 0.03), MAT.wood);
    base.position.set(cx, -SLAB_DEPTH - BASE_HEIGHT / 2, cz);
    const lip = new THREE.Mesh(rbox(W + 0.08, 0.06, D + 0.08, 0.02), MAT.wood);
    lip.position.set(cx, -SLAB_DEPTH - 0.02, cz);
    const groove = new THREE.Mesh(rbox(W + 0.03, 0.03, D + 0.03, 0.01), MAT.slabDark);
    groove.position.set(cx, -SLAB_DEPTH - BASE_HEIGHT * 0.62, cz);
    const foot = new THREE.Mesh(rbox(W + 0.14, 0.08, D + 0.14, 0.02), MAT.wood);
    foot.position.set(cx, -SLAB_DEPTH - BASE_HEIGHT - 0.02, cz);
    for (const m of [base, lip, foot]) {
      m.castShadow = true;
      m.receiveShadow = true;
    }
    const [plateCanvas, pc] = makeCanvas(640, 110);
    const brass = pc.createLinearGradient(0, 0, 640, 110);
    brass.addColorStop(0, '#f3dc9a');
    brass.addColorStop(0.5, '#c9a046');
    brass.addColorStop(1, '#e8c76e');
    pc.fillStyle = brass;
    pc.fillRect(0, 0, 640, 110);
    pc.strokeStyle = 'rgba(70,45,5,0.7)';
    pc.lineWidth = 6;
    pc.strokeRect(8, 8, 624, 94);
    pc.fillStyle = '#3b2a0c';
    pc.font = 'bold 44px Georgia, serif';
    pc.textAlign = 'center';
    pc.textBaseline = 'middle';
    pc.fillText(`Night ${this.episode} · ${level.title}`, 320, 58);
    const plateTex = new THREE.CanvasTexture(plateCanvas);
    plateTex.colorSpace = THREE.SRGBColorSpace;
    const plaque = new THREE.Mesh(
      new THREE.PlaneGeometry(2.4, 0.42),
      new THREE.MeshStandardMaterial({ map: plateTex, metalness: 0.6, roughness: 0.35 })
    );
    plaque.position.set(cx, -SLAB_DEPTH - BASE_HEIGHT * 0.36, cz + D / 2 + 0.004);
    statics.add(base, lip, groove, foot, plaque);

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
          statics.add(wall);
          continue;
        }

        // The building: tall facades along the back and left, low
        // balustrades along the camera-side front and right.
        const back = y === 0;
        const left = x === 0;
        const front = y === rows - 1;
        const right = x === cols - 1;
        const pal = style.palette;
        const seed = x * 31 + y * 17 + level.id.length;
        let piece: THREE.Object3D;
        if (back || left) {
          const corner = (back && left) || (back && right) || (left && front);
          if (corner) piece = facadeCorner(pal);
          else {
            piece = facadeTile(pal, seed, !lampSpots.has(tileKey(p)) && seed % 5 === 0);
            piece.rotation.y = back ? 0 : Math.PI / 2;
          }
        } else {
          piece = parapetTile(pal);
          piece.rotation.y = front ? Math.PI : -Math.PI / 2;
          if (!lampSpots.has(tileKey(p))) {
            const decor = style.decor(seed, false);
            if (decor) {
              decor.position.y += PARAPET_HEIGHT * 0.45 - TERRACE_HEIGHT;
              decor.scale.multiplyScalar(0.8);
              decor.position.add(this.world(p));
              statics.add(decor);
            }
          }
        }
        piece.position.copy(this.world(p));
        statics.add(piece);
      }
    }

    this.boardGroup.add(statics);
    bakeInPlace(statics);
    // Read each bystander's facing after baking re-homes them.
    this.civilians = apron.civilians.map((c, i) => ({ c, yaw: c.group.rotation.y, phase: i * 1.7 }));

    // Lamp posts, one per lit room
    for (const [key, tiles] of lampSpots) {
      const [lx, ly] = key.split(',').map(Number);
      if (lx === undefined || ly === undefined) continue;
      // Lanterns hang on facades; posts stand on balustrades and inner walls.
      const onFacade = (ly === 0 || lx === 0) && this.isBorder({ x: lx, y: ly });
      const lamp = onFacade ? wallLantern() : makeLampPost();
      lamp.group.position.copy(this.world({ x: lx, y: ly }));
      if (onFacade) lamp.group.rotation.y = ly === 0 ? 0 : Math.PI / 2;
      else if (this.isBorder({ x: lx, y: ly })) lamp.group.position.y = PARAPET_HEIGHT * 0.45 - TERRACE_HEIGHT;
      else lamp.group.position.y = WALL_HEIGHT + 0.03 - TERRACE_HEIGHT;
      lamp.light.distance = 2.6 + Math.sqrt(tiles.length) * 1.2;
      this.boardGroup.add(lamp.group);
      this.lamps.push({ lamp, tiles });
    }

    // Props on the floor
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const ch = tileAt(level, { x, y });
        if (ch === 'P') {
          this.painting = makePainting(paintTarget(level.id));
          this.painting.group.position.copy(this.world({ x, y }));
          this.boardGroup.add(this.painting.group);
        } else if (ch === '$') {
          const cash = makeCash();
          cash.position.copy(this.world({ x, y }));
          this.boardGroup.add(cash);
          this.cashProps.set(`${x},${y}`, cash);
        } else if (ch === 'B') {
          this.safeProp = makeSafe();
          this.safeProp.group.position.copy(this.world({ x, y }));
          this.boardGroup.add(this.safeProp.group);
        } else if (ch === 'F') {
          this.forgeryProp = makeForgery();
          this.forgeryProp.position.copy(this.world({ x, y }));
          this.boardGroup.add(this.forgeryProp);
        } else if (ch === 'D') {
          this.deskProp = makeDesk();
          this.deskProp.group.position.copy(this.world({ x, y }));
          this.boardGroup.add(this.deskProp.group);
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
    level.guards.forEach((g, i) => {
      const guard = g.boss ? bossFigure() : g.dog ? makeDog() : makeGuard(i);
      guard.group.scale.setScalar(PIECE_SCALE);
      this.guards.set(g.id, guard);
      this.rigs.set(guard.group, guard.rigs);
      this.boardGroup.add(guard.group);
    });

    const half = Math.max(cols, rows) / 2 + 1.5 + APRON;
    const sc = this.key.shadow.camera;
    sc.left = -half;
    sc.right = half;
    sc.top = half;
    sc.bottom = -half;
    sc.near = 1;
    sc.far = 40;
    sc.updateProjectionMatrix();

    this.fitCamera();
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
      lamp.glow.emissiveIntensity = on ? 2.2 : 0.05;
    }
    if (this.painting) setPaintingTaken(this.painting, state.hasPainting);
    if (this.exit) setExitActive(this.exit, objectiveDone(level, state));
    for (const [key, cash] of this.cashProps) cash.visible = !state.cash.includes(key);
    if (this.safeProp) setSafe(this.safeProp, state.safeTurns / SAFE_TURNS, state.safeOpen);
    if (this.forgeryProp) this.forgeryProp.visible = !state.forgery;
    if (this.deskProp) this.deskProp.file.visible = state.planted;
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
      const target = guard.group.getObjectByName('target');
      if (target) target.visible = !gs.out;
      if (gs.out) {
        // Knocked out: topples over, then is set aside next to the model.
        guard.beam.visible = false;
        guard.spot.intensity = 0;
        guard.alert.visible = false;
        const spot = holdingSpot(this.cols, this.rows, benched);
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
          guard.group.rotation.set(0, Math.PI / 2, 0);
          this.makeAngry(guard.group);
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
    this.animateAngry(now);
    for (const [obj, list] of this.rigs) {
      for (const r of list) r.mixer.update(dt);
      const until = this.holdAnim.get(obj);
      if (until !== undefined && now > until && !this.topples.has(obj)) {
        this.holdAnim.delete(obj);
        if (!this.state || this.state.status === 'playing') for (const r of list) r.play('Idle', { fade: 0.25 });
      }
    }
    this.animateDust(now);
    // Bystanders shift their weight and look around.
    for (const { c, yaw, phase } of this.civilians) {
      c.head.rotation.y = Math.sin(now * 0.0005 + phase) * 0.55;
      c.group.rotation.y = yaw + Math.sin(now * 0.0003 + phase * 2) * 0.12;
    }
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
    this.renderer.render(this.scene, this.camera);
  }

  /** Colour grading without post-processing: a gradient sky and matching light. */
  private applyMood(mood: Mood) {
    const [canvas, ctx] = makeCanvas(4, 256);
    const g = ctx.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, mood.sky[0]);
    g.addColorStop(0.55, mood.sky[1]);
    g.addColorStop(1, mood.sky[2]);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 4, 256);
    this.skyTex?.dispose();
    this.skyTex = new THREE.CanvasTexture(canvas);
    this.skyTex.colorSpace = THREE.SRGBColorSpace;
    this.scene.background = this.skyTex;
    this.hemi.color.setHex(mood.hemiSky);
    this.hemi.groundColor.setHex(mood.hemiGround);
    this.hemi.intensity = mood.hemi;
    this.key.color.setHex(mood.key);
    this.key.intensity = mood.keyIntensity;
    this.key.position.set(...mood.keyPos);
    this.renderer.toneMappingExposure = mood.exposure;
  }

  /** Glide in when a level opens; drift back and around after an escape. */
  private cameraPose(now: number): THREE.Vector3 {
    // Ease the player's view towards where they dragged or pinched.
    for (const key of ['yaw', 'pitch', 'zoom'] as const) {
      this.view[key] += (this.viewTarget[key] - this.view[key]) * 0.2;
    }
    const elev = THREE.MathUtils.clamp(this.baseElev + this.view.pitch, MIN_ELEV, MAX_ELEV);
    const yaw = this.baseYaw + this.view.yaw;
    const dist = this.baseDist * this.view.zoom;
    const offset = new THREE.Vector3(
      Math.sin(yaw) * Math.cos(elev),
      Math.sin(elev),
      Math.cos(yaw) * Math.cos(elev)
    ).multiplyScalar(dist);
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

  /** A throbbing red anger mark, drawn once and shared. */
  private angerTexture() {
    if (this.angerTex) return this.angerTex;
    const [canvas, ctx] = makeCanvas(128, 128);
    const vein = (rot: number) => {
      ctx.save();
      ctx.translate(64, 64);
      ctx.rotate(rot);
      ctx.beginPath();
      ctx.moveTo(10, 34);
      ctx.quadraticCurveTo(14, 14, 34, 10);
      ctx.stroke();
      ctx.restore();
    };
    ctx.lineCap = 'round';
    for (const [color, width] of [
      ['#ffffff', 26],
      ['#e0201a', 14],
    ] as const) {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      for (let i = 0; i < 4; i++) vein((i * Math.PI) / 2);
    }
    this.angerTex = new THREE.CanvasTexture(canvas);
    this.angerTex.colorSpace = THREE.SRGBColorSpace;
    return this.angerTex;
  }

  /** Put a knocked-out piece in the holding area's angry crowd. */
  private makeAngry(obj: THREE.Object3D) {
    if (this.angry.has(obj)) return;
    let mark = obj.getObjectByName('anger');
    if (!(mark instanceof THREE.Sprite)) {
      mark = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: this.angerTexture(), depthTest: false, transparent: true })
      );
      mark.name = 'anger';
      mark.renderOrder = 11;
      obj.add(mark);
    }
    if (!(mark instanceof THREE.Sprite)) return;
    mark.position.set(0.08, 1.02, 0);
    mark.visible = true;
    this.angry.set(obj, { mark, phase: this.angry.size * 1.9 });
  }

  /** Benched pieces turn to glare at Wren, stomp now and then, and fume. */
  private animateAngry(now: number) {
    const thief = this.thief?.group.position;
    if (!thief) return;
    for (const [obj, { mark, phase }] of this.angry) {
      const target = Math.atan2(-(thief.z - obj.position.z), thief.x - obj.position.x);
      let delta = target - obj.rotation.y;
      while (delta > Math.PI) delta -= Math.PI * 2;
      while (delta < -Math.PI) delta += Math.PI * 2;
      obj.rotation.y += delta * 0.12;
      const s = Math.sin(now * 0.0045 + phase);
      obj.position.y = s > 0.9 ? (s - 0.9) * 0.9 : 0;
      const pulse = 0.24 * (1 + 0.18 * Math.sin(now * 0.014 + phase));
      mark.scale.set(pulse, pulse, 1);
      mark.position.y = 1.02 + Math.sin(now * 0.006 + phase) * 0.03;
    }
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
      // Lying down in flight, springing upright as they land.
      const up = Math.min(1, Math.max(0, (e - 0.65) / 0.35));
      obj.rotation.set(0, a.yaw + (Math.PI / 2 - a.yaw) * k, animated ? 0 : (Math.PI / 2) * (1 - up));
      if (e >= 1) {
        this.topples.delete(obj);
        this.puff(a.to.clone());
        for (const r of this.rigs.get(obj) ?? []) r.play('Idle', { fade: 0.3 });
        this.makeAngry(obj);
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
    // Frame the board plus the apron along the front and right.
    for (const x of [-halfW, halfW + APRON]) {
      for (const z of [-halfD, halfD + APRON]) {
        for (const y of [-SLAB_DEPTH - BASE_HEIGHT, FACADE_HEIGHT]) corners.push(new THREE.Vector3(x, y, z));
      }
    }
    this.lookAt.set(APRON * 0.4, -0.1, 0.2 + APRON * 0.4);
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
    this.baseYaw = yaw;
    this.baseElev = elevation;
    this.baseDist = dist;
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

  /** Back to the default framing, smoothly. */
  resetView() {
    this.viewTarget = { yaw: 0, pitch: 0, zoom: 1 };
  }

  private zoomBy(factor: number) {
    this.viewTarget.zoom = THREE.MathUtils.clamp(this.viewTarget.zoom * factor, MIN_ZOOM, MAX_ZOOM);
  }

  private onPointerDown(e: PointerEvent) {
    this.renderer.domElement.setPointerCapture(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pointers.size === 1) {
      this.downAt = { x: e.clientX, y: e.clientY };
      this.dragged = false;
    } else if (this.pointers.size === 2) {
      // A second finger starts a pinch, never a tap.
      this.dragged = true;
      this.pinchStart = this.pinchDistance();
    }
  }

  private pinchDistance() {
    const [a, b] = [...this.pointers.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  }

  /** One finger turns and tilts the model; two fingers pinch to zoom. */
  private onPointerMove(e: PointerEvent) {
    const last = this.pointers.get(e.pointerId);
    if (!last) return;
    const dx = e.clientX - last.x;
    const dy = e.clientY - last.y;
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (this.pointers.size >= 2) {
      const d = this.pinchDistance();
      if (this.pinchStart > 0 && d > 0) this.zoomBy(this.pinchStart / d);
      this.pinchStart = d;
      return;
    }
    const start = this.downAt;
    if (!start) return;
    if (!this.dragged && Math.hypot(e.clientX - start.x, e.clientY - start.y) < DRAG_THRESHOLD) return;
    this.dragged = true;
    this.viewTarget.yaw -= dx * 0.008;
    const minPitch = MIN_ELEV - this.baseElev;
    const maxPitch = MAX_ELEV - this.baseElev;
    this.viewTarget.pitch = THREE.MathUtils.clamp(this.viewTarget.pitch + dy * 0.006, minPitch, maxPitch);
  }

  /** A press that didn't drag is a tap on a tile. */
  private onPointerUp(e: PointerEvent, cancelled = false) {
    this.pointers.delete(e.pointerId);
    if (this.pointers.size > 0) return;
    const start = this.downAt;
    this.downAt = null;
    if (!start || this.dragged || cancelled) return;
    const hit = this.groundAt(e.clientX, e.clientY);
    if (!hit) return;
    this.onInput({
      kind: 'tap',
      tile: { x: Math.floor(hit.x + this.cols / 2), y: Math.floor(hit.z + this.rows / 2) },
    });
  }
}
