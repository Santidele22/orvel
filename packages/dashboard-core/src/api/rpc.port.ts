/**
 * Fase 1 of #1098 — the RPC port of the shared core.
 *
 * Postgres RPC is the only backend shape the core needs from Supabase, and it
 * needs it in the app's vocabulary, not the SDK's: the real client, an in-memory
 * fake in tests and the future native HTTP adapter all satisfy this contract.
 *
 * The error type is structural on purpose. Core callers only read `message`,
 * so the adapter may hand back the SDK's own error object without the core
 * having to know what that is.
 */
export type RpcError = {
  message: string;
  code?: string;
  details?: unknown;
};

export type RpcResponse<TData = unknown> = {
  data: TData | null;
  error: RpcError | null;
};

export interface RpcClient {
  rpc<TData = unknown>(name: string, args?: Record<string, unknown>): PromiseLike<RpcResponse<TData>>;
}
