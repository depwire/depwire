import { DirectedGraph } from 'graphology';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { generateArchitecture } from './architecture.js';
import { generateConventions } from './conventions.js';
import { generateDependencies } from './dependencies.js';
import { generateOnboarding } from './onboarding.js';
import { generateFiles } from './files.js';
import { generateApiSurface } from './api-surface.js';
import { generateErrors } from './errors.js';
import { generateTests } from './tests.js';
import { generateHistory } from './history.js';
import { generateCurrent } from './current.js';
import { generateStatus } from './status.js';
import { generateHealth } from './health.js';
import { createMetadata, updateMetadata, saveMetadata, loadMetadata, type ProjectMetadata } from './metadata.js';

export interface GeneratorOptions {
  outputDir: string;
  format: 'markdown' | 'json';
  include: string[];
  update: boolean;
  only?: string[];
  verbose: boolean;
  stats: boolean;
}

export interface GenerationResult {
  success: boolean;
  generated: string[];
  errors: string[];
  stats?: {
    totalTime: number;
    filesGenerated: number;
  };
}

/**
 * Main documentation generator
 */
export async function generateDocs(
  graph: DirectedGraph,
  projectRoot: string,
  version: string,
  parseTime: number,
  options: GeneratorOptions
): Promise<GenerationResult> {
  const startTime = Date.now();
  const generated: string[] = [];
  const errors: string[] = [];
  
  try {
    // Ensure output directory exists
    if (!existsSync(options.outputDir)) {
      mkdirSync(options.outputDir, { recursive: true });
      if (options.verbose) {
        console.log(`Created output directory: ${options.outputDir}`);
      }
    }
    
    // Determine which docs to generate
    let docsToGenerate = options.include;
    
    if (options.update && options.only) {
      docsToGenerate = options.only;
    }
    
    // Expand "all" to all available docs
    if (docsToGenerate.includes('all')) {
      docsToGenerate = [
        'architecture', 'conventions', 'dependencies', 'onboarding',
        'files', 'api_surface', 'errors', 'tests', 'history', 'current', 'status', 'health'
      ];
    }
    
    // Load existing metadata if updating
    let metadata: ProjectMetadata | null = null;
    if (options.update) {
      metadata = loadMetadata(options.outputDir);
    }
    
    // Generate each document
    const fileCount = getFileCount(graph);
    const symbolCount = graph.order;
    const edgeCount = graph.size;
    
    if (options.format === 'markdown') {
      // Generate markdown documents
      if (docsToGenerate.includes('architecture')) {
        try {
          if (options.verbose) console.log('Generating ARCHITECTURE.md...');
          const content = generateArchitecture(graph, projectRoot, version, parseTime);
          const filePath = join(options.outputDir, 'ARCHITECTURE.md');
          writeFileSync(filePath, content, 'utf-8');
          generated.push('ARCHITECTURE.md');
        } catch (err) {
          errors.push(`Failed to generate ARCHITECTURE.md: ${err}`);
        }
      }
      
      if (docsToGenerate.includes('conventions')) {
        try {
          if (options.verbose) console.log('Generating CONVENTIONS.md...');
          const content = generateConventions(graph, projectRoot, version);
          const filePath = join(options.outputDir, 'CONVENTIONS.md');
          writeFileSync(filePath, content, 'utf-8');
          generated.push('CONVENTIONS.md');
        } catch (err) {
          errors.push(`Failed to generate CONVENTIONS.md: ${err}`);
        }
      }
      
      if (docsToGenerate.includes('dependencies')) {
        try {
          if (options.verbose) console.log('Generating DEPENDENCIES.md...');
          const content = generateDependencies(graph, projectRoot, version);
          const filePath = join(options.outputDir, 'DEPENDENCIES.md');
          writeFileSync(filePath, content, 'utf-8');
          generated.push('DEPENDENCIES.md');
        } catch (err) {
          errors.push(`Failed to generate DEPENDENCIES.md: ${err}`);
        }
      }
      
      if (docsToGenerate.includes('onboarding')) {
        try {
          if (options.verbose) console.log('Generating ONBOARDING.md...');
          const content = generateOnboarding(graph, projectRoot, version);
          const filePath = join(options.outputDir, 'ONBOARDING.md');
          writeFileSync(filePath, content, 'utf-8');
          generated.push('ONBOARDING.md');
        } catch (err) {
          errors.push(`Failed to generate ONBOARDING.md: ${err}`);
        }
      }
      
      if (docsToGenerate.includes('files')) {
        try {
          if (options.verbose) console.log('Generating FILES.md...');
          const content = generateFiles(graph, projectRoot, version);
          const filePath = join(options.outputDir, 'FILES.md');
          writeFileSync(filePath, content, 'utf-8');
          generated.push('FILES.md');
        } catch (err) {
          errors.push(`Failed to generate FILES.md: ${err}`);
        }
      }
      
      if (docsToGenerate.includes('api_surface')) {
        try {
          if (options.verbose) console.log('Generating API_SURFACE.md...');
          const content = generateApiSurface(graph, projectRoot, version);
          const filePath = join(options.outputDir, 'API_SURFACE.md');
          writeFileSync(filePath, content, 'utf-8');
          generated.push('API_SURFACE.md');
        } catch (err) {
          errors.push(`Failed to generate API_SURFACE.md: ${err}`);
        }
      }
      
      if (docsToGenerate.includes('errors')) {
        try {
          if (options.verbose) console.log('Generating ERRORS.md...');
          const content = generateErrors(graph, projectRoot, version);
          const filePath = join(options.outputDir, 'ERRORS.md');
          writeFileSync(filePath, content, 'utf-8');
          generated.push('ERRORS.md');
        } catch (err) {
          errors.push(`Failed to generate ERRORS.md: ${err}`);
        }
      }
      
      if (docsToGenerate.includes('tests')) {
        try {
          if (options.verbose) console.log('Generating TESTS.md...');
          const content = generateTests(graph, projectRoot, version);
          const filePath = join(options.outputDir, 'TESTS.md');
          writeFileSync(filePath, content, 'utf-8');
          generated.push('TESTS.md');
        } catch (err) {
          errors.push(`Failed to generate TESTS.md: ${err}`);
        }
      }
      
      if (docsToGenerate.includes('history')) {
        try {
          if (options.verbose) console.log('Generating HISTORY.md...');
          const content = generateHistory(graph, projectRoot, version);
          const filePath = join(options.outputDir, 'HISTORY.md');
          writeFileSync(filePath, content, 'utf-8');
          generated.push('HISTORY.md');
        } catch (err) {
          errors.push(`Failed to generate HISTORY.md: ${err}`);
        }
      }
      
      if (docsToGenerate.includes('current')) {
        try {
          if (options.verbose) console.log('Generating CURRENT.md...');
          const content = generateCurrent(graph, projectRoot, version);
          const filePath = join(options.outputDir, 'CURRENT.md');
          writeFileSync(filePath, content, 'utf-8');
          generated.push('CURRENT.md');
        } catch (err) {
          errors.push(`Failed to generate CURRENT.md: ${err}`);
        }
      }
      
      if (docsToGenerate.includes('status')) {
        try {
          if (options.verbose) console.log('Generating STATUS.md...');
          const content = generateStatus(graph, projectRoot, version);
          const filePath = join(options.outputDir, 'STATUS.md');
          writeFileSync(filePath, content, 'utf-8');
          generated.push('STATUS.md');
        } catch (err) {
          errors.push(`Failed to generate STATUS.md: ${err}`);
        }
      }
      
      if (docsToGenerate.includes('health')) {
        try {
          if (options.verbose) console.log('Generating HEALTH.md...');
          const content = generateHealth(graph, projectRoot, version);
          const filePath = join(options.outputDir, 'HEALTH.md');
          writeFileSync(filePath, content, 'utf-8');
          generated.push('HEALTH.md');
        } catch (err) {
          errors.push(`Failed to generate HEALTH.md: ${err}`);
        }
      }
    } else if (options.format === 'json') {
      // TODO: JSON format support (Phase B or later)
      errors.push('JSON format not yet supported');
    }
    
    // Save/update metadata
    if (metadata && options.update) {
      metadata = updateMetadata(metadata, docsToGenerate, fileCount, symbolCount, edgeCount);
    } else {
      metadata = createMetadata(version, projectRoot, fileCount, symbolCount, edgeCount, docsToGenerate);
    }
    
    saveMetadata(options.outputDir, metadata);
    if (options.verbose) console.log('Saved metadata.json');
    
    const totalTime = Date.now() - startTime;
    
    return {
      success: errors.length === 0,
      generated,
      errors,
      stats: options.stats ? {
        totalTime,
        filesGenerated: generated.length,
      } : undefined,
    };
  } catch (err) {
    return {
      success: false,
      generated,
      errors: [`Fatal error: ${err}`],
    };
  }
}

function getFileCount(graph: DirectedGraph): number {
  const files = new Set<string>();
  graph.forEachNode((node, attrs) => {
    files.add(attrs.filePath);
  });
  return files.size;
}
