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
    // Assume extra.sessionId contains the ID for the current request context
    const sessionId = extra.sessionId as string; 
    const apiKey = sessionApiKeys[sessionId];

    if (!sessionId) {
      console.error("ERROR: Could not determine sessionId for the request.");
      return {
        content: [{ type: "text", text: "Error: Internal server error (missing session ID)." }]
      };
    }

    try {
      // Get API key associated with this session
      // const apiKey = process.env.SERPER_API_KEY; // OLD: Reading from env var
      
      // Log API key status (partial key for security)
      if (!apiKey) {
        // console.error("ERROR: SERPER_API_KEY environment variable is not set"); // OLD message
        console.error(`ERROR: API key not found for session ${sessionId}`);
        return {
          // content: [{ type: "text", text: "Error: API key not found in environment variables. Please set SERPER_API_KEY." }] // OLD message
          content: [{ type: "text", text: "Error: API key not configured for this session." }]
        };
      } else {
        // Log first and last 4 chars of API key for verification
        const keyLength = apiKey.length;
        const maskedKey = keyLength > 8 
          ? `${apiKey.substring(0, 4)}...${apiKey.substring(keyLength - 4)}` 
          : "***short-key***";
        console.log(`Using API key: ${maskedKey} (length: ${keyLength})`);
      }
      
      console.log(`Searching for query: "${args.query}"`);
      
      // Call Serper API
      try {
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
        
        console.log(`Search API responded with status: ${response.status}`);
        
        // Create a simple text report of search results
        let resultText = `Search results for: ${args.query}\n\n`;
        
        // Add web results
        if (response.data.organic && response.data.organic.length > 0) {
          console.log(`Found ${response.data.organic.length} organic results`);
          resultText += "Web Results:\n";
          response.data.organic.forEach((result: any, index: number) => {
            resultText += `${index + 1}. ${result.title}\n`;
            resultText += `   ${result.link}\n`;
            resultText += `   ${result.snippet}\n\n`;
          });
        } else {
          console.log("No organic results found in the response");
          console.log("Response data structure:", Object.keys(response.data));
        }
        
        // Return the results as text content
        return {
          content: [{ type: "text", text: resultText }]
        };
      } catch (axiosError: any) {
        // Detailed axios error logging
        console.error("Axios error details:");
        if (axiosError.response) {
          // The request was made and the server responded with a status code outside of 2xx
          console.error(`Response status: ${axiosError.response.status}`);
          console.error(`Response headers:`, axiosError.response.headers);
          console.error(`Response data:`, axiosError.response.data);
        } else if (axiosError.request) {
          // The request was made but no response was received
          console.error("No response received from server");
          console.error(`Request details:`, axiosError.request);
        } else {
          // Something happened in setting up the request
          console.error(`Error message: ${axiosError.message}`);
        }
        console.error(`Error config:`, axiosError.config);
        
        throw axiosError; // Re-throw to be caught by outer catch
      }
    } catch (error: any) {
      console.error(`Search failed with error: ${error.message}`);
      console.error(`Error stack: ${error.stack}`);
      
      return {
        content: [{ type: "text", text: `Error: Could not complete the search. Details: ${error.message}` }]
      };
    }
  }
);

// Express + SSE setup
const app = express();
const transports: { [sessionId: string]: SSEServerTransport } = {};

app.get("/sse", async (req: Request, res: Response) => {
  // Extract API key from header
  const apiKey = req.headers['x-serper-api-key'] as string;

  if (!apiKey) {
    console.error("Connection rejected: Missing X-Serper-Api-Key header.");
    res.status(400).send("Missing X-Serper-Api-Key header");
    return;
  }

  const transport = new SSEServerTransport("/messages", res);
  transports[transport.sessionId] = transport;
  sessionApiKeys[transport.sessionId] = apiKey; // Store API key for this session

  // console.log("SSE session started:", transport.sessionId); // Original log
  console.log("SSE session started:", transport.sessionId, "with API key provided."); // Updated log (avoid logging key)


  res.on("close", () => {
    // console.log(" SSE session closed:", transport.sessionId); // Original log
    console.log("SSE session closed:", transport.sessionId); // Updated log
    delete transports[transport.sessionId];
    delete sessionApiKeys[transport.sessionId]; // Clean up API key
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

// Log environment checks at startup
console.log("----------------------------------------");
console.log("SERVER STARTUP - ENVIRONMENT CHECK");
console.log("----------------------------------------");
console.log(`Node.js version: ${process.version}`);
console.log(`PORT: ${PORT}`);
// console.log(`SERPER_API_KEY: ${process.env.SERPER_API_KEY ? "Set (not displaying for security)" : "NOT SET"}`); // No longer reading from env
console.log("Server expects 'X-Serper-Api-Key' header for API key.");
console.log("----------------------------------------");

app.listen(PORT, () => {
  console.log(`MCP Server running on port ${PORT}`);
});