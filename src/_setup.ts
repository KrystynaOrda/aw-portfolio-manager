/**
 * Setup script for Lit
 */
import { LitService } from "./vendors/lit-service";
import inquirer from "inquirer";
import { join } from "path";
import { mkdir } from "fs/promises";

const litService = new LitService();

// Define the available commands and their descriptions
const COMMANDS = {
  mintPKP: "Mint new PKP tokens",
  mintCredits: "Mint Credits NFT",
  getDelegationAuth: "Get delegation authentication signature",
  all: "Execute all commands in sequence",
} as const;

// Add path utility functions at the top level
const LOG_DIR = "logs";

async function ensureLogDirectory() {
  await mkdir(LOG_DIR, { recursive: true });
}

function getTimestampedFilename(baseName: string): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const extension = baseName.split(".").pop();
  const nameWithoutExt = baseName.replace(`.${extension}`, "");
  return join(LOG_DIR, `${nameWithoutExt}-${timestamp}.${extension}`);
}

async function promptForCommand() {
  const { command } = await inquirer.prompt([
    {
      type: "list",
      name: "command",
      message: "Select an operation to perform:",
      choices: Object.entries(COMMANDS).map(([value, name]) => ({
        name,
        value,
      })),
    },
  ]);

  if (command === "getDelegationAuth" || command === "all") {
    const { tokenId } = await inquirer.prompt([
      {
        type: "input",
        name: "tokenId",
        message: "Enter the token ID:",
        validate: (input) => {
          if (input.trim() === "") {
            return "Token ID is required";
          }
          return true;
        },
      },
    ]);
    return { command, tokenId };
  }

  return { command };
}

async function executeCommand(command: string, tokenId?: string) {
  await ensureLogDirectory();

  switch (command) {
    case "mintPKP":
      const pkps = await litService.mintPKP();
      console.log("PKP Minting Result:", pkps.info);
      await Bun.write(
        getTimestampedFilename("pkp-tx.json"),
        JSON.stringify(pkps, null, 2)
      );
      console.log(`✅ pkp-tx.json written to ${LOG_DIR} directory`);
      process.exit(0);

    case "mintCredits":
      const creditsNFT = await litService.mintCreditsNFT();
      console.log("Credits NFT Result:", creditsNFT);
      await Bun.write(
        getTimestampedFilename("credits-nft.json"),
        JSON.stringify(creditsNFT, null, 2)
      );
      console.log(`✅ credits-nft.json written to ${LOG_DIR} directory`);
      process.exit(0);

    case "getDelegationAuth":
      if (!tokenId) {
        throw new Error("Token ID is required for getDelegationAuth command");
      }
      const delegationAuthSig = await litService.getDelegationAuthSig(tokenId);
      console.log("Delegation Auth Signature:", delegationAuthSig);
      await Bun.write(
        getTimestampedFilename(`delegation-auth-sig-${tokenId}.json`),
        JSON.stringify(delegationAuthSig, null, 2)
      );
      console.log(
        `✅ delegation-auth-sig.json written to ${LOG_DIR} directory`
      );
      process.exit(0);

    case "all":
      console.log("\n🚀 Executing all commands in sequence...\n");

      console.log("Step 1: Minting PKP tokens...");
      const allPkps = await litService.mintPKP();
      console.log("PKP Minting Result:", allPkps.info);
      await Bun.write(
        getTimestampedFilename("pkp-tx.json"),
        JSON.stringify(allPkps, null, 2)
      );
      console.log(`✅ pkp-tx.json written to ${LOG_DIR} directory\n`);

      console.log("Step 2: Minting Credits NFT...");
      const allCreditsNFT = await litService.mintCreditsNFT();
      console.log("Credits NFT Result:", allCreditsNFT);
      await Bun.write(
        getTimestampedFilename("credits-nft.json"),
        JSON.stringify(allCreditsNFT, null, 2)
      );
      console.log(`✅ credits-nft.json written to ${LOG_DIR} directory\n`);

      if (tokenId) {
        console.log("Step 3: Getting Delegation Auth Signature...");
        const allDelegationAuthSig = await litService.getDelegationAuthSig(
          tokenId
        );
        console.log("Delegation Auth Signature:", allDelegationAuthSig);
        await Bun.write(
          getTimestampedFilename("delegation-auth-sig.json"),
          JSON.stringify(allDelegationAuthSig, null, 2)
        );
        console.log(
          `✅ delegation-auth-sig.json written to ${LOG_DIR} directory\n`
        );
      }

      console.log("🎉 All operations completed successfully!");
      break;
  }
}

async function main() {
  try {
    await litService.connect();
    console.log("🔗 Connected to Lit Service\n");

    const { command, tokenId } = await promptForCommand();
    await executeCommand(command, tokenId);
  } catch (error: any) {
    console.error("❌ Error:", error?.message || "Unknown error occurred");
    process.exit(1);
  }
}

main();
