import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: resolve(__dirname, 'src/main/index.ts')
      }
    }
  },
  preload: {
    // sandbox: true (main/index.ts) não suporta preload em ESM — o
    // renderer/main saem como ESM (.mjs), mas o preload sandboxado *precisa*
    // ser CommonJS, senão o Electron recusa carregar com "Cannot use import
    // statement outside a module". Sem externalizeDepsPlugin aqui: em modo
    // CJS sandboxado as dependências precisam vir empacotadas, não externas
    // (hoje o preload só usa `electron`, que o electron-vite já trata como
    // externo automaticamente de qualquer forma).
    build: {
      rollupOptions: {
        input: resolve(__dirname, 'src/preload/index.ts'),
        output: { format: 'cjs' }
      }
    }
  },
  renderer: {
    root: 'src/renderer',
    build: {
      rollupOptions: {
        input: resolve(__dirname, 'src/renderer/index.html')
      }
    },
    plugins: [react(), tailwindcss()]
  }
})
