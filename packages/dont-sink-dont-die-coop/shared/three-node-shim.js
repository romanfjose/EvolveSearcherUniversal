/**
 * Zero-dependency Node ESM Three.js shim for headless unit tests (`npm test`).
 * In the browser, `<script type="importmap">` maps `"three"` to the real WebGL Three.js build.
 */
export class Vector3 {
    constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
    set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
    setScalar(s) { this.x = s; this.y = s; this.z = s; return this; }
    multiplyScalar(s) { this.x *= s; this.y *= s; this.z *= s; return this; }
    copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
    add(v) { this.x += v.x; this.y += v.y; this.z += v.z; return this; }
    addScaledVector(v, s) { this.x += v.x * s; this.y += v.y * s; this.z += v.z * s; return this; }
    lerp(v, a) { this.x += (v.x - this.x) * a; this.y += (v.y - this.y) * a; this.z += (v.z - this.z) * a; return this; }
    lerpVectors(v1, v2, a) { this.x = v1.x + (v2.x - v1.x) * a; this.y = v1.y + (v2.y - v1.y) * a; this.z = v1.z + (v2.z - v1.z) * a; return this; }
    distanceTo(v) { return Math.hypot(this.x - v.x, this.y - v.y, this.z - v.z); }
    clone() { return new Vector3(this.x, this.y, this.z); }
}

export class Euler {
    constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
    set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
    copy(e) { this.x = e.x; this.y = e.y; this.z = e.z; return this; }
}

export class Quaternion {
    constructor(x = 0, y = 0, z = 0, w = 1) { this.x = x; this.y = y; this.z = z; this.w = w; }
    set(x, y, z, w) { this.x = x; this.y = y; this.z = z; this.w = w; return this; }
    copy(q) { this.x = q.x; this.y = q.y; this.z = q.z; this.w = q.w; return this; }
    setFromAxisAngle(axis, angle) {
        const half = angle / 2, s = Math.sin(half);
        this.x = (axis.x || 0) * s; this.y = (axis.y || 0) * s; this.z = (axis.z || 0) * s; this.w = Math.cos(half);
        return this;
    }
}

export class Color {
    constructor(c = 0xffffff) { this.value = c; this.r = 1; this.g = 1; this.b = 1; }
    setHex(h) { this.value = h; return this; }
    set(c) { this.value = c; return this; }
    copy(c) { this.value = c?.value ?? c; return this; }
    lerp() { return this; }
    clone() { return new Color(this.value); }
}

export class Object3D {
    constructor() {
        this.position = new Vector3();
        this.rotation = new Euler();
        this.scale = new Vector3(1, 1, 1);
        this.quaternion = new Quaternion();
        this.children = [];
        this.userData = {};
        this.visible = true;
        this.name = '';
    }
    add(...objs) { for (const o of objs) if (o) this.children.push(o); return this; }
    remove(...objs) { for (const o of objs) { const i = this.children.indexOf(o); if (i >= 0) this.children.splice(i, 1); } return this; }
    lookAt() {}
    traverse(fn) { fn(this); for (const c of this.children) if (c?.traverse) c.traverse(fn); }
    getObjectByName(name) {
        if (this.name === name) return this;
        for (const c of this.children) {
            const f = c?.getObjectByName?.(name);
            if (f) return f;
        }
        return null;
    }
}

export class Group extends Object3D { constructor() { super(); this.type = 'Group'; } }
export class Mesh extends Object3D {
    constructor(geometry = null, material = null) { super(); this.type = 'Mesh'; this.geometry = geometry; this.material = material; }
}
export class Points extends Object3D {
    constructor(geometry = null, material = null) { super(); this.type = 'Points'; this.geometry = geometry; this.material = material; }
}
export class Line extends Object3D {
    constructor(geometry = null, material = null) { super(); this.type = 'Line'; this.geometry = geometry; this.material = material; }
}
export class Scene extends Group {}

export class BufferAttribute {
    constructor(array, itemSize) { this.array = array; this.itemSize = itemSize; this.count = array ? array.length / itemSize : 0; this.needsUpdate = false; }
    setUsage() { return this; }
    getX(i) { return this.array[i * this.itemSize]; }
    getY(i) { return this.array[i * this.itemSize + 1]; }
    getZ(i) { return this.array[i * this.itemSize + 2]; }
    setXYZ(i, x, y, z) { this.array[i * this.itemSize] = x; this.array[i * this.itemSize + 1] = y; this.array[i * this.itemSize + 2] = z; return this; }
}

export class BufferGeometry {
    constructor() {
        const verts = new Float32Array(30);
        this.attributes = { position: new BufferAttribute(verts, 3) };
    }
    setAttribute(name, attr) { this.attributes[name] = attr; return this; }
    rotateX() { return this; }
    rotateY() { return this; }
    rotateZ() { return this; }
    translate() { return this; }
    scale() { return this; }
    computeVertexNormals() { return this; }
    dispose() {}
}

export class BoxGeometry extends BufferGeometry {}
export class SphereGeometry extends BufferGeometry {}
export class CylinderGeometry extends BufferGeometry {}
export class ConeGeometry extends BufferGeometry {}
export class TorusGeometry extends BufferGeometry {}
export class RingGeometry extends BufferGeometry {}
export class CircleGeometry extends BufferGeometry {}
export class PlaneGeometry extends BufferGeometry {}
export class CapsuleGeometry extends BufferGeometry {}
export class DodecahedronGeometry extends BufferGeometry {}
export class OctahedronGeometry extends BufferGeometry {}
export class IcosahedronGeometry extends BufferGeometry {}
export class TetrahedronGeometry extends BufferGeometry {}

export class Material {
    constructor(opts = {}) { Object.assign(this, opts); this.color = new Color(opts.color ?? 0xffffff); this.emissive = new Color(opts.emissive ?? 0x000000); }
    dispose() {}
    clone() { return new this.constructor(this); }
}
export class MeshStandardMaterial extends Material {}
export class MeshBasicMaterial extends Material {}
export class MeshLambertMaterial extends Material {}
export class MeshPhongMaterial extends Material {}
export class ShaderMaterial extends Material {}
export class PointsMaterial extends Material {}
export class LineBasicMaterial extends Material {}

export const MathUtils = {
    clamp: (v, min, max) => Math.max(min, Math.min(max, v)),
    lerp: (a, b, t) => a + (b - a) * t,
};

export const DoubleSide = 2;
export const BackSide = 1;
export const FrontSide = 0;
export const AdditiveBlending = 2;
export const NormalBlending = 1;
export const DynamicDrawUsage = 35048;
export const RepeatWrapping = 1000;
export const ACESFilmicToneMapping = 4;
export const SRGBColorSpace = 'srgb';
export const PCFSoftShadowMap = 2;
