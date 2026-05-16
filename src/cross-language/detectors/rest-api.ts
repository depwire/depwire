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
  if (filePath.endsWith('.kt') || filePath.endsWith('.kts')) return 'kotlin';
  if (filePath.endsWith('.php')) return 'php';
  if (filePath.endsWith('.swift')) return 'swift';
  if (filePath.endsWith('.rb') || filePath.endsWith('.rake') || filePath.endsWith('.ru') || filePath.endsWith('.gemspec')) return 'ruby';
  if (filePath.endsWith('.dart')) return 'dart';
  if (filePath.endsWith('.mojo') || filePath.endsWith('.🔥')) return 'mojo';
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

    if (lang === 'kotlin') {
      // Spring Boot with Kotlin — same annotations as Java
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

      // @RequestMapping
      const requestMappingMatch = line.match(/@RequestMapping\s*\(\s*(?:value\s*=\s*(?:\[)?\s*)?["']([^"']+)["']/);
      if (requestMappingMatch) {
        let path = requestMappingMatch[1];
        if (!path.startsWith('/')) path = '/' + path;
        const methodMatch = line.match(/method\s*=\s*\[?\s*RequestMethod\.(\w+)/);
        const method = methodMatch ? methodMatch[1].toUpperCase() : 'ANY';
        routes.push({
          method,
          path,
          normalizedPath: normalizePath(path),
          file: filePath,
          line: i + 1,
        });
      }

      // Ktor routing: get("/api/users"), post("/api/users"), etc.
      const ktorMatch = line.match(/\b(get|post|put|delete|patch|head|options)\s*\(\s*["']([^"']+)["']\s*\)/);
      if (ktorMatch) {
        const path = ktorMatch[2];
        if (path.startsWith('/')) {
          routes.push({
            method: ktorMatch[1].toUpperCase(),
            path,
            normalizedPath: normalizePath(path),
            file: filePath,
            line: i + 1,
          });
        }
      }

      // Ktor route() block: route("/api/users") { ... }
      const ktorRouteMatch = line.match(/\broute\s*\(\s*["']([^"']+)["']\s*\)/);
      if (ktorRouteMatch) {
        const path = ktorRouteMatch[1];
        if (path.startsWith('/')) {
          routes.push({
            method: 'ANY',
            path,
            normalizedPath: normalizePath(path),
            file: filePath,
            line: i + 1,
          });
        }
      }

      // Ktor Resources: @Resource("/api/users")
      const resourceMatch = line.match(/@Resource\s*\(\s*["']([^"']+)["']\s*\)/);
      if (resourceMatch) {
        const path = resourceMatch[1];
        if (path.startsWith('/')) {
          routes.push({
            method: 'ANY',
            path,
            normalizedPath: normalizePath(path),
            file: filePath,
            line: i + 1,
          });
        }
      }

      // Http4k: "/api/users" bind GET to handler::listUsers
      const http4kMatch = line.match(/["']([^"']+)["']\s*bind\s*(GET|POST|PUT|DELETE|PATCH)/);
      if (http4kMatch) {
        const path = http4kMatch[1];
        if (path.startsWith('/')) {
          routes.push({
            method: http4kMatch[2].toUpperCase(),
            path,
            normalizedPath: normalizePath(path),
            file: filePath,
            line: i + 1,
          });
        }
      }

      // Retrofit (client-side, outgoing): @GET("api/users"), @POST("api/users")
      const retrofitMatch = line.match(/@(GET|POST|PUT|DELETE|PATCH|HEAD)\s*\(\s*["']([^"']+)["']\s*\)/);
      if (retrofitMatch) {
        let path = retrofitMatch[2];
        if (!path.startsWith('/')) path = '/' + path;
        // Retrofit calls are outgoing HTTP calls, not route definitions
        // Add them as HTTP calls instead
      }
    }

    if (lang === 'php') {
      // Laravel: Route::get('/api/users', [Controller::class, 'method'])
      const laravelRouteMatch = line.match(/Route\s*::\s*(get|post|put|delete|patch)\s*\(\s*['"]([^'"]+)['"]/i);
      if (laravelRouteMatch) {
        const path = laravelRouteMatch[2];
        if (path.startsWith('/')) {
          routes.push({
            method: laravelRouteMatch[1].toUpperCase(),
            path,
            normalizedPath: normalizePath(path),
            file: filePath,
            line: i + 1,
          });
        }
      }

      // Symfony: #[Route('/api/users', methods: ['GET'])]
      const symfonyRouteMatch = line.match(/#\[Route\s*\(\s*['"]([^'"]+)['"]/);
      if (symfonyRouteMatch) {
        const path = symfonyRouteMatch[1];
        if (path.startsWith('/')) {
          const methodsMatch = line.match(/methods\s*:\s*\[([^\]]+)\]/);
          const methods: string[] = methodsMatch
            ? methodsMatch[1].match(/['"](\w+)['"]/g)?.map(m => m.replace(/['"]/g, '').toUpperCase()) || ['ANY']
            : ['ANY'];
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

      // Slim Framework: $app->get('/api/users', function ...)
      const slimMatch = line.match(/\$(?:app|group)\s*->\s*(get|post|put|delete|patch)\s*\(\s*['"]([^'"]+)['"]/i);
      if (slimMatch) {
        const path = slimMatch[2];
        if (path.startsWith('/')) {
          routes.push({
            method: slimMatch[1].toUpperCase(),
            path,
            normalizedPath: normalizePath(path),
            file: filePath,
            line: i + 1,
          });
        }
      }

      // WordPress REST API: register_rest_route('namespace', '/route', ...)
      const wpRestMatch = line.match(/register_rest_route\s*\(\s*['"]([^'"]+)['"]\s*,\s*['"]([^'"]+)['"]/);
      if (wpRestMatch) {
        const namespace = wpRestMatch[1];
        let path = wpRestMatch[2];
        if (!path.startsWith('/')) path = '/' + path;
        const fullPath = `/wp-json/${namespace}${path}`;
        const methodMatch = line.match(/methods\s*['"=>\s]+['"](\w+)['"]/i);
        const method = methodMatch ? methodMatch[1].toUpperCase() : 'ANY';
        routes.push({
          method,
          path: fullPath,
          normalizedPath: normalizePath(fullPath),
          file: filePath,
          line: i + 1,
        });
      }
    }

    if (lang === 'swift') {
      // Vapor: app.get("api", "users") or app.post("api", "users")
      const vaporMatch = line.match(/(?:app|router|routes)\s*\.\s*(get|post|put|delete|patch)\s*\(\s*["']([^"']+)["']/i);
      if (vaporMatch) {
        let path = vaporMatch[2];
        if (!path.startsWith('/')) path = '/' + path;
        routes.push({
          method: vaporMatch[1].toUpperCase(),
          path,
          normalizedPath: normalizePath(path),
          file: filePath,
          line: i + 1,
        });
      }

      // Hummingbird: router.get("api/users") or router.post("api/users")
      const hbMatch = line.match(/router\s*\.\s*(get|post|put|delete|patch)\s*\(\s*["']([^"']+)["']/i);
      if (hbMatch && !vaporMatch) {
        let path = hbMatch[2];
        if (!path.startsWith('/')) path = '/' + path;
        routes.push({
          method: hbMatch[1].toUpperCase(),
          path,
          normalizedPath: normalizePath(path),
          file: filePath,
          line: i + 1,
        });
      }

      // Perfect: routes.add(method: .get, uri: "/api/users")
      const perfectMatch = line.match(/routes\s*\.\s*add\s*\([^)]*uri\s*:\s*["']([^"']+)["']/);
      if (perfectMatch) {
        const path = perfectMatch[1].startsWith('/') ? perfectMatch[1] : '/' + perfectMatch[1];
        const methodMatch = line.match(/method\s*:\s*\.(\w+)/);
        const method = methodMatch ? methodMatch[1].toUpperCase() : 'ANY';
        routes.push({
          method,
          path,
          normalizedPath: normalizePath(path),
          file: filePath,
          line: i + 1,
        });
      }
    }

    if (lang === 'mojo') {
      // Mojo can use Python-compatible frameworks via interop
      // FastAPI/Starlette style routes (since Mojo can call Python)
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

      // Mojo stdlib HTTP patterns (future-proofing)
      const mojoHttpMatch = line.match(/(?:server|app)\s*\.\s*(?:route|handle)\s*\(\s*['"]([^'"]+)['"]\s*,\s*['"]?(GET|POST|PUT|DELETE|PATCH)['"]?/i);
      if (mojoHttpMatch) {
        const path = mojoHttpMatch[1];
        if (path.startsWith('/')) {
          routes.push({
            method: mojoHttpMatch[2].toUpperCase(),
            path,
            normalizedPath: normalizePath(path),
            file: filePath,
            line: i + 1,
          });
        }
      }
    }

    if (lang === 'ruby') {
      // Rails routes.rb: get '/path', post '/path', resources :name, namespace :name
      const railsRouteMatch = line.match(/^\s*(get|post|put|patch|delete)\s+['"]([^'"]+)['"]/);
      if (railsRouteMatch) {
        const path = railsRouteMatch[2].startsWith('/') ? railsRouteMatch[2] : '/' + railsRouteMatch[2];
        routes.push({
          method: railsRouteMatch[1].toUpperCase(),
          path,
          normalizedPath: normalizePath(path),
          file: filePath,
          line: i + 1,
        });
      }

      // Sinatra: get '/path' do, post '/path' do
      const sinatraMatch = line.match(/^\s*(get|post|put|patch|delete)\s+['"]([^'"]+)['"]\s+do/);
      if (sinatraMatch && !railsRouteMatch) {
        const path = sinatraMatch[2].startsWith('/') ? sinatraMatch[2] : '/' + sinatraMatch[2];
        routes.push({
          method: sinatraMatch[1].toUpperCase(),
          path,
          normalizedPath: normalizePath(path),
          file: filePath,
          line: i + 1,
        });
      }

      // Rails resources: resources :users -> /users (CRUD)
      const resourcesMatch = line.match(/^\s*resources?\s+:(\w+)/);
      if (resourcesMatch) {
        const resourcePath = '/' + resourcesMatch[1];
        routes.push({
          method: 'ANY',
          path: resourcePath,
          normalizedPath: normalizePath(resourcePath),
          file: filePath,
          line: i + 1,
        });
      }

      // Rack: map '/path' do
      const rackMatch = line.match(/^\s*map\s+['"]([^'"]+)['"]/);
      if (rackMatch) {
        const path = rackMatch[1].startsWith('/') ? rackMatch[1] : '/' + rackMatch[1];
        routes.push({
          method: 'ANY',
          path,
          normalizedPath: normalizePath(path),
          file: filePath,
          line: i + 1,
        });
      }

      // Grape API: get '/path', post '/path' etc (inside class < Grape::API)
      const grapeMatch = line.match(/^\s*(get|post|put|patch|delete)\s+['"]([^'"]+)['"]/);
      if (grapeMatch && !railsRouteMatch) {
        const path = grapeMatch[2].startsWith('/') ? grapeMatch[2] : '/' + grapeMatch[2];
        routes.push({
          method: grapeMatch[1].toUpperCase(),
          path,
          normalizedPath: normalizePath(path),
          file: filePath,
          line: i + 1,
        });
      }
    }

    if (lang === 'dart') {
      // Shelf router: router.get('/path', handler) or router.post('/path', handler)
      const shelfMatch = line.match(/(?:router|app)\s*\.\s*(get|post|put|delete|patch)\s*\(\s*['"]([^'"]+)['"]/i);
      if (shelfMatch) {
        const path = shelfMatch[2];
        if (path.startsWith('/')) {
          routes.push({
            method: shelfMatch[1].toUpperCase(),
            path,
            normalizedPath: normalizePath(path),
            file: filePath,
            line: i + 1,
          });
        }
      }

      // Aqueduct/Conduit: router.route('/path')
      const conduitMatch = line.match(/router\s*\.\s*route\s*\(\s*['"]([^'"]+)['"]/);
      if (conduitMatch) {
        const path = conduitMatch[1].startsWith('/') ? conduitMatch[1] : '/' + conduitMatch[1];
        routes.push({
          method: 'ANY',
          path,
          normalizedPath: normalizePath(path),
          file: filePath,
          line: i + 1,
        });
      }

      // Angel framework: app.get('/path', handler)
      const angelMatch = line.match(/app\s*\.\s*(get|post|put|delete|patch)\s*\(\s*['"]([^'"]+)['"]/i);
      if (angelMatch && !shelfMatch) {
        const path = angelMatch[2];
        if (path.startsWith('/')) {
          routes.push({
            method: angelMatch[1].toUpperCase(),
            path,
            normalizedPath: normalizePath(path),
            file: filePath,
            line: i + 1,
          });
        }
      }

      // Serverpod endpoint: extends Endpoint — class-level detection
      const serverpodMatch = line.match(/class\s+(\w+)\s+extends\s+Endpoint/);
      if (serverpodMatch) {
        const endpointName = serverpodMatch[1].toLowerCase().replace(/endpoint$/, '');
        const path = '/' + endpointName;
        routes.push({
          method: 'ANY',
          path,
          normalizedPath: normalizePath(path),
          file: filePath,
          line: i + 1,
        });
      }
    }

    if (lang === 'r') {
      // plumber API annotations: #* @get /endpoint, #* @post /data
      const plumberMatch = line.match(/^#\*\s*@(get|post|put|delete|patch|head)\s+(\/\S*)/i);
      if (plumberMatch) {
        const path = plumberMatch[2];
        routes.push({
          method: plumberMatch[1].toUpperCase(),
          path,
          normalizedPath: normalizePath(path),
          file: filePath,
          line: i + 1,
        });
      }

      // RestRserve routes: app$add_get("/path"), app$add_post("/path")
      const restrserveMatch = line.match(/\w+\$add_(get|post|put|delete|patch)\s*\(\s*['"]([^'"]+)['"]/i);
      if (restrserveMatch) {
        const path = restrserveMatch[2];
        if (path.startsWith('/')) {
          routes.push({
            method: restrserveMatch[1].toUpperCase(),
            path,
            normalizedPath: normalizePath(path),
            file: filePath,
            line: i + 1,
          });
        }
      }

      // Beakr framework routes: beakr %>% httpGET("/path"), newBeakr() %>% httpPOST("/path")
      const beakrMatch = line.match(/http(GET|POST|PUT|DELETE|PATCH)\s*\(\s*['"]([^'"]+)['"]/i);
      if (beakrMatch) {
        const path = beakrMatch[2];
        if (path.startsWith('/')) {
          routes.push({
            method: beakrMatch[1].toUpperCase(),
            path,
            normalizedPath: normalizePath(path),
            file: filePath,
            line: i + 1,
          });
        }
      }

      // Shiny app server function detection
      const shinyServerMatch = line.match(/server\s*<-\s*function\s*\(\s*input\s*,\s*output/);
      if (shinyServerMatch) {
        routes.push({
          method: 'ANY',
          path: '/shiny',
          normalizedPath: normalizePath('/shiny'),
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

    // Extract Kotlin Retrofit outgoing calls
    if (lang === 'kotlin') {
      const kotlinLines = source.split('\n');
      for (let i = 0; i < kotlinLines.length; i++) {
        const line = kotlinLines[i];
        const retrofitMatch = line.match(/@(GET|POST|PUT|DELETE|PATCH|HEAD)\s*\(\s*["']([^"']+)["']\s*\)/);
        if (retrofitMatch) {
          let path = retrofitMatch[2];
          if (!path.startsWith('/')) path = '/' + path;
          allCalls.push({ method: retrofitMatch[1].toUpperCase(), path, file: file.filePath, line: i + 1 });
        }
      }
    }

    // Extract Swift HTTP client calls (URLSession, Alamofire)
    if (lang === 'swift') {
      const swiftLines = source.split('\n');
      for (let i = 0; i < swiftLines.length; i++) {
        const line = swiftLines[i];

        // URLRequest/URLSession: URL(string: "/api/users") or URLRequest(url: URL(string: "..."))
        const urlMatch = line.match(/URL\s*\(\s*string\s*:\s*["']([^"']+)["']/);
        if (urlMatch) {
          const path = urlMatch[1];
          if (isLocalApiPath(path)) {
            const methodMatch = line.match(/httpMethod\s*=\s*["'](\w+)["']/);
            const method = methodMatch ? methodMatch[1].toUpperCase() : 'GET';
            allCalls.push({ method, path: cleanPath(path), file: file.filePath, line: i + 1 });
          }
        }

        // Alamofire: AF.request("/api/users", method: .post)
        const afMatch = line.match(/AF\s*\.\s*(?:request|upload|download)\s*\(\s*["']([^"']+)["']/);
        if (afMatch) {
          const path = afMatch[1];
          if (isLocalApiPath(path)) {
            const methodMatch = line.match(/method\s*:\s*\.(\w+)/);
            const method = methodMatch ? methodMatch[1].toUpperCase() : 'GET';
            allCalls.push({ method, path: cleanPath(path), file: file.filePath, line: i + 1 });
          }
        }
      }
    }

    // Extract PHP HTTP client calls
    if (lang === 'php') {
      const phpLines = source.split('\n');
      for (let i = 0; i < phpLines.length; i++) {
        const line = phpLines[i];

        // Guzzle: $client->get('/api/users'), $client->post('/api/users'), $client->request('GET', '/api/users')
        const guzzleMatch = line.match(/\$\w+\s*->\s*(get|post|put|delete|patch|request)\s*\(\s*['"]([^'"]+)['"]/i);
        if (guzzleMatch) {
          let method = guzzleMatch[1].toUpperCase();
          let path = guzzleMatch[2];
          if (method === 'REQUEST') {
            // $client->request('GET', '/api/...')
            const reqMethodMatch = line.match(/request\s*\(\s*['"](\w+)['"]\s*,\s*['"]([^'"]+)['"]/i);
            if (reqMethodMatch) {
              method = reqMethodMatch[1].toUpperCase();
              path = reqMethodMatch[2];
            }
          }
          if (isLocalApiPath(path)) {
            allCalls.push({ method, path: cleanPath(path), file: file.filePath, line: i + 1 });
          }
        }

        // file_get_contents with http
        const fgcMatch = line.match(/file_get_contents\s*\(\s*['"]([^'"]+)['"]/);
        if (fgcMatch) {
          const path = fgcMatch[1];
          if (isLocalApiPath(path)) {
            allCalls.push({ method: 'GET', path: cleanPath(path), file: file.filePath, line: i + 1 });
          }
        }
      }
    }

    // Extract Ruby HTTP client calls (Faraday, Net::HTTP, HTTParty)
    if (lang === 'ruby') {
      const rubyLines = source.split('\n');
      for (let i = 0; i < rubyLines.length; i++) {
        const line = rubyLines[i];

        // Faraday: conn.get('/api/users'), conn.post('/api/users')
        const faradayMatch = line.match(/\w+\s*\.\s*(get|post|put|delete|patch)\s*\(\s*['"]([^'"]+)['"]/i);
        if (faradayMatch) {
          const path = faradayMatch[2];
          if (isLocalApiPath(path)) {
            allCalls.push({ method: faradayMatch[1].toUpperCase(), path: cleanPath(path), file: file.filePath, line: i + 1 });
          }
        }

        // Net::HTTP.get/post_form with URI
        const netHttpMatch = line.match(/Net::HTTP\s*\.\s*(get|post_form|post)\s*\(/i);
        if (netHttpMatch) {
          const uriMatch = line.match(/['"]([^'"]+)['"]/);
          if (uriMatch && isLocalApiPath(uriMatch[1])) {
            const method = netHttpMatch[1].toUpperCase().replace('POST_FORM', 'POST');
            allCalls.push({ method, path: cleanPath(uriMatch[1]), file: file.filePath, line: i + 1 });
          }
        }

        // HTTParty: self.get('/api/users'), HTTParty.get('/api/users')
        const httpartyMatch = line.match(/(?:HTTParty|self)\s*\.\s*(get|post|put|delete|patch)\s*\(\s*['"]([^'"]+)['"]/i);
        if (httpartyMatch) {
          const path = httpartyMatch[2];
          if (isLocalApiPath(path)) {
            allCalls.push({ method: httpartyMatch[1].toUpperCase(), path: cleanPath(path), file: file.filePath, line: i + 1 });
          }
        }
      }
    }

    // Extract Dart HTTP client calls (http, Dio, Chopper, Retrofit)
    if (lang === 'dart') {
      const dartLines = source.split('\n');
      for (let i = 0; i < dartLines.length; i++) {
        const line = dartLines[i];

        // http package: http.get(Uri.parse('/api/...')), http.post(...)
        const httpMatch = line.match(/http\s*\.\s*(get|post|put|delete|patch)\s*\(\s*(?:Uri\.parse\s*\(\s*)?['"]([^'"]+)['"]/i);
        if (httpMatch) {
          const path = httpMatch[2];
          if (isLocalApiPath(path)) {
            allCalls.push({ method: httpMatch[1].toUpperCase(), path: cleanPath(path), file: file.filePath, line: i + 1 });
          }
        }

        // Dio: dio.get('/api/...'), dio.post('/api/...')
        const dioMatch = line.match(/(?:dio|_dio|client)\s*\.\s*(get|post|put|delete|patch|request)\s*\(\s*['"]([^'"]+)['"]/i);
        if (dioMatch) {
          const path = dioMatch[2];
          if (isLocalApiPath(path)) {
            allCalls.push({ method: dioMatch[1].toUpperCase(), path: cleanPath(path), file: file.filePath, line: i + 1 });
          }
        }

        // Chopper/Retrofit annotations: @Get(path: '/api/...'), @Post(path: '/api/...')
        const annotationMatch = line.match(/@(Get|Post|Put|Delete|Patch)\s*\(\s*(?:path\s*:\s*)?['"]([^'"]+)['"]/);
        if (annotationMatch) {
          let path = annotationMatch[2];
          if (!path.startsWith('/')) path = '/' + path;
          allCalls.push({ method: annotationMatch[1].toUpperCase(), path, file: file.filePath, line: i + 1 });
        }

        // @GET/@POST (Retrofit Dart style)
        const retrofitMatch = line.match(/@(GET|POST|PUT|DELETE|PATCH)\s*\(\s*['"]([^'"]+)['"]/);
        if (retrofitMatch && !annotationMatch) {
          let path = retrofitMatch[2];
          if (!path.startsWith('/')) path = '/' + path;
          allCalls.push({ method: retrofitMatch[1].toUpperCase(), path, file: file.filePath, line: i + 1 });
        }
      }
    }

    // Extract R HTTP client calls (httr, httr2, curl, DBI)
    if (lang === 'r') {
      const rLines = source.split('\n');
      for (let i = 0; i < rLines.length; i++) {
        const line = rLines[i];

        // httr: httr::GET("url"), httr::POST("url"), GET("url"), POST("url")
        const httrMatch = line.match(/(?:httr::)?(GET|POST|PUT|DELETE|PATCH|HEAD)\s*\(\s*['"]([^'"]+)['"]/);
        if (httrMatch) {
          const path = httrMatch[2];
          if (isLocalApiPath(path)) {
            allCalls.push({ method: httrMatch[1].toUpperCase(), path: cleanPath(path), file: file.filePath, line: i + 1 });
          }
        }

        // httr2: httr2::request("url") |> req_method("POST")
        const httr2Match = line.match(/(?:httr2::)?request\s*\(\s*['"]([^'"]+)['"]/);
        if (httr2Match) {
          const path = httr2Match[1];
          if (isLocalApiPath(path)) {
            const methodMatch = line.match(/req_method\s*\(\s*['"](\w+)['"]/);
            const method = methodMatch ? methodMatch[1].toUpperCase() : 'GET';
            allCalls.push({ method, path: cleanPath(path), file: file.filePath, line: i + 1 });
          }
        }

        // curl: curl_fetch_memory("url"), curl_fetch_disk("url")
        const curlMatch = line.match(/curl_fetch_(?:memory|disk)\s*\(\s*['"]([^'"]+)['"]/);
        if (curlMatch) {
          const path = curlMatch[1];
          if (isLocalApiPath(path)) {
            allCalls.push({ method: 'GET', path: cleanPath(path), file: file.filePath, line: i + 1 });
          }
        }
      }
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
