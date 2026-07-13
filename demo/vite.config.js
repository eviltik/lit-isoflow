import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// Multi-page demo: Vite only picks up the root index.html on its own, so each
// demo has to be declared as an entry or it silently vanishes from the build.
export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        index: resolve(import.meta.dirname, 'index.html'),
        editor: resolve(import.meta.dirname, 'editor/index.html'),
        stress: resolve(import.meta.dirname, 'stress/index.html')
      }
    }
  }
});
