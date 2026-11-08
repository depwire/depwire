import { parseProject } from '../parser/index.js';
import { discoverJvmModuleRoots } from '../parser/jvm-modules.js';
import { initParser } from '../parser/wasm-init.js';
import { scanDirectory } from '../utils/files.js';
import { canonicalPath } from '../graph/paths.js';

/** verify-change contract §2: inspect failures/coverage before accepting a loaded graph. */
export async function parseVerifyProject(projectRoot: string) {
  const discovered = scanDirectory(projectRoot);
  await initParser(); // parseProject can swallow initialization failure on an empty directory.
  const jvm = discoverJvmModuleRoots(projectRoot);
  if (jvm.errors.length) throw new Error(`JVM discovery: ${jvm.errors.map(e => `${e.path}: ${e.reason}`).join('; ')}`);
  const parsed = await parseProject(projectRoot, { useCache: false });
  if (parsed.errorFiles.length) throw new Error(`Project parse: ${parsed.errorFiles.map(e => `${e.path}: ${e.reason}`).join('; ')}`);
  const found = new Set(parsed.map(f => canonicalPath(f.filePath, projectRoot)));
  const unparsedFiles = discovered.filter(f => !found.has(f));
  return { parsed, unparsedFiles, sourceCoverage: unparsedFiles.length ? 'partial' as const : 'complete' as const };
}
