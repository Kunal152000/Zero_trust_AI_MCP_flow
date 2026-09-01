# System Context: Enterprise MCP Orchestrator Gateway

## Project Overview
You are assisting in the development of a zero-trust enterprise Model Context Protocol (MCP) Gateway. This system acts as a secure middleware layer between Large Language Models (LLMs) and internal enterprise databases. 

## Technology Stack
*   **Gateway Layer:** Node.js, Fastify, TypeScript, Zod (Validation).
*   **Domain Servers:** Python, FastAPI, `mcp.server.fastmcp`, Pydantic.
*   **Data Layer:** PostgreSQL (Audit logs, local API keys), pgvector (Semantic routing).
*   **Deployment:** Docker, Docker Compose.

## Architectural Rules (Strictly Enforced)
*   **Clean Architecture:** Maintain strict separation between Entities, Use Cases, Interface Adapters, and Infrastructure. Dependencies must point inward.
*   **Zero-Trust Security:** The Node.js Gateway handles all JWT validation, Role-Based Access Control (RBAC), and tool filtering. The Python domain servers do not handle user authentication.
*   **No AI SQL Generation:** The LLM must only output JSON arguments. The Python backend logic must use these arguments to construct parameterized SQL queries. 
*   **Observability:** Every tool execution proxy request managed by the Node.js Gateway must be asynchronously logged to the PostgreSQL audit database before routing. 