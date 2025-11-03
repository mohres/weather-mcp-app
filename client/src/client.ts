import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import OpenAI from "openai";
import * as dotenv from "dotenv";
import * as readline from "readline";

dotenv.config();

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Initialize MCP client
const mcpClient = new Client(
  {
    name: "weather-client",
    version: "1.0.0",
  },
  {
    capabilities: {},
  }
);

async function connectToMCPServer() {
  // Connect to your MCP server using stdio transport
  const transport = new StdioClientTransport({
    command: "node",
    args: ["../server/dist/index.js"],
  });

  await mcpClient.connect(transport);
  console.log("✅ Connected to Weather MCP Server");

  // List available tools
  const tools = await mcpClient.listTools();
  console.log("\n🛠️  Available tools:", tools.tools.map(t => t.name));

  // List available resources
  const resources = await mcpClient.listResources();
  console.log("📚 Available resources:", resources.resources.map(r => r.uri));
}

async function chatWithLLM(userMessage: string) {
  console.log(`\n👤 User: ${userMessage}`);

  // Get available tools from MCP server
  const toolsList = await mcpClient.listTools();

  // Convert MCP tools to OpenAI tool format
  const openaiTools = toolsList.tools.map((tool) => ({
    type: "function" as const,
    function: {
      name: tool.name,
      description: tool.description ?? `Tool: ${tool.name}`,
      parameters: tool.inputSchema,
    },
  }));

  // Create messages array for the conversation
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    {
      role: "user",
      content: userMessage,
    },
  ];

  let continueLoop = true;

  while (continueLoop) {
    // Send message to OpenAI
    const response = await openai.chat.completions.create({
      model: "gpt-4-1106-preview",
      max_tokens: 1000,
      messages: messages,
      tools: openaiTools,
    });

    const choice = response.choices[0];
    if (!choice) {
      throw new Error("No response received from OpenAI");
    }

    console.log(`\n🤖 GPT-4o (finish_reason: ${choice.finish_reason})`);

    // Process the response
    const message = choice.message;
    if (message.tool_calls && message.tool_calls.length > 0) {
      // OpenAI wants to use a tool
      const toolCall = message.tool_calls[0];
      if (!toolCall) {
        throw new Error("Tool call is undefined");
      }

      if (toolCall.type !== "function") {
        throw new Error("Only function tool calls are supported");
      }

      console.log(`\n🔧 GPT-4o is using tool: ${toolCall.function.name}`);
      console.log(`   Input: ${toolCall.function.arguments}`);

      // Call the MCP server tool
      const toolResult = await mcpClient.callTool({
        name: toolCall.function.name,
        arguments: JSON.parse(toolCall.function.arguments),
      });

      console.log(`   Result: ${JSON.stringify(toolResult.content)}`);

      // Add assistant's response and tool result to messages
      messages.push({
        role: "assistant",
        content: message.content,
        tool_calls: message.tool_calls,
      });

      messages.push({
        role: "tool",
        content: JSON.stringify(toolResult.content),
        tool_call_id: toolCall.id,
      });
    } else if (choice.finish_reason === "stop") {
      // OpenAI has finished responding
      if (message.content) {
        console.log(`   ${message.content}`);
      }

      continueLoop = false;
    }
  }
}

function createReadlineInterface() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

async function startInteractiveSession() {
  const rl = createReadlineInterface();
  let sessionActive = true;

  // Handle graceful shutdown on Ctrl+C
  process.on('SIGINT', () => {
    console.log("\n\n👋 Thanks for using the Weather Assistant!");
    sessionActive = false;
    rl.close();
    process.exit(0);
  });

  console.log("\n" + "=".repeat(50));
  console.log("🌤️  Interactive Weather Assistant");
  console.log("=".repeat(50));
  console.log("Ask me about the weather anywhere in the world!");
  console.log("Type 'exit', 'quit', or press Ctrl+C to end the session.\n");

  const askQuestion = (): Promise<boolean> => {
    return new Promise((resolve) => {
      rl.question("💬 You: ", async (userInput) => {
        const trimmedInput = userInput.trim();

        if (trimmedInput.toLowerCase() === 'exit' || trimmedInput.toLowerCase() === 'quit') {
          console.log("\n👋 Thanks for using the Weather Assistant!");
          sessionActive = false;
          rl.close();
          resolve(false);
          return;
        }

        if (trimmedInput === '') {
          console.log("Please enter a question or type 'exit' to quit.\n");
          resolve(true);
          return;
        }

        try {
          await chatWithLLM(trimmedInput);
          console.log("\n" + "-".repeat(50) + "\n");
        } catch (error) {
          console.error("❌ Error processing your question:", error);
          console.log("\n" + "-".repeat(50) + "\n");
        }

        resolve(true);
      });
    });
  };

  while (sessionActive) {
    const shouldContinue = await askQuestion();
    if (!shouldContinue) break;
  }
}

async function main() {
  try {
    // Connect to MCP server
    await connectToMCPServer();

    // Start interactive session
    await startInteractiveSession();

    // Close connection
    await mcpClient.close();
    console.log("✅ Connection closed");
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }
}

main();