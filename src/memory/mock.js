import fs from 'node:fs/promises';
import path from 'node:path';

export function createMockMemory(config = {}) {
  const baseDir = config.baseDir || path.resolve(process.cwd(), '.agent-home', 'episodes');
  const logs = new Map(); // sessionId -> [{ role, content, ts }]

  return {
    async start() { await fs.mkdir(baseDir, { recursive: true }); return true; },
    async stop() { logs.clear(); return true; },
    async append({ sessionId, role, content }) {
      const arr = logs.get(sessionId) || [];
      arr.push({ role, content, ts: Date.now() });
      logs.set(sessionId, arr);
      try {
        const sessionDir = path.join(baseDir, sessionId);
        await fs.mkdir(sessionDir, { recursive: true });
        const line = JSON.stringify({ ts: Date.now(), role, content }) + '\n';
        await fs.appendFile(path.join(sessionDir, 'episode.log'), line, 'utf8');
      } catch {}
      return true;
    },
    async retrieveContext({ sessionId, recentMessages = [] }) {
      const recent = (logs.get(sessionId) || []).slice(-5);
      const hints = recent.map(m => `- ${m.role}: ${truncate(m.content, 160)}`).join('\n');
      return `Memory context for session ${sessionId} (mock)\nRecent notes:\n${hints}`;
    }
  };
}

function truncate(text, maxLen) {
  if (!text) return '';
  return text.length > maxLen ? text.slice(0, maxLen) + '…' : text;
}


