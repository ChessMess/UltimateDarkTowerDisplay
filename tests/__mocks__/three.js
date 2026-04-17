// Minimal mock of `three` and related modules to keep the Jest suite (which
// runs on Node + jsdom) free of WebGL + ESM-only imports. Tower3DView is not
// unit-tested directly; this mock simply prevents accidental imports from
// crashing the suite.
class Scene {
  add() {}
}
class Group {}
class Vector3 {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
  clone() { return new Vector3(this.x, this.y, this.z); }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
  sub() { return this; }
  length() { return 0; }
  lengthSq() { return 0; }
}
class Color {}
class PerspectiveCamera {
  constructor() { this.position = new Vector3(); this.fov = 45; }
  lookAt() {}
  updateProjectionMatrix() {}
}
class WebGLRenderer {
  constructor() { this.domElement = document.createElement('canvas'); }
  setPixelRatio() {}
  setSize() {}
  render() {}
  dispose() {}
  forceContextLoss() {}
}
class HemisphereLight {}
class DirectionalLight { constructor() { this.position = new Vector3(); } }
class Box3 {
  setFromObject() { return this; }
  getCenter(v) { return v; }
  getSize(v) { return v; }
  getBoundingSphere(s) { s.radius = 1; return s; }
}
class Sphere { constructor() { this.radius = 0; } }

module.exports = {
  Scene, Group, Vector3, Color, PerspectiveCamera, WebGLRenderer,
  HemisphereLight, DirectionalLight, Box3, Sphere,
  SRGBColorSpace: 'srgb',
};
