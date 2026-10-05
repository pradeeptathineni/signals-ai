import { expect, it } from 'vitest';
import { signalsSetting } from './configuration.js';
it('accepts either name and identical aliases, rejects conflicting settings', () => {
  expect(signalsSetting('HOST', { MAESTRO_HOST: '127.0.0.1' })).toBe('127.0.0.1');
  expect(signalsSetting('HOST', { SIGNALS_HOST: 'localhost' })).toBe('localhost');
  expect(signalsSetting('HOST', { SIGNALS_HOST: 'localhost', MAESTRO_HOST: 'localhost' })).toBe(
    'localhost',
  );
  expect(() =>
    signalsSetting('ALLOW_NETWORK_FETCH', {
      SIGNALS_ALLOW_NETWORK_FETCH: 'false',
      MAESTRO_ALLOW_NETWORK_FETCH: 'true',
    }),
  ).toThrow('Conflicting');
});
