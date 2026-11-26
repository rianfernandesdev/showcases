import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const page = (p) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  base: process.env.BASE_PATH ?? '/showcases/',
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      input: {
        main: page('./index.html'),
        odonto: page('./odonto/index.html'),
        estetica: page('./estetica/index.html'),
      },
    },
  },
});
