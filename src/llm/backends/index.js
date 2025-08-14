import { createOllamaBackend } from './ollama.js';

export async function createBackend(config) {
  const type = config?.type || 'ollama';
  if (type === 'ollama') return createOllamaBackend(config.ollama || {});
  // Stubs for future adapters
  if (type === 'openai') throw new Error('openai backend not implemented yet');
  if (type === 'anthropic') throw new Error('anthropic backend not implemented yet');
  throw new Error(`Unknown backend type: ${type}`);
}


