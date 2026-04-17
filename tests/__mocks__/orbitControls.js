class OrbitControls {
  constructor() {
    this.target = { x: 0, y: 0, z: 0, set() {} };
    this.enableDamping = false;
    this.dampingFactor = 0;
  }
  update() {}
  dispose() {}
}
module.exports = { OrbitControls };
