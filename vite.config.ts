import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'node:url';
import {defineConfig, loadEnv} from 'vite';

const configDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, configDir, '');
  return {
    plugins: [react(), tailwindcss()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(configDir, '.'),
      },
    },
    server: {
      // HMR + WebSocket attach to the Express server in server.ts (hmr: { server }).
      // Only force off here when needed (e.g. AI Studio); avoid hmr: true so merge stays an object.
      ...(process.env.DISABLE_HMR === "true" ? { hmr: false as const } : {}),
    },
  };
});
