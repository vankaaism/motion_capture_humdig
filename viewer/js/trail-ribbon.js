// trail-ribbon.js - a thick 3D polyline for the motion trail on the avatar.
// WebGL lines are always 1 px wide, so each trail point becomes two vertices that the vertex
// shader pushes apart in screen space (constant pixel width). Buffers are allocated once.

import * as THREE from "three";
import { TRAIL_CAPACITY, trailAlpha } from "./trail.js";

const vertexShader = /* glsl */ `
  attribute vec3 prevPos;
  attribute vec3 nextPos;
  attribute float side;
  attribute float alpha;
  uniform vec2 resolution;
  uniform float width;
  varying float vAlpha;
  void main() {
    mat4 mvp = projectionMatrix * modelViewMatrix;
    vec4 c = mvp * vec4(position, 1.0);
    vec4 p = mvp * vec4(prevPos, 1.0);
    vec4 n = mvp * vec4(nextPos, 1.0);
    vec2 aspect = vec2(resolution.x / resolution.y, 1.0);
    vec2 sc = c.xy / c.w * aspect;
    vec2 sp = p.xy / p.w * aspect;
    vec2 sn = n.xy / n.w * aspect;
    vec2 dir = sn - sp;
    if (dot(dir, dir) < 1e-12) dir = vec2(1.0, 0.0);
    dir = normalize(dir);
    vec2 normal = vec2(-dir.y, dir.x) / aspect;
    // width is in device pixels; clip space spans 2 units over resolution.y pixels.
    c.xy += normal * side * width / resolution.y * c.w;
    gl_Position = c;
    vAlpha = alpha;
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 color;
  uniform float opacity;
  varying float vAlpha;
  void main() {
    gl_FragColor = vec4(color, vAlpha * opacity);
    #include <colorspace_fragment>
  }
`;

export class TrailRibbon {
  constructor(color, capacity = TRAIL_CAPACITY) {
    this.capacity = capacity;
    const v = capacity * 2;
    this.pos = new Float32Array(v * 3);
    this.prev = new Float32Array(v * 3);
    this.next = new Float32Array(v * 3);
    this.alpha = new Float32Array(v);
    const side = new Float32Array(v);
    for (let i = 0; i < v; i++) side[i] = i % 2 ? -1 : 1;

    const index = new Uint32Array((capacity - 1) * 6);
    for (let k = 0; k < capacity - 1; k++) {
      const a = 2 * k;
      index.set([a, a + 1, a + 2, a + 1, a + 3, a + 2], k * 6);
    }

    const g = new THREE.BufferGeometry();
    const dyn = (arr, size) => new THREE.BufferAttribute(arr, size).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute("position", dyn(this.pos, 3));
    g.setAttribute("prevPos", dyn(this.prev, 3));
    g.setAttribute("nextPos", dyn(this.next, 3));
    g.setAttribute("alpha", dyn(this.alpha, 1));
    g.setAttribute("side", new THREE.BufferAttribute(side, 1));
    g.setIndex(new THREE.BufferAttribute(index, 1));
    g.setDrawRange(0, 0);
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e4); // never frustum-culled

    this.material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        color: { value: new THREE.Color(color) },
        opacity: { value: 1 },
        resolution: { value: new THREE.Vector2(1, 1) },
        width: { value: 5 },
      },
      transparent: true,
      depthWrite: false,
    });
    this.mesh = new THREE.Mesh(g, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 10;
    this.geometry = g;
    this.lastVersion = -1;
  }

  setColor(color) {
    this.material.uniforms.color.value.set(color);
  }

  setResolution(w, h, dpr) {
    this.material.uniforms.resolution.value.set(w, h);
    this.material.uniforms.width.value = 5 * dpr;
  }

  /** Rebuild the vertex data from a Trail (dims: a, b, c = x, y, z). */
  update(trail, now, windowSec) {
    const n = trail.count;
    if (n < 2) {
      this.geometry.setDrawRange(0, 0);
      return;
    }
    const positionsChanged = trail.version !== this.lastVersion;
    this.lastVersion = trail.version;
    const P = this.pos, Pp = this.prev, Pn = this.next, A = this.alpha;
    for (let k = 0; k < n; k++) {
      const al = trailAlpha(now - trail.t(k), windowSec);
      A[2 * k] = al;
      A[2 * k + 1] = al;
      if (!positionsChanged) continue;
      const kp = k > 0 ? k - 1 : 0;
      const kn = k < n - 1 ? k + 1 : n - 1;
      for (let s = 0; s < 2; s++) {
        const o = (2 * k + s) * 3;
        P[o] = trail.a(k); P[o + 1] = trail.b(k); P[o + 2] = trail.c(k);
        Pp[o] = trail.a(kp); Pp[o + 1] = trail.b(kp); Pp[o + 2] = trail.c(kp);
        Pn[o] = trail.a(kn); Pn[o + 1] = trail.b(kn); Pn[o + 2] = trail.c(kn);
      }
    }
    const attrs = this.geometry.attributes;
    attrs.alpha.needsUpdate = true;
    if (positionsChanged) {
      attrs.position.needsUpdate = true;
      attrs.prevPos.needsUpdate = true;
      attrs.nextPos.needsUpdate = true;
    }
    this.geometry.setDrawRange(0, (n - 1) * 6);
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
  }
}
