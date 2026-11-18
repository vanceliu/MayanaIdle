/**
 * 星盤 demo 單檔建置：`npm run demo:star-chart` → `dist-demo/star-chart.html`。
 * JS 與 CSS 全部內嵌，雙擊即可離線開啟（`file://`）。
 */
import { defineConfig } from 'vite';
import type { Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const demoDir = fileURLToPath(new URL('.', import.meta.url));

function inlineBundle(): Plugin {
  return {
    name: 'star-chart-inline-bundle',
    enforce: 'post',
    transformIndexHtml(html) {
      const date = new Date().toISOString().slice(0, 10);
      return html.replace(/<title>(.*?)<\/title>/, `<title>$1（${date}）</title>`);
    },
    generateBundle(_options, bundle) {
      const htmlFile = Object.values(bundle).find(f => f.type === 'asset' && f.fileName.endsWith('.html'));
      if (!htmlFile || htmlFile.type !== 'asset') return;
      let html = String(htmlFile.source);
      for (const [name, file] of Object.entries(bundle)) {
        if (file.type === 'chunk') {
          html = html.replace(/<script type="module" crossorigin src="[^"]*"><\/script>/,
            () => `<script type="module">${file.code}</script>`);
          delete bundle[name];
        } else if (file.fileName.endsWith('.css')) {
          html = html.replace(/<link rel="stylesheet" crossorigin href="[^"]*">/,
            () => `<style>${String(file.source)}</style>`);
          delete bundle[name];
        }
      }
      htmlFile.source = html;
    },
  };
}

export default defineConfig({
  root: demoDir,
  base: './',
  plugins: [react(), inlineBundle()],
  build: {
    outDir: fileURLToPath(new URL('../dist-demo', import.meta.url)),
    emptyOutDir: true,
    assetsInlineLimit: Number.MAX_SAFE_INTEGER,
    rolldownOptions: {
      input: fileURLToPath(new URL('./star-chart.html', import.meta.url)),
      output: { codeSplitting: false },
    },
  },
});
