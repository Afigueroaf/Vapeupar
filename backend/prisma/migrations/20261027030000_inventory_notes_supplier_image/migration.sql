-- AlterTable
ALTER TABLE "suppliers" ADD COLUMN "image_key" TEXT;

-- CreateTable
CREATE TABLE "inventory_notes" (
    "id" UUID NOT NULL,
    "variant_id" UUID,
    "text" TEXT NOT NULL,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "author_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "resolved_at" TIMESTAMPTZ(3),

    CONSTRAINT "inventory_notes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "inventory_notes_variant_id_resolved_created_at_idx" ON "inventory_notes"("variant_id", "resolved", "created_at");

-- CreateIndex
CREATE INDEX "inventory_notes_resolved_created_at_idx" ON "inventory_notes"("resolved", "created_at");

-- AddForeignKey
ALTER TABLE "inventory_notes" ADD CONSTRAINT "inventory_notes_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_notes" ADD CONSTRAINT "inventory_notes_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Permisos del rol de la aplicación (migración 20261027015227_app_role).
-- Las notas se leen, se crean y se resuelven; no se borran.
GRANT SELECT, INSERT, UPDATE ON inventory_notes TO vapeupar_app;
