// Investigation-only substitutions. No production parser/resolver changes.
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
const root = process.cwd();
const target = process.argv[2] || 'bun-darwin-arm64';
const outfile = process.argv[3] || '/tmp/depwire-bun-spike/depwire';
const pkg = readFileSync('package.json', 'utf8');
const asset = (path: string, name: string) => `import ${name} from ${JSON.stringify(resolve(path))} with { type: 'file' };\n`;
const result = await Bun.build({
  entrypoints: [process.argv[4] || 'src/index.ts'],
  compile: { target: target as any, outfile },
  naming: { asset: '[name].[ext]' },
  plugins: [{ name: 'spike-embedded-assets', setup(build) {
    build.onLoad({ filter: /src\/.*\.ts$/ }, args => {
      let text = readFileSync(args.path, 'utf8');
      if (args.path.endsWith('/index.ts') || args.path.endsWith('/mcp/tools.ts')) {
        text = text.replace("JSON.parse(readFileSync(packageJsonPath, 'utf-8'))", `(${pkg})`);
      }
      if (args.path.endsWith('/mcp/server.ts')) {
        text = text.replace(/const pkg = JSON.parse\(readFileSync\(.*?;\n/, `const pkg = ${pkg};\n`);
      }
      if (args.path.endsWith('/parser/wasm-init.ts')) {
        let imports = asset('node_modules/web-tree-sitter/web-tree-sitter.wasm', 'runtimeWasm');
        const map: string[] = [];
        readdirSync('src/parser/grammars').filter(x => x.endsWith('.wasm')).forEach((file, i) => {
          imports += asset('src/parser/grammars/' + file, 'grammar' + i);
          map.push(`${JSON.stringify(file)}: grammar${i}`);
        });
        text = imports + `const embeddedGrammars = {${map.join(',')}};\n` + text;
        text = text.replace('await Parser.init();', 'await Parser.init({ locateFile: () => runtimeWasm });');
        text = text.replace('path.join(grammarsDir, file)', 'embeddedGrammars[file]');
      }
      if (args.path.endsWith('/security/native-bindings.ts')) {
        text = asset('src/security/native-binding-allowlist.json', 'allowlistAsset') + text;
        text = text.replace(/const candidates = \[[\s\S]*?\];/, 'const candidates = [allowlistAsset];');
      }
      if (args.path.endsWith('/viz/temporal-server.ts')) {
        let imports = '';
        const assets = ['temporal.html', 'temporal.js', 'temporal.css'];
        assets.forEach((file, i) => { imports += asset('src/viz/public/' + file, 'page' + i); });
        text = imports + text;
        text = text.replace("resolve(__dirname, 'viz', 'public')", 'dirname(page0)');
        text = text.replace("readFileSync(jsPath, 'utf-8')", "readFileSync(page1, 'utf-8')");
        text = text.replace("readFileSync(cssPath, 'utf-8')", "readFileSync(page2, 'utf-8')");
      }
      if (args.path.endsWith('/parser/cache.ts')) {
        text = text.replace("Database = nodeRequire('better-sqlite3');", "throw new Error('native cache excluded in spike');");
        text = text.replace('// better-sqlite3 unavailable — cache disabled, full parse still works.', "console.error('[standalone spike] SQLite cache unavailable; full parsing enabled.');");
      }
      return { contents: text, loader: 'ts' };
    });
  }}],
});
if (!result.success) { console.error(result.logs); process.exit(1); }
console.log(JSON.stringify({target,outfile,bytes: (await Bun.file(target.includes('windows') && !outfile.endsWith('.exe') ? outfile + '.exe' : outfile).stat()).size}));
