import { cp, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

await build({ configFile: fileURLToPath(new URL('./vite.config.ts', import.meta.url)) });

// Keep the existing public URLs while Vite bundles each HTML entry point.
for (const [route, folder] of [['teacher', 'instructor'], ['student', 'student']]) {
  const destination = new URL(`./dist/${route}/`, import.meta.url);
  await mkdir(destination, { recursive: true });
  await cp(
    new URL(`./dist/src/pages/${folder}/index.html`, import.meta.url),
    new URL('index.html', destination),
  );
}
