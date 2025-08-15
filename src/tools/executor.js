import fs from 'fs/promises';

// Tool implementations
const toolImplementations = {
  async file_read({ file, start_line, end_line, sudo }) {
    try {
      const content = await fs.readFile(file, 'utf8');
      const lines = content.split('\n');

      if (start_line !== undefined || end_line !== undefined) {
        const startIdx = start_line || 0;
        const endIdx = end_line || lines.length;
        return lines.slice(startIdx, endIdx).join('\n');
      }

      return content;
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new Error(`File not found: ${file}`);
      }
      if (error.code === 'EACCES') {
        throw new Error(`Permission denied: ${file}`);
      }
      throw new Error(`Failed to read file ${file}: ${error.message}`);
    }
  }
};

export class ToolExecutor {
  constructor() {
    this.implementations = toolImplementations;
  }

    async executeTool(toolCall) {
    const { name, arguments: args } = toolCall.function;

    console.log('[TOOL_EXECUTOR][EXECUTING]', {
      tool_call_id: toolCall.id,
      function_name: name,
      arguments: typeof args === 'string' ? args : JSON.stringify(args)
    });

    if (!this.implementations[name]) {
      const error = `Unknown tool: ${name}`;
      console.log('[TOOL_EXECUTOR][ERROR]', { tool_call_id: toolCall.id, error });
      throw new Error(error);
    }

    try {
      const parsedArgs = typeof args === 'string' ? JSON.parse(args) : args;
      console.log('[TOOL_EXECUTOR][PARSED_ARGS]', {
        tool_call_id: toolCall.id,
        function_name: name,
        parsed_args: parsedArgs
      });

      const result = await this.implementations[name](parsedArgs);

      console.log('[TOOL_EXECUTOR][SUCCESS]', {
        tool_call_id: toolCall.id,
        function_name: name,
        result_type: typeof result,
        result_length: typeof result === 'string' ? result.length : undefined,
        result_preview: typeof result === 'string' ? result.slice(0, 150) : (result ? JSON.stringify(result).slice(0, 150) : '[null]')
      });

      return {
        success: true,
        result,
        error: null
      };
    } catch (error) {
      console.log('[TOOL_EXECUTOR][FAILED]', {
        tool_call_id: toolCall.id,
        function_name: name,
        error: error.message
      });

      return {
        success: false,
        result: null,
        error: error.message
      };
    }
  }

    async executeToolCalls(toolCalls) {
    console.log('[TOOL_EXECUTOR][BATCH_START]', {
      tool_count: toolCalls.length,
      tools: toolCalls.map(tc => ({ id: tc.id, name: tc.function.name }))
    });

    const results = [];

    for (const toolCall of toolCalls) {
      const result = await this.executeTool(toolCall);
      results.push({
        tool_call_id: toolCall.id,
        function_name: toolCall.function.name,
        ...result
      });
    }

    console.log('[TOOL_EXECUTOR][BATCH_COMPLETE]', {
      tool_count: toolCalls.length,
      successful: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length
    });

    return results;
  }

  hasImplementation(toolName) {
    return toolName in this.implementations;
  }

  getAvailableTools() {
    return Object.keys(this.implementations);
  }
}

export function createToolExecutor() {
  return new ToolExecutor();
}
