import react from '@vitejs/plugin-react';
import {defineConfig} from 'vite';
import {localApi} from './local-api.ts';

// https://vite.dev/config/
export default defineConfig(({mode}) => ({
  // `npm run dev` also answers /api/* from api/, with the variables of .env.local (see local-api.ts).
  plugins: [react(), localApi(mode)],
  // Ports 5190 and 5191 are Retrospin's and Retroreel's: all three can run side by side.
  server: {host: '127.0.0.1', port: 5192, strictPort: true},
}));
