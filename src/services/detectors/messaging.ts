/**
 * Messaging detector — Kafka, RabbitMQ, AWS SQS, AWS Kinesis, Spring Cloud Stream.
 *
 * Generic Spring patterns; no domain-specific code. Resolution chain:
 *
 *   1. ExpressionResolver handles literals, @Value("${prop}") fields, class
 *      static String constants (project-wide), local final/non-final
 *      assignments (with chain-following), SpEL @Value("#{${propMap}}") maps,
 *      and getter chains (bean.getFooMap().get(...)).
 *   2. Stream-binding indexer resolves Spring Cloud Stream binding names to
 *      their underlying broker destination via two-hop lookup
 *      (binding-name → spring.cloud.stream.bindings.<name>.destination).
 *   3. Multi-line method-call argument extractor handles publish calls split
 *      across many lines.
 */

import type { Channel, ChannelKind } from '../types.js';
import type { SourceFile } from '../file-walker.js';
import { findEnclosingMethod } from '../file-walker.js';
import type { PropertyResolver } from '../property-resolver.js';
import { ExpressionResolver, extractCallArguments } from './expression-resolver.js';

export function detectMessagingChannels(
  serviceName: string,
  files: SourceFile[],
  resolver: PropertyResolver,
): Channel[] {
  const out: Channel[] = [];
  const exprResolver = new ExpressionResolver(resolver, files);
  const streamBindings = indexStreamBindings(resolver);

  for (const file of files) {
    detectKafka(serviceName, file, resolver, exprResolver, out);
    detectRabbit(serviceName, file, resolver, exprResolver, out);
    detectSqs(serviceName, file, resolver, exprResolver, out);
    detectKinesis(serviceName, file, resolver, exprResolver, out);
    detectStreamBridge(serviceName, file, resolver, exprResolver, streamBindings, out);
    detectFunctionalStreamConsumers(serviceName, file, resolver, streamBindings, out);
  }

  return out;
}

// ---------------- Kafka ----------------

function detectKafka(
  serviceName: string,
  file: SourceFile,
  resolver: PropertyResolver,
  exprResolver: ExpressionResolver,
  out: Channel[],
): void {
  const lines = file.content.split(/\r?\n/);

  // @KafkaListener
  for (let i = 0; i < lines.length; i++) {
    const annoM = lines[i].match(/@KafkaListener\s*\(([^)]*)\)/);
    if (!annoM) continue;
    const topics = extractAnnotationStringList(annoM[1], 'topics');
    const groupId = extractAnnotationStringValue(annoM[1], 'groupId');
    for (const topic of topics) {
      const resolved = resolver.resolve(topic);
      out.push({
        serviceName,
        kind: 'kafka',
        direction: 'inbound',
        identifier: resolved,
        filePath: file.relativePath,
        line: i + 1,
        rawValue: topic,
        confidence: resolved.includes('${') ? 'low' : 'high',
        metadata: {
          framework: 'spring-kafka',
          annotation: '@KafkaListener',
          ...(groupId ? { groupId: resolver.resolve(groupId) } : {}),
        },
      });
    }
  }

  // kafkaTemplate.send(topic, ...)  (multi-line tolerant)
  if (!/\bKafkaTemplate\b/.test(file.content)) return;
  const spelMaps = exprResolver.collectSpelMapsForFile(file.content);
  const locals = exprResolver.collectLocalAssignments(file.content, spelMaps);

  const sendRe = /\b(\w*[Kk]afkaTemplate)\b\s*\.\s*send\s*\(/g;
  let m;
  while ((m = sendRe.exec(file.content)) !== null) {
    const offset = m.index + m[0].length;
    const before = file.content.slice(0, m.index);
    const lineNo = before.split(/\r?\n/).length;
    const args = extractCallArguments(file.content, offset);
    if (args.length === 0) continue;
    const resolved = exprResolver.resolve(args[0], file.content, locals, spelMaps);
    if (!resolved) continue;
    for (const v of toArray(resolved)) {
      out.push({
        serviceName,
        kind: 'kafka',
        direction: 'outbound',
        identifier: v,
        filePath: file.relativePath,
        line: lineNo,
        rawValue: args[0],
        confidence: v.includes('${') ? 'low' : 'high',
        metadata: { framework: 'spring-kafka', client: m[1] },
      });
    }
  }
}

// ---------------- RabbitMQ ----------------

function detectRabbit(
  serviceName: string,
  file: SourceFile,
  resolver: PropertyResolver,
  exprResolver: ExpressionResolver,
  out: Channel[],
): void {
  // @RabbitListener
  const lines = file.content.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const annoM = lines[i].match(/@RabbitListener\s*\(([^)]*)\)/);
    if (!annoM) continue;
    const queues = extractAnnotationStringList(annoM[1], 'queues');
    for (const q of queues) {
      const resolved = resolver.resolve(q);
      out.push({
        serviceName,
        kind: 'rabbitmq',
        direction: 'inbound',
        identifier: resolved,
        filePath: file.relativePath,
        line: i + 1,
        rawValue: q,
        confidence: resolved.includes('${') ? 'low' : 'high',
        metadata: { framework: 'spring-amqp', annotation: '@RabbitListener' },
      });
    }
  }

  // <field>.convertAndSend(arg1[, arg2[, arg3]]) where field is a Rabbit/AMQP template.
  const usesAmqp =
    /import\s+org\.springframework\.amqp/.test(file.content) ||
    /\bRabbitTemplate\b|\bAmqpTemplate\b/.test(file.content);
  if (!usesAmqp) return;

  const spelMaps = exprResolver.collectSpelMapsForFile(file.content);
  const locals = exprResolver.collectLocalAssignments(file.content, spelMaps);

  const sendRe = /\b(\w*[Tt]emplate)\b\s*\.\s*(convertAndSend|send|sendAndReceive|convertSendAndReceive)\s*\(/g;
  let m;
  while ((m = sendRe.exec(file.content)) !== null) {
    const fieldName = m[1];
    if (isNonAmqpTemplate(fieldName)) continue;

    const offset = m.index + m[0].length;
    const before = file.content.slice(0, m.index);
    const lineNo = before.split(/\r?\n/).length;

    const args = extractCallArguments(file.content, offset);
    if (args.length === 0) continue;

    const arg1 = exprResolver.resolve(args[0], file.content, locals, spelMaps);
    const arg2 = args.length > 1 ? exprResolver.resolve(args[1], file.content, locals, spelMaps) : null;

    if (arg1 === null) continue;

    for (const a1 of toArray(arg1)) {
      for (const a2 of arg2 === null ? [null] : toArray(arg2)) {
        const id = a2 ? `${a1}#${a2}` : a1;
        out.push({
          serviceName,
          kind: 'rabbitmq',
          direction: 'outbound',
          identifier: id,
          filePath: file.relativePath,
          line: lineNo,
          rawValue: args.slice(0, 2).join(', '),
          confidence: id.includes('${') ? 'low' : 'high',
          metadata: { framework: 'spring-amqp', client: fieldName },
        });
      }
    }
  }
}

// ---------------- AWS SQS ----------------

function detectSqs(
  serviceName: string,
  file: SourceFile,
  resolver: PropertyResolver,
  exprResolver: ExpressionResolver,
  out: Channel[],
): void {
  const lines = file.content.split(/\r?\n/);
  const spelMaps = exprResolver.collectSpelMapsForFile(file.content);
  const locals = exprResolver.collectLocalAssignments(file.content, spelMaps);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // @SqsListener("queue-name")
    const annoM = line.match(/@SqsListener\s*\(\s*(?:value\s*=\s*)?["']([^"']+)["']/);
    if (annoM) {
      const resolved = resolver.resolve(annoM[1]);
      out.push({
        serviceName,
        kind: 'sqs',
        direction: 'inbound',
        identifier: resolved,
        filePath: file.relativePath,
        line: i + 1,
        rawValue: annoM[1],
        confidence: resolved.includes('${') ? 'low' : 'high',
        metadata: { framework: 'spring-cloud-aws', annotation: '@SqsListener' },
      });
    }
  }

  // sqsTemplate.send(...) / queueMessagingTemplate.convertAndSend(...) (multi-line)
  const sendRe = /\b(?:sqsTemplate|queueMessagingTemplate)\b\s*\.\s*(?:send|convertAndSend|sendMessage)\s*\(/g;
  let m;
  while ((m = sendRe.exec(file.content)) !== null) {
    const offset = m.index + m[0].length;
    const before = file.content.slice(0, m.index);
    const lineNo = before.split(/\r?\n/).length;
    const args = extractCallArguments(file.content, offset);
    if (args.length === 0) continue;
    const resolved = exprResolver.resolve(args[0], file.content, locals, spelMaps);
    if (!resolved) continue;
    for (const v of toArray(resolved)) {
      out.push({
        serviceName,
        kind: 'sqs',
        direction: 'outbound',
        identifier: v,
        filePath: file.relativePath,
        line: lineNo,
        rawValue: args[0],
        confidence: v.includes('${') ? 'low' : 'high',
        metadata: { framework: 'spring-cloud-aws' },
      });
    }
  }

  // AWS SDK v2: anyClient.sendMessage(SendMessageRequest.builder().queueUrl(<expr>)...)
  const awsRe = /\.sendMessage\s*\(\s*SendMessageRequest\.builder\s*\(\s*\)\s*\.queueUrl\s*\(\s*([^)]+)\)/g;
  while ((m = awsRe.exec(file.content)) !== null) {
    const resolved = exprResolver.resolve(m[1].trim(), file.content, locals, spelMaps);
    if (!resolved) continue;
    const lineNo = file.content.slice(0, m.index).split(/\r?\n/).length;
    for (const v of toArray(resolved)) {
      out.push({
        serviceName,
        kind: 'sqs',
        direction: 'outbound',
        identifier: v,
        filePath: file.relativePath,
        line: lineNo,
        rawValue: m[1],
        confidence: v.includes('${') ? 'low' : 'high',
        metadata: { framework: 'aws-sdk-v2' },
      });
    }
  }
}

// ---------------- AWS Kinesis ----------------

function detectKinesis(
  serviceName: string,
  file: SourceFile,
  resolver: PropertyResolver,
  exprResolver: ExpressionResolver,
  out: Channel[],
): void {
  const lines = file.content.split(/\r?\n/);
  const spelMaps = exprResolver.collectSpelMapsForFile(file.content);
  const locals = exprResolver.collectLocalAssignments(file.content, spelMaps);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const m = line.match(/\.streamName\s*\(\s*([^)]+)\s*\)/);
    if (!m) continue;
    const resolved = exprResolver.resolve(m[1].trim(), file.content, locals, spelMaps);
    if (!resolved) continue;
    for (const v of toArray(resolved)) {
      out.push({
        serviceName,
        kind: 'kinesis',
        direction: /putRecord|putRecords/.test(line) ? 'outbound' : 'inbound',
        identifier: v,
        filePath: file.relativePath,
        line: i + 1,
        rawValue: m[1],
        confidence: v.includes('${') ? 'low' : 'high',
        metadata: { framework: 'aws-kinesis' },
      });
    }
  }
}

// ---------------- Spring Cloud Stream ----------------

function indexStreamBindings(
  resolver: PropertyResolver,
): Map<string, { destinations: string[]; group?: string; binder?: string }> {
  // Walk OWN property keys for `spring.cloud.stream.bindings.<binding>.destination`.
  // For each binding, collect ALL distinct destinations seen across env-specific
  // config files plus the binder type so we can label the channel correctly.
  const map = new Map<string, { destinations: string[]; group?: string; binder?: string }>();
  const keys = resolver.ownKeysMatching(/^spring\.cloud\.stream\.bindings\.[^.]+\.destination$/);
  for (const key of keys) {
    const m = key.match(/^spring\.cloud\.stream\.bindings\.([^.]+)\.destination$/);
    if (!m) continue;
    const binding = m[1];
    const allValues = resolver.getAll(key);
    if (allValues.length === 0) continue;
    const destinations = [...new Set(allValues.map(v => resolver.resolve(v)))];
    const groupKey = `spring.cloud.stream.bindings.${binding}.group`;
    const group = resolver.getOwn(groupKey);
    const binderKey = `spring.cloud.stream.bindings.${binding}.binder`;
    const binder = resolver.getOwn(binderKey);
    map.set(binding, {
      destinations,
      group: group ? resolver.resolve(group) : undefined,
      binder: binder ? resolver.resolve(binder) : undefined,
    });
  }
  return map;
}

/**
 * Determine the broker kind for a Spring Cloud Stream binding.
 *
 * Resolution order (deterministic, no heuristic guessing on success):
 *   1. Per-binding binder property (`spring.cloud.stream.bindings.<x>.binder`).
 *   2. Default binder (`spring.cloud.stream.default.binder`
 *      OR `spring.cloud.stream.default-binder` — both forms are valid).
 *   3. Named binder type lookup (`spring.cloud.stream.binders.<name>.type`).
 *      A binder name like "cctKafka" or "myKinesis" doesn't tell us the broker;
 *      we need to read its declared type, which is itself a property.
 *   4. Substring heuristic on the binder name (kafka / rabbit / sqs / kinesis).
 *   5. Fallback: substring heuristic on the binding name itself.
 */
function inferBrokerKind(
  bindingName: string,
  binding: { binder?: string } | undefined,
  resolver: PropertyResolver,
): ChannelKind {
  // Step 1 — per-binding binder, or step 2 — default binder.
  const explicit =
    binding?.binder
    ?? resolver.getOwn('spring.cloud.stream.default.binder')
    ?? resolver.getOwn('spring.cloud.stream.default-binder');

  if (explicit) {
    // Step 3 — resolve binder name to its declared type.
    const typeKey = `spring.cloud.stream.binders.${explicit}.type`;
    const declaredType =
      resolver.getOwn(typeKey)
      ?? resolver.get(typeKey); // also try cross-service map for named binders shared across env files
    const candidate = (declaredType ?? explicit).toLowerCase();

    if (candidate.includes('kinesis')) return 'kinesis';
    if (candidate.includes('rabbit') || candidate.includes('amqp')) return 'rabbitmq';
    if (candidate.includes('kafka')) return 'kafka';
    if (candidate.includes('sqs')) return 'sqs';
  }

  // Step 5 — last-resort heuristic on the binding name.
  return inferBrokerKindFromBindingName(bindingName) ?? 'stream-binding';
}

function detectStreamBridge(
  serviceName: string,
  file: SourceFile,
  resolver: PropertyResolver,
  exprResolver: ExpressionResolver,
  bindings: Map<string, { destinations: string[]; group?: string; binder?: string }>,
  out: Channel[],
): void {
  if (!/\bstreamBridge\b/.test(file.content)) return;

  const spelMaps = exprResolver.collectSpelMapsForFile(file.content);
  const locals = exprResolver.collectLocalAssignments(file.content, spelMaps);

  const sendRe = /\bstreamBridge\b\s*\.\s*send\s*\(/g;
  let m;
  while ((m = sendRe.exec(file.content)) !== null) {
    const offset = m.index + m[0].length;
    const before = file.content.slice(0, m.index);
    const lineNo = before.split(/\r?\n/).length;
    const args = extractCallArguments(file.content, offset);
    if (args.length === 0) continue;

    const resolved = exprResolver.resolve(args[0], file.content, locals, spelMaps);
    if (!resolved) continue;

    // Each resolved value is a binding name. Resolve to its destinations via
    // the two-hop lookup; if no binding exists, treat the value itself as the
    // destination (caller may have passed a literal queue/topic name).
    for (const bindingName of toArray(resolved)) {
      const b = bindings.get(bindingName);
      const destinations = b?.destinations ?? [bindingName];
      const kind = inferBrokerKind(bindingName, b, resolver);
      for (const destination of destinations) {
        out.push({
          serviceName,
          kind,
          direction: 'outbound',
          identifier: destination,
          filePath: file.relativePath,
          line: lineNo,
          rawValue: args[0],
          confidence: b ? 'high' : 'medium',
          metadata: {
            framework: 'spring-cloud-stream',
            bindingName,
            client: 'StreamBridge',
            ...(b?.binder ? { binder: b.binder } : {}),
          },
        });
      }
    }
  }
}

/**
 * Detect functional consumers — `@Bean Consumer<T> emailConsumer()` paired with
 * a Spring Cloud Stream binding named `emailConsumer-in-0` whose `destination`
 * resolves to the actual queue/topic.
 */
function detectFunctionalStreamConsumers(
  serviceName: string,
  file: SourceFile,
  resolver: PropertyResolver,
  bindings: Map<string, { destinations: string[]; group?: string; binder?: string }>,
  out: Channel[],
): void {
  // Spring Cloud Stream functional bean: `@Bean Consumer<X> beanName() { ... }`.
  // The generic type may be nested (`Consumer<List<Request>>`), so we tolerate
  // up to two levels of `<...<...>...>` before the bean name.
  const consumerRe = /@Bean[\s\S]{0,200}?(?:public\s+|protected\s+|private\s+)?(?:Consumer|Function|Supplier)\s*<(?:[^<>]|<[^<>]*>)+>\s+(\w+)\s*\(/g;
  let match;
  while ((match = consumerRe.exec(file.content)) !== null) {
    const beanName = match[1];
    const bindingNames = [`${beanName}-in-0`, `${beanName}-out-0`];
    for (const bn of bindingNames) {
      const b = bindings.get(bn);
      if (!b) continue;
      const direction: 'inbound' | 'outbound' = bn.endsWith('-in-0') ? 'inbound' : 'outbound';
      const kind = inferBrokerKind(bn, b, resolver);
      const lineNo = file.content.slice(0, match.index).split(/\r?\n/).length;
      // The bean factory method itself is the handler entry point, so attribute
      // the channel directly to it. (The later generic enrichment can't, since
      // the channel line points at the @Bean annotation, outside the method
      // body braces.)
      const cls = file.content.slice(0, match.index).match(/(?:class|interface)\s+(\w+)[^{]*$/)?.[1]
        ?? enclosingClassOf(file.content, match.index);
      for (const destination of b.destinations) {
        out.push({
          serviceName,
          kind,
          direction,
          identifier: destination,
          filePath: file.relativePath,
          line: lineNo,
          enclosingMethod: beanName,
          enclosingClass: cls,
          rawValue: bn,
          confidence: 'high',
          metadata: {
            framework: 'spring-cloud-stream',
            bindingName: bn,
            beanName,
            ...(b.group ? { group: b.group } : {}),
            ...(b.binder ? { binder: b.binder } : {}),
          },
        });
      }
    }
  }
}

/** Find the nearest enclosing class name for an offset (last class decl before it). */
function enclosingClassOf(source: string, offset: number): string | undefined {
  const re = /\b(?:class|interface|enum|record)\s+(\w+)/g;
  let m: RegExpExecArray | null;
  let name: string | undefined;
  while ((m = re.exec(source)) !== null) {
    if (m.index > offset) break;
    name = m[1];
  }
  return name;
}

function inferBrokerKindFromBindingName(name: string): ChannelKind | null {
  if (name.startsWith('kafka-') || name.includes('kafka')) return 'kafka';
  if (name.startsWith('rabbit-') || name.includes('rabbit')) return 'rabbitmq';
  if (name.startsWith('sqs-') || name.includes('sqs')) return 'sqs';
  return null;
}

// ---------------- helpers ----------------

function extractAnnotationStringList(args: string, key: string): string[] {
  const re = new RegExp(`${key}\\s*=\\s*(\\{[^}]*\\}|["'][^"']+["'])`);
  const m = args.match(re);
  if (!m) return [];
  const val = m[1];
  if (val.startsWith('{')) {
    return [...val.matchAll(/["']([^"']+)["']/g)].map(x => x[1]);
  }
  return [val.replace(/^["']|["']$/g, '')];
}

function extractAnnotationStringValue(args: string, key: string): string | undefined {
  const m = args.match(new RegExp(`${key}\\s*=\\s*["']([^"']+)["']`));
  return m?.[1];
}

function isNonAmqpTemplate(fieldName: string): boolean {
  return /jdbcTemplate|restTemplate|webClient|jmsTemplate|kafkaTemplate|sqsTemplate|queueMessagingTemplate|namedParameterJdbcTemplate|jpaTemplate|redisTemplate|mongoTemplate|cassandraTemplate|elasticsearchTemplate/i.test(fieldName);
}

function toArray<T>(v: T | T[]): T[] {
  return Array.isArray(v) ? v : [v];
}
