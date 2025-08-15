import fs from 'fs/promises';
import path from 'path';

export async function loadTools({ toolsFile }) {
  try {
    const toolsData = await fs.readFile(toolsFile, 'utf8');
    const tools = JSON.parse(toolsData);

    if (!Array.isArray(tools)) {
      throw new Error('Tools file must contain an array of tool definitions');
    }

    // Validate tool structure
    for (const tool of tools) {
      if (tool.type !== 'function' || !tool.function?.name) {
        throw new Error('Each tool must have type "function" and function.name');
      }
    }

    return tools;
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.warn(`Tools file not found at ${toolsFile}, using empty tools list`);
      return [];
    }
    throw new Error(`Failed to load tools: ${error.message}`);
  }
}

export function getAvailableTools(tools) {
  return tools.map(tool => ({
    type: tool.type,
    function: {
      name: tool.function.name,
      description: tool.function.description,
      parameters: tool.function.parameters
    }
  }));
}
