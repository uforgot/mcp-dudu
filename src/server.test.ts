import assert from "node:assert/strict";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { DuduClient } from "./dudu-client.js";
import { createDuduMcpServer } from "./server.js";

function makeFetch() {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetchImpl: typeof fetch = async (input, init = {}) => {
    const url = String(input);
    calls.push({ url, init });
    let response: unknown = { ok: true };

    if (url.endsWith("/api/projects") && (!init.method || init.method === "GET")) {
      response = [{
        id: 7,
        emoji: "🤖",
        name: "할일빵빵",
        items: [],
        categories: [{ id: 215, name: "두두 MCP", items: [] }],
      }];
    } else if (url.endsWith("/api/projects/7/items")) {
      response = { id: 1261, project_id: 7, status: "todo", ...JSON.parse(String(init.body)) };
    } else if (url.endsWith("/api/items/1261")) {
      response = { id: 1261, ...JSON.parse(String(init.body)) };
    }

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
  return { calls, fetchImpl };
}

test("exposes safe Dudu tools and performs create/review flow", async () => {
  const { calls, fetchImpl } = makeFetch();
  const dudu = new DuduClient({ baseUrl: "http://localhost:3100/", apiKey: "test-key", fetchImpl });
  const server = createDuduMcpServer(dudu);
  const client = new Client({ name: "mcp-dudu-test", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  try {
    const tools = await client.listTools();
    const names = tools.tools.map((tool) => tool.name);
    assert(names.includes("dudu_create_task"));
    assert(names.includes("dudu_mark_review"));
    assert(!names.some((name) => name.includes("done")));
    assert(!names.some((name) => name.includes("delete")));

    await client.callTool({
      name: "dudu_create_task",
      arguments: {
        project_id: 7,
        category_id: 215,
        title: "MCP smoke test",
        content: "verification",
      },
    });
    await client.callTool({
      name: "dudu_mark_review",
      arguments: { task_id: 1261 },
    });

    const createCall = calls.find((call) => call.url.endsWith("/api/projects/7/items"));
    assert.equal(createCall?.init.method, "POST");
    assert.equal((createCall?.init.headers as Record<string, string>).Authorization, "Bearer test-key");
    assert.deepEqual(JSON.parse(String(createCall?.init.body)), {
      category_id: 215,
      title: "MCP smoke test",
      content: "verification",
      is_today: false,
    });

    const reviewCall = calls.find((call) => call.url.endsWith("/api/items/1261"));
    assert.deepEqual(JSON.parse(String(reviewCall?.init.body)), {
      status: "review",
      review_emoji: "👀",
    });
  } finally {
    await client.close();
    await server.close();
  }
});

test("requires exactly one queue anchor", async () => {
  const { fetchImpl } = makeFetch();
  const server = createDuduMcpServer(new DuduClient({
    baseUrl: "http://localhost:3100",
    apiKey: "test-key",
    fetchImpl,
  }));
  const client = new Client({ name: "mcp-dudu-test", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  try {
    const result = await client.callTool({
      name: "dudu_move_today_queue_task",
      arguments: { project_id: 7, task_id: 1261 },
    });
    assert.equal(result.isError, true);
    assert.match(JSON.stringify(result.content), /exactly one/);
  } finally {
    await client.close();
    await server.close();
  }
});
