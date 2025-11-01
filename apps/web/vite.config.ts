import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(() => {
  const isDesktopBuild = process.env.VITE_DESKTOP_APP === '1';

  return {
    base: isDesktopBuild ? './' : '/',
    plugins: [react()],
    server: {
      host: '0.0.0.0',
      port: 5173,
      proxy: {
        '/api': {
          target: 'http://localhost:3000',
          changeOrigin: true,
        },
        '/ws': {
          target: 'ws://localhost:8080',
          ws: true,
          rewrite: (path) => path.replace(/^\/ws/, '/'),
        },
      },
    },
  };
});
