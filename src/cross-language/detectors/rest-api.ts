import { readFileSync } from 'fs';
import { join, resolve } from 'path';
import type { ParsedFile } from '../../parser/types.js';
import type { CrossLanguageEdge } from '../types.js';

interface HttpCall {
  method: string;
  path: string;
  file: string;
  line: number;
}

interface RouteDefinition {
  method: string;
  path: string;
  normalizedPath: string;
  file: string;
  line: number;
}

function getLanguage(filePath: string): string {
  if (filePath.endsWith('.ts') || filePath.endsWith('.tsx')) return 'typescript';
  if (filePath.endsWith('.js') || filePath.endsWith('.jsx') || filePath.endsWith('.mjs') || filePath.endsWith('.cjs')) return 'javascript';
  if (filePath.endsWith('.py')) return 'python';
  if (filePath.endsWith('.go')) return 'go';
  return 'unknown';
}

function normalizePath(routePath: string): string {
  // Normalize :param and {param} to a wildcard marker
  return routePath
    .replace(/:[a-zA-Z_][a-zA-Z0-9_]*/g, '__PARAM__')
    .replace(/\{[a-zA-Z_][a-zA-Z0-9_]*\}/g, '__PARAM__');
}

function stripTrailingSlash(p: string): string {
  return p.length > 1 && p.endsWith('/') ? p.slice(0, -1) : p;
}

function extractHttpCalls(source: string, filePath: string): HttpCall[] {
  const calls: HttpCall[] = [];
  const lines = source.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // fetch calls: fetch('/api/...') or fetch(`/api/...`)
    const fetchMatch = line.match(/fetch\s*\(\s*(['"`])([^'"`]+)\1/);
    if (fetchMatch) {
      const path = fetchMatch[2];
      if (isLocalApiPath(path)) {
        // Check for method in options
        const methodMatch = line.match(/method\s*:\s*['"](\w+)['"]/);
        const method = methodMatch ? methodMatch[1].toUpperCase() : 'GET';
        calls.push({ method, path: cleanPath(path), file: filePath, line: i + 1 });
      }
    }

    // fetch with template literal: fetch(`/api/users/${id}`)
    if (!fetchMatch) {
      const fetchTemplateMatch = line.match(/fetch\s*\(\s*`([^`]+)`/);
      if (fetchTemplateMatch) {
        const path = fetchTemplateMatch[1];
        if (isLocalApiPath(path)) {
          const methodMatch = line.match(/method\s*:\s*['"](\w+)['"]/);
          const method = methodMatch ? methodMatch[1].toUpperCase() : 'GET';
          calls.push({ method, path: cleanPath(path), file: filePath, line: i + 1 });
        }
      }
    }

    // axios calls: axios.get('/api/...'), axios.post('/api/...')
    const axiosMatch = line.match(/axios\s*\.\s*(get|post|put|delete|patch)\s*\(\s*(['"`])([^'"`]+)\2/i);
    if (axiosMatch) {
      const path = axiosMatch[3];
      if (isLocalApiPath(path)) {
        calls.push({ method: axiosMatch[1].toUpperCase(), path: cleanPath(path), file: filePath, line: i + 1 });
      }
    }

    // axios with template literal
    if (!axiosMatch) {
      const axiosTemplateMatch = line.match(/axios\s*\.\s*(get|post|put|delete|patch)\s*\(\s*`([^`]+)`/i);
      if (axiosTemplateMatch) {
        const path = axiosTemplateMatch[2];
        if (isLocalApiPath(path)) {
          calls.push({ method: axiosTemplateMatch[1].toUpperCase(), path: cleanPath(path), file: filePath, line: i + 1 });
        }
      }
    }

    // Generic HTTP client: http.get('/api/...'), client.post('/api/...')
    const genericMatch = line.match(/\w+\s*\.\s*(get|post|put|delete|patch)\s*\(\s*(['"`])([^'"`]+)\2/i);
    if (genericMatch && !line.match(/axios/) && !line.match(/app\s*\./) && !line.match(/router\s*\./) && !line.match(/r\s*\./)) {
      const path = genericMatch[3];
      if (isLocalApiPath(path)) {
        calls.push({ method: genericMatch[1].toUpperCase(), path: cleanPath(path), file: filePath, line: i + 1 });
      }
    }
  }

  return calls;
}

function isLocalApiPath(path: string): boolean {
  // Skip external URLs
  if (path.startsWith('http://') || path.startsWith('https://')) return false;
  // Must start with / or contain /api/
  return path.startsWith('/') || path.includes('/api/');
}

function cleanPath(path: string): string {
  // Strip template literal expressions: /api/users/${id} → /api/users/
  let cleaned = path.replace(/\$\{[^}]*\}/g, '');
  cleaned = stripTrailingSlash(cleaned);
  return cleaned;
}

function extractRouteDefinitions(source: string, filePath: string): RouteDefinition[] {
  const routes: RouteDefinition[] = [];
  const lines = source.split('\n');
  const lang = getLanguage(filePath);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (lang === 'typescript' || lang === 'javascript') {
      // Express/Hono: app.get('/api/...', handler) or router.get('/api/...', handler)
      const expressMatch = line.match(/(?:app|router)\s*\.\s*(get|post|put|delete|patch)\s*\(\s*(['"`])([^'"`]+)\2/i);
      if (expressMatch) {
        const path = expressMatch[3];
        if (path.startsWith('/')) {
          routes.push({
            method: expressMatch[1].toUpperCase(),
            path,
            normalizedPath: normalizePath(path),
            file: filePath,
            line: i + 1,
          });
        }
      }
    }

    if (lang === 'python') {
      // FastAPI/Flask: @app.get('/api/...') or @router.get('/api/...')
      const pythonMatch = line.match(/@(?:app|router)\s*\.\s*(get|post|put|delete|patch)\s*\(\s*(['"])([^'"]+)\2/i);
      if (pythonMatch) {
        const path = pythonMatch[3];
        if (path.startsWith('/')) {
          routes.push({
            method: pythonMatch[1].toUpperCase(),
            path,
            normalizedPath: normalizePath(path),
            file: filePath,
            line: i + 1,
          });
        }
      }
    }

    if (lang === 'go') {
      // Gin: r.GET('/api/...', handler) or router.GET('/api/...')
      const goMatch = line.match(/(?:r|router|group)\s*\.\s*(GET|POST|PUT|DELETE|PATCH)\s*\(\s*"([^"]+)"/);
      if (goMatch) {
        const path = goMatch[2];
        if (path.startsWith('/')) {
          routes.push({
            method: goMatch[1].toUpperCase(),
            path,
            normalizedPath: normalizePath(path),
            file: filePath,
            line: i + 1,
          });
        }
      }
    }
  }

  return routes;
}

function matchPaths(callPath: string, routeNormalized: string): boolean {
  const normalizedCall = normalizePath(stripTrailingSlash(callPath));
  const normalizedRoute = stripTrailingSlash(routeNormalized);

  // Exact match
  if (normalizedCall === normalizedRoute) return true;

  // Prefix match: call path is a prefix of route (stripped template vars)
  if (normalizedRoute.startsWith(normalizedCall) && normalizedRoute[normalizedCall.length] === '/') return true;

  // Call matches route with param segments
  const callParts = normalizedCall.split('/');
  const routeParts = normalizedRoute.split('/');

  if (callParts.length <= routeParts.length) {
    let match = true;
    for (let i = 0; i < callParts.length; i++) {
      if (routeParts[i] === '__PARAM__') continue;
      if (callParts[i] !== routeParts[i]) { match = false; break; }
    }
    if (match) return true;
  }

  return false;
}

function getConfidence(
  callPath: string,
  callMethod: string,
  routePath: string,
  routeMethod: string
): 'high' | 'medium' | 'low' {
  const normalizedCall = normalizePath(stripTrailingSlash(callPath));
  const normalizedRoute = normalizePath(stripTrailingSlash(routePath));
  const exactPath = normalizedCall === normalizedRoute;
  const methodMatch = callMethod === routeMethod;

  if (exactPath && methodMatch) return 'high';
  if (exactPath) return 'medium';
  if (methodMatch) return 'medium';
  return 'low';
}

export function detectRestApiEdges(
  files: ParsedFile[],
  projectRoot: string
): CrossLanguageEdge[] {
  const edges: CrossLanguageEdge[] = [];
  const allCalls: HttpCall[] = [];
  const allRoutes: RouteDefinition[] = [];

  for (const file of files) {
    const fullPath = join(projectRoot, file.filePath);
    // Validate path containment
    if (!resolve(fullPath).startsWith(resolve(projectRoot))) continue;

    let source: string;
    try {
      source = readFileSync(fullPath, 'utf-8');
    } catch {
      continue;
    }

    const lang = getLanguage(file.filePath);

    // Extract HTTP calls from TS/JS files
    if (lang === 'typescript' || lang === 'javascript') {
      allCalls.push(...extractHttpCalls(source, file.filePath));
    }

    // Extract route definitions from all languages
    allRoutes.push(...extractRouteDefinitions(source, file.filePath));
  }

  // Match calls to routes
  for (const call of allCalls) {
    for (const route of allRoutes) {
      // Skip same-file matches
      if (call.file === route.file) continue;

      if (matchPaths(call.path, route.normalizedPath)) {
        const confidence = getConfidence(call.path, call.method, route.path, route.method);

        edges.push({
          sourceFile: call.file,
          targetFile: route.file,
          edgeType: 'rest-api',
          confidence,
          sourceLanguage: getLanguage(call.file),
          targetLanguage: getLanguage(route.file),
          sourceLine: call.line,
          targetLine: route.line,
          metadata: {
            httpMethod: call.method,
            path: call.path,
          },
        });
      }
    }
  }

  return edges;
}
