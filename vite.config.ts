/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// GitHub Pages 專案站掛在 /<repo>/ 底下，資源路徑必須帶這個前綴
function resolveBase(env: Record<string, string>): string {
  if (env.VITE_BASE) return env.VITE_BASE.endsWith('/') ? env.VITE_BASE : `${env.VITE_BASE}/`
  const repo = process.env.GITHUB_REPOSITORY?.split('/')[1]
  if (process.env.GITHUB_ACTIONS && repo && !repo.endsWith('.github.io')) return `/${repo}/`
  return '/'
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    base: resolveBase({ ...env, ...process.env } as Record<string, string>),
    plugins: [
      vue(),
      tailwindcss(),
      VitePWA({
        // 不自動接管：正在填表單時重新整理會丟資料，改由 UpdatePrompt 讓使用者自己按更新
        registerType: 'prompt',
        includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
        manifest: {
          name: '旅遊規劃',
          short_name: '旅遊規劃',
          description: '和旅伴一起排行程、記旅費',
          lang: 'zh-TW',
          theme_color: '#0f1b2d',
          background_color: '#0b1422',
          display: 'standalone',
          start_url: '.',
          scope: '.',
          icons: [
            { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
            { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
            { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        },
      }),
    ],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    test: {
      include: ['src/**/*.test.ts'],
    },
  }
})
