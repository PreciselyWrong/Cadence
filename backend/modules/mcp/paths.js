'use strict';

const API_VERSION = process.env.API_VERSION || 'v1';

// The MCP protocol endpoint is served at /api/mcp, /api/<version>/mcp and,
// for remote connectors behind a tunnel, at /mcp (docs/38-remote-mcp.md).
const MCP_PATHS = new Set(['/mcp', '/api/mcp', `/api/${API_VERSION}/mcp`]);

function isMcpPath(req) {
    const pathname = String(req.originalUrl || req.url || '').split('?')[0];
    const trimmed =
        pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
    return MCP_PATHS.has(trimmed);
}

module.exports = { MCP_PATHS, isMcpPath };
