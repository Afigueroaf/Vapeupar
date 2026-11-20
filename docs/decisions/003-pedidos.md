# ADR-003: Pedidos guardados en la base (entidad Order)

## Estado
Aceptado — 2026-11-20. Parte 1 (este ADR, modelo, migración y API) en la rama
`feat/pedidos-backend`. Parte 2 (carrito con datos y autorización, borrador de
`/privacidad` y pantalla `/admin/orders`) en `feat/pedidos-frontend`; el
carrito tiene su propio interruptor, `NEXT_PUBLIC_ORDERS_ENABLED`, que se
enciende junto con `ORDERS_ENABLED`.

**Activación en dos pasos.** La migración se aplica con la release, como todas
(`infra/deploy/migrate.mjs` ejecuta `prisma migrate deploy` al activar): es
aditiva, no toca datos existentes y es segura. El endpoint público **no**: queda
apagado tras el interruptor `ORDERS_ENABLED` (por defecto desactivado; ni
`write-env.mjs` ni `infra/` lo encienden) y solo se activa con la aprobación del
dueño, la parte 2 desplegada (carrito con datos y autorización) y la política de
datos revisada por un abogado. Apagado, `POST /api/orders` responde el 404
genérico de una ruta inexistente; las rutas de consola funcionan igual.

Decisiones del dueño que lo originan (Deathnote, 2026-11-19):

- `dec-como-llega-el-pedido-a-la-consola`: opción 3, **entidad Order creada al
  enviar el pedido por WhatsApp**.
- `dec-datos-del-cliente-que-se-guardan`: opción 2, **nombre, teléfono y barrio**,
  conforme a la Ley 1581 de 2012.
- `dec-cuando-se-descuenta-el-stock`: opción 1, **al confirmar por chat** desde la
  consola. Un pedido recibido no reserva stock; una cancelación posterior a la
  confirmación se registra como devolución.
- `dec-registrar-el-precio-cobrado`: opción 1, **precio unitario cobrado y
  domicilio**, en la misma migración.

Complementa [ADR-001](001-stack-and-architecture.md) §3 (el cierre sigue siendo
por WhatsApp, sin pasarela de pago) y [ADR-002](002-consola-de-administracion-y-persistencia.md)
§2 (el libro de movimientos sigue siendo la autoridad del stock).

## Contexto

El carrito (`frontend/src/lib/cart.ts`) genera un mensaje de WhatsApp con una
referencia `VP-XXXXXX` (`frontend/src/lib/order-message.ts`). La tienda confirma
disponibilidad y domicilio por chat, entrega verificando la cédula (+18) y
registra a mano un movimiento `sale` por variante en `/admin/stock`. De ahí:

1. Un pedido de tres sabores son tres formularios, y nada impide registrar dos
   veces el mismo pedido ni olvidar una línea.
2. La referencia VP no queda en ningún sitio: no se puede cruzar un chat con su
   venta.
3. No se guarda el precio cobrado ni el domicilio: no hay ingresos ni margen.
4. El precio del mensaje lo calculó el navegador del cliente; nada lo contrasta
   con el catálogo.

## Decisión

### 1. El pedido nace en el servidor al enviarlo

Al pulsar «Enviar pedido», el sitio hace `POST /api/orders` con las líneas
(`variantId`, cantidad), los datos del cliente y su autorización de tratamiento
de datos. El backend:

- valida el cuerpo con Zod en modo estricto (un campo de más es 400);
- **toma el precio del catálogo**, nunca del cliente: el cuerpo no tiene campo de
  precio;
- exige que cada variante esté activa, en una línea publicada con precio, y con
  disponible suficiente en ese momento (comprobación orientativa: **no reserva**);
- **genera la referencia `VP-XXXXXX`** con el mismo alfabeto que el frontend (sin
  0/O ni 1/I/L) y reintenta ante colisión. Una referencia propuesta por el
  navegador permitiría adivinar u ocupar referencias ajenas;
- responde solo `{ reference, subtotal }`: ni identificadores internos, ni datos
  del cliente, ni nada de otros pedidos.

El sitio abre después WhatsApp con esa referencia (parte 2). Un reintento con la
misma `submissionKey` (UUID que el navegador genera una vez por envío) devuelve
el mismo pedido en vez de crear otro.

### 2. Estados y transiciones

```
recibido ──confirmar──▶ confirmado ──entregar──▶ entregado
   │                        │
   └──cancelar──▶ cancelado ◀──cancelar (devuelve el stock)
```

| Transición | Efecto en stock | Quién |
|---|---|---|
| (crear) → `received` | ninguno | público, con límite de peticiones |
| `received` → `confirmed` | un movimiento `sale` por línea, en una sola transacción | owner, operator |
| `confirmed` → `delivered` | ninguno | owner, operator |
| `received` → `cancelled` | ninguno | owner, operator |
| `confirmed` → `cancelled` | un movimiento `return` por línea, en una sola transacción | owner, operator |
| anonimizar (solo `delivered` o `cancelled`) | ninguno | **owner** |
| aplicar el plazo de conservación | ninguno | **owner** |

`delivered` y `cancelled` son finales. Una devolución después de entregar no
reabre el pedido: se registra a mano como movimiento `return` con la referencia en
`lot`, como hoy.

**Confirmar** fija el domicilio (`deliveryFee`) y el **precio unitario cobrado**
de cada línea, que por defecto es el de catálogo al recibir el pedido. Cobrar
**otro** precio que el de catálogo (descuento) exige rol **owner**: el operator
confirma a precio de lista. Es la misma regla de ADR-002 de que el precio lo
gobierna el dueño. Si una línea no tiene stock suficiente, no se registra
ninguna y la respuesta dice cuál falla.

**Idempotencia.** Los movimientos usan `operationKey` derivado del pedido y la
variante (`order:<id>:sale:<variantId>`, `order:<id>:return:<variantId>`) y la
referencia VP en `lot`. Un doble clic en «Confirmar» no duplica nada: el pedido
está bloqueado en la transacción y la segunda petición ve el estado ya cambiado;
si trae los mismos datos responde 200 con `replayed: true`, y si trae otros, 409.

Editar las líneas de un pedido recibido (cambiar un sabor por otro, bajar
cantidades) queda fuera de esta parte: el operador cancela y el cliente vuelve a
enviar, o registra la diferencia a mano.

### 3. Modelo

- `orders`: referencia única, estado, datos del cliente (nulables para poder
  anonimizar), `subtotal` a precio de catálogo al recibir, `delivery_fee` y
  fechas de cada transición, `cancel_reason`, `anonymized_at`, `submission_key`
  única.
- `order_lines`: variante, cantidad, `list_price` (catálogo al recibir) y
  `unit_price` (cobrado, se fija al confirmar), con copia del nombre de línea y
  variante para que el pedido se lea igual aunque se renombre el catálogo. Una
  variante aparece una sola vez por pedido.
- `order_consents`: la autorización de tratamiento (versión de la política
  aceptada, finalidad, fecha del servidor). **Solo inserción** para el rol de la
  aplicación: es la prueba de la autorización y sobrevive a la anonimización.
- `stock_movements.unit_price`: precio unitario cobrado en las ventas (nulable;
  las ventas manuales y los demás tipos lo dejan vacío). Con `unit_cost` de los
  ingresos habilita ingresos y margen.

### 4. Datos personales (Ley 1581 de 2012)

- **Qué se guarda**: nombre, teléfono móvil colombiano y barrio. Nada más: ni
  dirección exacta, ni cédula (se verifica en la entrega y no se anota), ni IP.
- **Finalidad limitada**: gestionar el pedido (confirmar disponibilidad,
  domicilio y entrega) y reconocer al cliente recurrente en la consola. No
  publicidad, no cesión a terceros.
- **Autorización explícita**: el cuerpo exige `consent.accepted: true` y la
  versión vigente de la política (`DATA_POLICY_VERSION` en
  `backend/src/schemas/order.schema.ts`). Se registra la versión y la fecha del
  servidor en `order_consents`. Una versión distinta de la vigente se rechaza.
- **Acceso**: solo usuarios de la consola (owner y operator), tras sesión con
  TOTP. El endpoint público no devuelve datos personales nunca. La auditoría
  (`audit_logs`) **no** copia nombre, teléfono ni barrio.
- **Supresión a petición**: el owner anonimiza un pedido entregado o cancelado
  (`POST /api/admin/orders/:id/anonymize`): nombre, teléfono y barrio pasan a
  nulo y queda `anonymized_at`. Si el pedido sigue abierto, primero se cancela.
  El pedido, sus líneas y sus movimientos se conservan: son contabilidad, no dato
  personal.
- **Plazo de conservación** (propuesto, ajustable tras la revisión legal):
  - pedidos entregados o cancelados: datos personales anonimizados a los
    **365 días** de cerrarse;
  - pedidos recibidos que nunca se confirmaron: se cancelan como caducados y se
    anonimizan a los **30 días**.
  Lo aplica `POST /api/admin/orders/retention` (owner); en la parte 2 se decide
  si se programa.
- **Cifrado en reposo**: la base es RDS con `storageEncrypted: true`
  (`infra/lib/data-stack.ts`). Las copias automáticas conservan los datos
  anonimizados durante su retención (1 día en dev, 7 en prod) y caducan solas.
- **Política de datos**: el texto es un **borrador pendiente de revisión legal**.
  Este ADR no lo redacta: fija solo el contrato (versión, finalidad, plazos y
  procedimiento). Elementos que la política tendrá que cubrir: responsable y
  contacto, finalidad, datos tratados, derechos del titular (conocer, actualizar,
  rectificar, suprimir, revocar), canal para ejercerlos (WhatsApp de la tienda),
  plazos de respuesta y vigencia. Cambiar el texto obliga a subir
  `DATA_POLICY_VERSION`.

### 5. Superficie pública y abuso

- `POST /api/orders` tiene su **propio límite de peticiones**: 10 pedidos por IP
  cada 15 minutos (`rateLimits.ordersMax`), además del general de `/api`. Solo
  cuentan los que crean o repiten un pedido (`skipFailedRequests`): en redes
  móviles con CGNAT muchos clientes comparten IP, y un teléfono mal escrito o
  una línea agotada no deben gastarles el cupo. Los cuerpos inválidos no
  escriben nada y los frena el límite general. El cuerpo público ya está
  limitado a 20 kB y el pedido a 20 líneas de hasta 10 unidades (`MAX_PER_LINE`
  del carrito).
- **Interruptor `ORDERS_ENABLED`**: sin él a `true`, la ruta no se monta. Se
  eligió 404 y no 503 porque, mientras está apagado, nada legítimo la llama (el
  carrito de la parte 2 aún no existe) y un 503 anunciaría una función que no
  está abierta; el 404 es indistinguible de cualquier ruta inexistente.
- Un JSON mal formado o demasiado grande responde `400`/`413` y el registro
  guarda solo el tipo de error, nunca el cuerpo (que traería nombre y teléfono).
- Un pedido recibido no bloquea stock, así que el spam no puede agotar el
  catálogo: como mucho, ensucia la bandeja de pedidos, y caduca a los 30 días.
- Sin captcha por ahora. Si aparece spam real, se añade (Turnstile) sin cambiar
  el modelo.

### 6. Revalidación del sitio

Confirmar y cancelar un pedido confirmado cambian el stock: tras la transacción
se llama a `notifySite(['catalogo'])` como en los movimientos manuales (A7.3), y
su fallo no cambia la respuesta (`meta.revalidated`).

## Alternativas consideradas

| Alternativa | Por qué no |
|---|---|
| **Enlace en el mensaje con el carrito codificado** | Sin datos personales ni endpoint público, pero sin historial de pedidos ni de clientes, y expone la ruta `/admin` en el chat. El dueño eligió la entidad |
| **Registro manual por lotes** | Lo más simple, pero la referencia y los datos del pedido siguen viviendo solo en el chat |
| **Reservar stock al recibir** | Exige reservas que caducan y su limpieza, y convierte el spam en stock bloqueado. El dueño eligió descontar al confirmar |
| **Descontar al entregar** | El sitio seguiría ofreciendo unidades ya comprometidas entre confirmación y entrega |
| **Referencia generada en el navegador** | Es lo de hoy, pero un cliente podría adivinar u ocupar referencias de otros |
| **Precio solo en las líneas del pedido** | Las ventas manuales no tendrían precio; `unit_price` en el movimiento lo deja en el libro para todas |
| **Guardar la IP para el límite o como prueba** | Es dato personal sin finalidad clara; la prueba de la autorización es la versión y la fecha |

## Consecuencias

**A favor**

- El pedido completo se confirma en un paso y genera todos sus movimientos o
  ninguno; la referencia VP queda en el pedido y en `lot` de cada movimiento.
- Ingresos y margen por línea y por mes (`unit_price` frente a `unit_cost`).
- El precio cobrado sale del catálogo, no del navegador.

**En contra / costos asumidos**

- Obligaciones de habeas data: política publicada, casilla de autorización,
  atender solicitudes de supresión y aplicar el plazo de conservación.
- Un endpoint público nuevo con escritura en la base: superficie de abuso
  acotada por el límite de peticiones y por no reservar stock.
- El rol de la aplicación gana `UPDATE` sobre `orders` y `order_lines` (estado,
  precio cobrado, anonimización) y `INSERT` sobre `order_consents`; ningún
  `DELETE`.
- El frontend tiene que pedir los datos y la autorización antes de abrir
  WhatsApp, y abrirlo con la referencia del servidor (parte 2).

## Invariantes que este ADR añade

1. El precio de un pedido sale del catálogo en el servidor; el cliente nunca lo
   envía.
2. Solo `StockService` escribe movimientos; confirmar y cancelar usan su
   operación dentro de la transacción del pedido.
3. Ningún endpoint público devuelve datos personales, y la auditoría no los copia.
4. Un pedido recibido no altera el stock.
5. Nada de un pedido se borra físicamente: los datos personales se anonimizan.
