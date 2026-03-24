import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { base44VitePlugin } from '@base44/vite-plugin';

export default defineConfig({
  plugins: [
    react(),
    base44VitePlugin(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
    dedupe: ['react', 'react-dom'],
  },
});