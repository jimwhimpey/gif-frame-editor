import { defineConfig } from 'vite'

export default defineConfig({
  preview: {
    port: 8090,
    host: true,
    allowedHosts: ['gifeditor.jimwhimpey.com'],
  },
})
