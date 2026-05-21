/** Validates server env (e.g. paired auth domain vars) when the Node runtime starts. */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { validateServerEnv } = await import("@/lib/env/server");
    validateServerEnv();
  }
}
