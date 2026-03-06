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
export { generateFiles } from './files.js';
export { generateApiSurface } from './api-surface.js';
export { generateErrors } from './errors.js';
export { generateTests } from './tests.js';
export { generateHistory } from './history.js';
export { generateCurrent } from './current.js';
export { generateStatus } from './status.js';
export { generateHealth } from './health.js';
export { createMetadata, updateMetadata, loadMetadata, saveMetadata, type ProjectMetadata, type DocMetadata } from './metadata.js';
