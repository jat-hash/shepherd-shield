import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import base44Plugin from '@base44/vite-plugin';

export default defineConfig({
  plugins: [
    react(),
    base44Plugin(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      'react': path.resolve(__dirname, './node_modules/react'),
      'react-dom': path.resolve(__dirname, './node_modules/react-dom'),
      'react-dom/client': path.resolve(__dirname, './node_modules/react-dom/client'),
    },
    dedupe: ['react', 'react-dom'],
  },
  optimizeDeps: {
    force: true,
  },
});