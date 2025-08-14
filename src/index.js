import { createAgentRuntime } from './lib/agentRuntime.js';
import { startApiServer } from './api/server.js';
import { createDefaultConfig } from './lib/config.js';

async function main() {
  const config = await createDefaultConfig();
  const runtime = await createAgentRuntime(config);

  if (config.api?.enabled !== false) {
    await startApiServer({ runtime, config });
  }

  // Keep process alive if running standalone without API
  if (config.api?.enabled === false) {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      await new Promise(r => setTimeout(r, 1_000_000));
    }
  }
}

main().catch(err => {
  console.error('Agent failed to start:', err);
  process.exit(1);
});

