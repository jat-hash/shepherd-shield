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
      'react': path.resolve(__dirname, './node_modules/react/index.js'),
      'react-dom': path.resolve(__dirname, './node_modules/react-dom/index.js'),
      'react-dom/client': path.resolve(__dirname, './node_modules/react-dom/client.js'),
      'react/jsx-runtime': path.resolve(__dirname, './node_modules/react/jsx-runtime.js'),
    },
    dedupe: ['react', 'react-dom', 'react-router-dom', 'scheduler'],
  },
  optimizeDeps: {
    force: true,
    exclude: ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime'],
  },
});