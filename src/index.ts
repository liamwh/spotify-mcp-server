#!/usr/bin/env node

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  createSpotifyMcpServer,
  startSpotifyTokenRefreshScheduler,
} from './server.js';

/**
 * Runs the Spotify MCP server using the stdio transport.
 */
async function main(): Promise<void> {
  const stopTokenRefresh = startSpotifyTokenRefreshScheduler();
  const server = createSpotifyMcpServer();
  const transport = new StdioServerTransport();

  const shutdown = async (): Promise<void> => {
    stopTokenRefresh();

    try {
      await server.close();
    } catch (error: unknown) {
      console.error(
        'Failed to close Spotify MCP server cleanly:',
        error instanceof Error ? error.message : String(error),
      );
    }
  };

  process.once('SIGINT', () => {
    void shutdown().finally(() => {
      process.exit(0);
    });
  });

  process.once('SIGTERM', () => {
    void shutdown().finally(() => {
      process.exit(0);
    });
  });

  await server.connect(transport);
}

main().catch((error: unknown) => {
  console.error(
    'Fatal error in Spotify MCP stdio server:',
    error instanceof Error ? (error.stack ?? error.message) : String(error),
  );

  process.exitCode = 1;
});
