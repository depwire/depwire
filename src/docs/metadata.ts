import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

export interface DocMetadata {
  generated_at: string;
  file: string;
}

export interface ProjectMetadata {
  version: string;
  generated_at: string;
  project_path: string;
  file_count: number;
  symbol_count: number;
  edge_count: number;
  documents: Record<string, DocMetadata>;
}

/**
 * Load existing metadata from .depwire/metadata.json
 */
export function loadMetadata(outputDir: string): ProjectMetadata | null {
  const metadataPath = join(outputDir, 'metadata.json');
  
  if (!existsSync(metadataPath)) {
    return null;
  }
  
  try {
    const content = readFileSync(metadataPath, 'utf-8');
    return JSON.parse(content);
  } catch (err) {
    console.error('Failed to load metadata:', err);
    return null;
  }
}

/**
 * Save metadata to .depwire/metadata.json
 */
export function saveMetadata(outputDir: string, metadata: ProjectMetadata): void {
  const metadataPath = join(outputDir, 'metadata.json');
  writeFileSync(metadataPath, JSON.stringify(metadata, null, 2), 'utf-8');
}

/**
 * Create initial metadata structure
 */
export function createMetadata(
  version: string,
  projectPath: string,
  fileCount: number,
  symbolCount: number,
  edgeCount: number,
  docTypes: string[]
): ProjectMetadata {
  const now = new Date().toISOString();
  
  const documents: Record<string, DocMetadata> = {};
  for (const docType of docTypes) {
    const fileName = docType === 'architecture' ? 'ARCHITECTURE.md' :
                     docType === 'conventions' ? 'CONVENTIONS.md' :
                     docType === 'dependencies' ? 'DEPENDENCIES.md' :
                     docType === 'onboarding' ? 'ONBOARDING.md' :
                     `${docType.toUpperCase()}.md`;
    
    documents[docType] = {
      generated_at: now,
      file: fileName,
    };
  }
  
  return {
    version,
    generated_at: now,
    project_path: projectPath,
    file_count: fileCount,
    symbol_count: symbolCount,
    edge_count: edgeCount,
    documents,
  };
}

/**
 * Update metadata for specific documents
 */
export function updateMetadata(
  existing: ProjectMetadata,
  docTypes: string[],
  fileCount: number,
  symbolCount: number,
  edgeCount: number
): ProjectMetadata {
  const now = new Date().toISOString();
  
  // Update the generation timestamp for specified docs
  for (const docType of docTypes) {
    if (existing.documents[docType]) {
      existing.documents[docType].generated_at = now;
    }
  }
  
  // Update project stats
  existing.file_count = fileCount;
  existing.symbol_count = symbolCount;
  existing.edge_count = edgeCount;
  existing.generated_at = now;
  
  return existing;
}
