import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";
import dotenv from "dotenv";

dotenv.config({ path: "../.env" });

export const env = createEnv({
  server: {
    // ethereum private key // must be etheruem address
    ETHEREUM_PRIVATE_KEY: z
      .string()
      .regex(/^0x[a-fA-F0-9]{64}$/, "Invalid Ethereum private key"),
    ETH_ADDRESS: z
      .string()
      .regex(/^0x[a-fA-F0-9]{40}$/, "Invalid Ethereum address"),

    PKP_PUBLIC_KEY: z.string(),
    PKP_ETH_ADDRESS: z.string(),
    OPENAI_API_KEY: z.string(),
  },

  /**
   * What object holds the environment variables at runtime. This is usually
   * `process.env` or `import.meta.env`.
   */
  runtimeEnv: process.env,

  /**
   * By default, this library will feed the environment variables directly to
   * the Zod validator.
   *
   * This means that if you have an empty string for a value that is supposed
   * to be a number (e.g. `PORT=` in a ".env" file), Zod will incorrectly flag
   * it as a type mismatch violation. Additionally, if you have an empty string
   * for a value that is supposed to be a string with a default value (e.g.
   * `DOMAIN=` in an ".env" file), the default value will never be applied.
   *
   * In order to solve these issues, we recommend that all new projects
   * explicitly specify this option as true.
   */
  emptyStringAsUndefined: true,
});
