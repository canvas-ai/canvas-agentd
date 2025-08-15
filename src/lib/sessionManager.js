import { v4 as uuidv4 } from 'uuid';

export function createSessionManager({ memory, prompts, backend, config, tools = [], toolExecutor }) {
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
    async chat({ sessionId, messages, tools: requestedTools = [] }) {
      const { session, finalMessages } = await prepareMessagesInternal({ sessionId, messages });

      // Use provided tools or default to all available tools
      const availableTools = requestedTools.length > 0 ? requestedTools : tools;

      if (config.telemetry?.debugRequests) {
        const summarize = (arr) => (arr || []).map(m => ({ role: m.role, content: typeof m.content === 'string' ? (config.telemetry?.debugFullMessages ? m.content : m.content.slice(0, 120)) : '[non-string]' }));
        console.log('[AGENTD][FINAL]', {
          session: session.id,
          messages: summarize(finalMessages),
          tools_count: availableTools.length,
          tools_preview: availableTools.slice(0, 5).map(t => t?.function?.name || 'unnamed')
        });
      }

            if (config.telemetry?.verboseLogging) {
        console.log('[AGENTD][BACKEND_REQUEST_META]', {
          backend_type: 'ollama',
          message_count: finalMessages.length,
          tools_count: availableTools.length
        });
        console.log('[AGENTD][MESSAGES_FULL]');
        console.log(JSON.stringify(finalMessages, null, 2));
        console.log('[AGENTD][TOOLS_FULL]');
        console.log(JSON.stringify(availableTools, null, 2));
      }

      const response = await backend.chat({ messages: finalMessages, tools: availableTools });

      if (config.telemetry?.verboseLogging) {
        console.log('[AGENTD][BACKEND_RESPONSE_FULL]');
        console.log(JSON.stringify(response, null, 2));
      }

      if (config.telemetry?.debugRequests) {
        const preview = typeof response?.content === 'string'
          ? (config.telemetry?.debugFullMessages ? response.content : response.content.slice(0, 240))
          : response?.content;
        console.log('[AGENTD][REPLY]', {
          session: session.id,
          role: response?.role,
          length: typeof response?.content === 'string' ? response.content.length : 0,
          content: preview,
          tool_calls: response?.tool_calls?.length || 0,
        });
      }

            // Handle tool calls if present
      let finalResponse = response;
      if (response.tool_calls && response.tool_calls.length > 0 && toolExecutor) {
        if (config.telemetry?.debugRequests) {
          console.log('[AGENTD][TOOLS_DETECTED]', {
            session: session.id,
            tool_calls: response.tool_calls.map(tc => ({
              id: tc.id,
              name: tc.function.name,
              args: tc.function.arguments
            }))
          });
          console.log('[AGENTD][ASSISTANT_WITH_TOOLS]', {
            role: 'assistant',
            content: response.content,
            tool_calls_count: response.tool_calls.length
          });
        }

        const toolResults = await toolExecutor.executeToolCalls(response.tool_calls);

        if (config.telemetry?.debugRequests) {
          console.log('[AGENTD][TOOL_EXECUTION_RESULTS]', {
            session: session.id,
            results: toolResults.map(result => ({
              tool_call_id: result.tool_call_id,
              function_name: result.function_name,
              success: result.success,
                            result_preview: result.success ?
                (typeof result.result === 'string' ? result.result.slice(0, 200) : (result.result ? JSON.stringify(result.result).slice(0, 200) : '[null]')) :
                (result.error || '[unknown error]')
            }))
          });
        }

        // Add tool results to conversation
        const toolMessages = toolResults.map(result => ({
          role: 'tool',
          tool_call_id: result.tool_call_id,
          content: result.success ? JSON.stringify(result.result) : `Error: ${result.error}`
        }));

        if (config.telemetry?.debugRequests) {
          console.log('[AGENTD][TOOL_MESSAGES]', {
            session: session.id,
            tool_messages: toolMessages.map(msg => ({
              role: msg.role,
              tool_call_id: msg.tool_call_id,
              content_preview: msg.content ? msg.content.slice(0, 200) : '[empty]'
            }))
          });
        }

        // Get follow-up response from LLM with tool results
        const followUpMessages = [
          ...finalMessages,
          { role: 'assistant', content: response.content, tool_calls: response.tool_calls },
          ...toolMessages
        ];

        if (config.telemetry?.debugRequests) {
          console.log('[AGENTD][FOLLOWUP_REQUEST]', {
            session: session.id,
            message_count: followUpMessages.length,
            last_messages: followUpMessages.slice(-3).map(msg => ({
              role: msg.role,
              content_preview: typeof msg.content === 'string' ? msg.content.slice(0, 100) : '[non-string]',
              has_tool_calls: !!msg.tool_calls,
              tool_call_id: msg.tool_call_id
            }))
          });
        }

        const followUpResponse = await backend.chat({ messages: followUpMessages, tools: availableTools });
        finalResponse = followUpResponse;

        if (config.telemetry?.debugRequests) {
          console.log('[AGENTD][FOLLOWUP_RESPONSE]', {
            session: session.id,
            role: followUpResponse.role,
            content_length: typeof followUpResponse.content === 'string' ? followUpResponse.content.length : 0,
            content_preview: typeof followUpResponse.content === 'string' ? followUpResponse.content.slice(0, 240) : followUpResponse.content,
            has_additional_tool_calls: !!(followUpResponse.tool_calls && followUpResponse.tool_calls.length > 0)
          });
        }
      }

      session.messages.push(...filterOutSystemMessages(messages));
      session.messages.push({ role: 'assistant', content: response.content, tool_calls: response.tool_calls });

      // If we have tool results, also add the final response
      if (response.tool_calls && response.tool_calls.length > 0) {
        session.messages.push({ role: 'assistant', content: finalResponse.content });
      }

      await memory.append({ sessionId: session.id, role: 'assistant', content: finalResponse.content });
      return { sessionId: session.id, ...finalResponse };
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


