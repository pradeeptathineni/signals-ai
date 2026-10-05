/** SIGNALS takes the documented name; unequal aliases fail closed, including network controls. */
export function signalsSetting(
  key: string,
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  const current = env[`SIGNALS_${key}`];
  const legacy = env[`MAESTRO_${key}`];
  if (current !== undefined && legacy !== undefined && current !== legacy) {
    throw new Error(`Conflicting SIGNALS_${key} and MAESTRO_${key} values.`);
  }
  return current ?? legacy;
}
