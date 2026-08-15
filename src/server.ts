import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import dotenv from "dotenv";
import { homedir } from "node:os";
import { join } from "node:path";
import * as z from "zod/v4";
import { DuduClient } from "./dudu-client.js";

const jsonResult = (value: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
});

const body = (value: unknown): RequestInit => ({
  method: "POST",
  body: JSON.stringify(value),
});

const patch = (value: unknown): RequestInit => ({
  method: "PATCH",
  body: JSON.stringify(value),
});

interface DuduTask {
  id: number;
  [key: string]: unknown;
}

interface DuduCategory {
  id: number;
  name: string;
  items: DuduTask[];
}

interface DuduProject {
  id: number;
  emoji: string | null;
  name: string;
  items: DuduTask[];
  categories: DuduCategory[];
  [key: string]: unknown;
}

export function createDuduMcpServer(client: DuduClient) {
  const server = new McpServer(
    { name: "mcp-dudu", version: "1.0.0" },
    {
      instructions:
        "Dudu is Hyung-Joo's task system. Agent-completed work must move to review, never done. " +
        "This server intentionally exposes no done, delete, archive, queue start, or queue stop tool.",
    },
  );

  server.registerTool(
    "dudu_list_projects",
    {
      description: "List Dudu projects with category and task summaries.",
      inputSchema: {
        include_tasks: z.boolean().optional().default(false).describe("Include full task objects"),
      },
    },
    async ({ include_tasks }) => {
      const projects = await client.request<DuduProject[]>("/api/projects");
      if (include_tasks) return jsonResult(projects);
      return jsonResult(projects.map((project) => ({
        id: project.id,
        emoji: project.emoji,
        name: project.name,
        categories: project.categories.map((category) => ({
          id: category.id,
          name: category.name,
          task_count: category.items.length,
        })),
        root_task_count: project.items.length,
        task_count: project.items.length + project.categories.reduce(
          (total, category) => total + category.items.length,
          0,
        ),
      })));
    },
  );

  server.registerTool(
    "dudu_get_project",
    {
      description: "Get one Dudu project with all categories and active tasks.",
      inputSchema: { project_id: z.number().int().positive() },
    },
    async ({ project_id }) => {
      const projects = await client.request<DuduProject[]>("/api/projects");
      const project = projects.find((entry) => entry.id === project_id);
      if (!project) throw new Error(`Dudu project #${project_id} not found`);
      return jsonResult(project);
    },
  );

  server.registerTool(
    "dudu_get_task",
    {
      description: "Find one active Dudu task by ID and include its project and category.",
      inputSchema: { task_id: z.number().int().positive() },
    },
    async ({ task_id }) => {
      const projects = await client.request<DuduProject[]>("/api/projects");
      for (const project of projects) {
        const rootTask = project.items.find((task) => task.id === task_id);
        if (rootTask) return jsonResult({ ...rootTask, project_id: project.id, project_name: project.name, category_id: null, category_name: null });
        for (const category of project.categories) {
          const task = category.items.find((entry) => entry.id === task_id);
          if (task) return jsonResult({ ...task, project_id: project.id, project_name: project.name, category_id: category.id, category_name: category.name });
        }
      }
      throw new Error(`Dudu task #${task_id} not found`);
    },
  );

  server.registerTool(
    "dudu_create_project",
    {
      description: "Create a Dudu project.",
      inputSchema: {
        name: z.string().trim().min(1),
        emoji: z.string().trim().min(1).optional().default("📌"),
      },
    },
    async (input) => jsonResult(await client.request("/api/projects", body(input))),
  );

  server.registerTool(
    "dudu_update_project",
    {
      description: "Update a Dudu project's name, emoji, color, or default AI bot.",
      inputSchema: {
        project_id: z.number().int().positive(),
        name: z.string().trim().min(1).optional(),
        emoji: z.string().trim().min(1).optional(),
        color: z.string().trim().nullable().optional(),
        default_ai_bot_key: z.string().trim().min(1).optional(),
      },
    },
    async ({ project_id, ...updates }) =>
      jsonResult(await client.request(`/api/projects/${project_id}`, patch(updates))),
  );

  server.registerTool(
    "dudu_create_category",
    {
      description: "Create a category in a Dudu project.",
      inputSchema: {
        project_id: z.number().int().positive(),
        name: z.string().trim().min(1),
      },
    },
    async ({ project_id, name }) => jsonResult(await client.request(
      `/api/projects/${project_id}/categories`,
      body({ name }),
    )),
  );

  server.registerTool(
    "dudu_create_task",
    {
      description: "Create a Dudu task. For substantial work, include goal, context, deliverable, and verification in content.",
      inputSchema: {
        project_id: z.number().int().positive(),
        title: z.string().trim().min(1),
        content: z.string().optional(),
        category_id: z.number().int().positive().nullable().optional(),
        owner: z.string().trim().min(1).nullable().optional(),
        is_today: z.boolean().optional().default(false),
      },
    },
    async ({ project_id, ...task }) => jsonResult(await client.request(
      `/api/projects/${project_id}/items`,
      body(task),
    )),
  );

  server.registerTool(
    "dudu_update_task",
    {
      description: "Update or move a Dudu task. This tool cannot change status; use dudu_mark_review after agent work.",
      inputSchema: {
        task_id: z.number().int().positive(),
        title: z.string().trim().min(1).optional(),
        content: z.string().nullable().optional(),
        category_id: z.number().int().positive().nullable().optional(),
        project_id: z.number().int().positive().optional(),
        owner: z.string().trim().min(1).nullable().optional(),
        is_today: z.boolean().optional(),
      },
    },
    async ({ task_id, ...updates }) =>
      jsonResult(await client.request(`/api/items/${task_id}`, patch(updates))),
  );

  server.registerTool(
    "dudu_mark_review",
    {
      description: "Mark agent-completed work as review (never done) and optionally set a review emoji.",
      inputSchema: {
        task_id: z.number().int().positive(),
        review_emoji: z.string().trim().min(1).optional().default("👀"),
      },
    },
    async ({ task_id, review_emoji }) => jsonResult(await client.request(
      `/api/items/${task_id}`,
      patch({ status: "review", review_emoji }),
    )),
  );

  server.registerTool(
    "dudu_set_today",
    {
      description: "Add or remove a Dudu task from Today.",
      inputSchema: {
        task_id: z.number().int().positive(),
        is_today: z.boolean(),
      },
    },
    async ({ task_id, is_today }) => jsonResult(await client.request(
      `/api/items/${task_id}`,
      patch({ is_today }),
    )),
  );

  server.registerTool(
    "dudu_get_today_queue",
    {
      description: "Get Today Queue status, optionally limited to one project.",
      inputSchema: { project_id: z.number().int().positive().optional() },
    },
    async ({ project_id }) => {
      const query = project_id ? `?project_id=${project_id}` : "";
      return jsonResult(await client.request(`/api/today-queue/status${query}`));
    },
  );

  server.registerTool(
    "dudu_move_today_queue_task",
    {
      description: "Move a pending Today Queue task before or after another pending task in the same project. Active/review tasks stay fixed.",
      inputSchema: {
        project_id: z.number().int().positive(),
        task_id: z.number().int().positive(),
        before_task_id: z.number().int().positive().optional(),
        after_task_id: z.number().int().positive().optional(),
      },
    },
    async ({ project_id, task_id, before_task_id, after_task_id }) => {
      if ((before_task_id === undefined) === (after_task_id === undefined)) {
        throw new Error("Provide exactly one of before_task_id or after_task_id");
      }
      return jsonResult(await client.request(
        `/api/projects/${project_id}/today-queue/items`,
        body({
          item_id: task_id,
          before_item_id: before_task_id,
          after_item_id: after_task_id,
        }),
      ));
    },
  );

  return server;
}

export async function main() {
  dotenv.config({
    path: process.env.DUDU_ENV_FILE || join(homedir(), ".config/mcp-dudu/.env"),
    quiet: true,
  });
  const apiKey = process.env.DUDU_API_KEY || process.env.USAGE_API_KEY;
  if (!apiKey) {
    throw new Error("DUDU_API_KEY (or USAGE_API_KEY) is required; set it directly or through DUDU_ENV_FILE");
  }

  const client = new DuduClient({
    baseUrl: process.env.DUDU_API_URL || "http://localhost:3100",
    apiKey,
  });
  const server = createDuduMcpServer(client);
  await server.connect(new StdioServerTransport());
}
