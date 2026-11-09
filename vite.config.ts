import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [react(), VitePWA({
    injectRegister: 'script-defer',
    manifest: {
      id: '/', name: 'Silla Via', short_name: 'Silla Via', start_url: '/', scope: '/',
      display: 'standalone', background_color: '#f7f6ef', theme_color: '#14594f',
      icons: [
        { src: '/icons/demo-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: '/icons/demo-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: '/icons/demo-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    },
    workbox: { navigateFallback: '/index.html', navigateFallbackDenylist: [/^\/api(?:\/|$)/], globPatterns: ['**/*.{html,js,css,png,svg}'] },
  })],
})

