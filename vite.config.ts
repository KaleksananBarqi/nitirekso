import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
    root: resolve(__dirname, 'src'),
    plugins: [react(), tailwindcss()],
    resolve: {
        alias: {
            '@': resolve(__dirname, 'src'),
            '@shared': resolve(__dirname, 'shared')
        }
    },
    build: {
        outDir: '../out/renderer',
        emptyOutDir: true,
        rollupOptions: {
            input: resolve(__dirname, 'src/index.html')
        }
    },
    server: {
        port: 5173,
        strictPort: true,
    }
})
