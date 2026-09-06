import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

const baked = (name: string): string => JSON.stringify(process.env[name] ?? '')

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    define: {
      __INBOXSCOUT_GOOGLE_CLIENT_ID__: baked('INBOXSCOUT_GOOGLE_CLIENT_ID'),
      __INBOXSCOUT_GOOGLE_CLIENT_SECRET__: baked('INBOXSCOUT_GOOGLE_CLIENT_SECRET'),
      __INBOXSCOUT_MS_CLIENT_ID__: baked('INBOXSCOUT_MS_CLIENT_ID')
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    plugins: [react()]
  }
})
