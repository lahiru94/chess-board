import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';
import { drawerMarkup } from './src/app/markup.ts';
import { Board } from './src/core/index.ts';
import { boardMarkup } from './src/view2d/markup.ts';

// Inlined into index.html so the first paint needs no extra request (PLAN.md 6.1).
const CSS_FILES = ['src/app/app.css', 'src/view2d/view2d.css', 'src/skins/2d/classic/skin.css'];
const SPRITE_FILE = 'src/skins/2d/classic/pieces.svg';

function minifySvg(svg: string): string {
  return svg
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/>\s+</g, '><')
    .trim();
}

/**
 * Pre-renders the start position, drawer, sprite, and CSS into index.html.
 * Uses the same markup functions as the runtime, so the 2D view can adopt the DOM as is.
 */
function prerender(): Plugin {
  const files = [...CSS_FILES, SPRITE_FILE].map((f) => resolve(f));
  const read = (f: string) => readFileSync(resolve(f), 'utf8');
  return {
    name: 'chess-prerender',
    // 'pre' so Vite's own HTML pass sees (and minifies) the inlined CSS.
    transformIndexHtml: {
      order: 'pre',
      handler: (html) =>
        html
          .replace('<!--inline-css-->', CSS_FILES.map(read).join('\n'))
          .replace('<!--sprite-->', minifySvg(read(SPRITE_FILE)))
          .replace('<!--board-->', boardMarkup(new Board().onBoard(), 'white'))
          .replace('<!--drawer-->', drawerMarkup()),
    },
    configureServer(server) {
      server.watcher.add(files);
      server.watcher.on('change', (f) => {
        if (files.includes(f)) server.ws.send({ type: 'full-reload' });
      });
    },
  };
}

export default defineConfig({
  plugins: [prerender()],
  build: {
    target: 'es2022',
    // Every browser that runs this app supports modulepreload natively.
    modulePreload: { polyfill: false },
    reportCompressedSize: false,
  },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['src/core/**/*.ts'],
      // PLAN.md M2: the core is fully covered, and stays that way.
      thresholds: { 100: true },
      reporter: ['text-summary'],
    },
  },
});
