import { v4 as uuidv4 } from 'uuid';

export function createSessionManager({ memory, prompts, backend, config }) {
  const sessionMap = new Map();
  const defaultSessionId = config.sessions?.defaultId || 'global';

  function ensureSession(sessionId) {
    if (sessionId && sessionMap.has(sessionId)) return sessionMap.get(sessionId);
    const id = sessionId || uuidv4();
    const state = {
      id,
      createdAt: new Date().toISOString(),
      messages: [],
      summary: '',
      tools: [],
    };
    sessionMap.set(id, state);
    return state;
  }

  function buildSystemPrompt() {
    const parts = [];
    if (prompts.common) parts.push(prompts.common);
    if (prompts.agentCode) parts.push(prompts.agentCode);
    if (prompts.agentMemory) parts.push(prompts.agentMemory);
    if (prompts.agentResearch) parts.push(prompts.agentResearch);
    return parts.filter(Boolean).join('\n\n');
  }

  function filterOutSystemMessages(messageArray) {
    if (!Array.isArray(messageArray)) return [];
    return messageArray.filter(m => m && m.role !== 'system');
  }

  function filterEmptyAssistantMessages(messageArray) {
    if (!Array.isArray(messageArray)) return [];
    return messageArray.filter(m => !(m.role === 'assistant' && (!m.content || String(m.content).trim() === '')));
  }

  async function prepareMessagesInternal({ sessionId, messages }) {
    const session = ensureSession(sessionId || defaultSessionId);
    const systemPrompt = buildSystemPrompt();
    const sanitizedIncoming = filterEmptyAssistantMessages(filterOutSystemMessages(messages));
    const memoryContext = await memory.retrieveContext({
      sessionId: session.id,
      recentMessages: [...session.messages, ...sanitizedIncoming].slice(-10),
    });
    const finalMessages = [
      { role: 'system', content: systemPrompt },
      { role: 'system', content: memoryContext },
      ...filterEmptyAssistantMessages(filterOutSystemMessages(session.messages)),
      ...sanitizedIncoming,
    ];
    return { session, finalMessages };
  }

  return {
    count() { return sessionMap.size; },
    get(sessionId) { return ensureSession(sessionId || defaultSessionId); },
    async prepareMessages({ sessionId, messages }) {
      return prepareMessagesInternal({ sessionId, messages });
    },
    async chat({ sessionId, messages, tools = [] }) {
      const { session, finalMessages } = await prepareMessagesInternal({ sessionId, messages });
      if (config.telemetry?.debugRequests) {
        const summarize = (arr) => (arr || []).map(m => ({ role: m.role, content: typeof m.content === 'string' ? (config.telemetry?.debugFullMessages ? m.content : m.content.slice(0, 120)) : '[non-string]' }));
        console.log('[AGENTD][FINAL]', { session: session.id, messages: summarize(finalMessages) });
      }
      const response = await backend.chat({ messages: finalMessages, tools });
      if (config.telemetry?.debugRequests) {
        const preview = typeof response?.content === 'string'
          ? (config.telemetry?.debugFullMessages ? response.content : response.content.slice(0, 240))
          : response?.content;
        console.log('[AGENTD][REPLY]', {
          session: session.id,
          role: response?.role,
          length: typeof response?.content === 'string' ? response.content.length : 0,
          content: preview,
        });
      }
      session.messages.push(...filterOutSystemMessages(messages));
      session.messages.push({ role: 'assistant', content: response.content, tool_calls: response.tool_calls });
      await memory.append({ sessionId: session.id, role: 'assistant', content: response.content });
      return { sessionId: session.id, ...response };
    },
    async commitUserMessages({ sessionId, messages }) {
      const session = ensureSession(sessionId || defaultSessionId);
      const sanitized = filterOutSystemMessages(messages);
      if (sanitized.length > 0) {
        session.messages.push(...sanitized);
        for (const m of sanitized) {
          if (typeof m.content === 'string') {
            await memory.append({ sessionId: session.id, role: m.role, content: m.content });
          }
        }
      }
      return session.id;
    },
    async commitAssistantMessage({ sessionId, content, tool_calls }) {
      const session = ensureSession(sessionId || defaultSessionId);
      session.messages.push({ role: 'assistant', content, tool_calls });
      await memory.append({ sessionId: session.id, role: 'assistant', content });
      return session.id;
    }
  };
}


