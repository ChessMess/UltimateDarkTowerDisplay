// Minimal mock of `three` and related modules to keep the Jest suite (which
// runs on Node + jsdom) free of WebGL + ESM-only imports. Tower3DView is not
// unit-tested directly; this mock simply prevents accidental imports from
// crashing the suite.
class Scene {
  constructor() {
    this.children = [];
  }
  add(obj) {
    this.children.push(obj);
  }
}
class Group {
  constructor() {
    this.children = [];
    this.position = new Vector3();
  }
  add(obj) {
    this.children.push(obj);
    if (obj) obj.parent = this;
  }
}
class Object3D {
  constructor() {
    this.children = [];
    this.position = new Vector3();
    this.parent = null;
  }
  add(obj) {
    this.children.push(obj);
    if (obj) obj.parent = this;
  }
  removeFromParent() {
    if (this.parent && this.parent.children) {
      const i = this.parent.children.indexOf(this);
      if (i >= 0) this.parent.children.splice(i, 1);
    }
    this.parent = null;
  }
}
class Vector3 {
  constructor(x = 0, y = 0, z = 0) {
    this.x = x;
    this.y = y;
    this.z = z;
  }
  clone() {
    return new Vector3(this.x, this.y, this.z);
  }
  set(x, y, z) {
    this.x = x;
    this.y = y;
    this.z = z;
    return this;
  }
  sub() {
    return this;
  }
  length() {
    return 0;
  }
  lengthSq() {
    return 0;
  }
  toArray() {
    return [this.x, this.y, this.z];
  }
}
class Color {
  constructor(c) {
    this.value = c;
  }
  setHex(c) {
    this.value = c;
    return this;
  }
  set(c) {
    this.value = c;
    return this;
  }
}
class PerspectiveCamera {
  constructor() {
    this.position = new Vector3();
    this.fov = 45;
    this.children = [];
    this.parent = null;
    this.near = 0.1;
    this.far = 1000;
    this.aspect = 1;
  }
  add(obj) {
    this.children.push(obj);
    if (obj) obj.parent = this;
  }
  lookAt() {}
  updateProjectionMatrix() {}
}
class WebGLRenderer {
  constructor() {
    this.domElement = document.createElement('canvas');
    this.info = { memory: { geometries: 0, textures: 0 } };
    this.shadowMap = { enabled: false, type: 0 };
    this.toneMapping = 0;
    this.toneMappingExposure = 1;
    this.outputColorSpace = '';
  }
  setPixelRatio() {}
  setSize() {}
  render() {}
  dispose() {}
  forceContextLoss() {}
}
class HemisphereLight {
  constructor(sky = 0xffffff, ground = 0x000000, intensity = 1) {
    this.color = new Color(sky);
    this.groundColor = new Color(ground);
    this.intensity = intensity;
  }
}
class DirectionalLight {
  constructor(color = 0xffffff, intensity = 1) {
    this.color = new Color(color);
    this.intensity = intensity;
    this.position = new Vector3();
    this.castShadow = false;
    this.shadow = {
      mapSize: { set() {}, x: 0, y: 0 },
      bias: 0,
      normalBias: 0,
      camera: {
        left: 0,
        right: 0,
        top: 0,
        bottom: 0,
        near: 0.1,
        far: 1000,
        updateProjectionMatrix() {},
      },
    };
    this.target = null;
  }
}
class RectAreaLight {
  constructor(color, intensity = 1, width = 1, height = 1) {
    this.color = new Color(color);
    this.intensity = intensity;
    this.width = width;
    this.height = height;
    this.position = new Vector3();
    this.parent = null;
  }
  lookAt() {}
}
class Box3 {
  setFromObject() {
    return this;
  }
  getCenter(v) {
    return v;
  }
  getSize(v) {
    return v;
  }
  getBoundingSphere(s) {
    s.radius = 1;
    return s;
  }
}
class Sphere {
  constructor() {
    this.radius = 0;
  }
}

class Mesh {
  constructor(geometry, material) {
    this.geometry = geometry;
    this.material = material;
    this.position = new Vector3();
    this.rotation = { x: 0, y: 0, z: 0 };
    this.children = [];
    this.parent = null;
    this.isMesh = true;
    this.visible = true;
    this.castShadow = false;
    this.receiveShadow = false;
  }
  add(obj) {
    this.children.push(obj);
    if (obj) obj.parent = this;
  }
  traverse(cb) {
    cb(this);
    for (const c of this.children) if (c.traverse) c.traverse(cb);
  }
  removeFromParent() {
    if (this.parent && this.parent.children) {
      const i = this.parent.children.indexOf(this);
      if (i >= 0) this.parent.children.splice(i, 1);
    }
    this.parent = null;
  }
}

class MeshStandardMaterial {
  constructor(opts = {}) {
    this.color = new Color(opts.color);
    this.emissive = new Color(opts.emissive);
    this.emissiveIntensity = opts.emissiveIntensity ?? 0;
    this.toneMapped = opts.toneMapped ?? true;
    this._opts = opts;
  }
  clone() {
    return new MeshStandardMaterial(this._opts);
  }
  dispose() {}
}

class PointLight {
  constructor(color, intensity = 1, distance = 0, decay = 2) {
    this.color = new Color(color);
    this.intensity = intensity;
    this.distance = distance;
    this.decay = decay;
    this.visible = true;
    this.position = new Vector3();
    this.parent = null;
  }
  removeFromParent() {
    if (this.parent && this.parent.children) {
      const i = this.parent.children.indexOf(this);
      if (i >= 0) this.parent.children.splice(i, 1);
    }
    this.parent = null;
  }
}

class SphereGeometry {
  constructor(radius, widthSegments, heightSegments) {
    this.radius = radius;
    this.widthSegments = widthSegments;
    this.heightSegments = heightSegments;
  }
  dispose() {}
}

class CircleGeometry {
  constructor(radius, segments) {
    this.radius = radius;
    this.segments = segments;
  }
  dispose() {}
}

class AxesHelper {
  constructor(size) {
    this.size = size;
    this.visible = true;
    this.scale = { setScalar() {} };
    this.position = new Vector3();
    this.parent = null;
  }
  removeFromParent() {
    if (this.parent && this.parent.children) {
      const i = this.parent.children.indexOf(this);
      if (i >= 0) this.parent.children.splice(i, 1);
    }
    this.parent = null;
  }
}

module.exports = {
  Scene,
  Group,
  Object3D,
  Vector3,
  Color,
  PerspectiveCamera,
  WebGLRenderer,
  HemisphereLight,
  DirectionalLight,
  RectAreaLight,
  Box3,
  Sphere,
  Mesh,
  MeshStandardMaterial,
  PointLight,
  SphereGeometry,
  CircleGeometry,
  AxesHelper,
  SRGBColorSpace: 'srgb',
  ACESFilmicToneMapping: 1,
  PCFSoftShadowMap: 2,
};
