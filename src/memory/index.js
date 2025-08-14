import { createMockMemory } from './mock.js';

export async function createMemory(config) {
  const type = config?.type || 'mock';
  if (type === 'mock') return createMockMemory(config);
  throw new Error(`Unknown memory type: ${type}`);
}


