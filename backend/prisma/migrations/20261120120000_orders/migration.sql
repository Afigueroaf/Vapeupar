-- Pedidos guardados en la base (ADR-003).
--
-- Generada sin base de datos con
--   prisma migrate diff --from-schema <schema anterior> --to-schema prisma/schema.prisma --script
-- y revisada a mano: solo CREATE y ALTER ... ADD, nada destructivo.
--
-- * `orders`: el pedido, con los datos del cliente nulables para poder
--   anonimizarlos (Ley 1581) y la `submission_key` que hace idempotente el envío.
-- * `order_lines`: precio de catálogo al recibir y precio cobrado al confirmar.
-- * `order_consents`: la autorización de tratamiento de datos, solo inserción.
-- * `stock_movements.unit_price`: precio cobrado en las ventas, para ingresos y
--   margen. Nulable: los movimientos existentes no cambian.

-- CreateEnum
CREATE TYPE "order_status" AS ENUM ('received', 'confirmed', 'delivered', 'cancelled');

-- AlterTable
ALTER TABLE "stock_movements" ADD COLUMN     "unit_price" INTEGER;

-- CreateTable
CREATE TABLE "orders" (
    "id" UUID NOT NULL,
    "reference" TEXT NOT NULL,
    "status" "order_status" NOT NULL DEFAULT 'received',
    "customer_name" TEXT,
    "customer_phone" TEXT,
    "customer_neighborhood" TEXT,
    "subtotal" INTEGER NOT NULL,
    "delivery_fee" INTEGER,
    "cancel_reason" TEXT,
    "submission_key" UUID NOT NULL,
    "confirmed_at" TIMESTAMPTZ(3),
    "delivered_at" TIMESTAMPTZ(3),
    "cancelled_at" TIMESTAMPTZ(3),
    "anonymized_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_lines" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "list_price" INTEGER NOT NULL,
    "unit_price" INTEGER,
    "product_name" TEXT NOT NULL,
    "variant_name" TEXT NOT NULL,

    CONSTRAINT "order_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_consents" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "policy_version" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "accepted_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_consents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "orders_reference_key" ON "orders"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "orders_submission_key_key" ON "orders"("submission_key");

-- CreateIndex
CREATE INDEX "orders_status_created_at_idx" ON "orders"("status", "created_at");

-- CreateIndex
CREATE INDEX "orders_created_at_idx" ON "orders"("created_at");

-- CreateIndex
CREATE INDEX "orders_customer_phone_idx" ON "orders"("customer_phone");

-- CreateIndex
CREATE INDEX "order_lines_variant_id_idx" ON "order_lines"("variant_id");

-- CreateIndex
CREATE UNIQUE INDEX "order_lines_order_id_variant_id_key" ON "order_lines"("order_id", "variant_id");

-- CreateIndex
CREATE UNIQUE INDEX "order_consents_order_id_key" ON "order_consents"("order_id");

-- AddForeignKey
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_consents" ADD CONSTRAINT "order_consents_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Permisos del rol de la aplicación (migración 20261027015227_app_role).
-- Nada se borra: sin DELETE en ninguna de las tres tablas.
--
-- `orders` se actualiza solo en las columnas que cambian las transiciones y la
-- anonimización; referencia, subtotal, clave de envío y fecha de creación
-- quedan fijas desde la inserción. `SELECT ... FOR UPDATE` (bloqueo del pedido
-- al confirmar o cancelar) solo exige UPDATE en alguna columna.
GRANT SELECT, INSERT ON orders TO vapeupar_app;
GRANT UPDATE (
  status, customer_name, customer_phone, customer_neighborhood, delivery_fee,
  cancel_reason, confirmed_at, delivered_at, cancelled_at, anonymized_at, updated_at
) ON orders TO vapeupar_app;

-- De una línea solo se fija el precio cobrado al confirmar.
GRANT SELECT, INSERT ON order_lines TO vapeupar_app;
GRANT UPDATE (unit_price) ON order_lines TO vapeupar_app;

-- La prueba de la autorización no se modifica.
GRANT SELECT, INSERT ON order_consents TO vapeupar_app;

-- `stock_movements.unit_price` no necesita GRANT: el rol ya tiene SELECT e
-- INSERT a nivel de tabla, que alcanzan a las columnas nuevas.
