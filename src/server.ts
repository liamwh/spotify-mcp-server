import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { albumTools } from './albums.js';
import { playTools } from './play.js';
import { playlistTools } from './playlist.js';
import { readTools } from './read.js';
import { createSpotifyApi } from './utils.js';

const TOKEN_REFRESH_INTERVAL_MS = 45 * 60 * 1000;

/**
 * Creates a new Spotify MCP server with every Spotify tool registered.
 *
 * A new instance is required for each stateless Streamable HTTP request because
 * an MCP server instance can only be connected to one transport at a time.
 */
export function createSpotifyMcpServer(): McpServer {
  const server = new McpServer({
    name: 'spotify-controller',
    version: '1.0.0',
  });

  for (const spotifyTool of readTools) {
    server.tool(
      spotifyTool.name,
      spotifyTool.description,
      spotifyTool.schema,
      spotifyTool.handler,
    );
  }

  for (const spotifyTool of playTools) {
    server.tool(
      spotifyTool.name,
      spotifyTool.description,
      spotifyTool.schema,
      spotifyTool.handler,
    );
  }

  for (const spotifyTool of albumTools) {
    server.tool(
      spotifyTool.name,
      spotifyTool.description,
      spotifyTool.schema,
      spotifyTool.handler,
    );
  }

  for (const spotifyTool of playlistTools) {
    server.tool(
      spotifyTool.name,
      spotifyTool.description,
      spotifyTool.schema,
      spotifyTool.handler,
    );
  }

  return server;
}

/**
 * Starts the background Spotify access-token refresh scheduler.
 *
 * The returned function stops the scheduler. The timer is unreferenced so it
 * does not prevent an otherwise completed process from exiting.
 */
export function startSpotifyTokenRefreshScheduler(): () => void {
  const timer = setInterval(() => {
    void createSpotifyApi().catch((error: unknown) => {
      console.error(
        'Proactive Spotify access-token refresh failed:',
        error instanceof Error ? error.message : String(error),
      );
    });
  }, TOKEN_REFRESH_INTERVAL_MS);

  timer.unref();

  return () => {
    clearInterval(timer);
  };
}
