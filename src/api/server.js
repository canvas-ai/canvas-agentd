import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import { v4 as uuidv4 } from 'uuid';
import { createDefaultConfig } from '../lib/config.js';
import { createAgentRuntime } from '../lib/agentRuntime.js';

export async function startApiServer({ runtime, config }) {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '2mb' }));
  app.use(morgan('dev'));

  if (config.telemetry?.debugRequests) {
    app.use((req, res, next) => {
      const headerSession = req.headers['x-session-id'];
      const body = (req.method === 'GET') ? {} : (req.body || {});
      // Shallow safe clone of messages for logging (full or truncated)
      const projector = (arr) => (arr || []).map(m => ({ role: m.role, content: typeof m.content === 'string' ? (config.telemetry?.debugFullMessages ? m.content : m.content.slice(0, 120)) : '[non-string]' }));
      const messages = Array.isArray(body.messages) ? projector(body.messages) : undefined;
      console.log('[AGENTD][REQ]', {
        method: req.method,
        path: req.path,
        session_header: headerSession,
        session_body: body.session_id,
        stream: body.stream,
        messages,
      });
      next();
    });
  }

  // Health & status
  app.get('/healthz', (req, res) => res.json({ ok: true }));
  app.get('/status', async (req, res) => res.json(await runtime.getStatus()));
  app.post('/api/show', async (req, res) => {
    res.json({ ok: true, echo: req.body || {} });
  });

  // Minimal OpenAI-compatible endpoints
  app.get('/v1/models', (req, res) => {
    const modelId = config.backend?.ollama?.model || 'unknown';
    res.json({
      object: 'list',
      data: [{ id: modelId, object: 'model', created: Math.floor(Date.now() / 1000), owned_by: 'system' }]
    });
  });

  app.post('/v1/chat/completions', async (req, res) => {
    try {
      const { messages = [], tools = [], stream = false, user, session_id } = req.body || {};
      const headerSession = req.headers['x-session-id'];
      const sessionId = session_id || headerSession || undefined; // default handled in session manager

      if (stream) {
        // OpenAI-compatible SSE streaming
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no');
        const send = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);
        let accumulated = '';
        try {
          // Always override any incoming system messages by rebuilding message array via session manager
          const { session, finalMessages } = await runtime.sessions.prepareMessages({ sessionId, messages });
          if (config.telemetry?.debugRequests) {
            const summarize = (arr) => (arr || []).map(m => ({ role: m.role, content: typeof m.content === 'string' ? (config.telemetry?.debugFullMessages ? m.content : m.content.slice(0, 120)) : '[non-string]' }));
            console.log('[AGENTD][FINAL]', { session: session?.id || 'n/a', messages: summarize(finalMessages) });
          }
          send({ id: `chatcmpl-${uuidv4()}`, object: 'chat.completion.chunk', created: Math.floor(Date.now() / 1000), model: config.backend?.ollama?.model || 'unknown', choices: [] });
          for await (const token of runtime.backend.streamChat({ messages: finalMessages })) {
            accumulated += token;
            send({ object: 'chat.completion.chunk', choices: [{ delta: { content: token } }] });
          }
          send({ object: 'chat.completion', choices: [{ message: { role: 'assistant', content: accumulated }, finish_reason: 'stop' }], session_id: session?.id || sessionId || 'global' });
          res.write('data: [DONE]\n\n');
          if (config.telemetry?.debugRequests) {
            const preview = typeof accumulated === 'string' ? (config.telemetry?.debugFullMessages ? accumulated : accumulated.slice(0, 240)) : accumulated;
            console.log('[AGENTD][REPLY:STREAM]', { session: session?.id || sessionId || 'global', length: typeof accumulated === 'string' ? accumulated.length : 0, content: preview });
          }
        } catch (e) {
          send({ error: { message: e?.message || String(e) } });
        }
        return res.end();
      }

      // Always rebuild message array via session manager to force our system prompt
      const reply = await runtime.chat({ sessionId, messages, tools });
      const created = Math.floor(Date.now() / 1000);

      const responseBody = {
        id: `chatcmpl-${uuidv4()}`,
        object: 'chat.completion',
        created,
        model: config.backend?.ollama?.model || 'unknown',
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: reply.content },
            finish_reason: 'stop'
          }
        ],
        usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
        session_id: reply.sessionId
      };

      res.json(responseBody);
      if (config.telemetry?.debugRequests) {
        console.log('[AGENTD][SESSION]', { provided: sessionId, used: reply.sessionId });
        const preview = typeof reply?.content === 'string' ? (config.telemetry?.debugFullMessages ? reply.content : reply.content.slice(0, 240)) : reply?.content;
        console.log('[AGENTD][REPLY:HTTP]', { session: reply.sessionId, length: typeof reply?.content === 'string' ? reply.content.length : 0, content: preview });
      }
    } catch (err) {
      res.status(500).json({ error: { message: err?.message || String(err) } });
    }
  });

  // Error handler -> JSON
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    res.status(500).json({ error: { message: err?.message || 'Internal Server Error' } });
  });

  // JSON 404 for unknown routes to avoid HTML error pages
  app.use((req, res) => {
    res.status(404).json({ error: { message: 'Not Found', path: req.path } });
  });

  return new Promise((resolve) => {
    const server = app.listen(config.api.port, config.api.host, () => {
      const address = server.address();
      console.log(`API listening on http://${address.address}:${address.port}`);
      resolve(server);
    });
  });
}

// Allow standalone run: `npm run api`
async function main() {
  const config = await createDefaultConfig();
  const runtime = await createAgentRuntime(config);
  await startApiServer({ runtime, config });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}


