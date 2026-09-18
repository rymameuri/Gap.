import { cp, mkdir, rm } from 'node:fs/promises';
const base = new URL('./', import.meta.url);
const output = new URL('./dist/', base);
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(new URL('./apps/frontend/src/', base), new URL('./src/', output), { recursive: true });
await cp(new URL('./data/', base), new URL('./data/', output), { recursive: true });
await cp(new URL('./apps/frontend/index.html', base), new URL('./index.html', output));
for (const [route, folder] of [['teacher','instructor'], ['student','student']]) {
  await mkdir(new URL(route + '/', output), { recursive: true });
  await cp(new URL('./apps/frontend/src/pages/' + folder + '/index.html', base), new URL(route + '/index.html', output));
}
console.log('Gap built in dist/');
