// Límite de peticiones de nginx (F7). No sustituye a `nginx -t` (que se ejecuta
// en la instancia en cada despliegue, activate.sh), pero fija lo que un
// `nginx -t` en verde no garantiza: los valores acordados en
// dec-proteccion-perimetral y que la tienda pública no se limite.
//
//   npm run test --workspace=infra
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, test } from 'node:test';

const dir = path.resolve(__dirname, '..', 'deploy', 'nginx');
/** Sin comentarios, para no contar directivas citadas en ellos. */
const read = (file: string) =>
  readFileSync(path.join(dir, file), 'utf8')
    .split('\n')
    .map((line) => line.replace(/#.*$/, ''))
    .join('\n');

const mainConf = read('nginx.conf');
const site = read('vapeupar-site.inc');

type Location = { modifier: string; pattern: string; body: string };

/** Las `location` de site.inc en orden (sin llaves anidadas en site.inc). */
const locations: Location[] = [...site.matchAll(/location\s+(?:(\^~|~\*?|=)\s+)?(\S+)\s*\{([^}]*)\}/g)].map(
  (m) => ({ modifier: m[1] ?? '', pattern: m[2], body: m[3] }),
);

/** Cuerpo de la location con ese patrón exacto (`/api/`, `^/api/(?i:admin/)`...). */
function location(pattern: string): string {
  const found = locations.find((l) => l.pattern === pattern);
  assert.ok(found, `falta location ${pattern}`);
  return found.body;
}

/**
 * La location que elige nginx para una URI (sin `=`, que site.inc no usa): el
 * prefijo más largo; si es `^~`, ese; si no, la PRIMERA regex que coincida, y
 * si ninguna, el prefijo. Node 24 entiende `(?i:...)` igual que PCRE.
 */
function pick(uri: string): string {
  const prefix = locations
    .filter((l) => (l.modifier === '' || l.modifier === '^~') && !l.pattern.startsWith('@') && uri.startsWith(l.pattern))
    .sort((a, b) => b.pattern.length - a.pattern.length)[0];
  if (prefix?.modifier !== '^~') {
    const regex = locations.find(
      (l) => l.modifier.startsWith('~') && new RegExp(l.pattern, l.modifier === '~*' ? 'i' : '').test(uri),
    );
    if (regex) return regex.pattern;
  }
  assert.ok(prefix, `ninguna location para ${uri}`);
  return prefix.pattern;
}

const AUTH = '^/api/(?i:admin/auth/)';
const ADMIN = '^/api/(?i:admin/)';

describe('nginx: límite de peticiones (F7)', () => {
  test('las zonas se definen en nginx.conf (contexto http) y no en site.inc', () => {
    assert.match(mainConf, /limit_req_zone\s+\$binary_remote_addr\s+zone=vapeupar_auth:\d+m\s+rate=10r\/m;/);
    assert.match(mainConf, /limit_req_zone\s+\$binary_remote_addr\s+zone=vapeupar_admin:/);
    assert.match(mainConf, /limit_conn_zone\s+\$binary_remote_addr\s+zone=vapeupar_conn:/);
    assert.match(mainConf, /limit_req_status\s+429;/);
    assert.match(mainConf, /limit_conn_status\s+429;/);
    assert.doesNotMatch(site, /limit_(req|conn)_zone/);
    // Las zonas tienen que estar antes del include del sitio.
    assert.ok(mainConf.indexOf('limit_req_zone') < mainConf.indexOf('include /etc/nginx/conf.d/'));
  });

  test('toda zona que usa site.inc existe en nginx.conf', () => {
    const used = [...site.matchAll(/limit_(?:req|conn)\s+(?:zone=)?(\w+)/g)].map((m) => m[1]);
    assert.ok(used.length >= 3);
    for (const zone of used) assert.match(mainConf, new RegExp(`zone=${zone}:`), `zona ${zone} sin definir`);
  });

  test('login: ráfaga 5 sin espera, así la 7.ª petición seguida recibe 429', () => {
    const auth = location(AUTH);
    assert.match(auth, /limit_req\s+zone=vapeupar_auth\s+burst=5\s+nodelay;/);
    // Mismos búferes que /api/: /mfa devuelve las cookies grandes (502 si no).
    assert.match(auth, /proxy_buffer_size\s+16k;/);
    assert.match(auth, /proxy_pass\s+http:\/\/vapeupar_api;/);
  });

  test('resto de la consola: límite holgado y con los búferes de /api/', () => {
    const admin = location(ADMIN);
    assert.match(admin, /limit_req\s+zone=vapeupar_admin\s+burst=\d+\s+nodelay;/);
    assert.match(admin, /proxy_buffer_size\s+16k;/);
  });

  test('el login no se salta con mayúsculas (Express no las distingue) y nada más cae en las zonas', () => {
    const expected: Record<string, string> = {
      '/api/admin/auth/login': AUTH,
      '/api/admin/AUTH/login': AUTH,
      '/api/ADMIN/Auth/mfa': AUTH,
      '/api/admin/auth/new-password': AUTH,
      '/api/admin/products': ADMIN,
      '/api/Admin/products': ADMIN,
      '/api/admin/image-uploads/presign': ADMIN,
      '/api/products': '/api/',
      '/api/administradores': '/api/',
      '/API/admin/auth/login': '/', // nginx no lo manda al backend: va al frontend
      '/internal/revalidate': '/internal/',
      '/_next/static/chunks/app.js': '/_next/static/',
      '/': '/',
      '/productos/admin/auth/x': '/',
    };
    for (const [uri, want] of Object.entries(expected)) assert.equal(pick(uri), want, uri);
  });

  test('la tienda, la API pública y los estáticos no llevan limit_req', () => {
    for (const prefix of ['/api/', '/_next/static/', '/']) {
      assert.doesNotMatch(location(prefix), /limit_req/, `location ${prefix}`);
    }
  });
});
