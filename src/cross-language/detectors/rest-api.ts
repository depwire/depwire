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
  if (filePath.endsWith('.cs') || filePath.endsWith('.csx')) return 'csharp';
  if (filePath.endsWith('.java')) return 'java';
  if (filePath.endsWith('.cpp') || filePath.endsWith('.cc') || filePath.endsWith('.cxx') || filePath.endsWith('.c++') ||
      filePath.endsWith('.hpp') || filePath.endsWith('.hh') || filePath.endsWith('.hxx') || filePath.endsWith('.h++') ||
      filePath.endsWith('.h') || filePath.endsWith('.inl') || filePath.endsWith('.ipp')) return 'cpp';
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
      // FastAPI: @app.get('/api/...') or @router.get('/api/...')
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

      // Flask: @app.route('/api/...') or @blueprint.route('/api/...')
      const flaskMatch = line.match(/@(?:app|blueprint|router)\s*\.\s*route\s*\(\s*(['"])([^'"]+)\1/);
      if (flaskMatch) {
        const path = flaskMatch[2];
        if (path.startsWith('/')) {
          // Extract methods from methods=['POST'] or methods=['GET', 'POST']
          const methodsMatch = line.match(/methods\s*=\s*\[([^\]]+)\]/);
          const methods: string[] = methodsMatch
            ? methodsMatch[1].match(/['"](\w+)['"]/g)?.map(m => m.replace(/['"]/g, '').toUpperCase()) || ['GET']
            : ['GET'];

          for (const method of methods) {
            routes.push({
              method,
              path,
              normalizedPath: normalizePath(path),
              file: filePath,
              line: i + 1,
            });
          }
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

    if (lang === 'csharp') {
      // ASP.NET Core attribute routing: [HttpGet("/api/users")], [HttpPost("/api/users")]
      const attrMatch = line.match(/\[\s*Http(Get|Post|Put|Delete|Patch)\s*\(\s*"([^"]+)"\s*\)\s*\]/);
      if (attrMatch) {
        routes.push({
          method: attrMatch[1].toUpperCase(),
          path: attrMatch[2],
          normalizedPath: normalizePath(attrMatch[2]),
          file: filePath,
          line: i + 1,
        });
      }

      // [Route("api/[controller]")] — extract and normalize [controller] token
      const routeAttrMatch = line.match(/\[\s*Route\s*\(\s*"([^"]+)"\s*\)\s*\]/);
      if (routeAttrMatch) {
        let routePath = routeAttrMatch[1];
        // Resolve [controller] using class name convention
        if (routePath.includes('[controller]')) {
          // Look ahead/behind for the controller class name
          const classMatch = source.match(/class\s+(\w+?)Controller\s/);
          if (classMatch) {
            routePath = routePath.replace('[controller]', classMatch[1].toLowerCase());
          }
        }
        if (!routePath.startsWith('/')) routePath = '/' + routePath;
        routes.push({
          method: 'ANY',
          path: routePath,
          normalizedPath: normalizePath(routePath),
          file: filePath,
          line: i + 1,
        });
      }

      // Minimal API (.NET 6+): app.MapGet("/api/users", ...)
      const minimalMatch = line.match(/app\s*\.\s*Map(Get|Post|Put|Delete|Patch)\s*\(\s*"([^"]+)"/);
      if (minimalMatch) {
        const path = minimalMatch[2];
        if (path.startsWith('/')) {
          routes.push({
            method: minimalMatch[1].toUpperCase(),
            path,
            normalizedPath: normalizePath(path),
            file: filePath,
            line: i + 1,
          });
        }
      }
    }

    if (lang === 'java') {
      // Spring Boot: @GetMapping("/api/users"), @PostMapping, @PutMapping, @DeleteMapping, @PatchMapping
      const springMethodMatch = line.match(/@(Get|Post|Put|Delete|Patch)Mapping\s*\(\s*(?:value\s*=\s*)?["']([^"']+)["']/);
      if (springMethodMatch) {
        const method = springMethodMatch[1].toUpperCase();
        let path = springMethodMatch[2];
        const classPrefix = findClassLevelPrefix(source);
        if (classPrefix) path = classPrefix + path;
        if (!path.startsWith('/')) path = '/' + path;
        routes.push({
          method,
          path,
          normalizedPath: normalizePath(path),
          file: filePath,
          line: i + 1,
        });
      }

      // @GetMapping (no path — maps to class-level path)
      if (!springMethodMatch) {
        const springNoPathMatch = line.match(/@(Get|Post|Put|Delete|Patch)Mapping\s*$/);
        if (springNoPathMatch) {
          const method = springNoPathMatch[1].toUpperCase();
          const classPrefix = findClassLevelPrefix(source);
          if (classPrefix) {
            routes.push({
              method,
              path: classPrefix,
              normalizedPath: normalizePath(classPrefix),
              file: filePath,
              line: i + 1,
            });
          }
        }
      }

      // @RequestMapping(value = "/api/users", method = RequestMethod.GET)
      const requestMappingMatch = line.match(/@RequestMapping\s*\(\s*(?:value\s*=\s*)?["']([^"']+)["']/);
      if (requestMappingMatch) {
        let path = requestMappingMatch[1];
        if (!path.startsWith('/')) path = '/' + path;
        const methodMatch = line.match(/method\s*=\s*RequestMethod\.(\w+)/);
        const method = methodMatch ? methodMatch[1].toUpperCase() : 'ANY';
        routes.push({
          method,
          path,
          normalizedPath: normalizePath(path),
          file: filePath,
          line: i + 1,
        });
      }

      // JAX-RS: @Path("/api/users") combined with @GET, @POST, etc.
      const jaxPathMatch = line.match(/@Path\s*\(\s*["']([^"']+)["']\s*\)/);
      if (jaxPathMatch) {
        let path = jaxPathMatch[1];
        if (!path.startsWith('/')) path = '/' + path;
        const nextLine = i + 1 < lines.length ? lines[i + 1] : '';
        const prevLine = i > 0 ? lines[i - 1] : '';
        const jaxMethodMatch = (nextLine + prevLine).match(/@(GET|POST|PUT|DELETE|PATCH)/);
        const method = jaxMethodMatch ? jaxMethodMatch[1] : 'ANY';
        routes.push({
          method,
          path,
          normalizedPath: normalizePath(path),
          file: filePath,
          line: i + 1,
        });
      }

      // Spring WebFlux RouterFunction: route(GET("/api/users"), handler::list)
      const webFluxMatch = line.match(/(?:route|andRoute)\s*\(\s*(GET|POST|PUT|DELETE|PATCH)\s*\(\s*["']([^"']+)["']\s*\)/);
      if (webFluxMatch) {
        const path = webFluxMatch[2].startsWith('/') ? webFluxMatch[2] : '/' + webFluxMatch[2];
        routes.push({
          method: webFluxMatch[1].toUpperCase(),
          path,
          normalizedPath: normalizePath(path),
          file: filePath,
          line: i + 1,
        });
      }
    }

    if (lang === 'cpp') {
      // Crow: CROW_ROUTE(app, "/api/users")
      const crowMatch = line.match(/CROW_ROUTE\s*\(\s*\w+\s*,\s*"([^"]+)"/);
      if (crowMatch) {
        const path = crowMatch[1];
        if (path.startsWith('/')) {
          // Check for .methods() call
          const methodsMatch = line.match(/methods\s*\(\s*"([^"]+)"_method/);
          const method = methodsMatch ? methodsMatch[1].toUpperCase() : 'ANY';
          routes.push({
            method,
            path,
            normalizedPath: normalizePath(path),
            file: filePath,
            line: i + 1,
          });
        }
      }

      // Drogon: ADD_METHOD_TO(Controller::method, "/api/users", Get)
      const drogonMatch = line.match(/ADD_METHOD_TO\s*\(\s*[^,]+,\s*"([^"]+)"\s*,\s*(\w+)/);
      if (drogonMatch) {
        const path = drogonMatch[1].startsWith('/') ? drogonMatch[1] : '/' + drogonMatch[1];
        routes.push({
          method: drogonMatch[2].toUpperCase(),
          path,
          normalizedPath: normalizePath(path),
          file: filePath,
          line: i + 1,
        });
      }

      // Drogon: PATH_ADD("/api/users", Get, Post)
      const pathAddMatch = line.match(/PATH_ADD\s*\(\s*"([^"]+)"\s*,\s*(\w+)/);
      if (pathAddMatch) {
        const path = pathAddMatch[1].startsWith('/') ? pathAddMatch[1] : '/' + pathAddMatch[1];
        routes.push({
          method: pathAddMatch[2].toUpperCase(),
          path,
          normalizedPath: normalizePath(path),
          file: filePath,
          line: i + 1,
        });
      }

      // Pistache: router.get("/api/users", Routes::bind(...))
      const pistacheMatch = line.match(/router\s*\.\s*(get|post|put|del|patch)\s*\(\s*"([^"]+)"/i);
      if (pistacheMatch) {
        const method = pistacheMatch[1].toUpperCase() === 'DEL' ? 'DELETE' : pistacheMatch[1].toUpperCase();
        const path = pistacheMatch[2];
        if (path.startsWith('/')) {
          routes.push({
            method,
            path,
            normalizedPath: normalizePath(path),
            file: filePath,
            line: i + 1,
          });
        }
      }

      // cpp-httplib: svr.Get("/api/users", ...)
      const httplibMatch = line.match(/(?:svr|server)\s*\.\s*(Get|Post|Put|Delete|Patch)\s*\(\s*"([^"]+)"/);
      if (httplibMatch) {
        const path = httplibMatch[2];
        if (path.startsWith('/')) {
          routes.push({
            method: httplibMatch[1].toUpperCase(),
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

function findClassLevelPrefix(source: string): string | null {
  // Look for class-level @RequestMapping("/api/...") annotation
  const match = source.match(/@RequestMapping\s*\(\s*(?:value\s*=\s*)?["']([^"']+)["']/);
  if (match) {
    let path = match[1];
    if (!path.startsWith('/')) path = '/' + path;
    // Remove trailing slash for combining
    if (path.endsWith('/') && path.length > 1) path = path.slice(0, -1);
    return path;
  }
  return null;
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
  const methodMatch = callMethod === routeMethod || routeMethod === 'ANY';

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
