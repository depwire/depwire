/**
 * MCP tool handlers for the multi-service graph, method-level impact flow, and
 * config↔code drift. These let an AI coding agent ask, before editing a
 * service:
 *   - what does the cross-service graph look like?
 *   - if I touch this symbol, what flows across services break?
 *   - does config disagree with code (drift)?
 *
 * All deterministic. The agent points at a parent directory of repos plus an
 * optional Spring config repo / profile.
 */

import { resolve } from 'path';
import { analyzeServices, analyzeServicesWithDrift } from '../../services/index.js';
import { traceMethodFlow } from '../../services/method-flow.js';

interface ServicesArgs {
  directory: string;
  configRepo?: string[];
  profile?: string[];
  minConfidence?: 'low' | 'medium' | 'high';
  externalSources?: boolean;
}

export async function handleServiceGraph(args: ServicesArgs): Promise<any> {
  if (!args.directory) return { error: 'directory is required (parent folder of service repos)' };
  const graph = await analyzeServices(resolve(args.directory), {
    configRepos: args.configRepo?.map((p) => resolve(p)),
    profiles: args.profile,
    minConfidence: args.minConfidence,
    showExternalSources: args.externalSources,
  });
  // Return a compact, agent-friendly shape.
  return {
    stats: graph.stats,
    services: graph.services.map((s) => ({
      name: s.name,
      inbound: s.channels.filter((c) => c.direction === 'inbound').length,
      outbound: s.channels.filter((c) => c.direction === 'outbound').length,
    })),
    edges: graph.edges.map((e) => ({
      from: e.source,
      to: e.target,
      kind: e.kind,
      httpMethod: e.httpMethod,
      identifier: e.identifier,
      confidence: e.confidence,
      producer: e.sites[0] ? `${e.sites[0].filePath}:${e.sites[0].line}` : undefined,
      consumer: e.targetSites && e.targetSites[0] ? `${e.targetSites[0].filePath}:${e.targetSites[0].line}` : undefined,
    })),
    unresolvedCount: graph.unresolved.length,
  };
}

interface FlowArgs extends ServicesArgs {
  service: string;
  symbol: string;
  depth?: number;
}

export async function handleServiceFlow(args: FlowArgs): Promise<any> {
  if (!args.directory || !args.service || !args.symbol) {
    return { error: 'directory, service, and symbol are all required' };
  }
  const graph = await analyzeServices(resolve(args.directory), {
    configRepos: args.configRepo?.map((p) => resolve(p)),
    profiles: args.profile,
    minConfidence: args.minConfidence,
  });
  const match = graph.services.find((s) => s.name === args.service)
    ?? graph.services.find((s) => s.name.toLowerCase().includes(args.service.toLowerCase()));
  if (!match) {
    return { error: `service "${args.service}" not found`, available: graph.services.map((s) => s.name) };
  }
  const result = await traceMethodFlow(graph, match.name, args.symbol, { maxDepth: args.depth });
  return result;
}

export async function handleServiceDrift(args: ServicesArgs): Promise<any> {
  if (!args.directory) return { error: 'directory is required' };
  const { drift } = await analyzeServicesWithDrift(resolve(args.directory), {
    configRepos: args.configRepo?.map((p) => resolve(p)),
    profiles: args.profile,
  });
  return drift;
}

export const serviceToolDefinitions = [
  {
    name: 'service_graph',
    description:
      'Build a deterministic cross-service dependency graph across multiple repos in a parent directory. Detects REST, Kafka, RabbitMQ, SQS, Kinesis, and Spring Cloud Stream links between services, plus configured-URL references. Returns services, edges (with producer/consumer file:line and confidence), and stats. Use this to understand how microservices are wired before making a change.',
    inputSchema: {
      type: 'object',
      properties: {
        directory: { type: 'string', description: 'Parent directory containing the service repos' },
        configRepo: { type: 'array', items: { type: 'string' }, description: 'External Spring config repo path(s) for property resolution (e.g. Spring Cloud Config repo)' },
        profile: { type: 'array', items: { type: 'string' }, description: 'Restrict config to these Spring profile tokens (e.g. ["prod"])' },
        minConfidence: { type: 'string', enum: ['low', 'medium', 'high'], description: 'Drop edges below this confidence (default low)' },
        externalSources: { type: 'boolean', description: 'Include external upstream feeds (e.g. inbound Kafka topics) as source nodes' },
      },
      required: ['directory'],
    },
  },
  {
    name: 'service_flow',
    description:
      'Trace cross-service impact for a specific symbol (class, method, field, or constant) in a service. Reports transitive dependents within the service, plus upstream entry points that flow INTO the symbol and downstream external calls/queues it can trigger, hopping across services. Use before changing a symbol to see which other services are affected.',
    inputSchema: {
      type: 'object',
      properties: {
        directory: { type: 'string', description: 'Parent directory containing the service repos' },
        service: { type: 'string', description: 'Service that owns the symbol (name or substring)' },
        symbol: { type: 'string', description: 'Symbol being changed: class, method, field, or constant name (or Class.member)' },
        configRepo: { type: 'array', items: { type: 'string' }, description: 'External Spring config repo path(s)' },
        profile: { type: 'array', items: { type: 'string' }, description: 'Spring profile tokens (e.g. ["prod"])' },
        depth: { type: 'number', description: 'Max cross-service hop depth (default 8)' },
        minConfidence: { type: 'string', enum: ['low', 'medium', 'high'] },
      },
      required: ['directory', 'service', 'symbol'],
    },
  },
  {
    name: 'service_drift',
    description:
      'Detect drift between Spring config and code across services: stream bindings declared in config but never published/consumed in code (stale config), and broker destinations used in code but not declared in config (missing config). Deterministic guardrail to catch wiring inconsistencies.',
    inputSchema: {
      type: 'object',
      properties: {
        directory: { type: 'string', description: 'Parent directory containing the service repos' },
        configRepo: { type: 'array', items: { type: 'string' }, description: 'External Spring config repo path(s)' },
        profile: { type: 'array', items: { type: 'string' }, description: 'Spring profile tokens (e.g. ["prod"])' },
      },
      required: ['directory'],
    },
  },
];
