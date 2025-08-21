import { tools } from '../tools/tools.json'


class Context {

    activeTools = new Map();

    // Main body
    #model = null;
    #messages = [];

    #options = {
        
    }

    #systemPrompt = {};
    #userPrompt = {};

    #tools = []


    constructor() {
        this.context = {}
        this.#buildToolMap()
    }

    enableTool(toolName) {
        if (!this.activeTools.has(toolName)) {
            this.activeTools.set(toolName, tools.find(tool => tool.name === toolName))
        }
    }

    disableTool(toolName) {
        this.activeTools = this.activeTools.filter(t => t !== tool)
    }

    listActiveTools(format = 'name') {
        if (format === 'name') {
            return Array.from(this.activeTools.keys())
        }

        return Array.from(this.activeTools.values())
    }

    listAllTools(format = 'name') {
        if (format === 'name') {
            return tools.map(tool => tool.name)
        }

        return tools
    }



    // Called on every LLM turn, returns the updated context object
    async updateContext() { }


    #buildToolMap() {
        this.activeTools = new Map(tools.map(tool => [tool.name, tool]))
    }

}



