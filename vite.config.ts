import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

const fromRoot = (path: string) => fileURLToPath(new URL(path, import.meta.url));

function workspaceRoutes(): Plugin {
  return {
    name: 'workspace-routes',
    configureServer(server) {
      server.middlewares.use((request, _response, next) => {
        const url = new URL(request.url ?? '/', 'http://localhost');
        const routes: Record<string, string> = {
          '/student': '/src/pages/student/index.html',
          '/student/': '/src/pages/student/index.html',
          '/teacher': '/src/pages/instructor/index.html',
          '/teacher/': '/src/pages/instructor/index.html',
        };
        if (routes[url.pathname]) request.url = routes[url.pathname] + url.search;
        next();
      });
    },
  };
}

export default defineConfig({
  root: fromRoot('./apps/frontend'),
  plugins: [react(), workspaceRoutes()],
  server: { host: '127.0.0.1', port: 3000 },
  build: {
    outDir: fromRoot('./dist'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        landing: fromRoot('./apps/frontend/index.html'),
        student: fromRoot('./apps/frontend/src/pages/student/index.html'),
        instructor: fromRoot('./apps/frontend/src/pages/instructor/index.html'),
      },
    },
  },
});
