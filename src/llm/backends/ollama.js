export function createOllamaBackend(options, fullConfig) {
  const baseUrl = options.baseUrl || 'http://127.0.0.1:11434';
  const model = options.model || 'qwen3:latest';
  const temperature = options.temperature ?? 0.4;
  const verbose = fullConfig?.telemetry?.verboseLogging || false;

    async function chat({ messages, tools = [] }) {
    const body = {
      model,
      messages,
      options: { temperature },
      stream: false
    };

    // Add tools to the request if provided
    if (tools && tools.length > 0) {
      console.log('[OLLAMA][TOOLS_INPUT]', {
        total_tools: tools.length,
        tool_names: tools.map(t => t?.function?.name || 'unnamed').slice(0, 10)
      });

      // Validate and fix tools format to prevent Ollama template errors
      const validTools = tools.map((tool, index) => {
        if (!tool || tool.type !== 'function' || !tool.function || !tool.function.name || !tool.function.parameters) {
          console.log('[OLLAMA][TOOL_INVALID]', { index, tool_name: tool?.function?.name || 'unknown' });
          return null;
        }

        // Create a deep copy to avoid modifying the original
        const toolCopy = JSON.parse(JSON.stringify(tool));

        // Ensure parameters has proper structure for Ollama
        const params = toolCopy.function.parameters;
        const wasFixed = params.type === 'object' && !params.properties;
        if (wasFixed) {
          // Add empty properties for tools that don't have parameters
          params.properties = {};
          console.log('[OLLAMA][TOOL_FIXED]', {
            tool_name: toolCopy.function.name,
            reason: 'added_empty_properties'
          });
        }

        return toolCopy;
      }).filter(Boolean);

      console.log('[OLLAMA][TOOLS_PROCESSED]', {
        input_count: tools.length,
        valid_count: validTools.length,
        filtered_out: tools.length - validTools.length,
        final_tools: validTools.map(t => t.function.name)
      });

      if (validTools.length > 0) {
        body.tools = validTools;
      }
    }

    if (verbose) {
      console.log('[OLLAMA][REQUEST_META]', {
        url: `${baseUrl}/api/chat`,
        method: 'POST',
        headers: { 'content-type': 'application/json' }
      });
      console.log('[OLLAMA][REQUEST_BODY_FULL]');
      console.log(JSON.stringify(body, null, 2));
    }

    const res = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.error('[OLLAMA][ERROR]', {
        status: res.status,
        error: text,
        request_body: {
          model: body.model,
          message_count: body.messages?.length,
          tools_count: body.tools?.length || 0,
          tools_names: body.tools?.map(t => t.function?.name) || []
        }
      });
      throw new Error(`Ollama error ${res.status}: ${text}`);
    }
    const json = await res.json();

    if (verbose) {
      console.log('[OLLAMA][RESPONSE_META]', {
        status: res.status,
        headers: Object.fromEntries(res.headers.entries())
      });
      console.log('[OLLAMA][RESPONSE_BODY_FULL]');
      console.log(JSON.stringify(json, null, 2));
    }

    // Ollama returns { message: { role, content, tool_calls }, ... }
    const result = {
      role: json.message?.role || 'assistant',
      content: json.message?.content || '',
      tool_calls: json.message?.tool_calls || undefined,
      raw: json,
    };

    if (verbose) {
      console.log('[OLLAMA][RESPONSE_PARSED]', {
        role: result.role,
        content_length: result.content?.length || 0,
        content_preview: result.content?.slice(0, 200) || '',
        tool_calls_count: result.tool_calls?.length || 0,
        tool_calls: result.tool_calls?.map(tc => ({ id: tc.id, name: tc.function?.name })) || []
      });
    }

    return result;
  }

  async function* streamChat({ messages, tools = [] }) {
    const body = {
      model,
      messages,
      options: { temperature },
      stream: true
    };

        // Add tools to the request if provided
    if (tools && tools.length > 0) {
      // Validate and fix tools format to prevent Ollama template errors
      const validTools = tools.map(tool => {
        if (!tool || tool.type !== 'function' || !tool.function || !tool.function.name || !tool.function.parameters) {
          return null;
        }

        // Create a deep copy to avoid modifying the original
        const toolCopy = JSON.parse(JSON.stringify(tool));

        // Ensure parameters has proper structure for Ollama
        const params = toolCopy.function.parameters;
        if (params.type === 'object' && !params.properties) {
          // Add empty properties for tools that don't have parameters
          params.properties = {};
        }

        return toolCopy;
      }).filter(Boolean);

      if (validTools.length > 0) {
        body.tools = validTools;
      }
    }
    const res = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok || !res.body) {
      const text = await res.text().catch(() => '');
      throw new Error(`Ollama stream error ${res.status}: ${text}`);
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    // NDJSON lines
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx;
      while ((idx = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 1);
        if (!line.trim()) continue;
        try {
          const obj = JSON.parse(line);
          const piece = obj?.message?.content || '';
          if (piece) yield piece;
          if (obj?.done) return;
        } catch {
          // ignore malformed lines
        }
      }
    }
    // flush any remaining
    if (buffer.trim()) {
      try {
        const obj = JSON.parse(buffer);
        const piece = obj?.message?.content || '';
        if (piece) yield piece;
      } catch {}
    }
  }

  return { chat, streamChat };
}


