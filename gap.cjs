/**
 * Independent completeness check.
 *
 * Build the cross-service connection set purely from CONFIG (consumer
 * destination ↔ any other service binding the same destination), then compare
 * to depwire's emitted edges. Report destinations that config says are
 * cross-service but depwire produced NO edge for (potential misses), and
 * normalize service-name skew (config uses dm-/eks- variants).
 */
const fs = require('fs'), path = require('path');
const cfg = '/Users/P3159953/UCC/git/ucc-hub-apps-configurations';
const svc = JSON.parse(fs.readFileSync('/tmp/svc.json', 'utf8'));

// --- config-derived destination -> {consumers, producers(any other binder)} ---
const files = fs.readdirSync(cfg).filter(f => /prod1?\.properties$/.test(f));
const consumers = new Map(), allBind = new Map();
function norm(svcName) {
  // collapse dm-, eks-, fo-, *-v2 etc to a canonical scanned-service name
  return svcName
    .replace(/\.properties$/, '')
    .replace(/-(fo|messagequeue|singleapi|internal-consumer|secondary)/g, '')
    .replace(/-eks/g, '')
    .replace(/-?prod1?$/, '')
    .replace(/^dm-/, 'ucc-hub-')
    .replace(/-mgnt-/, '-mgmt-')
    .replace(/common-msg-ing-processor/, 'common-msg-ingestion-processor')
    .replace(/common-msg-rmatter/, 'common-msg-formatter')
    .replace(/common-msgrmatter/, 'common-msg-formatter')
    .replace(/common-msgformatter/, 'common-msg-formatter');
}
for (const f of files) {
  const svcName = norm(f);
  const txt = fs.readFileSync(path.join(cfg, f), 'utf8');
  for (const m of txt.matchAll(/spring\.cloud\.stream\.bindings\.([^.]+)\.destination\s*=\s*([^\r\n#]+)/g)) {
    const binding = m[1], dest = m[2].trim().replace(/^=+/, '');
    if (!allBind.has(dest)) allBind.set(dest, new Set());
    allBind.get(dest).add(svcName);
    if (/-in-0$/.test(binding) || /[Cc]onsumer/.test(binding)) {
      if (!consumers.has(dest)) consumers.set(dest, new Set());
      consumers.get(dest).add(svcName);
    }
  }
}

// --- depwire emitted service-pairs (normalized, direction-agnostic dest match) ---
const depwirePairs = new Set();
for (const e of svc.edges) {
  depwirePairs.add(e.source + '|' + e.target);
}
const scanned = new Set(svc.services.map(s => s.name));

// --- expected cross-service pairs from config ---
const expected = new Map(); // "A|B" -> dest
let expectedCount = 0;
for (const [dest, cons] of consumers) {
  const binders = allBind.get(dest) || new Set();
  for (const c of cons) {
    for (const b of binders) {
      if (b === c) continue;
      // producer b -> consumer c
      const key = b + '|' + c;
      if (!expected.has(key)) expected.set(key, []);
      expected.get(key).push(dest);
    }
  }
}

let covered = 0, missing = 0, unknownSvc = 0;
const missList = [];
const skippedList = [];
for (const [pair, dests] of expected) {
  const [prod, cons] = pair.split('|');
  if (!scanned.has(prod) || !scanned.has(cons)) {
    unknownSvc++;
    const which = [!scanned.has(prod) ? prod : null, !scanned.has(cons) ? cons : null].filter(Boolean).join(' & ');
    skippedList.push(`${pair}  (${[...new Set(dests)].slice(0,2).join(',')})  [unmatched: ${which}]`);
    continue;
  }
  if (depwirePairs.has(pair)) covered++;
  else { missing++; missList.push(pair + '  (' + [...new Set(dests)].slice(0,3).join(',') + ')'); }
}

console.log('Config-derived cross-service producer→consumer pairs (scanned services only):', covered + missing);
console.log('  Covered by depwire:', covered);
console.log('  MISSING from depwire:', missing);
console.log('  (skipped pairs involving non-scanned/!normalized services:', unknownSvc, ')');
if (missList.length) {
  console.log('\nPairs config says exist but depwire did NOT emit:');
  for (const m of missList) console.log('  -', m);
}
if (skippedList.length) {
  console.log('\nSkipped (service name in config did not map to a scanned service):');
  for (const s of skippedList) console.log('  -', s);
}
console.log('\nScanned services:', [...scanned].sort().join(', '));
