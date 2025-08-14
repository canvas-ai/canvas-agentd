export function createOllamaBackend(options) {
  const baseUrl = options.baseUrl || 'http://127.0.0.1:11434';
  const model = options.model || 'qwen3:latest';
  const temperature = options.temperature ?? 0.4;

  async function chat({ messages }) {
    const body = { model, messages, options: { temperature }, stream: false };
    const res = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Ollama error ${res.status}: ${text}`);
    }
    const json = await res.json();
    // Ollama returns { message: { role, content }, ... }
    return {
      role: json.message?.role || 'assistant',
      content: json.message?.content || '',
      raw: json,
    };
  }

  async function* streamChat({ messages }) {
    const body = { model, messages, options: { temperature }, stream: true };
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


