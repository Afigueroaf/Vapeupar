import { describe, expect, it, vi } from 'vitest';
import { createSiteRevalidator, DEFAULT_REVALIDATE_URL, SITE_TAGS } from './site-revalidation.service.js';
import * as frontTags from '../../../frontend/src/lib/cache-tags.js';
import { isRevalidateAuthorized } from '../../../frontend/src/lib/revalidate-auth.js';

const ok = () => new Response('{}', { status: 200 });

describe('notificador del sitio (A7.3)', () => {
  it('manda las etiquetas con el secreto como Bearer a la ruta interna', async () => {
    const fetch = vi.fn(async () => ok());
    const revalidate = createSiteRevalidator({ secret: 's3cr3t', fetch });

    expect(await revalidate(['catalogo', 'catalogo', 'contenido'])).toBe(true);

    expect(fetch).toHaveBeenCalledOnce();
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(DEFAULT_REVALIDATE_URL);
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer s3cr3t');
    expect(JSON.parse(init.body as string)).toEqual({ tags: ['catalogo', 'contenido'] });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('sin secreto no llama a nadie y devuelve false', async () => {
    const fetch = vi.fn(async () => ok());
    expect(await createSiteRevalidator({ fetch })(['catalogo'])).toBe(false);
    expect(await createSiteRevalidator({ secret: '', fetch })(['catalogo'])).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('una respuesta 500 (o 401) es false y un aviso, no una excepción', async () => {
    const warn = vi.fn();
    const revalidate = createSiteRevalidator({
      secret: 's', warn, fetch: vi.fn(async () => new Response('', { status: 500 }))
    });
    expect(await revalidate(['contenido'])).toBe(false);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('500'));
  });

  it('con el frontend apagado tampoco lanza', async () => {
    const warn = vi.fn();
    const revalidate = createSiteRevalidator({
      secret: 's', warn, fetch: vi.fn(async () => { throw new TypeError('fetch failed'); })
    });
    expect(await revalidate(['catalogo'])).toBe(false);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('fetch failed'));
  });

  it('corta a los timeoutMs si el frontend no contesta', async () => {
    const warn = vi.fn();
    // Un fetch que solo termina cuando se aborta su señal, como uno real colgado.
    const hanging = vi.fn((_url: string | URL | Request, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal!.reason));
      }));
    const revalidate = createSiteRevalidator({ secret: 's', warn, timeoutMs: 20, fetch: hanging as typeof fetch });

    const started = Date.now();
    expect(await revalidate(['catalogo'])).toBe(false);
    expect(Date.now() - started).toBeLessThan(1000);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('sin respuesta'));
  });
});

describe('contrato con el frontend', () => {
  it('las etiquetas son las mismas en los dos lados', () => {
    expect([...frontTags.SITE_TAGS].sort()).toEqual([...SITE_TAGS].sort());
  });

  it('la ruta acepta exactamente la cabecera que manda el backend', async () => {
    const fetch = vi.fn(async () => ok());
    await createSiteRevalidator({ secret: 'el-secreto', fetch })(['catalogo']);
    const [, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    const header = (init.headers as Record<string, string>).Authorization;

    expect(isRevalidateAuthorized(header, 'el-secreto')).toBe(true);
  });

  it('rechaza secretos incorrectos, de otra longitud o mal formados', () => {
    expect(isRevalidateAuthorized('Bearer otro', 'el-secreto')).toBe(false);
    expect(isRevalidateAuthorized('Bearer el-secreto-y-mas', 'el-secreto')).toBe(false);
    expect(isRevalidateAuthorized('el-secreto', 'el-secreto')).toBe(false);
    expect(isRevalidateAuthorized('Basic el-secreto', 'el-secreto')).toBe(false);
    expect(isRevalidateAuthorized(null, 'el-secreto')).toBe(false);
    // Un servidor sin secreto no acepta a nadie, ni siquiera con «Bearer ».
    expect(isRevalidateAuthorized('Bearer ', '')).toBe(false);
  });
});
