/**
 * NOT LOADED by the production runtime.
 *
 * OMEGA-SYNAPSE deploys as Python WSGI (`api/index.py`). Vercel does not
 * execute this file. The OpenTelemetry SDK is not installed in that runtime.
 *
 * The designated sink (https://dist-kdwedath.devinapps.com/v1/traces) is probed
 * by `omega_synapse/telemetry_sink.py`. Do not treat the presence of this file
 * as evidence that traces are flowing.
 *
 * register() fails closed so a later Next.js mount cannot export into a
 * non-receiver and report success.
 */
export const OTEL_STATUS = "NOT_LOADED";
export const RUNTIME = "python-wsgi";

export async function register(): Promise<void> {
  throw new Error(
    "omega-synapse instrumentation.ts is not the production runtime and must not export traces"
  );
}
