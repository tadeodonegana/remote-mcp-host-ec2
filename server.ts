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

// Register web search tool
server.tool(
  "search_web",
  "Search the web for the given query",
  { query: z.string().describe("The search query to look up on the web") },
  async (args, extra) => {
    try {
      // Get API key from environment variable
      const apiKey = process.env.SERPER_API_KEY;
      
      // Call Serper API
      const response = await axios.post(
        "https://google.serper.dev/search",
        { q: args.query, num: 3 }, // Search for query and limit to 3 results
        {
          headers: {
            "X-API-KEY": apiKey,
            "Content-Type": "application/json"
          }
        }
      );
      
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
    }
  }
);

// Express + SSE setup
const app = express();
const transports: { [sessionId: string]: SSEServerTransport } = {};

app.get("/sse", async (req: Request, res: Response) => {
  const transport = new SSEServerTransport("/messages", res);
  transports[transport.sessionId] = transport;

  console.log("SSE session started:", transport.sessionId);

  res.on("close", () => {
    console.log(" SSE session closed:", transport.sessionId);
    delete transports[transport.sessionId];
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