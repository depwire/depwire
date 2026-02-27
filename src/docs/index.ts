/**
 * Depwire Documentation Generator
 * 
 * Auto-generates comprehensive codebase documentation from dependency graphs.
 */

export { generateDocs, type GeneratorOptions, type GenerationResult } from './generator.js';
export { generateArchitecture } from './architecture.js';
export { generateConventions } from './conventions.js';
export { generateDependencies } from './dependencies.js';
export { generateOnboarding } from './onboarding.js';
export { createMetadata, updateMetadata, loadMetadata, saveMetadata, type ProjectMetadata, type DocMetadata } from './metadata.js';
