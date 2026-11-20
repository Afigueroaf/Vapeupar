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

/** Cuerpo de `location <prefijo> { ... }` (sin llaves anidadas en site.inc). */
function location(prefix: string): string {
  const match = site.match(new RegExp(`location\\s+${prefix.replace(/[/^~@]/g, '\\$&')}\\s*\\{([^}]*)\\}`));
  assert.ok(match, `falta location ${prefix}`);
  return match[1];
}

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
    const auth = location('/api/admin/auth/');
    assert.match(auth, /limit_req\s+zone=vapeupar_auth\s+burst=5\s+nodelay;/);
    // Mismos búferes que /api/: /mfa devuelve las cookies grandes (502 si no).
    assert.match(auth, /proxy_buffer_size\s+16k;/);
    assert.match(auth, /proxy_pass\s+http:\/\/vapeupar_api;/);
  });

  test('resto de la consola: límite holgado y con los búferes de /api/', () => {
    const admin = location('/api/admin/');
    assert.match(admin, /limit_req\s+zone=vapeupar_admin\s+burst=\d+\s+nodelay;/);
    assert.match(admin, /proxy_buffer_size\s+16k;/);
  });

  test('la tienda, la API pública y los estáticos no llevan limit_req', () => {
    for (const prefix of ['/api/', '/_next/static/', '/']) {
      assert.doesNotMatch(location(prefix), /limit_req/, `location ${prefix}`);
    }
  });
});
