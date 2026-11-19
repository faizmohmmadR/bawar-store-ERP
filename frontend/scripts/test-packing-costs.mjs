import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';

const temporary = await mkdtemp(join(tmpdir(), 'erp-packing-tests-'));
try {
  const outfile = join(temporary, 'packing.test.cjs');
  await build({
    entryPoints: [resolve('src/lib/packingStockCosts.test.ts')], outfile, bundle: true,
    platform: 'node', format: 'cjs', mainFields: ['module', 'main'], alias: { '@': resolve('src') }, logLevel: 'warning',
  });
  const result = spawnSync(process.execPath, [outfile], { stdio: 'inherit' });
  process.exitCode = result.status ?? 1;
} finally {
  await rm(temporary, { recursive: true, force: true });
}
