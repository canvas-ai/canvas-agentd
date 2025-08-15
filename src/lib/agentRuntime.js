import { v4 as uuidv4 } from 'uuid';
import { createBackend } from '../llm/backends/index.js';
import { createMemory } from '../memory/index.js';
import { loadPromptTemplates } from '../prompts/loader.js';
import { createSessionManager } from './sessionManager.js';
import { loadTools } from '../tools/loader.js';
import { createToolExecutor } from '../tools/executor.js';

export async function createAgentRuntime(config) {
  const id = uuidv4();

  const backend = await createBackend(config.backend, config);
  const memory = await createMemory(config.memory);
  const prompts = await loadPromptTemplates(config.prompts);
  const tools = config.tools?.enabled ? await loadTools(config.tools) : [];
  const toolExecutor = createToolExecutor();
  const sessions = createSessionManager({ memory, prompts, backend, config, tools, toolExecutor });

  const state = {
    id,
    config,
    backend,
    memory,
    prompts,
    tools,
    toolExecutor,
    sessions,
    status: 'initializing'
  };

  await memory.start?.();

  state.status = 'running';

  return {
    get id() { return id; },
    get status() { return state.status; },
    get config() { return state.config; },
    get prompts() { return state.prompts; },
    get memory() { return state.memory; },
    get backend() { return state.backend; },
    get tools() { return state.tools; },
    get toolExecutor() { return state.toolExecutor; },
    get sessions() { return state.sessions; },

    async start() {
      state.status = 'running';
      return true;
    },
    async stop() {
      state.status = 'stopped';
      await memory.stop?.();
      return true;
    },
    async restart() {
      await this.stop();
      await this.start();
      return true;
    },
    async chat({ sessionId, messages, tools = [] }) {
      return sessions.chat({ sessionId, messages, tools });
    },
    async getStatus() {
      return {
        id,
        status: state.status,
        backend: config.backend?.type,
        sessions: state.sessions.count(),
      };
    }
  };
}


