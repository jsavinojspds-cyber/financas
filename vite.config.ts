import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// O app é servido em https://jsavinojspds-cyber.github.io/financas/
// Todo asset precisa sair com esse prefixo, senão o PWA quebra no iOS.
const BASE = '/financas/'

export default defineConfig({
  base: BASE,
  define: {
    // Carimbo do build, mostrado em Ajustes: permite ao usuário dizer com
    // precisão qual versão está rodando quando algo dá errado.
    __BUILD__: JSON.stringify(new Date().toISOString()),
  },
  // precisa espelhar os `paths` do tsconfig — o tsc resolve, o bundler não
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  plugins: [
    react(),
    VitePWA({
      // injectManifest: o Workbox só gera a lista de precache; o SW é nosso
      // (precisamos de lógica própria para notificações de vencimento).
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'prompt',
      injectRegister: null,
      manifest: false, // usamos public/manifest.webmanifest escrito à mão
      injectManifest: {
        // json entra por causa do mercado.json: sem ele no precache, a aba
        // "Hoje" ficaria sem cotações offline.
        globPatterns: ['**/*.{js,css,html,woff2,png,svg,webmanifest,json}'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      },
      devOptions: { enabled: false },
    }),
  ],
  build: {
    // Safari iOS 16.4+ (iPhone 17 Pro Max roda muito acima disso).
    target: ['es2020', 'safari16'],
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom'],
          supabase: ['@supabase/supabase-js'],
        },
      },
    },
  },
})
