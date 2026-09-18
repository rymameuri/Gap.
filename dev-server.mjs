import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';

const server = await createServer({
  configFile: fileURLToPath(new URL('./vite.config.ts', import.meta.url)),
  server: { port: Number(process.env.PORT || 3000) },
});

await server.listen();
server.printUrls();
