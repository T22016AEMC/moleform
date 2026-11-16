// bridge.cjs 的型別宣告（只供 tests 的型別檢查使用）
export const ALLOWED_PATHS: readonly string[];
export const LOOPBACK_HOST: string;
export const MAX_BODY_BYTES: number;
export function isAllowedPath(p: unknown): boolean;
export function validateCall(p: unknown, body: unknown): { ok: true; body: Record<string, unknown> } | { ok: false; error: string };
export interface BridgeEngine {
  host?: string;
  port: number;
  token?: string;
}
export type BridgeSend = (engine: BridgeEngine, method: string, path: string, body: unknown) => Promise<{ status: number; body: unknown }>;
export function callEngine(
  engine: BridgeEngine | null,
  p: unknown,
  body: unknown,
  send: BridgeSend,
): Promise<{ ok: true; status: number; body: unknown } | { ok: false; error: string }>;
