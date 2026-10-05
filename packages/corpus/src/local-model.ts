import type { StructuredModel } from '../../domain/src/research-query.js';
import { requireUniqueJsonKeys } from '../../domain/src/evidence-exchange.js';

/** Explicit loopback configuration only; no provider discovery, credentials or cloud fallback. */
export function localStructuredModel(endpoint: string, model: string): StructuredModel {
  const url = new URL(endpoint);
  if (
    url.protocol !== 'http:' ||
    !['127.0.0.1', '[::1]'].includes(url.hostname) ||
    !url.port ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !model.trim()
  )
    throw new Error('Supply an explicit loopback HTTP model endpoint, port and model ID.');
  return {
    async propose(task, payload, schema) {
      const body = JSON.stringify({
        model,
        messages: [
          { role: 'system', content: task },
          { role: 'user', content: JSON.stringify(payload) },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: { name: 'signals_output', strict: true, schema },
        },
        temperature: 0,
      });
      if (Buffer.byteLength(body) > 128_000) throw new Error('Model input exceeds byte budget.');
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20_000);
      try {
        const response = await fetch(url, {
          method: 'POST',
          body,
          headers: { 'content-type': 'application/json' },
          redirect: 'error',
          signal: controller.signal,
        });
        if (!response.ok || !response.body)
          throw new Error(`Configured model unavailable (${response.status}).`);
        let bytes = 0;
        const chunks: Uint8Array[] = [];
        for await (const chunk of response.body) {
          bytes += chunk.byteLength;
          if (bytes > 262_144) {
            controller.abort();
            throw new Error('Model response exceeds byte budget.');
          }
          chunks.push(chunk);
        }
        const raw = Buffer.concat(chunks).toString('utf8');
        requireUniqueJsonKeys(raw);
        const value = JSON.parse(raw) as { choices?: Array<{ message?: { content?: string } }> };
        const output = value.choices?.[0]?.message?.content;
        if (!output) throw new Error('Configured model returned no structured content.');
        requireUniqueJsonKeys(output);
        return JSON.parse(output) as unknown;
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}
