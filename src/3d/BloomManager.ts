import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

import type { ResolvedLightingConfig } from './types';
import { BLOOM_LAYER } from './constants';

const BLOOM_VERTEX_SHADER = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const BLOOM_FRAGMENT_SHADER = `
uniform sampler2D baseTexture;
uniform sampler2D bloomTexture;
varying vec2 vUv;
void main() {
  gl_FragColor = texture2D(baseTexture, vUv) + texture2D(bloomTexture, vUv);
}
`;

/**
 * Selective-bloom postprocessing. Renders meshes on the bloom layer through
 * a UnrealBloomPass into an offscreen target, then composites that against
 * a normal scene render. Owns its composers and the dark-material swap that
 * masks non-bloom geometry during the bloom pass.
 *
 * The bloom layer index ({@link BLOOM_LAYER}) must be enabled on any mesh
 * that should glow. Per-frame cost is two scene traversals (darken + restore)
 * plus two composer renders.
 */
export class BloomManager {
  private readonly bloomLayer = new THREE.Layers();
  private readonly darkMaterial = new THREE.MeshBasicMaterial({ color: 0x000000 });
  private readonly savedMaterials = new Map<string, THREE.Material | THREE.Material[]>();

  private readonly bloomComposer: EffectComposer;
  private readonly finalComposer: EffectComposer;
  private readonly bloomPass: UnrealBloomPass;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly camera: THREE.PerspectiveCamera,
    private readonly renderer: THREE.WebGLRenderer,
    lighting: ResolvedLightingConfig,
    width: number,
    height: number,
  ) {
    this.bloomLayer.set(BLOOM_LAYER);

    this.bloomComposer = new EffectComposer(renderer);
    this.bloomComposer.renderToScreen = false;
    this.bloomComposer.addPass(new RenderPass(scene, camera));
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(width, height),
      lighting.scene.bloom.strength,
      lighting.scene.bloom.radius,
      lighting.scene.bloom.threshold,
    );
    this.bloomComposer.addPass(this.bloomPass);

    const finalPass = new ShaderPass(
      new THREE.ShaderMaterial({
        uniforms: {
          baseTexture: { value: null },
          bloomTexture: { value: this.bloomComposer.renderTarget2.texture },
        },
        vertexShader: BLOOM_VERTEX_SHADER,
        fragmentShader: BLOOM_FRAGMENT_SHADER,
      }),
      'baseTexture',
    );
    finalPass.needsSwap = true;

    this.finalComposer = new EffectComposer(renderer);
    this.finalComposer.addPass(new RenderPass(scene, camera));
    this.finalComposer.addPass(finalPass);
    this.finalComposer.addPass(new OutputPass());
  }

  /** Render the scene with selective bloom applied. */
  render(): void {
    this.darkenNonBloom();
    this.bloomComposer.render();
    this.restoreMaterials();
    this.finalComposer.render();
  }

  /** Push updated bloom strength/radius/threshold from a new lighting config. */
  applyConfig(lighting: ResolvedLightingConfig): void {
    const { strength, radius, threshold } = lighting.scene.bloom;
    this.bloomPass.strength = strength;
    this.bloomPass.radius = radius;
    this.bloomPass.threshold = threshold;
  }

  /** Forward a canvas resize to both composers. */
  setSize(width: number, height: number): void {
    this.bloomComposer.setSize(width, height);
    this.finalComposer.setSize(width, height);
  }

  dispose(): void {
    this.bloomComposer.dispose();
    this.finalComposer.dispose();
    this.darkMaterial.dispose();
    this.savedMaterials.clear();
  }

  private darkenNonBloom(): void {
    this.scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      if (this.bloomLayer.test(mesh.layers)) return;
      this.savedMaterials.set(mesh.uuid, mesh.material);
      mesh.material = this.darkMaterial;
    });
  }

  private restoreMaterials(): void {
    this.scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      const saved = this.savedMaterials.get(mesh.uuid);
      if (saved === undefined) return;
      mesh.material = saved;
      this.savedMaterials.delete(mesh.uuid);
    });
  }
}
