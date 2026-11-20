# Cuerpo común del sitio de Vapeupar: lo incluyen las dos variantes,
# `vapeupar.conf` (solo HTTP) y `vapeupar-tls.conf` (HTTPS). activate.sh lo
# instala en /etc/nginx/vapeupar/site.inc, fuera de conf.d para que nginx no
# lo cargue por su cuenta como si fuera un sitio.
#
#   /api/admin/auth/* -> backend, con límite estricto (zona vapeupar_auth)
#   /api/admin/*      -> backend, con límite holgado (zona vapeupar_admin)
#   /api/*            -> backend  127.0.0.1:4000
#   /internal/*       -> 404 (solo el backend llega, por loopback)
#   /_next/static/*   -> disco, directamente (sin pasar por Node)
#   resto             -> frontend 127.0.0.1:3000

# Cuerpo máximo: el JSON más grande es el de la consola (256 kB,
# `ADMIN_BODY_LIMIT` en backend/src/app.ts) más margen. Las imágenes NO
# pasan por aquí: el navegador las sube directo a S3 con URL firmada.
client_max_body_size 300k;

# Límite de peticiones (F7). Las zonas y el código 429 están en nginx.conf
# (contexto `http`). Simultáneas por IP en TODO el sitio, estáticos incluidos:
# 100 es mucho más de lo que abre un navegador cargando la tienda, así que solo
# lo nota quien abre cientos de peticiones a la vez.
limit_conn vapeupar_conn 100;

# Cuando el que corta es nginx, la consola recibe el mismo sobre JSON que da
# Express (`{ success, message }`): admin-api.ts muestra `message`, y sin esto
# mostraría la página HTML de error de nginx. Los 429 de Express no pasan por
# aquí (sin `proxy_intercept_errors`, nginx deja pasar la respuesta tal cual).
error_page 429 @vapeupar_429;
location @vapeupar_429 {
    default_type application/json;
    add_header Retry-After 60 always;
    return 429 '{"success":false,"message":"Demasiadas solicitudes. Espera un minuto antes de volver a intentarlo."}';
}

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

# Inicio de sesión, cambio de contraseña, MFA y cierre de sesión: las únicas
# rutas de /api/admin/auth/ (todas POST). 10/min por IP con ráfaga de 5 sin
# espera: un inicio de sesión completo son 2 o 3 peticiones, y de la 7.ª
# seguida en adelante responde nginx con 429 sin despertar a Node. Varios
# administradores detrás de la misma IP comparten el cupo (ver riesgos de F7).
location /api/admin/auth/ {
    limit_req zone=vapeupar_auth burst=5 nodelay;
    proxy_pass http://vapeupar_api;
    # Los mismos búferes que /api/ (ver allí): /mfa es justo la respuesta que
    # trae las cookies grandes. Las location hermanas no se heredan.
    proxy_buffer_size 16k;
    proxy_buffers 8 16k;
    proxy_busy_buffers_size 32k;
}

# Resto de la consola, presign de imágenes incluido. Holgado a propósito: el
# límite que nota un administrador es el de Express (30/min); este solo frena
# inundaciones. Una pantalla de la consola pide varias cosas a la vez, de ahí
# la ráfaga grande.
location /api/admin/ {
    limit_req zone=vapeupar_admin burst=60 nodelay;
    proxy_pass http://vapeupar_api;
    proxy_buffer_size 16k;
    proxy_buffers 8 16k;
    proxy_busy_buffers_size 32k;
}

# API pública (catálogo, contenido): sin límite en nginx, solo el de Express
# (100/min por IP). El sitio la pide desde el servidor por loopback
# (127.0.0.1:4000, ISR), no por aquí, y un visitante no debe notar nada.
location /api/ {
    proxy_pass http://vapeupar_api;

    # Cabeceras de respuesta grandes: al iniciar sesión (o completar la MFA) el
    # backend fija las cookies con los tokens de Cognito —acceso, identidad y
    # renovación—, varios KB en total. El búfer por defecto es de una página
    # (4 KB) y nginx respondía 502 «upstream sent too big header» justo en
    # POST /api/admin/auth/mfa (2026-11-17). En local no se veía: allí no hay
    # nginx delante.
    proxy_buffer_size 16k;
    proxy_buffers 8 16k;
    proxy_busy_buffers_size 32k;
}

# Rutas internas de Next (A7.3): `/internal/revalidate` la llama SOLO el
# backend, directo a 127.0.0.1:3000. Desde fuera no existe, aunque el secreto
# la proteja igual. `^~` para que ninguna location con expresión regular que
# se añada después pueda adelantarse a esta.
location ^~ /internal/ {
    return 404;
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
