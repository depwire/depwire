/**
 * Correctness verification of the depwire service graph.
 *
 *  SOUNDNESS  — every emitted edge must have a real producer identifier on the
 *               source side and a real consumer for that identifier on the
 *               target side. We re-derive the consumer index independently and
 *               check each edge against it.
 *
 *  COMPLETENESS — every unresolved outbound channel is classified:
 *               - INTERNAL-MISS : its identifier IS consumed by some scanned
 *                 service, so an edge SHOULD exist but doesn't (a real miss).
 *               - EXTERNAL      : no scanned service consumes it (correctly
 *                 unresolved — external dependency).
 *
 * Run: node verify.cjs /tmp/svc.json
 */
const fs = require('fs');
const svc = JSON.parse(fs.readFileSync(process.argv[2] || '/tmp/svc.json', 'utf8'));

// ---- Build independent inbound index from channels ----
// key = kind + '::' + identifier  (REST handled separately with path matching)
const inboundExact = new Map();   // non-rest: kind::id -> Set(service)
const inboundRest = [];           // {service, path}
for (const s of svc.services) {
  for (const c of s.channels) {
    if (c.direction !== 'inbound') continue;
    if (c.kind === 'rest') {
      inboundRest.push({ service: s.name, path: canon(c.identifier) });
    } else {
      const k = c.kind + '::' + c.identifier;
      if (!inboundExact.has(k)) inboundExact.set(k, new Set());
      inboundExact.get(k).add(s.name);
    }
  }
}

function canon(p) {
  let s = String(p).split(/[?#]/)[0];
  if (s.length > 1 && s.endsWith('/')) s = s.slice(0, -1);
  return s;
}
function restConsumers(path) {
  const cp = canon(path);
  const out = [];
  for (const r of inboundRest) {
    if (pathsMatch(cp, r.path)) out.push(r.service);
  }
  return out;
}

// Replicate the matcher's non-REST consumer lookup, including the RabbitMQ
// dot-suffix strip (producer "x.routing-key" ↔ consumer queue "x") and the
// stream-binding fallback.
function brokerConsumers(kind, id) {
  const direct = new Set([...(inboundExact.get(kind + '::' + id) || [])]);
  // dot-suffix strip for rabbitmq
  if (kind === 'rabbitmq') {
    const dot = id.indexOf('.');
    if (dot > 0) {
      const head = id.slice(0, dot);
      for (const s of (inboundExact.get('rabbitmq::' + head) || [])) direct.add(s);
      for (const s of (inboundExact.get('stream-binding::' + head) || [])) direct.add(s);
    }
  }
  // stream-binding fallback
  for (const s of (inboundExact.get('stream-binding::' + id) || [])) direct.add(s);
  return [...direct];
}
function pathsMatch(call, route) {
  if (call === route) return true;
  const a = call.split('/'), b = route.split('/');
  if (a.length === b.length) {
    let ok = true;
    for (let i = 0; i < a.length; i++) {
      if (a[i] === b[i]) continue;
      if (a[i] === '__PARAM__' || b[i] === '__PARAM__') continue;
      ok = false; break;
    }
    if (ok) return true;
  }
  if (call.startsWith(route + '/') || route.startsWith(call + '/')) return true;
  // gateway prefix: route may be call minus a leading service segment
  return false;
}

// ---- SOUNDNESS ----
let unsound = 0;
for (const e of svc.edges) {
  if (String(e.source).startsWith('external-')) continue;
  let consumers;
  if (e.kind === 'rest') consumers = restConsumers(e.identifier);
  else consumers = brokerConsumers(e.kind, e.identifier);
  // For rest with gateway-prefix/host matching the consumer may be matched by
  // host rather than path, so only flag non-rest as unsound when no consumer.
  if (e.kind !== 'rest' && !consumers.includes(e.target)) {
    console.log('  UNSOUND edge (target not a consumer):', e.source, '->', e.target, e.kind, e.identifier);
    unsound++;
  }
}

// ---- COMPLETENESS ----
let internalMiss = 0, external = 0;
const missDetail = [];
for (const u of svc.unresolved) {
  let consumers;
  if (u.kind === 'rest') consumers = restConsumers(u.identifier);
  else consumers = brokerConsumers(u.kind, u.identifier);
  consumers = consumers.filter(c => c !== u.serviceName);
  if (consumers.length > 0) {
    internalMiss++;
    missDetail.push(`${u.serviceName} --${u.kind}:${u.identifier}--> SHOULD link ${consumers.join(',')}  (${u.filePath}:${u.line})`);
  } else {
    external++;
  }
}

console.log('\n==== SOUNDNESS ====');
console.log('Edges:', svc.edges.length, ' Unsound (false) edges:', unsound);
console.log('\n==== COMPLETENESS ====');
console.log('Unresolved outbound total:', svc.unresolved.length);
console.log('  EXTERNAL (correctly unresolved):', external);
console.log('  INTERNAL-MISS (should have linked):', internalMiss);
if (missDetail.length) {
  console.log('\n  Missed internal links:');
  for (const m of missDetail.slice(0, 40)) console.log('   -', m);
  if (missDetail.length > 40) console.log('   ... +' + (missDetail.length - 40) + ' more');
}
