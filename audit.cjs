/**
 * Deterministic per-service audit of depwire's `services` output.
 *
 * For each Java service, grep ground-truth pattern counts from source and
 * compare against depwire's emitted channels. The verdict columns flag any
 * gap so we can iterate on real misses instead of theory.
 *
 * Run:
 *   node audit.cjs <svc.json> <repos-root>
 */

const fs = require('fs');
const cp = require('child_process');
const path = require('path');

const svcJsonPath = process.argv[2] || '/tmp/svc.json';
const reposRoot   = process.argv[3] || '/Users/P3159953/UCC/git';

const data = JSON.parse(fs.readFileSync(svcJsonPath, 'utf-8'));

function grepHits(repoPath, pattern) {
  try {
    const out = cp.execFileSync('grep', ['-rEhc', pattern, path.join(repoPath, 'src/main/java')], {
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return out.toString()
      .split('\n')
      .map(s => parseInt(s, 10))
      .filter(n => !isNaN(n))
      .reduce((a, b) => a + b, 0);
  } catch {
    return 0;
  }
}

function source(repo) {
  return {
    kafkaListener:        grepHits(repo, '@KafkaListener'),
    rabbitListener:       grepHits(repo, '@RabbitListener'),
    sqsListener:          grepHits(repo, '@SqsListener'),
    funcConsumer:         grepHits(repo, '@Bean[^\\n]*\\b(Consumer|Function|Supplier)\\s*<'),
    kafkaTemplateSend:    grepHits(repo, '\\bkafkaTemplate\\b\\s*\\.\\s*send'),
    rabbitTemplateSend:   grepHits(repo, '\\bw*[Tt]emplate\\b\\s*\\.\\s*(convertAndSend|sendAndReceive|convertSendAndReceive)'),
    streamBridgeSend:     grepHits(repo, '\\bstreamBridge\\b\\s*\\.\\s*send'),
    sqsTemplateSend:      grepHits(repo, '\\b(sqsTemplate|queueMessagingTemplate)\\b\\s*\\.\\s*(send|convertAndSend|sendMessage)'),
    restClient:           grepHits(repo, '\\b\\w*[Rr]estTemplate\\b\\s*\\.\\s*(exchange|getForObject|getForEntity|postForObject|postForEntity|patchForObject)') +
                          grepHits(repo, '\\b\\w*[Ww]ebClient\\b\\s*\\.\\s*(get|post|put|delete|patch)\\s*\\(\\s*\\)\\s*\\.\\s*uri'),
  };
}

function depwire(svcName) {
  const svc = data.services.find(s => s.name === svcName);
  if (!svc) return null;
  const counts = { inbound: {}, outbound: {} };
  for (const c of svc.channels) {
    const map = c.direction === 'inbound' ? counts.inbound : counts.outbound;
    map[c.kind] = (map[c.kind] || 0) + 1;
  }
  return counts;
}

const services = data.services
  .filter(s => s.buildSystem === 'gradle' || s.buildSystem === 'maven')
  .filter(s => fs.existsSync(path.join(reposRoot, s.name, 'src/main/java')));

console.log('═'.repeat(140));
console.log('Per-service deterministic audit (source ground truth vs depwire output)');
console.log('═'.repeat(140));

const header = [
  'service'.padEnd(40),
  'src.in'.padStart(8),
  '(K|R|S|F)'.padStart(15),
  'dw.in'.padStart(7),
  '(K|R|S|St|Kn)'.padStart(20),
  'src.out'.padStart(9),
  '(K|R|St|Sq|REST)'.padStart(22),
  'dw.out'.padStart(7),
  '(K|R|S|St|Kn|REST)'.padStart(28),
  'flag'.padStart(8),
];
console.log(header.join(' '));
console.log('─'.repeat(140));

let issues = 0;
const tally = { partialIn: [], partialOut: [], extra: [] };

for (const svc of services) {
  const repoPath = path.join(reposRoot, svc.name);
  const src = source(repoPath);
  const dw = depwire(svc.name) || { inbound: {}, outbound: {} };

  const srcIn = src.kafkaListener + src.rabbitListener + src.sqsListener + src.funcConsumer;
  const dwIn = (dw.inbound.kafka || 0) + (dw.inbound.rabbitmq || 0) + (dw.inbound.sqs || 0) +
               (dw.inbound['stream-binding'] || 0) + (dw.inbound.kinesis || 0);

  const srcOut = src.kafkaTemplateSend + src.rabbitTemplateSend + src.streamBridgeSend +
                 src.sqsTemplateSend + src.restClient;
  const dwOut = (dw.outbound.kafka || 0) + (dw.outbound.rabbitmq || 0) + (dw.outbound.sqs || 0) +
                (dw.outbound['stream-binding'] || 0) + (dw.outbound.kinesis || 0) + (dw.outbound.rest || 0);

  let flag = 'ok';
  // Per-pattern check: each non-zero src kind must have non-zero dw output.
  if (src.kafkaListener > 0 && (dw.inbound.kafka || 0) === 0) { flag = 'MISS-Kin'; tally.partialIn.push([svc.name, '@KafkaListener']); }
  else if (src.rabbitListener > 0 && (dw.inbound.rabbitmq || 0) === 0) { flag = 'MISS-Rin'; tally.partialIn.push([svc.name, '@RabbitListener']); }
  else if (src.sqsListener > 0 && (dw.inbound.sqs || 0) === 0) { flag = 'MISS-Sin'; tally.partialIn.push([svc.name, '@SqsListener']); }
  else if (src.funcConsumer > 0 && dwIn === 0) { flag = 'MISS-Fin'; tally.partialIn.push([svc.name, 'functional-Consumer']); }
  else if (src.kafkaTemplateSend > 0 && (dw.outbound.kafka || 0) === 0) { flag = 'MISS-Kout'; tally.partialOut.push([svc.name, 'kafkaTemplate.send']); }
  else if (src.streamBridgeSend > 0 && dwOut === 0) { flag = 'MISS-StBr'; tally.partialOut.push([svc.name, 'streamBridge.send']); }
  else if (src.restClient > 0 && (dw.outbound.rest || 0) === 0) { flag = 'MISS-Rest'; tally.partialOut.push([svc.name, 'restTemplate/webClient']); }

  if (flag !== 'ok') issues++;

  console.log([
    svc.name.padEnd(40),
    String(srcIn).padStart(8),
    `(${src.kafkaListener}|${src.rabbitListener}|${src.sqsListener}|${src.funcConsumer})`.padStart(15),
    String(dwIn).padStart(7),
    `(${dw.inbound.kafka||0}|${dw.inbound.rabbitmq||0}|${dw.inbound.sqs||0}|${dw.inbound['stream-binding']||0}|${dw.inbound.kinesis||0})`.padStart(20),
    String(srcOut).padStart(9),
    `(${src.kafkaTemplateSend}|${src.rabbitTemplateSend}|${src.streamBridgeSend}|${src.sqsTemplateSend}|${src.restClient})`.padStart(22),
    String(dwOut).padStart(7),
    `(${dw.outbound.kafka||0}|${dw.outbound.rabbitmq||0}|${dw.outbound.sqs||0}|${dw.outbound['stream-binding']||0}|${dw.outbound.kinesis||0}|${dw.outbound.rest||0})`.padStart(28),
    flag.padStart(8),
  ].join(' '));
}

console.log('─'.repeat(140));
console.log(`Issues: ${issues}`);
console.log();
console.log('Legend:  K=kafka  R=rabbit  S=sqs  F=functional consumer  St=stream-binding  Kn=kinesis');
if (tally.partialIn.length) {
  console.log('\nMisses (inbound):');
  for (const [svc, p] of tally.partialIn) console.log('  ' + svc + ' — ' + p);
}
if (tally.partialOut.length) {
  console.log('\nMisses (outbound):');
  for (const [svc, p] of tally.partialOut) console.log('  ' + svc + ' — ' + p);
}
