import express, { Request, Response } from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import axios from "axios";
import { z } from "zod";

// Create an MCP server
const server = new McpServer({
  name: "test-remote-server",
  version: "1.0.0"
});

// Store API keys per session
const sessionApiKeys: { [sessionId: string]: string } = {};

// Register web search tool
server.tool(
  "search_web",
  "Search the web for the given query",
  { query: z.string().describe("The search query to look up on the web") },
  async (args, extra) => {
    console.log("--- search_web tool execution ---");
    console.log("Arguments (args):", JSON.stringify(args));
    console.log("Extra context (extra):", JSON.stringify(extra, null, 2)); // Keep logging extra for now

    try {
      // Get sessionId from extra context
      const sessionId = extra.sessionId as string;

      if (!sessionId) {
        console.error("ERROR: Could not determine sessionId for the request.");
        return {
          content: [{ type: "text", text: "Error: Internal server error (missing session ID)." }]
        };
      }

      // Retrieve the API key stored for this session
      const apiKey = sessionApiKeys[sessionId];

      // Check if the API key exists for this session *before* attempting to use it
      if (!apiKey) {
        console.error(`ERROR: API key not found for session ${sessionId} when attempting tool use.`);
        return {
          content: [{ type: "text", text: "Error: API key not configured for this session. Please ensure X-Serper-Api-Key header was sent on connection." }]
        };
      }

      // Log first and last 4 chars of API key for verification (Optional but helpful)
      const keyLength = apiKey.length;
      const maskedKey = keyLength > 8 
        ? `${apiKey.substring(0, 4)}...${apiKey.substring(keyLength - 4)}` 
        : "***short-key***";
      console.log(`[${sessionId}] Using API key: ${maskedKey} (length: ${keyLength})`);

      console.log(`[${sessionId}] Searching for query: "${args.query}"`);
      
      // Call Serper API using the session-specific key
      const response = await axios.post(
        "https://google.serper.dev/search",
        { q: args.query, num: 3 }, // Search for query and limit to 3 results
        {
          headers: {
            "X-API-KEY": apiKey, // Use the retrieved apiKey here
            "Content-Type": "application/json"
          }
        }
      );
      
      console.log(`[${sessionId}] Search API responded with status: ${response.status}`);

      // Create a simple text report of search results
      let resultText = `Search results for: ${args.query}\n\n`;
      
      // Add web results
      if (response.data.organic) {
        resultText += "Web Results:\n";
        response.data.organic.forEach((result: any, index: number) => {
          resultText += `${index + 1}. ${result.title}\n`;
          resultText += `   ${result.link}\n`;
          resultText += `   ${result.snippet}\n\n`;
        });
      }
      
      // Return the results as text content
      return {
        content: [{ type: "text", text: resultText }]
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: "Error: Could not complete the search." }]
      };
    } finally {
      console.log("--- search_web tool execution complete ---");
    }
  }
);

// Express + SSE setup
const app = express();
const transports: { [sessionId: string]: SSEServerTransport } = {};

app.get("/sse", async (req: Request, res: Response) => {
  // Extract API key from header
  const apiKey = req.headers['x-serper-api-key'] as string;
  let apiKeyStatusMessage = "with API key provided.";

  if (!apiKey) {
    apiKeyStatusMessage = "WITHOUT API key header (tool execution will likely fail).";
    // Log as warning, don't reject connection here
    console.warn(`[${req.ip}] Connection established without X-Serper-Api-Key header.`); 
  }

  const transport = new SSEServerTransport("/messages", res);
  transports[transport.sessionId] = transport;
  // Store the provided API key (or empty string if missing) for this session
  sessionApiKeys[transport.sessionId] = apiKey || ""; 

  console.log(`SSE session started: ${transport.sessionId} ${apiKeyStatusMessage}`);

  res.on("close", () => {
    console.log(" SSE session closed:", transport.sessionId);
    delete transports[transport.sessionId];
    delete sessionApiKeys[transport.sessionId]; // Clean up API key on disconnect
  });

  await server.connect(transport);
});

app.post("/messages", async (req: Request, res: Response) => {
  const sessionId = req.query.sessionId as string;
  const transport = transports[sessionId];

  if (transport) {
    await transport.handlePostMessage(req, res);
  } else {
    res.status(400).send("No transport found for sessionId");
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`MCP Server running on port ${PORT}`);
});