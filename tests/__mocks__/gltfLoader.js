// Test hook: when auto-load is on, `load` invokes onLoad synchronously with a
// mock GLTF. Tests that want to exercise the pre-load branch can flip this off.
let autoLoad = true;
// Test hook: which seal nodes to include in the mock scene. null → full 12.
let sealNamesOverride = null;
const instances = [];

const DEFAULT_SEAL_NAMES = [
  'seal_north_top', 'seal_north_middle', 'seal_north_bottom',
  'seal_south_top', 'seal_south_middle', 'seal_south_bottom',
  'seal_east_top',  'seal_east_middle',  'seal_east_bottom',
  'seal_west_top',  'seal_west_middle',  'seal_west_bottom',
];

function makeNode(name) {
  return {
    name,
    visible: true,
    children: [],
    parent: null,
    traverse(cb) { cb(this); },
  };
}

function makeMockScene() {
  const scene = {
    name: 'Scene',
    children: [],
    parent: null,
    position: {
      x: 0, y: 0, z: 0,
      sub() { return this; },
      toArray() { return [0, 0, 0]; },
    },
    add(child) {
      this.children.push(child);
      if (child) child.parent = this;
    },
    traverse(cb) {
      cb(this);
      for (const c of this.children) {
        if (typeof c.traverse === 'function') c.traverse(cb);
      }
    },
    removeFromParent() { this.parent = null; },
  };

  const names = sealNamesOverride ?? DEFAULT_SEAL_NAMES;
  for (const name of names) {
    scene.add(makeNode(name));
  }
  return scene;
}

class GLTFLoader {
  constructor() {
    instances.push(this);
  }

  setDRACOLoader(_loader) {
    return this;
  }

  load(_url, onLoad, _onProgress, _onError) {
    this._onLoad = onLoad;
    if (autoLoad && onLoad) {
      onLoad({ scene: makeMockScene() });
    }
  }

  // Test helper: fire onLoad deferred (for tests that want to observe pre-load state).
  fireLoad() {
    if (this._onLoad) this._onLoad({ scene: makeMockScene() });
  }
}

module.exports = {
  GLTFLoader,
  __setAutoLoad(v) { autoLoad = v; },
  __setSealNames(names) { sealNamesOverride = names; },
  __getLastInstance() { return instances[instances.length - 1]; },
  __reset() { autoLoad = true; sealNamesOverride = null; instances.length = 0; },
};
