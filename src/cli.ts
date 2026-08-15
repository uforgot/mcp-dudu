#!/usr/bin/env node

import { main } from "./server.js";

main().catch((error) => {
  console.error(`[mcp-dudu] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
