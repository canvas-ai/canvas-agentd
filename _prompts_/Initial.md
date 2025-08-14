Thu Aug 14 06:53:52 PM CEST 2025

# Canvas AgentD :: Inital draft

Lets create a very simple nodejs agent module skeleton in Javascript with the following:

- Agent can be run as a standalone nodejs service or directly as a ESM module
- The main feature of our agent is a persistent memory backend which will be used to augment a LLM session with contextual STM/LTM information to simulate a more human-like context awareness
- We should support a toggable openai-compatible API implemented in ./src/api as the frontend so as to easily pipe our standalone agent into an openai compatible client like vscode / continue.dev or simillar
- Agent itself should be a middleware, hence be able to use the following backends:
  - ollama
  - openai
  - anthropi
- Agent should expose methods to start, stop, restart, get status of an agent
- Agent should support long-lived sessions - meaning - we start a session(aka Task) and continually update the context and our memory backend with relevant information(compressing or replacing old information with summaries and referecens to the original data if needed) - the same session should be usable over various interfaces (phone/webchat/vscode etc) - so that I can for example talk with the agent about something we want to code while driving in my car, then switch to my workstation and continue the same conversation in vscode
- In the initial draft, lets focus on the skeleton and mock the memory interface, we will need to write tools like
  - refine_recall_add_concept(concept) -> emeddings -> lancedb(vector store), retrieve related document IDs and briefe descriptions/summaries geneated by a llm on ingestion, maybe something like document ID: Simple description, [main concepts array],[tag array]
  - refine_recall_block_concept
  - refine_recall_remove_concept
  - retrieve_document_by_id(id, format = simple)
  - etc
  and a suitable memory prompt template that would also include crucial context information to ground RAG
- Tools should be dynamic, we should be able to toggle tools on each turn of the conversation (which would update the context JSON object we send to the backend LLM)
- The central focus should be the maintenance and management of our precious 32k - 200k token window session using various tricks to go beyond that limitations(next state would be to train with  special memory tokens)

## Folder structure of a initialized agent

- Agent HOME (for example /opt/canvas-server/users/foo@bar/agents/lucy)
  - db: SynapsD root folder
  - config
    - agent.json: Main agent configuration, who you are + personality(system prompts), name, uuid, color, backend engine and backend configuration (temperature, top_p, ctx length etc). We should also configure which common and custom prompt templates(in markdown format) should be included in the prompt. Prompt templates are stored in ./src/prompts
    - tools.json: Either a JSON configuration of all tools or a list to <toolname>.json from ./src/tools
    - mcp-servers.json: Probably the same as above or maybe we should just use the above, we should definitely support https://www.npmjs.com/package/@modelcontextprotocol/sdk, github https://github.com/modelcontextprotocol/typescript-sdk
  - prompts:
    - optional custom prompt templates in markdown format, should be auto-loaded in addition to user-supplied system prompt and built-in prompts from ./src/prompts
  - data
    - home: Agents home folder
    - episodes: Folder contains a specialy prepared context-rich log of agent/user/task interaction with optional associated data for automated lora fine-tunning)
      - datetime
        - episode.log
        - associated_data/ (optional)
  - cache
  - tmp

## Flow

- As a starter, lets create a simple agent that could be integrated into an openai compatible client, talk to a ollama backend and enrich the context with some mock data
- Lets also create a simple REPL interface in ./src/cli to test the same directly
- Initial Flow (MVP)
  - Agent Start
  - Load config
  - Initialize backend (Ollama for MVP)
  - Initialize memory store (mocked)
  - Start API server if enabled(default yes)
  - Client Connection
    - OpenAI-compatible client (e.g., Continue.dev) connects
    - Agent proxies chat requests to backend
    - Augment prompt with mock memory data
    - Session Updates
    - Append conversation to memory
    - Maintain running summarization


----
