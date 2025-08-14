import path from 'node:path';
import os from 'node:os';

export async function createDefaultConfig(overrides = {}) {
  const agentHome = process.env.AGENT_HOME || path.resolve(process.cwd(), '.agent-home');

  const config = {
    agent: {
      name: process.env.AGENT_NAME || 'Canvas AgentD',
      home: agentHome,
      color: process.env.AGENT_COLOR || 'violet',
    },
    api: {
      enabled: (process.env.AGENT_API_ENABLED ?? 'true') !== 'false',
      host: process.env.AGENT_API_HOST || '0.0.0.0',
      port: parseInt(process.env.AGENT_API_PORT || '3141'),
    },
    backend: {
      type: process.env.AGENT_BACKEND || 'ollama',
      ollama: {
        baseUrl: process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434',
        model: process.env.OLLAMA_MODEL || 'qwen3:latest',
        temperature: process.env.OLLAMA_TEMPERATURE ? parseFloat(process.env.OLLAMA_TEMPERATURE) : 0.4,
      },
      openai: {
        apiKey: process.env.OPENAI_API_KEY || '',
        baseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      },
      anthropic: {
        apiKey: process.env.ANTHROPIC_API_KEY || '',
        baseUrl: process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com',
        model: process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet',
      }
    },
    memory: {
      type: 'mock',
    },
    sessions: {
      defaultId: process.env.AGENT_DEFAULT_SESSION_ID || 'global',
    },
    prompts: {
      builtinDir: path.resolve(process.cwd(), 'src/prompts'),
      userDir: path.join(agentHome, 'prompts'),
    },
    telemetry: {
      enableConsole: process.env.AGENT_LOG_CONSOLE || true,
      debugRequests: process.env.AGENT_DEBUG_REQUESTS || true,
      debugFullMessages: process.env.AGENT_DEBUG_FULL || true,
    },
    system: {
      user: os.userInfo().username,
      hostname: os.hostname(),
      cwd: process.cwd(),
      pid: process.pid,
    },
  };

  return deepMerge(config, overrides);
}

function deepMerge(base, extra) {
  if (!extra) return base;
  const out = Array.isArray(base) ? [...base] : { ...base };
  for (const [k, v] of Object.entries(extra)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      out[k] = deepMerge(base[k] || {}, v);
    } else {
      out[k] = v;
    }
  }
  return out;
}


