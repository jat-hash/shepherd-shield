import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import base44Plugin from '@base44/vite-plugin';

const reactPath = path.resolve(__dirname, './node_modules/react');
const reactDomPath = path.resolve(__dirname, './node_modules/react-dom');

export default defineConfig({
  plugins: [
    react(),
    base44Plugin(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      'react': reactPath,
      'react-dom': reactDomPath,
    },
    dedupe: ['react', 'react-dom', 'react-router-dom'],
  },
  optimizeDeps: {
    exclude: ['@base44/sdk'],
  },
});