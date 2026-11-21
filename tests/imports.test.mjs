// Static check: every SCREEN_* / config name a game module uses must be imported
// or declared in that file. (node --check only parses; a missing import is a
// runtime ReferenceError that short-circuiting can hide, as happened with
// SCREEN_PLAY in render.js.)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const srcDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'game', 'src');

test('modules: every SCREEN_* name used is imported or declared', () => {
  for (const file of readdirSync(srcDir).filter((f) => f.endsWith('.js'))) {
    const source = readFileSync(join(srcDir, file), 'utf8');
    const imported = new Set();
    for (const match of source.matchAll(/import\s*\{([^}]*)\}\s*from/g)) {
      for (const part of match[1].split(',')) {
        const name = part.trim().split(/\s+as\s+/)[0].trim();
        if (name) imported.add(name);
      }
    }
    for (const match of source.matchAll(/import\s+(\w+)\s+from/g)) imported.add(match[1]);
    const declared = new Set(imported);
    for (const match of source.matchAll(/(?:const|let|function|class)\s+(\w+)/g)) declared.add(match[1]);
    for (const match of source.matchAll(/export\s+(?:const|let|function|class)\s+(\w+)/g)) declared.add(match[1]);
    const used = new Set(source.match(/SCREEN_[A-Z_]+/g) ?? []);
    for (const name of used) {
      assert.ok(declared.has(name), `${file}: uses ${name} without importing or declaring it`);
    }
  }
});
