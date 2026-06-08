/**
 * Service-level cross-repo dependency graph.
 *
 * A "service" is a single deployable unit (typically one repo / one Spring Boot app).
 * Edges between services represent communication channels detected deterministically
 * from source code: REST calls, Kafka topics, RabbitMQ queues, SQS queues, etc.
 *
 * No LLM, no embeddings. Pattern-based extraction with Spring property resolution.
 */

export type ChannelKind =
  | 'rest'              // HTTP REST call (RestTemplate / WebClient / Feign / fetch / axios)
  | 'kafka'             // Kafka topic publish/subscribe
  | 'rabbitmq'          // RabbitMQ queue / exchange
  | 'sqs'               // AWS SQS queue
  | 'kinesis'           // AWS Kinesis stream
  | 'stream-binding';   // Spring Cloud Stream binding (resolved to underlying broker)

export type Direction = 'outbound' | 'inbound';

/**
 * One emission or consumption point detected in a service's source code.
 */
export interface Channel {
  /** Service that owns this code site. */
  serviceName: string;
  /** Communication kind. */
  kind: ChannelKind;
  /** outbound = this service calls/publishes; inbound = this service receives/listens. */
  direction: Direction;

  /**
   * Identifier used to match across services.
   * - rest:        normalized path "/api/v1/users/{id}"
   * - kafka:       topic name
   * - rabbitmq:    queue or exchange/routing-key
   * - sqs:         queue name
   * - stream-binding: resolved destination
   */
  identifier: string;

  /** HTTP method for REST, otherwise undefined. */
  httpMethod?: string;

  /** File path (relative to service root) where the channel was detected. */
  filePath: string;
  /** 1-based line number. */
  line: number;

  /** Enclosing method name at the detection site (deterministic, best-effort). */
  enclosingMethod?: string;
  /** Enclosing class/type name at the detection site. */
  enclosingClass?: string;

  /** Original raw token from source (e.g. "${ucc.cpm.url}/arbitration"). */
  rawValue?: string;

  /** Confidence of the detection. */
  confidence: 'high' | 'medium' | 'low';

  /** Extra metadata (annotation type, framework, group, etc.). */
  metadata: Record<string, string | number | boolean>;
}

/**
 * One detected service.
 */
export interface ServiceNode {
  /** Folder name (used as canonical service id). */
  name: string;
  /** Absolute path to the service root. */
  rootPath: string;
  /** Build system that identified this folder as a service. */
  buildSystem: 'gradle' | 'maven' | 'npm' | 'unknown';
  /** Spring application.name if discovered, otherwise undefined. */
  springApplicationName?: string;
  /** Number of source files scanned. */
  filesScanned: number;
  /** All channel sites detected in this service. */
  channels: Channel[];
}

/**
 * Edge between two services in the resolved cross-service graph.
 */
export interface ServiceEdge {
  source: string;          // service name
  target: string;          // service name
  kind: ChannelKind;
  identifier: string;      // matched identifier
  httpMethod?: string;
  confidence: 'high' | 'medium' | 'low';
  /** Source-side detection sites that contributed to this edge. */
  sites: Array<{ filePath: string; line: number; method?: string; cls?: string }>;
  /** Inbound (consumer) sites on the target side, when known. */
  targetSites?: Array<{ filePath: string; line: number; method?: string; cls?: string }>;
}

export interface ServiceGraph {
  rootPath: string;
  services: ServiceNode[];
  edges: ServiceEdge[];
  /** Channels that could not be matched to any inbound listener. */
  unresolved: Channel[];
  stats: {
    serviceCount: number;
    edgeCount: number;
    restEdges: number;
    kafkaEdges: number;
    rabbitmqEdges: number;
    sqsEdges: number;
    kinesisEdges: number;
    detectionTimeMs: number;
  };
}
