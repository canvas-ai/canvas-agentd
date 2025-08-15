import readline from 'node:readline';
import { v4 as uuidv4 } from 'uuid';
import { createDefaultConfig } from '../lib/config.js';
import { createAgentRuntime } from '../lib/agentRuntime.js';
import { startApiServer } from '../api/server.js';

async function main() {
  const config = await createDefaultConfig();
  const runtime = await createAgentRuntime(config);
  const server = await startApiServer({ runtime, config });
  const sessionId = uuidv4();

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: 'you> ' });
  console.log('Canvas AgentD REPL. Type your message, Ctrl+C to exit.');
  rl.prompt();

  rl.on('line', async (line) => {
    const input = line.trim();
    if (!input) return rl.prompt();
    try {
      const reply = await runtime.chat({ sessionId, messages: [{ role: 'user', content: input }], tools: runtime.tools });
      console.log(`agent> ${reply.content}`);
    } catch (err) {
      console.error('Error:', err?.message || String(err));
    }
    rl.prompt();
  });

  rl.on('SIGINT', async () => {
    rl.close();
  });

  rl.on('close', async () => {
    console.log('\nShutting down...');
    server.close();
    await runtime.stop();
    process.exit(0);
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}


