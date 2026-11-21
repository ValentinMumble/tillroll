import {readFileSync} from 'node:fs';
import react from '@vitejs/plugin-react';
import {defineConfig, type Plugin} from 'vite';
import {localApi} from './local-api.ts';

const LOADING_FRAME = '<!-- loading frame -->';

/** Puts the app's loading screen (src/loading-frame.html, from design/render-launch.mjs) into the page: see index.html. */
function loadingFrame(): Plugin {
  return {
    name: 'loading-frame',
    transformIndexHtml(html) {
      if (!html.includes(LOADING_FRAME)) throw new Error(`index.html has lost its ${LOADING_FRAME}`);
      const markup = readFileSync(new URL('src/loading-frame.html', import.meta.url), 'utf8').trim();
      return html.replace(LOADING_FRAME, () => markup);
    },
  };
}

// https://vite.dev/config/
export default defineConfig(({mode}) => ({
  // `npm run dev` also answers /api/* from api/, with the variables of .env.local (see local-api.ts).
  plugins: [react(), localApi(mode), loadingFrame()],
  // Ports 5190 and 5191 are Retrospin's and Retroreel's: all three can run side by side.
  server: {host: '127.0.0.1', port: 5192, strictPort: true},
}));
