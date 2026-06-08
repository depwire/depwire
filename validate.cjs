const d = require('/tmp/svc.json');
const out = new Map();
for (const e of d.edges) {
  const k = e.source + '->' + e.target;
  if (!out.has(k)) out.set(k, []);
  out.get(k).push(e);
}
const expected = [
  ['ucc-hub-ingestion-api',                  'ucc-hub-campaign-process-manager',           'Ingestion -> CPM'],
  ['ucc-hub-common-msg-formatter',           'ucc-hub-common-msg-ingestion-processor',     'CMF -> CMIP'],
  ['ucc-hub-common-msg-ingestion-processor', 'ucc-hub-campaign-process-manager',           'CMIP -> CPM'],
  ['ucc-hub-campaign-process-manager',       'ucc-hub-ready4delivery-publisher',           'CPM -> Ready4Delivery'],
  ['ucc-hub-ready4delivery-publisher',       'ucc-hub-priority-context-delivery-processor','Ready4Delivery -> PCDP'],
  ['ucc-hub-comm-delivey-response-handler',  'ucc-hub-dnd-mgmt-service',                   'Response Handler -> DND'],
  ['ucc-hub-comm-delivey-response-handler',  'ucc-hub-priority-context-delivery-processor','Response Handler -> PCDP (RCS->SMS failover)'],
  ['ucc-hub-reprocessing-service',           'ucc-hub-priority-context-delivery-processor','Reprocess -> PCDP'],
  ['ucc-hub-reprocessing-service',           'ucc-hub-ingestion-api',                      'Reprocess -> Ingestion (preferenceFailOver)'],
  ['ucc-hub-ui-api',                         'ucc-hub-campaign-process-manager',           'UI API -> CPM'],
];
console.log('Expected per-architecture flows:');
let pass = 0, miss = 0;
for (const row of expected) {
  const s = row[0], t = row[1], label = row[2];
  const k = s + '->' + t;
  if (out.has(k)) {
    console.log('  PASS  ' + label + '  (' + out.get(k).length + ' edges)');
    pass++;
  } else {
    console.log('  MISS  ' + label);
    miss++;
  }
}
console.log('\nResult: ' + pass + ' / ' + (pass + miss) + ' documented flows detected');

console.log('\n--- All detected service edges ---');
for (const k of [...out.keys()].sort()) {
  console.log('  ' + k + '   x' + out.get(k).length);
}
