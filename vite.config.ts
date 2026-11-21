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

/**
 * Puts the built stylesheet inside the page, so its first paint needs nothing but the page. Opened from an iPhone's
 * home screen, iOS takes the launch image away on its own clock, and until the page has painted, the web view under
 * it is blank, which shows white: the sooner the first paint, the shorter that is.
 */
function inlineStylesheet(): Plugin {
  return {
    name: 'inline-stylesheet',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html, {bundle}) {
        const link = /<link rel="stylesheet" crossorigin href="\/(assets\/index-[^"]+\.css)">/.exec(html);
        const asset = link ? bundle?.[link[1]] : undefined;
        if (!link || asset?.type !== 'asset') throw new Error('The page has no stylesheet to put inside it');
        const css = typeof asset.source === 'string' ? asset.source : new TextDecoder().decode(asset.source);
        return html.replace(link[0], () => `<style>${css}</style>`);
      },
    },
  };
}

// https://vite.dev/config/
export default defineConfig(({mode}) => ({
  // `npm run dev` also answers /api/* from api/, with the variables of .env.local (see local-api.ts).
  plugins: [react(), localApi(mode), loadingFrame(), inlineStylesheet()],
  // Ports 5190 and 5191 are Retrospin's and Retroreel's: all three can run side by side.
  server: {host: '127.0.0.1', port: 5192, strictPort: true},
}));
