// avatar-stage.js - panel 2: the refined animation.
// A three.js stage (soft light, simple floor, neutral background) with a VRM avatar driven by
// Kalidokit, an optional 3D stick skeleton, and the motion trail drawn from the avatar's bones.
//
// Retargeting convention (verified numerically, see README "Catatan teknis"):
// Kalidokit expects a mirrored (selfie) pose. We always feed it the horizontally mirrored pose,
// so the avatar re-enacts the pose exactly as it is displayed in panel 1. With "Cermin" on, the
// avatar therefore behaves like a mirror: raising your right arm raises the arm on the same
// screen side. With the normalized bones of three-vrm 3, no axis flip is needed for this; the
// "Balik sumbu VRM" toggle is kept for models that need it.

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { VRMLoaderPlugin, VRMUtils } from "@pixiv/three-vrm";
import { Pose } from "kalidokit";
import { NUM_LANDMARKS, STRIDE, MIRROR_INDEX, POSE_CONNECTIONS, LANDMARK_TO_BONE } from "./pose.js";
import { clampBoneRotation } from "./refine.js";
import { Trail } from "./trail.js";
import { TrailRibbon } from "./trail-ribbon.js";

export const STAGE_BG = "#161920";

// Kalidokit rig key -> VRM bone, with a dampener (as in the original viewer).
const RIG_MAP = [
  ["hips", (r) => r.Hips.rotation, 0.7],
  ["spine", (r) => r.Spine, 0.45],
  ["chest", (r) => r.Spine, 0.25],
  ["rightUpperArm", (r) => r.RightUpperArm, 1],
  ["rightLowerArm", (r) => r.RightLowerArm, 1],
  ["leftUpperArm", (r) => r.LeftUpperArm, 1],
  ["leftLowerArm", (r) => r.LeftLowerArm, 1],
  ["leftUpperLeg", (r) => r.LeftUpperLeg, 1],
  ["leftLowerLeg", (r) => r.LeftLowerLeg, 1],
  ["rightUpperLeg", (r) => r.RightUpperLeg, 1],
  ["rightLowerLeg", (r) => r.RightLowerLeg, 1],
];
// Relaxed arms instead of a T-pose before the first frame arrives.
const REST = { leftUpperArm: new THREE.Euler(0, 0, -1.2), rightUpperArm: new THREE.Euler(0, 0, 1.2) };

const SKELETON_POINTS = [0, ...Array.from({ length: 22 }, (_, i) => i + 11)];
const SKELETON_LINKS = POSE_CONNECTIONS.filter(([a, b]) => a >= 11 && b >= 11).concat([[0, 11], [0, 12]]);

export class AvatarStage {
  constructor(mount) {
    this.mount = mount;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor(STAGE_BG);
    mount.appendChild(this.renderer.domElement);
    this.canvas = this.renderer.domElement;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(STAGE_BG);
    this.scene.fog = new THREE.Fog(STAGE_BG, 6, 13);

    this.camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.enableDamping = true;
    this.controls.maxPolarAngle = Math.PI * 0.53;
    this.controls.minDistance = 1.2;
    this.controls.maxDistance = 9;
    this.canvas.addEventListener("dblclick", () => this.fitCamera());

    this._buildLights();
    this._buildFloor();
    this._buildSkeleton();

    this.vrm = null;
    this.avatarHeight = 1.55;
    this.bones = []; // { node, target: Quaternion, name, damp, get }
    this.flipAxes = false;
    this.clampEnabled = true;
    this.hasPose = false;

    // Kalidokit input buffers (reused every frame).
    const mk = () => Array.from({ length: NUM_LANDMARKS }, () => ({ x: 0, y: 0, z: 0, visibility: 0 }));
    this.lm3d = mk();
    this.lm2d = mk();
    this.solveOpts = { runtime: "mediapipe", imageSize: { width: 1280, height: 720 }, enableLegs: true };
    this._euler = new THREE.Euler();
    this._q = new THREE.Quaternion();
    this._v = new THREE.Vector3();
    this._v2 = new THREE.Vector3();

    this.trails = []; // { landmark, bone, trail: Trail, ribbon: TrailRibbon, lastSample }
    this.blink = { next: 2, t: -1 };

    this.loader = new GLTFLoader();
    this.loader.register((parser) => new VRMLoaderPlugin(parser));

    this.resize();
  }

  // ---------- Scene dressing ----------
  _buildLights() {
    this.scene.add(new THREE.HemisphereLight(0xf3f6ff, 0x3a3f4a, 1.25));
    const key = new THREE.DirectionalLight(0xfff1e0, 1.9);
    key.position.set(1.6, 3.2, 2.6);
    this.scene.add(key);
    const fill = new THREE.DirectionalLight(0xc9d8ff, 0.7);
    fill.position.set(-2.2, 1.8, 1.5);
    this.scene.add(fill);
    const rim = new THREE.DirectionalLight(0xbfd4ff, 1.1);
    rim.position.set(-1.5, 2.6, -2.8);
    this.scene.add(rim);
  }

  _radialTexture(stops) {
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    const g = c.getContext("2d");
    const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    for (const [o, col] of stops) grad.addColorStop(o, col);
    g.fillStyle = grad;
    g.fillRect(0, 0, 256, 256);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  _buildFloor() {
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(2.6, 96),
      new THREE.MeshBasicMaterial({
        map: this._radialTexture([[0, "rgba(120,130,150,0.34)"], [0.55, "rgba(90,98,115,0.16)"], [1, "rgba(60,65,78,0)"]]),
        transparent: true,
        depthWrite: false,
      }),
    );
    disc.rotation.x = -Math.PI / 2;
    this.scene.add(disc);

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(1.08, 1.1, 128),
      new THREE.MeshBasicMaterial({ color: 0x8b93a7, transparent: true, opacity: 0.22, depthWrite: false }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.001;
    this.scene.add(ring);

    this.blob = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        map: this._radialTexture([[0, "rgba(0,0,0,0.55)"], [0.6, "rgba(0,0,0,0.18)"], [1, "rgba(0,0,0,0)"]]),
        transparent: true,
        depthWrite: false,
      }),
    );
    this.blob.rotation.x = -Math.PI / 2;
    this.blob.position.y = 0.002;
    this.blob.scale.set(0.9, 0.7, 1);
    this.scene.add(this.blob);
  }

  _buildSkeleton() {
    this.skeleton = new THREE.Group();
    this.skeleton.visible = false;
    this.skeleton.renderOrder = 20;
    this.skelPositions = new Float32Array(SKELETON_LINKS.length * 6);
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(this.skelPositions, 3).setUsage(THREE.DynamicDrawUsage));
    const lines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x22d3ee, depthTest: false, transparent: true, opacity: 0.95 }));
    lines.frustumCulled = false;
    lines.renderOrder = 20;
    this.skeleton.add(lines);
    this.skelGeometry = g;
    this.joints = new THREE.InstancedMesh(
      new THREE.SphereGeometry(0.018, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0xf43f5e, depthTest: false, transparent: true }),
      SKELETON_POINTS.length,
    );
    this.joints.frustumCulled = false;
    this.joints.renderOrder = 21;
    this.skeleton.add(this.joints);
    this.scene.add(this.skeleton);
    this._m = new THREE.Matrix4();
  }

  // ---------- Avatar ----------
  async loadVrm(url) {
    const gltf = await this.loader.loadAsync(url);
    const vrm = gltf.userData.vrm;
    if (!vrm) throw new Error("berkas ini bukan VRM");

    if (this.vrm) {
      this.scene.remove(this.vrm.scene);
      VRMUtils.deepDispose(this.vrm.scene);
    }
    VRMUtils.removeUnnecessaryVertices(gltf.scene);
    VRMUtils.combineSkeletons(gltf.scene);
    VRMUtils.rotateVRM0(vrm); // VRM 0.x faces -Z; turn it toward the camera
    vrm.scene.traverse((o) => {
      if (o.isMesh) o.frustumCulled = false; // skinned meshes move outside their bind-pose bounds
    });
    this.vrm = vrm;
    this.scene.add(vrm.scene);
    if (vrm.lookAt) vrm.lookAt.target = this.camera;

    this.bones = RIG_MAP.map(([name, get, damp]) => ({
      name,
      get,
      damp,
      node: vrm.humanoid.getNormalizedBoneNode(name),
      target: new THREE.Quaternion(),
    })).filter((b) => b.node);

    vrm.scene.updateMatrixWorld(true);
    const head = vrm.humanoid.getNormalizedBoneNode("head");
    this.avatarHeight = head ? head.getWorldPosition(this._v).y + 0.16 : 1.55;
    this.resetPose();
    this.fitCamera();
    this.clearTrails();
    // Compile the avatar's shaders for the offscreen (PNG/WebM) renderer now, so pressing
    // Record or Save image later does not freeze the demo for a moment.
    setTimeout(() => this.renderOffscreen(960, 540), 300);
    return describeMeta(vrm.meta);
  }

  resetPose() {
    this.hasPose = false;
    for (const b of this.bones) {
      const rest = REST[b.name];
      if (rest) b.target.setFromEuler(rest);
      else b.target.identity();
      b.node.quaternion.copy(b.target);
    }
    this.vrm?.springBoneManager?.reset();
  }

  /** Set target rotations from a (refined) PoseFrame. Width/height: source image size. */
  setPose(frame, width, height) {
    if (!this.vrm || !frame?.detected) return false;
    // Mirror the pose for Kalidokit (see header comment).
    for (let i = 0; i < NUM_LANDMARKS; i++) {
      const s = MIRROR_INDEX[i] * STRIDE;
      const w = this.lm3d[i];
      const m = this.lm2d[i];
      w.x = -frame.world[s]; w.y = frame.world[s + 1]; w.z = frame.world[s + 2]; w.visibility = frame.world[s + 3];
      m.x = 1 - frame.image[s]; m.y = frame.image[s + 1]; m.z = frame.image[s + 2]; m.visibility = frame.image[s + 3];
    }
    this.solveOpts.imageSize.width = width || 1280;
    this.solveOpts.imageSize.height = height || 720;
    let rig;
    try {
      rig = Pose.solve(this.lm3d, this.lm2d, this.solveOpts);
    } catch {
      return false;
    }
    if (!rig) return false;

    const s = this.flipAxes ? -1 : 1;
    for (const b of this.bones) {
      const r = b.get(rig);
      if (!r || !Number.isFinite(r.x)) continue;
      this._euler.set(r.x * b.damp * s, r.y * b.damp, r.z * b.damp * s, r.rotationOrder || "XYZ");
      b.target.setFromEuler(this._euler);
      if (this.clampEnabled) clampBoneRotation(b.name, b.target);
    }
    if (!this.hasPose) {
      // First pose: jump to it instead of slowly swinging out of the rest pose.
      for (const b of this.bones) b.node.quaternion.copy(b.target);
      this.hasPose = true;
    }
    return true;
  }

  /** Move bones toward their targets; alpha = slerp factor for this step (1 = snap). */
  stepBones(alpha) {
    for (const b of this.bones) {
      if (alpha >= 1) b.node.quaternion.copy(b.target);
      else b.node.quaternion.slerp(b.target, alpha);
    }
  }

  // ---------- 3D skeleton (optional) ----------
  setSkeletonVisible(v) {
    this.skeleton.visible = v;
  }

  updateSkeleton(frame) {
    if (!this.skeleton.visible || !frame?.detected || !this.vrm) return;
    // Anchor the stick figure on the avatar's hips so both overlap.
    const hips = this.vrm.humanoid.getNormalizedBoneNode("hips");
    hips.getWorldPosition(this._v2);
    const W = frame.world;
    const P = this.skelPositions;
    const hx = this._v2.x, hy = this._v2.y, hz = this._v2.z;
    for (let k = 0; k < SKELETON_LINKS.length; k++) {
      const a = SKELETON_LINKS[k][0] * STRIDE;
      const b = SKELETON_LINKS[k][1] * STRIDE;
      const o = k * 6;
      P[o] = hx + W[a]; P[o + 1] = hy - W[a + 1]; P[o + 2] = hz - W[a + 2];
      P[o + 3] = hx + W[b]; P[o + 4] = hy - W[b + 1]; P[o + 5] = hz - W[b + 2];
    }
    this.skelGeometry.attributes.position.needsUpdate = true;
    for (let k = 0; k < SKELETON_POINTS.length; k++) {
      const i = SKELETON_POINTS[k] * STRIDE;
      this._m.makeTranslation(hx + W[i], hy - W[i + 1], hz - W[i + 2]);
      this.joints.setMatrixAt(k, this._m);
    }
    this.joints.instanceMatrix.needsUpdate = true;
  }

  // ---------- 3D motion trail ----------
  /** joints: [{ landmark, color }] - landmark label decides the bone (see LANDMARK_TO_BONE). */
  setTrailJoints(joints) {
    for (const t of this.trails) {
      this.scene.remove(t.ribbon.mesh);
      t.ribbon.dispose();
    }
    this.trails = joints.map((j) => {
      const ribbon = new TrailRibbon(j.color);
      ribbon.setResolution(this.canvas.width, this.canvas.height, this.dpr || 1);
      this.scene.add(ribbon.mesh);
      return { landmark: j.landmark, bone: LANDMARK_TO_BONE[j.landmark], trail: new Trail(), ribbon, lastSample: -Infinity };
    });
  }

  clearTrails() {
    for (const t of this.trails) {
      t.trail.clear();
      t.lastSample = -Infinity;
    }
  }

  /** Record the current world position of each tracked bone (at most 30 samples per second). */
  sampleTrails(now, force = false) {
    if (!this.vrm || !this.hasPose) return;
    for (const t of this.trails) {
      if (!force && now - t.lastSample < 1 / 30 && now >= t.lastSample) continue;
      const node = this.vrm.humanoid.getNormalizedBoneNode(t.bone);
      if (!node) continue;
      node.updateWorldMatrix(true, false);
      if (t.bone === "head") this._v.set(0, 0.1, 0.03).applyMatrix4(node.matrixWorld);
      else this._v.setFromMatrixPosition(node.matrixWorld);
      const tr = t.trail;
      if (tr.count) {
        const k = tr.count - 1;
        const dx = this._v.x - tr.a(k), dy = this._v.y - tr.b(k), dz = this._v.z - tr.c(k);
        if (dx * dx + dy * dy + dz * dz < 1e-6 && now >= tr.lastT) {
          t.lastSample = now;
          continue; // not moving (e.g. pose held): do not pile up identical points
        }
      }
      tr.push(now, this._v.x, this._v.y, this._v.z);
      t.lastSample = now;
    }
  }

  // ---------- Frame update / render ----------
  update(dt, now, windowSec, slerpAlpha) {
    if (this.vrm) {
      this.stepBones(slerpAlpha);
      this._updateBlink(dt);
      this.vrm.update(dt);
      const hips = this.vrm.humanoid.getNormalizedBoneNode("hips");
      if (hips) {
        hips.getWorldPosition(this._v);
        this.blob.position.x = this._v.x;
        this.blob.position.z = this._v.z;
      }
      this.sampleTrails(now);
    }
    for (const t of this.trails) {
      if (Number.isFinite(windowSec)) t.trail.trimBefore(now - windowSec);
      t.ribbon.update(t.trail, now, windowSec);
    }
    this.controls.update();
  }

  _updateBlink(dt) {
    const em = this.vrm.expressionManager;
    if (!em) return;
    const b = this.blink;
    b.next -= dt;
    if (b.next <= 0 && b.t < 0) b.t = 0;
    if (b.t >= 0) {
      b.t += dt;
      const p = b.t / 0.16;
      em.setValue("blink", p < 1 ? Math.sin(p * Math.PI) : 0);
      if (p >= 1) {
        b.t = -1;
        b.next = 2 + Math.random() * 3.5;
      }
    }
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  /**
   * Render the stage at w x h for the PNG / WebM composite, framed for that aspect ratio, with a
   * second (offscreen) renderer so the on-screen canvas is untouched. Returns its canvas; copy it
   * in the same task (no preserveDrawingBuffer).
   */
  renderOffscreen(w, h) {
    if (!this.offRenderer) {
      this.offRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
      this.offRenderer.outputColorSpace = THREE.SRGBColorSpace;
      this.offRenderer.setClearColor(STAGE_BG);
      this.offCamera = new THREE.PerspectiveCamera();
    }
    const r = this.offRenderer;
    if (r.domElement.width !== w || r.domElement.height !== h) r.setSize(w, h, false);
    const cam = this.offCamera.copy(this.camera);
    cam.aspect = w / h;
    // Same viewing direction as the on-screen camera, distance refitted for this aspect.
    const target = this.controls.target;
    const dir = this._v.copy(this.camera.position).sub(target).normalize();
    cam.position.copy(target).addScaledVector(dir, this._fitDistance(cam.aspect));
    cam.updateProjectionMatrix();
    for (const t of this.trails) t.ribbon.setResolution(w, h, h / 540);
    r.render(this.scene, cam);
    for (const t of this.trails) t.ribbon.setResolution(this.canvas.width, this.canvas.height, this.dpr);
    return r.domElement;
  }

  _fitDistance(aspect) {
    const tanHalf = Math.tan((this.camera.fov * Math.PI) / 360);
    const spanY = this.avatarHeight * 1.42; // headroom for arms raised overhead
    const spanX = 1.75; // arms stretched sideways
    return Math.max(spanY / 2 / tanHalf, spanX / 2 / (tanHalf * aspect));
  }

  resize() {
    const r = this.mount.getBoundingClientRect();
    const w = Math.max(1, Math.round(r.width));
    const h = Math.max(1, Math.round(r.height));
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.renderer.setPixelRatio(this.dpr);
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    for (const t of this.trails) t.ribbon.setResolution(this.canvas.width, this.canvas.height, this.dpr);
    this.fitCamera();
  }

  /** Frame the whole avatar, centred, with room for raised arms. */
  fitCamera() {
    const dist = this._fitDistance(this.camera.aspect);
    const cy = this.avatarHeight * 0.56;
    this.controls.target.set(0, cy, 0);
    this.camera.position.set(0, cy + 0.12, dist);
    this.camera.lookAt(this.controls.target);
    this.controls.update();
  }
}

function describeMeta(meta) {
  if (!meta) return { name: "avatar", author: "", license: "tidak diketahui" };
  if (meta.metaVersion === "0") {
    return { name: meta.title || "avatar", author: meta.author || "", license: meta.licenseName || "tidak diketahui" };
  }
  return {
    name: meta.name || "avatar",
    author: (meta.authors || []).join(", "),
    license: meta.licenseUrl ? new URL(meta.licenseUrl, location.href).hostname : "tidak diketahui",
  };
}
