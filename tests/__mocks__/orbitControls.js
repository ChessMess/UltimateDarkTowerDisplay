class OrbitControls {
  constructor() {
    this.target = {
      x: 0, y: 0, z: 0,
      set() {},
      clone() { return { x: 0, y: 0, z: 0, set() {}, toArray() { return [0, 0, 0]; } }; },
      toArray() { return [0, 0, 0]; },
    };
    this.enableDamping = false;
    this.dampingFactor = 0;
  }
  update() {}
  dispose() {}
}
module.exports = { OrbitControls };
