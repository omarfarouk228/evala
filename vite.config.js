import { defineConfig } from 'vite';

// base relative : le jeu fonctionne sous /evala/ (GitHub Pages)
export default defineConfig({
  base: './',
  build: { target: 'es2020' },
});
