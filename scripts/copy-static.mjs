import { mkdirSync, cpSync, readdirSync } from 'node:fs';
for (const dir of ['dist/viz/public', 'dist/parser/grammars', 'dist/security']) mkdirSync(dir, { recursive: true });
cpSync('src/viz/public', 'dist/viz/public', { recursive: true });
for (const file of readdirSync('src/parser/grammars').filter(file => file.endsWith('.wasm'))) {
  cpSync(`src/parser/grammars/${file}`, `dist/parser/grammars/${file}`);
}
cpSync('src/security/native-binding-allowlist.json', 'dist/security/native-binding-allowlist.json');
