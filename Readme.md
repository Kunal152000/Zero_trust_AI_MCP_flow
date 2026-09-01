# Enterprise MCP Orchestrator Gateway

## Description
A highly secure, zero-trust control plane for integrating Large Language Models (LLMs) with enterprise data. The Orchestrator intercepts AI tool requests, enforces Role-Based Access Control (RBAC), logs audit events, and proxies validated requests to internal domain servers.

## Core Features
*   **Dynamic Tool Discovery:** Filters available AI tools based on the active user's JWT permissions.
*   **Immutable Audit Trail:** Records all AI execution attempts in PostgreSQL for SOC2 compliance.
*   **Isolated Execution:** Python domain servers handle raw database interactions internally, preventing direct LLM access to sensitive schemas.

## Repository Structure
`/gateway` - Node.js TypeScript application managing RBAC, tool filtering, and reverse proxy routing.
`/domain-connectors` - Python FastMCP services for internal PostgreSQL/pgvector database interactions.
`/infrastructure` - Docker Compose configurations and database initialization scripts.

## Deployment Strategy
This system is designed for Virtual Private Cloud (VPC) or on-premises deployment via Docker Compose. The external AI client connects to the Gateway, ensuring proprietary data never traverses unauthorized public networks.