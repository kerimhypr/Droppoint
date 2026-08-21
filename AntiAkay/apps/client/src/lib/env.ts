export const env = {
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL as string | undefined,
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined,
  signalingUrl: (import.meta.env.VITE_SIGNALING_URL as string | undefined) ?? "ws://127.0.0.1:8080/gateway",
  gatewayHttpUrl: (import.meta.env.VITE_GATEWAY_HTTP_URL as string | undefined) ?? "http://127.0.0.1:8080",
  turnUrl: import.meta.env.VITE_TURN_URL as string | undefined,
  turnUsername: import.meta.env.VITE_TURN_USERNAME as string | undefined,
  turnCredential: import.meta.env.VITE_TURN_CREDENTIAL as string | undefined,
  wasmDspUrl: (import.meta.env.VITE_WASM_DSP_URL as string | undefined) ?? "/wasm/noise-suppression.wasm",
} as const;

export function assertEnv(): void {
  if (!env.supabaseUrl || !env.supabaseAnonKey) {
    console.warn("[env] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY missing — auth will use mock/gateway mode");
  }
}
