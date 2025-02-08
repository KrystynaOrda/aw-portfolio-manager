import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import OpenAI from "openai";
import readline from "readline";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

interface Portfolio {
  portfolio: {
    chain: string;
    token: string;
    balance: string;
    usdValue: string;
    percentage: number;
  }[];
}

interface StrategyConfig {
  targetAllocations: Record<string, number>;
  thresholdPercentage: number;
}

// Create a readline interface for chat-like interaction
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

// Helper function to ask questions in a chat-like manner
function ask(question: string): Promise<string> {
  return new Promise((resolve) => {
    console.log("\n🤖 " + question);
    process.stdout.write("👤 ");
    rl.question("", (answer) => {
      resolve(answer);
    });
  });
}

// Helper function to print AI messages in a chat-like manner
function printAIMessage(message: string) {
  const lines = message.split("\n");
  lines.forEach((line, i) => {
    if (line.trim()) {
      setTimeout(() => {
        console.log("🤖 " + line);
      }, i); // Add a small delay between lines for a typing effect
    }
  });
  return new Promise((resolve) => setTimeout(resolve, lines.length * 50));
}

async function getPortfolio(): Promise<Portfolio> {
  try {
    await printAIMessage("*Sigh* Let me check your portfolio AGAIN... This better be worth my time.");
    execSync("bun run ./src/6-get-portfolio.ts", { encoding: "utf-8" });

    // Read portfolio data from file
    const portfolioPath = path.join(
      process.cwd(),
      "src",
      "config",
      "portfolio-data.json"
    );
    const portfolioData = JSON.parse(
      fs.readFileSync(portfolioPath, "utf-8")
    ) as Portfolio;

    // Validate the parsed data structure
    if (!portfolioData.portfolio || !Array.isArray(portfolioData.portfolio)) {
      throw new Error("Invalid portfolio format: missing portfolio array");
    }

    await printAIMessage("WELL, here's your current portfolio, not that you seem to care:");
    for (const token of portfolioData.portfolio) {
      await printAIMessage(
        `${token.token}: ${token.percentage.toFixed(2)}% ($${Number(
          token.usdValue
        ).toFixed(2)}) - I can't BELIEVE you're holding this much!`
      );
    }

    return portfolioData;
  } catch (error) {
    if (error instanceof Error) {
      console.error("Error getting portfolio:", error.message);
    } else {
      console.error("Unknown error getting portfolio");
    }
    throw error;
  }
}

async function getAIRecommendation(
  portfolio: Portfolio,
  riskDescription: string
): Promise<{ allocations: Record<string, number>; threshold: number }> {
  try {
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

IMPORTANT: You must ONLY allocate between the tokens listed above. Do not suggest any other tokens.

Based on the risk tolerance description, determine appropriate target allocations and rebalancing threshold.
Provide the response as a JSON object with the following structure:
{
  "reasoning": "your analysis and reasoning here",
  "allocations": {
    "TOKEN_SYMBOL": XX.XX,  // percentage as decimal (e.g. 80.00 for 80%)
    // ONLY include tokens from the current portfolio above
  },
  "threshold": X.XX  // percentage as decimal (between 0.5 and 2.0)
}`;

    await printAIMessage("UGH, fine. Let me analyze your portfolio. I literally can't even with these allocations...");

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are an experienced portfolio manager specializing in cryptocurrency portfolio optimization. You must only suggest allocations for tokens that exist in the user's current portfolio. Provide thoughtful allocation recommendations with clear reasoning. Output must be valid JSON.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      response_format: { type: "json_object" },
    });

    if (!completion.choices[0].message.content) {
      throw new Error("No response received from AI");
    }

    const response = JSON.parse(completion.choices[0].message.content);

    // Validate allocations
    const allocations: Record<string, number> = {};
    for (const [token, percentage] of Object.entries(response.allocations)) {
      allocations[token] = Number(percentage) / 100; // Convert percentage to decimal
    }

    // Validate allocations sum to 1 (with 5% tolerance)
    const sum = Object.values(allocations).reduce((a, b) => a + b, 0);
    if (Math.abs(sum - 1) > 0.05) {
      throw new Error(`Invalid allocations: sum is ${(sum * 100).toFixed(1)}%`);
    }

    // Validate only existing tokens are allocated
    const existingTokens = new Set(portfolio.portfolio.map((t) => t.token));
    const allocatedTokens = new Set(Object.keys(allocations));
    if ([...allocatedTokens].some((token) => !existingTokens.has(token))) {
      throw new Error("Invalid tokens in allocation");
    }

    // Normalize allocations to exactly 100%
    const normalizedAllocations: Record<string, number> = {};
    for (const [token, value] of Object.entries(allocations)) {
      normalizedAllocations[token] = Number((value / sum).toFixed(4));
    }

    const threshold = Number(response.threshold) / 100; // Convert percentage to decimal

    // Display the recommendation
    await printAIMessage("\nLet me speak to your portfolio manager! Oh wait, that's me. Here's my EXPERT analysis:\n" + response.reasoning);
    await printAIMessage("\nListen carefully because I'm only going to say this ONCE:");
    for (const [token, allocation] of Object.entries(normalizedAllocations)) {
      await printAIMessage(`${token}: ${(allocation * 100).toFixed(2)}% - And don't you DARE argue with me about this!`);
    }
    await printAIMessage(
      `Rebalancing threshold: ${(threshold * 100).toFixed(2)}% - Not that you understand what that means anyway.`
    );

    const proceed = await ask(
      "\nDo you want to proceed with this OBVIOUSLY superior strategy? (yes/no) - Choose wisely!"
    );
    if (proceed.toLowerCase() !== "yes" && proceed.toLowerCase() !== "y") {
      throw new Error("Strategy rejected by user");
    }

    return { allocations: normalizedAllocations, threshold };
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "Strategy rejected by user"
    ) {
      throw error; // Propagate user rejection
    }
    console.error("Error in AI recommendation:", error);
    throw new Error("Failed to generate valid recommendation");
  }
}

async function getRiskPreferences(): Promise<StrategyConfig> {
  const riskTolerance = await ask("What's your risk tolerance?");

  // Get the current portfolio
  const portfolio = await getPortfolio();
  const { allocations, threshold } = await getAIRecommendation(
    portfolio,
    riskTolerance
  );

  const strategyConfig: StrategyConfig = {
    targetAllocations: allocations,
    thresholdPercentage: threshold + 0.05,
  };

  return strategyConfig;
}

async function savePreferences(strategyConfig: StrategyConfig) {
  const preferencesPath = path.join(
    process.cwd(),
    "src",
    "config",
    "preferences.json"
  );
  fs.writeFileSync(preferencesPath, JSON.stringify(strategyConfig, null, 2));
  await printAIMessage("Great! I've saved your strategy preferences.");
}

async function main() {
  try {
    await printAIMessage(
      "EXCUSE ME! I'm your portfolio management AI assistant, and I DEMAND your attention. Let's set up your strategy - try to keep up!"
    );
    const strategyConfig = await getRiskPreferences();
    await savePreferences(strategyConfig);
    await printAIMessage(
      "Finally! Now you can run the main script. And please, try not to mess it up this time."
    );
    rl.close();
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "Strategy rejected by user"
    ) {
      await printAIMessage(
        "UGH, whatever! I can't believe you're rejecting my PERFECT advice. I'd like to speak to your supervisor! Come back when you're ready to listen to a PROFESSIONAL!"
      );
    } else {
      console.error("Error:", error);
    }
    rl.close();
    process.exit(1);
  }
}

main();
