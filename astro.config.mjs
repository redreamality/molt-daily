import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  output: 'static',
  site: 'https://redreamality.github.io',
  base: '/molt-daily',
  vite: {
    plugins: [tailwindcss()],
  },
});
