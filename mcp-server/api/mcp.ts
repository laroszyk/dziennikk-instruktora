import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import type { VercelRequest, VercelResponse } from "@vercel/node";

// ── Config ──────────────────────────────────────────────────────────────────
const EDGE_BASE = "https://asxvphinpnhjfrqibfka.supabase.co/functions/v1";

// ── Helpers ──────────────────────────────────────────────────────────────────
function extractBearer(req: VercelRequest): string | null {
  const auth = (req.headers["authorization"] as string) ?? "";
  return auth.startsWith("Bearer ") ? auth.slice(7).trim() : null;
}

async function callEdge(
  path: string,
  token: string,
  method: "GET" | "POST",
  body?: Record<string, unknown>,
  query?: Record<string, string>
): Promise<unknown> {
  const url = new URL(`${EDGE_BASE}/${path}`);
  if (query) {
    Object.entries(query).forEach(([k, v]) => url.searchParams.set(k, v));
  }
  const res = await fetch(url.toString(), {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function ok(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  };
}

// ── MCP Server factory ────────────────────────────────────────────────────────
function buildServer(token: string): McpServer {
  const server = new McpServer({
    name: "dziennik-instruktora",
    version: "1.0.0",
  });

  // ── Tool: add_training ───────────────────────────────────────────────────
  server.tool(
    "add_training",
    "Dodaje nowy wpis treningowy do dziennika instruktora jazdy konnej. " +
      "Jeźdźca wyszukuje po imieniu (częściowe dopasowanie, case-insensitive). " +
      "Zwraca id nowego wpisu i datę.",
    {
      jezdziec: z
        .string()
        .describe("Imię jeźdźca (lub fragment). Wymagane."),
      kon: z
        .string()
        .optional()
        .describe("Imię konia. Opcjonalne — jeśli nie podano, zostaje puste."),
      data: z
        .string()
        .optional()
        .describe("Data treningu w formacie YYYY-MM-DD. Domyślnie dzisiaj."),
      typ_jazdy: z
        .enum(["plac", "teren", "skoki", "ujeżdżenie", "lonża", "inne"])
        .optional()
        .describe("Typ jazdy. Domyślnie: plac."),
      ocena: z
        .number()
        .int()
        .min(1)
        .max(5)
        .optional()
        .describe("Ocena treningu od 1 do 5. Opcjonalna."),
      cwiczenia: z
        .array(z.string())
        .optional()
        .describe('Lista ćwiczeń, np. ["Koła 20 m", "Kłus bez strzemion"].'),
      uwagi: z.string().optional().describe("Ogólne uwagi z treningu."),
      dobrze: z.string().optional().describe("Co poszło dobrze."),
      do_poprawy: z.string().optional().describe("Co wymaga poprawy."),
      grupowa: z
        .boolean()
        .optional()
        .describe("Czy trening grupowy. Domyślnie false."),
    },
    async (args) => {
      const result = await callEdge("nowy-trening", token, "POST", args as Record<string, unknown>);
      return ok(result);
    }
  );

  // ── Tool: get_trainings ──────────────────────────────────────────────────
  server.tool(
    "get_trainings",
    "Zwraca wszystkie wpisy treningowe z podanego dnia. " +
      "Imiona jeźdźców i koni są już zdekodowane (bez surowych UUID). " +
      "Jeśli nie podasz daty, zwraca treningi z dzisiaj.",
    {
      data: z
        .string()
        .optional()
        .describe("Data w formacie YYYY-MM-DD. Domyślnie dzisiaj."),
    },
    async (args) => {
      const query: Record<string, string> = {};
      if (args.data) query["data"] = args.data;
      const result = await callEdge("trening-dnia", token, "GET", undefined, query);
      return ok(result);
    }
  );

  // ── Tool: ask_agent ──────────────────────────────────────────────────────
  server.tool(
    "ask_agent",
    "Zadaje pytanie agentowi AI Cwałek, który ma dostęp do pełnej historii treningów " +
      "i profili jeźdźców. Agent odpowiada po polsku, krótko i konkretnie. " +
      "Może analizować postępy jeźdźców, proponować ćwiczenia i porównywać daty.",
    {
      pytanie: z
        .string()
        .describe("Pytanie w dowolnym języku naturalnym."),
      data: z
        .string()
        .optional()
        .describe(
          "Dzień kontekstu YYYY-MM-DD. Treningi z tego dnia trafiają do promptu agenta. Domyślnie dzisiaj."
        ),
    },
    async (args) => {
      const result = await callEdge("zapytaj", token, "POST", args as Record<string, unknown>);
      return ok(result);
    }
  );

  return server;
}

// ── Vercel handler ───────────────────────────────────────────────────────────
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS preflight
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS, DELETE");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, mcp-session-id, Last-Event-ID"
  );

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  // Auth
  const token = extractBearer(req);
  if (!token) {
    return res
      .status(401)
      .json({ error: "Wymagany nagłówek: Authorization: Bearer <TOKEN>" });
  }

  // Build fresh server per request (stateless)
  const server = buildServer(token);

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless — brak sesji
  });

  await server.connect(transport);

  // req.body is already parsed by Vercel's runtime
  await transport.handleRequest(req as unknown as import("http").IncomingMessage, res as unknown as import("http").ServerResponse, req.body);
}
