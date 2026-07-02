#!/usr/bin/env node

import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import cors from 'cors';
import type { Request, Response } from 'express';
import {
  createSpotifyMcpServer,
  startSpotifyTokenRefreshScheduler,
} from './server.js';

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 8001;
const MCP_PATH = '/mcp';

/**
 * Parses a positive TCP port number from an environment variable.
 */
function parsePort(value: string | undefined): number {
  if (value === undefined) {
    return DEFAULT_PORT;
  }

  const port = Number.parseInt(value, 10);

  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(
      `PORT must be an integer between 1 and 65535; received "${value}".`,
    );
  }

  return port;
}

/**
 * Writes a JSON-RPC internal-error response when an MCP request fails before
 * the transport has started its response.
 */
function writeInternalError(res: Response): void {
  if (res.headersSent) {
    return;
  }

  res.status(500).json({
    jsonrpc: '2.0',
    error: {
      code: -32603,
      message: 'Internal server error',
    },
    id: null,
  });
}

/**
 * Runs the Spotify MCP server using native stateless Streamable HTTP.
 */
async function main(): Promise<void> {
  const host = process.env.HOST?.trim() || DEFAULT_HOST;
  const port = parsePort(process.env.PORT);
  const stopTokenRefresh = startSpotifyTokenRefreshScheduler();

  /*
   * The process still binds to 127.0.0.1 by default, so it is only reachable
   * locally. Host-header validation is not enabled here because ngrok forwards
   * the public ngrok hostname in the Host header.
   *
   * Do not bind this unauthenticated server directly to a public interface.
   */
  const app = createMcpExpressApp({
    host: '0.0.0.0',
  });

  app.use(
    cors({
      methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
      allowedHeaders: [
        'Accept',
        'Authorization',
        'Content-Type',
        'Last-Event-ID',
        'Mcp-Protocol-Version',
        'Mcp-Session-Id',
      ],
      exposedHeaders: ['Mcp-Session-Id'],
    }),
  );

  app.get('/healthz', (_req: Request, res: Response) => {
    res.status(200).json({
      status: 'ok',
      server: 'spotify-controller',
    });
  });

  app.get('/readyz', (_req: Request, res: Response) => {
    res.status(200).json({
      status: 'ready',
      server: 'spotify-controller',
    });
  });

  app.all(MCP_PATH, async (req: Request, res: Response) => {
    const server = createSpotifyMcpServer();

    /*
     * Stateless mode is deliberate:
     *
     * - each incoming HTTP request receives its own transport and server;
     * - concurrent initialize requests cannot overwrite one another;
     * - no in-memory session routing or sticky sessions are needed;
     * - plain JSON responses avoid an unnecessary SSE connection.
     */
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });

    let closed = false;

    const closeRequestResources = async (): Promise<void> => {
      if (closed) {
        return;
      }

      closed = true;

      const results = await Promise.allSettled([
        transport.close(),
        server.close(),
      ]);

      for (const result of results) {
        if (result.status === 'rejected') {
          console.error(
            'Failed to close an MCP request resource:',
            result.reason instanceof Error
              ? result.reason.message
              : String(result.reason),
          );
        }
      }
    };

    res.once('close', () => {
      void closeRequestResources();
    });

    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error: unknown) {
      console.error(
        'Spotify MCP HTTP request failed:',
        error instanceof Error ? error.stack ?? error.message : String(error),
      );

      writeInternalError(res);
      await closeRequestResources();
    }
  });

  const httpServer = app.listen(port, host, () => {
    console.error(
      `Spotify MCP HTTP server listening on http://${host}:${port}${MCP_PATH}`,
    );
    console.error(`Health check: http://${host}:${port}/healthz`);
  });

  httpServer.on('error', (error: Error) => {
    console.error('Spotify MCP HTTP server failed:', error);
    process.exitCode = 1;
  });

  let shuttingDown = false;

  const shutdown = (signal: NodeJS.Signals): void => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    stopTokenRefresh();

    console.error(`Received ${signal}; shutting down Spotify MCP HTTP server.`);

    const forceExitTimer = setTimeout(() => {
      console.error('HTTP server did not close within 10 seconds; exiting.');
      process.exit(1);
    }, 10_000);

    forceExitTimer.unref();

    httpServer.close((error?: Error) => {
      clearTimeout(forceExitTimer);

      if (error) {
        console.error('Failed to close HTTP server cleanly:', error);
        process.exit(1);
      }

      process.exit(0);
    });
  };

  process.once('SIGINT', () => {
    shutdown('SIGINT');
  });

  process.once('SIGTERM', () => {
    shutdown('SIGTERM');
  });
}

main().catch((error: unknown) => {
  console.error(
    'Fatal error in Spotify MCP HTTP server:',
    error instanceof Error ? error.stack ?? error.message : String(error),
  );

  process.exitCode = 1;
});
