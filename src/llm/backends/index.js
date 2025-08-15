import { createOllamaBackend } from './ollama.js';

export async function createBackend(backendConfig, fullConfig) {
  const type = backendConfig?.type || 'ollama';
  if (type === 'ollama') return createOllamaBackend(backendConfig.ollama || {}, fullConfig);
  // Stubs for future adapters
  if (type === 'openai') throw new Error('openai backend not implemented yet');
  if (type === 'anthropic') throw new Error('anthropic backend not implemented yet');
  throw new Error(`Unknown backend type: ${type}`);
}


