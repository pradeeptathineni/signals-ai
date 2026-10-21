import { realpath } from 'node:fs/promises';
import { basename, dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { isFileLoadingAllowed, normalizePath, type Connect, type ResolvedConfig } from 'vite';

function contains(root: string, file: string): boolean {
  const path = relative(root, file);
  return path === '' || (path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path));
}

// Resolve existing parents too: missing routes can still cross a directory symlink
async function physicalPath(file: string): Promise<string> {
  try {
    return await realpath(file);
  } catch (error) {
    if (!['ENOENT', 'ENOTDIR'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error;
    const parent = dirname(file);
    if (parent === file) throw error;
    return resolve(await physicalPath(parent), basename(file));
  }
}

export async function assetGuard(
  config: ResolvedConfig,
  queryDirectory: string,
  preview = false,
): Promise<Connect.NextHandleFunction> {
  const output = resolve(config.root, config.build.outDir);
  const physicalOutput = preview ? await realpath(output) : '';
  const privateQueries = await physicalPath(queryDirectory);
  const physicalConfig = {
    ...config,
    server: {
      ...config.server,
      fs: {
        ...config.server.fs,
        allow: await Promise.all(config.server.fs.allow.map(physicalPath)),
      },
    },
  };
  async function allowed(file: string): Promise<boolean> {
    const physical = await physicalPath(file);
    if (preview) return contains(output, file) && contains(physicalOutput, physical);
    return (
      isFileLoadingAllowed(config, normalizePath(file)) &&
      isFileLoadingAllowed(physicalConfig, normalizePath(physical)) &&
      !contains(privateQueries, physical)
    );
  }
  return (request, response, next) => {
    void (async () => {
      // Run before Vite's base rewriting, cached transforms, public and static serving
      const raw = request.url?.split(/[?#]/, 1)[0] ?? '';
      let path: string;
      try {
        path = decodeURIComponent(raw);
      } catch {
        throw new Error('invalid_asset_path');
      }
      if (!path.startsWith('/') || /[\\\0%]/.test(path)) throw new Error('invalid_asset_path');
      if (path.startsWith(config.base)) path = `/${path.slice(config.base.length)}`;
      const files = preview
        ? [
            resolve(output, `.${path}`),
            resolve(output, `.${path}.html`),
            resolve(output, `.${path}/index.html`),
            resolve(output, 'index.html'),
          ]
        : path.startsWith('/@fs/')
          ? [resolve(path.slice('/@fs'.length))]
          : [
              resolve(config.root, `.${path}`),
              ...(config.publicDir ? [resolve(config.publicDir, `.${path}`)] : []),
            ];
      for (const file of files) if (!(await allowed(file))) throw new Error('private_asset');
      next();
    })().catch(() => {
      response.writeHead(403, { 'content-type': 'text/plain' });
      response.end('Forbidden');
    });
  };
}
