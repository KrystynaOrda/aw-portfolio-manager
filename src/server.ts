/**
 * server.ts
 *
 * Express server that provides a web interface for the portfolio management AI assistant.
 * Uses Socket.IO for real-time communication with the client.
 *
 */
import "./utils/silent";
import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";
import path from "path";
import { execSync } from "child_process";
import fs from "fs";
import OpenAI from "openai";

interface PortfolioToken {
  chain: string;
  token: string;
  balance: string;
  usdValue: string;
  percentage: number;
}

interface Portfolio {
  portfolio: PortfolioToken[];
}

interface StrategyConfig {
  targetAllocations: Record<string, number>;
  thresholdPercentage: number;
}

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(process.cwd(), "public")));

// Serve the HTML file
app.get("/", (req, res) => {
  res.sendFile(path.join(process.cwd(), "public", "index.html"));
});

// Conversation states
enum ConversationState {
  GREETING,
  INTRODUCTION,
  SHOW_PORTFOLIO,
  ASK_RISK_TOLERANCE,
  GENERATE_STRATEGY,
  CONFIRMATION,
}

// Socket.IO connection handling
io.on("connection", (socket) => {
  console.log("Client connected");

  let state = ConversationState.GREETING;
  let portfolio: Portfolio | null = null;
  let riskTolerance: string | null = null;
  let lastRecommendation: {
    allocations: Record<string, number>;
    threshold: number;
  } | null = null;

  // Helper function to stream text character by character
  async function streamMessage(
    content: string,
    role: "assistant" | "user" = "assistant",
    isNewMessage: boolean = true
  ) {
    if (isNewMessage) {
      socket.emit("message", { role, content: "", isNewMessage: true });
    }

    // If the content contains a URL, send it as a single chunk
    if (content.includes("http")) {
      socket.emit("stream", { role, content });
      return;
    }

    // Otherwise stream characters in small chunks for better performance
    const chunkSize = 5; // Process 5 characters at a time
    for (let i = 0; i < content.length; i += chunkSize) {
      const chunk = content.slice(i, i + chunkSize);
      await new Promise((resolve) => setTimeout(resolve, 10)); // Reduced delay to 10ms
      socket.emit("stream", { role, content: chunk });
    }
  }

  // Initial greeting
  streamMessage(
    "Hi! I'm your portfolio management AI assistant. What's your name?"
  );

  // Handle getting portfolio
  async function getPortfolio(): Promise<Portfolio> {
    try {
      await streamMessage("Let me check your current portfolio...");
      execSync("bun run ./src/6-get-portfolio.ts", { encoding: "utf-8" });

      const portfolioPath = path.join(
        process.cwd(),
        "src",
        "config",
        "portfolio-data.json"
      );
      const portfolioData = JSON.parse(
        fs.readFileSync(portfolioPath, "utf-8")
      ) as Portfolio;

      if (!portfolioData.portfolio || !Array.isArray(portfolioData.portfolio)) {
        throw new Error("Invalid portfolio format: missing portfolio array");
      }

      await streamMessage("Here's your current portfolio:");
      for (const token of portfolioData.portfolio as PortfolioToken[]) {
        await streamMessage(
          `${token.token}: ${token.percentage.toFixed(2)}% ($${Number(
            token.usdValue
          ).toFixed(2)})`,
          "assistant",
          false
        );
      }

      return portfolioData;
    } catch (error) {
      console.error("Error getting portfolio:", error);
      throw error;
    }
  }

  // Handle AI recommendation
  async function getAIRecommendation(
    portfolio: Portfolio,
    riskDescription: string
  ): Promise<{ allocations: Record<string, number>; threshold: number }> {
    try {
      await streamMessage("Analyzing your portfolio and risk tolerance...\n");

      const availableTokens = portfolio.portfolio
        .map((t) => t.token)
        .join(", ");
      const prompt = `As a portfolio manager, analyze this portfolio and suggest target allocations based on the user's risk tolerance description: "${riskDescription}"

Current Portfolio:
${portfolio.portfolio
  .map(
    (token) =>
      `${token.token}: ${token.percentage.toFixed(2)}% ($${Number(
        token.usdValue
      ).toFixed(2)})`
  )
  .join("\n")}

IMPORTANT: You can ONLY allocate between these specific tokens: ${availableTokens}
DO NOT suggest any other tokens or cryptocurrencies.

First, provide your analysis and reasoning in a natural, conversational way.
Then, provide the allocation data in the following JSON format (after your analysis):

ALLOCATION_DATA:
{
  "allocations": {
    // ONLY use tokens from: ${availableTokens}
    "TOKEN_SYMBOL": XX.XX  // percentage as decimal (e.g. 80.00 for 80%)
  },
  "threshold": X.XX  // percentage as decimal (between 0.5 and 2.0)
}`;

      const stream = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "system",
            content: `You are an experienced portfolio manager specializing in cryptocurrency portfolio optimization. You must ONLY suggest allocations for these tokens: ${availableTokens}. First provide analysis in natural language, then provide allocation data in JSON format after the ALLOCATION_DATA: marker.`,
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        stream: true,
      });

      let fullResponse = "";
      let currentMessage = "";
      let isStreaming = false;

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || "";
        if (content) {
          fullResponse += content;
          currentMessage += content;

          // If we haven't hit the JSON data yet, stream the content
          if (!fullResponse.includes("ALLOCATION_DATA:")) {
            if (!isStreaming) {
              await streamMessage("");
              isStreaming = true;
            }

            // Stream in sentences or when buffer gets large enough
            if (
              content.includes(".") ||
              content.includes("\n") ||
              currentMessage.length > 100
            ) {
              await streamMessage(currentMessage, "assistant", false);
              currentMessage = "";
            }
          }
        }
      }

      // Send any remaining buffered content
      if (currentMessage) {
        await streamMessage(currentMessage, "assistant", false);
      }

      // Extract the JSON data
      const jsonMatch = fullResponse.match(/ALLOCATION_DATA:\s*({[\s\S]*})/);
      if (!jsonMatch) {
        throw new Error("No allocation data found in response");
      }

      const response = JSON.parse(jsonMatch[1]);

      // Validate allocations
      const allocations: Record<string, number> = {};
      for (const [token, percentage] of Object.entries(response.allocations)) {
        allocations[token] = Number(percentage) / 100;
      }

      // Validate allocations sum to 1 (with 5% tolerance)
      const sum = Object.values(allocations).reduce((a, b) => a + b, 0);
      if (Math.abs(sum - 1) > 0.05) {
        throw new Error(
          `Invalid allocations: sum is ${(sum * 100).toFixed(1)}%`
        );
      }

      // Validate only existing tokens are allocated
      const existingTokens = new Set(
        portfolio.portfolio.map((t: PortfolioToken) => t.token)
      );
      const allocatedTokens = new Set(Object.keys(allocations));
      if (
        [...allocatedTokens].some((token: string) => !existingTokens.has(token))
      ) {
        throw new Error("Invalid tokens in allocation");
      }

      // Normalize allocations to exactly 100%
      const normalizedAllocations: Record<string, number> = {};
      for (const [token, value] of Object.entries(allocations)) {
        normalizedAllocations[token] = Number((value / sum).toFixed(4));
      }

      const threshold = Number(response.threshold) / 100;

      // Display the final allocations
      await streamMessage("\nProposed strategy:", "assistant", false);

      for (const [token, allocation] of Object.entries(normalizedAllocations)) {
        await streamMessage(
          `${token}: ${(allocation * 100).toFixed(2)}%`,
          "assistant",
          false
        );
      }

      await streamMessage(
        `Rebalancing threshold: ${(threshold * 100).toFixed(2)}%`,
        "assistant",
        false
      );

      return { allocations: normalizedAllocations, threshold };
    } catch (error) {
      console.error("Error in AI recommendation:", error);
      throw error;
    }
  }

  // Handle saving preferences and running main script
  async function savePreferences(strategyConfig: StrategyConfig) {
    const preferencesPath = path.join(
      process.cwd(),
      "src",
      "config",
      "preferences.json"
    );
    fs.writeFileSync(preferencesPath, JSON.stringify(strategyConfig, null, 2));
    await streamMessage(
      "Great! I've saved your strategy preferences. Now executing the trades...",
      "assistant",
      true
    );

    try {
      // Execute the main script and stream its output
      const childProcess = require("child_process");
      const messageQueue: string[] = [];
      let isProcessing = false;

      const script = childProcess.spawn("bun", ["run", "src/index.ts"]);

      async function processNextMessage() {
        if (isProcessing || messageQueue.length === 0) return;

        isProcessing = true;
        const message = messageQueue.shift();

        if (message) {
          // Split messages containing URLs into separate messages
          if (message.includes("http")) {
            const parts = message.split(/(https?:\/\/[^\s]+)/).filter(Boolean);
            for (const part of parts) {
              await new Promise<void>(async (resolve) => {
                await streamMessage(part.trim(), "assistant", true);
                setTimeout(resolve, 100);
              });
            }
          } else {
            // For non-URL messages, process normally
            await new Promise<void>(async (resolve) => {
              await streamMessage(message.trim(), "assistant", true);
              setTimeout(resolve, 100);
            });
          }
        }

        isProcessing = false;
        if (messageQueue.length > 0) {
          await processNextMessage();
        }
      }

      script.stdout.on("data", (data: Buffer) => {
        const newData = data.toString();
        console.log("Received stdout:", newData);

        // Find all response tags and add them to the queue
        const matches = newData.matchAll(/<response>([\s\S]*?)<\/response>/g);
        for (const match of matches) {
          if (match[1]) {
            messageQueue.push(match[1].trim());
          }
        }

        if (!isProcessing) {
          processNextMessage();
        }
      });

      script.stderr.on("data", (data: Buffer) => {
        const error = data.toString();
        console.log("Received stderr:", error);

        if (
          error.includes("Storage key") ||
          error.includes("Unable to store walletSig")
        ) {
          return;
        }

        if (error.includes("NodeError")) {
          messageQueue.push(error.substring(0, 200));
          if (!isProcessing) {
            processNextMessage();
          }
          return;
        }

        // Clean up error messages
        const cleanError = error
          .replace(/\[.*?\]/g, "")
          .trim()
          .replace(/\s+/g, " ")
          .replace(/Error: /g, "\nError: ");

        messageQueue.push(`Error: ${cleanError}`);
        if (!isProcessing) {
          processNextMessage();
        }
      });

      await new Promise((resolve, reject) => {
        script.on("close", async (code: number) => {
          // Wait for all messages in the queue to be processed
          while (messageQueue.length > 0 || isProcessing) {
            await new Promise((resolve) => setTimeout(resolve, 100));
          }

          if (code === 0) {
            resolve(undefined);
          } else {
            reject(new Error(`Script execution failed with code ${code}`));
          }
        });
      });

      await streamMessage(
        "Trading execution completed. You can run me again anytime to adjust your strategy.",
        "assistant",
        true
      );
    } catch (error) {
      console.error("Error executing main script:", error);
      // Send a more detailed error message to the chat
      await streamMessage(
        "There was an error executing the trades:",
        "assistant",
        true
      );
      if (error instanceof Error) {
        await streamMessage(error.message, "assistant", true);
      } else {
        await streamMessage("An unexpected error occurred", "assistant", true);
      }
      await streamMessage(
        "Please try again later or contact support if the issue persists.",
        "assistant",
        true
      );
    }
  }

  // Handle user messages
  socket.on("message", async (message: string) => {
    try {
      await streamMessage(message, "user");

      switch (state) {
        case ConversationState.GREETING:
          await streamMessage(
            `Nice to meet you${
              message ? ", " + message : ""
            }! I'll help you manage your cryptocurrency portfolio. First, let me show you your current holdings.`
          );
          state = ConversationState.SHOW_PORTFOLIO;
          portfolio = await getPortfolio();
          await streamMessage(
            "Now, could you tell me about your risk tolerance? For example, are you conservative, moderate, or aggressive with your investments?"
          );
          state = ConversationState.ASK_RISK_TOLERANCE;
          socket.emit("enable_input");
          break;

        case ConversationState.ASK_RISK_TOLERANCE:
          riskTolerance = message;
          state = ConversationState.GENERATE_STRATEGY;
          if (portfolio) {
            lastRecommendation = await getAIRecommendation(
              portfolio,
              riskTolerance
            );
            await streamMessage(
              "Would you like to proceed with this strategy? (yes/no)"
            );
            state = ConversationState.CONFIRMATION;
            socket.emit("enable_input");
          }
          break;

        case ConversationState.CONFIRMATION:
          if (
            message.toLowerCase() === "yes" ||
            message.toLowerCase() === "y"
          ) {
            if (lastRecommendation) {
              const strategyConfig: StrategyConfig = {
                targetAllocations: lastRecommendation.allocations,
                thresholdPercentage: lastRecommendation.threshold,
              };
              await savePreferences(strategyConfig);
              state = ConversationState.GREETING;
              socket.emit("enable_input");
            } else {
              await streamMessage(
                "Sorry, there was an error with the recommendation. Please try again."
              );
              state = ConversationState.ASK_RISK_TOLERANCE;
              socket.emit("enable_input");
            }
          } else if (
            message.toLowerCase() === "no" ||
            message.toLowerCase() === "n"
          ) {
            await streamMessage(
              "No problem! Would you like to try again with a different risk tolerance?"
            );
            state = ConversationState.ASK_RISK_TOLERANCE;
            socket.emit("enable_input");
          } else {
            await streamMessage("Please answer with yes or no.");
            socket.emit("enable_input");
          }
          break;

        default:
          await streamMessage(
            "I didn't quite understand. Could you please try again?"
          );
          socket.emit("enable_input");
          break;
      }
    } catch (error) {
      console.error("Error:", error);
      await streamMessage("I encountered an error. Please try again.");
      state = ConversationState.GREETING;
      socket.emit("enable_input");
    }
  });

  socket.on("disconnect", () => {
    console.log("Client disconnected");
  });
});

// Start server
const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
