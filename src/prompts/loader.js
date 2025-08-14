import fs from 'node:fs/promises';
import path from 'node:path';

export async function loadPromptTemplates({ builtinDir, userDir }) {
  const load = async (p) => {
    try { return await fs.readFile(p, 'utf8'); } catch { return ''; }
  };
  const common = await load(path.join(builtinDir, 'common.markdown.md'));
  const agentCode = await load(path.join(builtinDir, 'agent.code.md'));
  const agentMemory = await load(path.join(builtinDir, 'agent.memory.md'));
  const agentResearch = await load(path.join(builtinDir, 'agent.research.md'));

  // Load all userDir .md files as an array (optional)
  let userTemplates = [];
  try {
    const entries = await fs.readdir(userDir, { withFileTypes: true });
    for (const e of entries) {
      if (e.isFile() && e.name.endsWith('.md')) {
        const content = await load(path.join(userDir, e.name));
        userTemplates.push({ name: e.name, content });
      }
    }
  } catch {}

  return { common, agentCode, agentMemory, agentResearch, userTemplates };
}


