import { defineConfig, type Plugin } from 'vite';
import { resolve } from 'path';
import { copyFileSync, mkdirSync } from 'fs';

function redirectExamplePath(): Plugin {
  const redirect = (req: { url?: string }, res: { statusCode: number; setHeader(name: string, value: string): void; end(): void }, next: () => void) => {
    if (req.url === '/') {
      res.statusCode = 302;
      res.setHeader('Location', '/example/');
      res.end();
      return;
    }

    if (req.url === '/example') {
      res.statusCode = 302;
      res.setHeader('Location', '/example/');
      res.end();
      return;
    }

    next();
  };

  return {
    name: 'redirect-example-path',
    configureServer(server) {
      server.middlewares.use(redirect);
    },
    configurePreviewServer(server) {
      server.middlewares.use(redirect);
    },
  };
}

// Copies the tower GLB into dist/3d/assets/ so consumers can import it via
// `ultimatedarktowerdisplay/dist/3d/assets/tower.glb`. The source no longer
// imports the asset directly (it's consumer-supplied via TowerDisplayOptions.modelUrl),
// so Vite wouldn't otherwise emit it.
function copyTowerAsset(): Plugin {
  return {
    name: 'copy-tower-asset',
    apply: 'build',
    closeBundle() {
      const src = resolve(__dirname, 'src/3d/assets/tower.glb');
      const destDir = resolve(__dirname, 'dist/3d/assets');
      mkdirSync(destDir, { recursive: true });
      copyFileSync(src, resolve(destDir, 'tower.glb'));
    },
  };
}

export default defineConfig({
  plugins: [redirectExamplePath(), copyTowerAsset()],
  resolve: {
    alias: {
      // The ESM build of ultimatedarktower uses createRequire which is not
      // available in browsers. Alias to the CJS build instead.
      ultimatedarktower: resolve(__dirname, 'node_modules/ultimatedarktower/dist/src/index.js'),
    },
  },
  assetsInclude: ['**/*.glb'],
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'UltimateDarkTowerDisplay',
      formats: ['es', 'cjs'],
      fileName: (format) => `index.${format === 'es' ? 'esm' : 'cjs'}.js`,
    },
    // Force large binary assets (GLB model) to emit as separate files rather
    // than inlining as base64 in the JS bundle.
    assetsInlineLimit: 0,
    rollupOptions: {
      // Peer/external deps — not bundled.
      external: [
        'ultimatedarktower',
        'three',
        /^three\/.*/,
        'gsap',
      ],
    },
    sourcemap: true,
  },
});
