# Cuerpo común del sitio de Vapeupar: lo incluyen las dos variantes,
# `vapeupar.conf` (solo HTTP) y `vapeupar-tls.conf` (HTTPS). activate.sh lo
# instala en /etc/nginx/vapeupar/site.inc, fuera de conf.d para que nginx no
# lo cargue por su cuenta como si fuera un sitio.
#
#   /api/*            -> backend  127.0.0.1:4000
#   /_next/static/*   -> disco, directamente (sin pasar por Node)
#   resto             -> frontend 127.0.0.1:3000

# Cuerpo máximo: el JSON más grande es el de la consola (256 kB,
# `ADMIN_BODY_LIMIT` en backend/src/app.ts) más margen. Las imágenes NO
# pasan por aquí: el navegador las sube directo a S3 con URL firmada.
client_max_body_size 300k;

# Conexiones persistentes a los upstream (necesita HTTP/1.1 y vaciar
# `Connection`; sin esto cada petición abre un socket nuevo).
proxy_http_version 1.1;
proxy_set_header Connection "";

proxy_set_header Host $host;
# `$scheme` es el del bloque que incluye esto: https detrás de TLS. El backend
# lo necesita (con TRUST_PROXY=1) para tratar la petición como segura.
proxy_set_header X-Forwarded-Proto $scheme;
# SE SUSTITUYE, NO SE AÑADE ($proxy_add_x_forwarded_for). Con
# `TRUST_PROXY=1` el backend se cree el último salto, y así ese salto es
# SIEMPRE la IP que ve nginx: un cliente que mande su propio
# X-Forwarded-For no consigue saltarse el límite de peticiones haciéndose
# pasar por otro. Si algún día se pone CloudFront delante, esto cambia a
# `$proxy_add_x_forwarded_for` y TRUST_PROXY a 2.
proxy_set_header X-Forwarded-For $remote_addr;
proxy_set_header X-Real-IP $remote_addr;

location /api/ {
    proxy_pass http://vapeupar_api;
}

# Recursos con hash en el nombre: inmutables por definición. Se sirven
# desde disco para que el proceso de Node, en una instancia de 1 GB, no
# gaste memoria ni CPU en copiar archivos. Si un archivo no existe se
# responde 404 aquí, sin molestar a Next.
location /_next/static/ {
    alias /opt/vapeupar/current/web/frontend/.next/static/;
    add_header Cache-Control "public, max-age=31536000, immutable";
    access_log off;
}

location / {
    proxy_pass http://vapeupar_web;
}
