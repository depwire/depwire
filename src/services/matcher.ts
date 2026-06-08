/**
 * Cross-service matcher.
 *
 * Takes per-service Channel lists and links every outbound site to a matching
 * inbound site in another service. Matching is identifier-based (topic, queue,
 * URL path) with HTTP method as an optional discriminator.
 *
 * No probability, no LLM.
 */

import type { Channel, ChannelKind, ServiceEdge, ServiceNode } from './types.js';

interface InboundIndex {
  // identifier → list of (service, channel)
  byKey: Map<string, Array<{ serviceName: string; channel: Channel }>>;
}

export function matchServices(services: ServiceNode[]): {
  edges: ServiceEdge[];
  unresolved: Channel[];
} {
  // Build per-kind inbound indexes.
  const inboundIndex: Record<ChannelKind, InboundIndex> = {
    rest: { byKey: new Map() },
    kafka: { byKey: new Map() },
    rabbitmq: { byKey: new Map() },
    sqs: { byKey: new Map() },
    kinesis: { byKey: new Map() },
    'stream-binding': { byKey: new Map() },
  };

  // Build a normalized lookup table of service names → real names.
  // Used to detect when an outbound REST URL embeds the target service name as
  // its leading path segment (a common Kubernetes/Ingress / API gateway pattern,
  // not specific to any platform).
  const serviceSlugs = new Map<string, string>();
  for (const svc of services) {
    serviceSlugs.set(svc.name.toLowerCase(), svc.name);
    // Index every contiguous suffix of tokens as a slug (covers common
    // shortened gateway prefixes like "/billing" for service "myorg-billing").
    const tokens = svc.name.toLowerCase().split(/[-_]/).filter(Boolean);
    for (let i = 0; i < tokens.length; i++) {
      const slug = tokens.slice(i).join('-');
      if (slug.length >= 3 && !serviceSlugs.has(slug)) serviceSlugs.set(slug, svc.name);
    }
    // Also index the concatenation of significant tokens with no separators
    // (covers "/prioritycontext" for service "priority-context-delivery-processor").
    const significant = tokens.filter(t => t.length >= 3);
    for (let i = 0; i < significant.length; i++) {
      for (let j = i + 1; j <= significant.length; j++) {
        const concat = significant.slice(i, j).join('');
        if (concat.length >= 5 && !serviceSlugs.has(concat)) {
          serviceSlugs.set(concat, svc.name);
        }
      }
    }
  }

  for (const svc of services) {
    for (const ch of svc.channels) {
      if (ch.direction !== 'inbound') continue;
      const indexKey = canonicalIdentifier(ch.kind, ch.identifier);
      const list = inboundIndex[ch.kind].byKey.get(indexKey) ?? [];
      list.push({ serviceName: svc.name, channel: ch });
      inboundIndex[ch.kind].byKey.set(indexKey, list);
    }
  }

  // For each outbound, find candidate inbound matches.
  const edgeMap = new Map<string, ServiceEdge>();
  const unresolved: Channel[] = [];

  for (const svc of services) {
    for (const ch of svc.channels) {
      if (ch.direction !== 'outbound') continue;
      let matches = findMatches(ch, inboundIndex);

      // Gateway-prefix fallback (REST only): callers may include the target
      // service name as the first path segment (e.g. "/billing-api/v1/foo"
      // routed through ingress to billing-api which serves "/v1/foo"). Detect
      // and retry with the prefix stripped.
      let prefixHint: string | undefined;
      if (ch.kind === 'rest' && matches.length === 0) {
        const stripped = stripLeadingServiceSegment(ch.identifier, serviceSlugs);
        if (stripped) {
          const altChannel: Channel = { ...ch, identifier: stripped.path };
          matches = findMatches(altChannel, inboundIndex);
          prefixHint = stripped.targetService;
        }
      }

      // Hostname-based service matching: when the resolved URL has a host
      // matching a discovered service (Kubernetes service-DNS pattern), use
      // it as a target hint. Generic across any K8s deployment.
      let hostHint: string | undefined;
      if (ch.kind === 'rest' && ch.metadata?.targetHost) {
        const host = String(ch.metadata.targetHost).toLowerCase();
        const target = matchHostToService(host, serviceSlugs);
        if (target && matches.length === 0) {
          const targetService = services.find(s => s.name === target);
          if (targetService) {
            for (const inb of targetService.channels) {
              if (inb.direction === 'inbound' && inb.kind === 'rest') {
                if (pathsMatch(canonicalIdentifier('rest', ch.identifier), canonicalIdentifier('rest', inb.identifier))) {
                  matches.push({ serviceName: target, channel: inb });
                }
              }
            }
            // Only treat the host as a confirmed target when a path also
            // matched. A hostname that resolves to a service but whose path
            // doesn't match any of that service's routes is almost always an
            // external API that merely shares a name fragment (OAuth token
            // servers, EWS, MSL, etc.), so we do NOT emit a synthetic edge.
            if (matches.length > 0) {
              hostHint = target;
            }
          }
        } else if (target) {
          hostHint = target;
        }
      }

      // For Feign, the @FeignClient(name = "...") gives us the target service
      // explicitly. Filter matches by it if present.
      const feignTarget = (ch.metadata?.targetService as string | undefined)?.toLowerCase();
      const targetHint = feignTarget || hostHint?.toLowerCase() || prefixHint?.toLowerCase();
      let filtered = matches;
      if (targetHint) {
        const byName = matches.filter(m => m.serviceName.toLowerCase().includes(targetHint));
        if (byName.length > 0) filtered = byName;
      }

      if (filtered.length === 0) {
        unresolved.push(ch);
        continue;
      }

      for (const match of filtered) {
        if (match.serviceName === svc.name) continue; // skip self-edges
        const key = `${svc.name}->${match.serviceName}::${ch.kind}::${ch.identifier}`;
        const existing = edgeMap.get(key);
        const site = {
          filePath: ch.filePath,
          line: ch.line,
          method: ch.enclosingMethod,
          cls: ch.enclosingClass,
        };
        const targetSite = {
          filePath: match.channel.filePath,
          line: match.channel.line,
          method: match.channel.enclosingMethod,
          cls: match.channel.enclosingClass,
        };
        if (existing) {
          existing.sites.push(site);
          if (!existing.targetSites) existing.targetSites = [];
          existing.targetSites.push(targetSite);
          existing.confidence = mergeConfidence(existing.confidence, ch.confidence);
        } else {
          edgeMap.set(key, {
            source: svc.name,
            target: match.serviceName,
            kind: ch.kind,
            identifier: ch.identifier,
            httpMethod: ch.httpMethod,
            confidence: ch.confidence,
            sites: [site],
            targetSites: [targetSite],
          });
        }
      }
    }
  }

  return { edges: [...edgeMap.values()], unresolved };
}

function findMatches(
  outbound: Channel,
  index: Record<ChannelKind, InboundIndex>,
): Array<{ serviceName: string; channel: Channel }> {
  // Try exact match first
  const candidates: Array<{ serviceName: string; channel: Channel }> = [];

  if (outbound.kind === 'rest') {
    // Look up REST inbound. Try both the exact normalized path and the
    // path's prefixes (since the outbound may include extra segments not
    // in the route definition, e.g. path params not yet templated).
    const allRest = index.rest.byKey;
    const outKey = canonicalIdentifier('rest', outbound.identifier);

    for (const [routeKey, entries] of allRest) {
      if (pathsMatch(outKey, routeKey) && methodMatches(outbound.httpMethod, entries)) {
        candidates.push(...entries);
      }
    }
    return candidates;
  }

  // For all other kinds (kafka/rabbitmq/sqs/kinesis/stream-binding) the identifier
  // must match exactly (topic / queue name).
  // Try the channel's own kind first, then 'stream-binding' as a fallback.
  const ownKey = canonicalIdentifier(outbound.kind, outbound.identifier);
  const own = index[outbound.kind].byKey.get(ownKey) ?? [];
  candidates.push(...own);

  // For RabbitMQ, the outbound identifier may include a `.routing-key` or
  // `.exchange` suffix that the inbound side does not include (e.g. caller
  // sends to "billing.notification-queue" and the listener subscribes to
  // queue "billing"). Try matching on the leading dot-separated segment.
  if (candidates.length === 0 && outbound.kind === 'rabbitmq') {
    const dot = ownKey.indexOf('.');
    if (dot > 0) {
      const head = ownKey.slice(0, dot);
      const headMatches = index.rabbitmq.byKey.get(head) ?? [];
      candidates.push(...headMatches);
      const headStream = index['stream-binding'].byKey.get(head) ?? [];
      candidates.push(...headStream);
    }
  }

  if (own.length === 0 && outbound.kind !== 'stream-binding') {
    const stream = index['stream-binding'].byKey.get(ownKey) ?? [];
    candidates.push(...stream);
  }

  return candidates;
}

function methodMatches(
  method: string | undefined,
  inbounds: Array<{ serviceName: string; channel: Channel }>,
): boolean {
  if (!method || method === 'ANY') return true;
  return inbounds.some(i => !i.channel.httpMethod || i.channel.httpMethod === 'ANY' || i.channel.httpMethod === method);
}

/** Canonicalize identifier for indexing: trim trailing slash, normalize case for non-paths. */
function canonicalIdentifier(kind: ChannelKind, id: string): string {
  if (kind === 'rest') {
    let p = id.split(/[?#]/)[0];
    if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1);
    return p;
  }
  return id;
}

/**
 * Path-match logic for REST:
 *   - Exact: callPath === routePath
 *   - Param-aware: segment-wise compare, where __PARAM__ matches any segment
 *   - Prefix: callPath is a prefix of routePath (covers cases where caller
 *     hits a more specific subpath that is captured by a wildcard on the
 *     server side, e.g. server has /api and caller hits /api/foo)
 */
function pathsMatch(call: string, route: string): boolean {
  if (call === route) return true;

  const callParts = call.split('/');
  const routeParts = route.split('/');

  // Exact length match with __PARAM__ wildcard semantics
  if (callParts.length === routeParts.length) {
    let ok = true;
    for (let i = 0; i < callParts.length; i++) {
      const a = callParts[i];
      const b = routeParts[i];
      if (a === b) continue;
      if (a === '__PARAM__' || b === '__PARAM__') continue;
      ok = false;
      break;
    }
    if (ok) return true;
  }

  // Prefix: route is more general, caller adds extra segments
  if (call.startsWith(route + '/')) return true;
  if (route.startsWith(call + '/')) return true;

  return false;
}

function mergeConfidence(
  a: 'high' | 'medium' | 'low',
  b: 'high' | 'medium' | 'low',
): 'high' | 'medium' | 'low' {
  // Use the higher of the two
  const order = { low: 0, medium: 1, high: 2 } as const;
  return order[a] >= order[b] ? a : b;
}

/**
 * If the URL begins with a path segment that matches a discovered service slug,
 * return the stripped path and the matching service name. Otherwise return null.
 *
 * Examples:
 *   "/billing-api/v1/users"  → { path: "/v1/users", targetService: "billing-api" }
 *   "/v1/users"              → null
 */
function stripLeadingServiceSegment(
  url: string,
  serviceSlugs: Map<string, string>,
): { path: string; targetService: string } | null {
  if (!url.startsWith('/')) return null;
  const idx = url.indexOf('/', 1);
  if (idx === -1) return null;
  const firstSegment = url.slice(1, idx).toLowerCase();
  const target = serviceSlugs.get(firstSegment);
  if (!target) return null;
  return { path: url.slice(idx), targetService: target };
}

/**
 * Match a Kubernetes-style hostname (e.g. "ucc-hub-rcs-capability-check") to a
 * discovered service. Strict: only exact slug match or a known K8s suffix
 * variant. No loose substring matching — that produced false positives where
 * external API hosts (oauth, ews, msl) coincidentally shared a name fragment
 * with a UCC service.
 */
function matchHostToService(host: string, serviceSlugs: Map<string, string>): string | null {
  if (serviceSlugs.has(host)) return serviceSlugs.get(host)!;
  const suffixes = ['-svc', '-service', '-cluster'];
  for (const sfx of suffixes) {
    if (host.endsWith(sfx)) {
      const base = host.slice(0, -sfx.length);
      if (serviceSlugs.has(base)) return serviceSlugs.get(base)!;
    }
  }
  return null;
}
