import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig(({ mode }) => ({
  plugins: [
    tailwindcss(),
    sveltekit()
  ],
  resolve: {
    conditions: mode === 'test' ? ['browser'] : []
  },
  test: {
    include: ['src/**/*.{test,spec}.{js,ts}'],
    environment: 'jsdom',
    globals: true,
    reporters: ['verbose']
  }
}));
