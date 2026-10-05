export interface ApiConfig {
  host: string;
  port: number;
  rateLimitMax: number;
  allowedHosts: Set<string>;
  allowedOrigins: Set<string>;
}

function loopbackOrigin(value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error('MAESTRO_WEB_ORIGIN must be a valid loopback HTTP origin in v0.');
  }
  const loopbackHosts = new Set(['127.0.0.1', 'localhost', '[::1]']);
  if (
    parsed.protocol !== 'http:' ||
    !loopbackHosts.has(parsed.hostname.toLowerCase()) ||
    parsed.username ||
    parsed.password ||
    (parsed.pathname !== '/' && parsed.pathname !== '') ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error('MAESTRO_WEB_ORIGIN must be a loopback HTTP origin in v0.');
  }
  return parsed.origin;
}

export function apiConfig(): ApiConfig {
  const host = signalsSetting('HOST') ?? '127.0.0.1';
  const port = Number(signalsSetting('PORT') ?? '4310');
  const rateLimitMax = Number(signalsSetting('RATE_LIMIT_MAX') ?? '120');
  if (!['127.0.0.1', '::1', 'localhost'].includes(host)) {
    throw new Error('MAESTRO_HOST must be a loopback host in v0.');
  }
  if (!Number.isInteger(port) || port < 1024 || port > 65_535) {
    throw new Error('MAESTRO_PORT must be an integer from 1024 through 65535.');
  }
  if (!Number.isInteger(rateLimitMax) || rateLimitMax < 1 || rateLimitMax > 10_000) {
    throw new Error('MAESTRO_RATE_LIMIT_MAX must be an integer from 1 through 10000.');
  }
  const apiOrigins = [
    `http://127.0.0.1:${port}`,
    `http://localhost:${port}`,
    `http://[::1]:${port}`,
  ];
  const webOrigin = loopbackOrigin(signalsSetting('WEB_ORIGIN') ?? 'http://127.0.0.1:5173');
  const hosts = apiOrigins.map((origin) => new URL(origin).host.toLowerCase());
  return {
    host,
    port,
    rateLimitMax,
    allowedHosts: new Set(hosts),
    allowedOrigins: new Set([...apiOrigins, webOrigin]),
  };
}
import { signalsSetting } from '../../../packages/domain/src/configuration.js';
