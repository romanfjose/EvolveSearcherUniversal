// Type declarations for llm-app-hardening-kit (runtime is plain ESM JavaScript).

// ── budget-breaker ──
export type WindowName = '5h' | '7d';
export interface CapSpec { usd?: number; tokens?: number }
export type Caps = Partial<Record<WindowName, CapSpec>>;
export interface Pricing { inputPerMTok: number; outputPerMTok: number }
export interface Route { model: string; until?: number }
export interface Store { transact<R>(fn: (state: any) => { state?: any; result: R }): Promise<R> }
export declare const WINDOWS: Readonly<Record<WindowName, { key: string; bucketMs: number; buckets: number }>>;
export declare class MemoryStore implements Store { transact<R>(fn: (state: any) => { state?: any; result: R }): Promise<R> }
export declare class FileStore implements Store {
  constructor(dir: string, opts?: { gcAgeMs?: number; commitWindowMs?: number; maxAttempts?: number });
  transact<R>(fn: (state: any) => { state?: any; result: R }): Promise<R>;
}
export interface AuthorizeRequest { tenant?: string; model?: string; inputTokens?: number; maxOutputTokens?: number; key?: string }
export type Decision =
  | { ok: true; reservation: string; model: string; downgraded: boolean; estimate: { tokens: number; usd: number }; replayed?: boolean }
  | { ok: false; reason: 'rate_limited' | 'budget_exhausted' | 'request_exceeds_cap' | 'unknown_model'; scope?: string; window?: WindowName;
      dimension?: 'usd' | 'tokens'; used?: number; limit?: number; retryAfterMs?: number | null; model?: string };
export declare class BudgetExceededError extends Error { reason: string; retryAfterMs?: number | null; scope?: string; window?: WindowName }
export interface BudgetBreaker {
  authorize(req: AuthorizeRequest): Promise<Decision>;
  settle(reservation: string, usage: { inputTokens?: number; outputTokens?: number }): Promise<false | { tokens: number; usd: number }>;
  release(reservation: string): Promise<boolean>;
  usage(opts?: { tenant?: string }): Promise<Record<string, Record<WindowName, { tokens: number; usd: number; cap?: CapSpec }>>>;
  run<T>(req: AuthorizeRequest, fn: (ctx: { model: string; downgraded: boolean }) => Promise<{ value: T; usage?: { inputTokens: number; outputTokens: number } }>):
    Promise<{ value: T; model: string; downgraded: boolean; charged: false | { tokens: number; usd: number } }>;
}
export declare function createBudgetBreaker(opts: {
  pricing: Record<string, Pricing>; routes: Array<string | Route>; caps?: { global?: Caps; tenant?: Caps };
  degradeAt?: number; rateLimit?: { capacity: number; refillPerSec: number }; store?: Store; now?: () => number;
}): BudgetBreaker;

// ── output-guard ──
export type JsonSchema = boolean | Record<string, any>;
export declare function repairJson(src: string): { text: string; complete: boolean } | null;
export declare function extractJson(text: string):
  | { ok: true; value: any; repaired: boolean; truncated: boolean; source: 'fence' | 'raw' }
  | { ok: false; error: string };
export declare function validateSchema(value: unknown, schema: JsonSchema, opts?: { strict?: boolean }): { valid: boolean; errors: Array<{ path: string; message: string }> };
export interface RedactOptions { systemPrompt?: string; secrets?: string[]; minWords?: number; patterns?: ReadonlyArray<readonly [string, RegExp]> }
export interface Redaction { type: string; start: number; end: number }
export declare const SECRET_PATTERNS: ReadonlyArray<readonly [string, RegExp]>;
export declare function redact(text: string, opts?: RedactOptions): { text: string; redactions: Redaction[] };
export declare function createStreamGuard(opts?: RedactOptions & { holdback?: number }): { push(chunk: string): string; end(): string; readonly redactions: Array<{ type: string }> };
export interface Source { id: string | number; text?: string; url?: string }
export interface CitationReport { valid: boolean; cited: string[]; missing: string[]; verifiedQuotes: Array<{ quote: string; ids: string[] }>; unverifiedQuotes: Array<{ quote: string; ids: string[] }>; uncited: string[] }
export declare function verifyCitations(text: string, sources: Source[], opts?: { requireCitation?: boolean }): CitationReport;
export declare function guardOutput(text: string, opts?: RedactOptions & { json?: boolean; schema?: JsonSchema; strict?: boolean; sources?: Source[] }): {
  ok: boolean; text: string; redactions: Redaction[]; json?: ReturnType<typeof extractJson>; schema?: ReturnType<typeof validateSchema>; citations?: CitationReport;
};

// ── repo-scanner ──
export type Severity = 'critical' | 'high' | 'medium' | 'low';
export type Category = 'cost' | 'leak' | 'injection' | 'schema' | 'idempotency';
export interface Finding { rule: string; title: string; severity: Severity; category: Category; path: string; line: number; col: number; snippet: string; message: string; fix: string }
export interface ScanResult {
  root: string; filesScanned: number; findings: Finding[];
  summary: { total: number; bySeverity: Record<Severity, number>; byRule: Record<string, number> };
  score: { categories: Record<Category, number>; overall: number };
}
export declare const SEVERITY_WEIGHT: Readonly<Record<Severity, number>>;
export declare const SEVERITY_ORDER: readonly Severity[];
export declare const CATEGORIES: Readonly<Record<Category, string>>;
export declare const RULES: ReadonlyArray<{ id: string; title: string; severity: Severity; category: Category; fix: string; env?: boolean }>;
export declare const RULES_BY_ID: Readonly<Record<string, (typeof RULES)[number]>>;
export declare function lex(src: string): { code: string; masked: string };
export declare function scanSource(src: string, path?: string): Finding[];
export declare function scanDir(target: string): Promise<ScanResult>;
export declare function scoreFindings(findings: Finding[]): ScanResult['score'];
export declare function summarize(findings: Finding[]): ScanResult['summary'];
export declare function exceeds(findings: Finding[], threshold?: Severity | 'none'): boolean;
export declare function isEnvFile(path: string): boolean;
export declare function isScannable(path: string): boolean;

// ── report ──
export declare function renderReport(opts: { title?: string; subtitle?: string; before: ScanResult; after?: ScanResult; generatedAt?: string }): string;
