/**
 * Auditoría de escrituras (ADR-002, plan A3.2). Todo servicio que escriba
 * precio, stock, estado de publicación o contenido registra aquí el antes y el
 * después, dentro de la misma transacción que la escritura: por eso recibe el
 * destino (`AuditSink`) del repositorio en lugar de tener uno propio.
 */
/** Quién firma una escritura. Sale de la sesión, nunca del cuerpo. */
export interface Author {
  userId: string;
}

export interface AuditEntry {
  /** Nulo solo para procesos sin usuario (comandos de mantenimiento). */
  userId: string | null;
  /** Entidad afectada, en singular y en inglés como el esquema: `variant`, `product`. */
  entity: string;
  entityId: string;
  /** Verbo con espacio de nombres: `stock.inbound`, `stock.reconcile`, `product.publish`. */
  action: string;
  before?: unknown;
  after?: unknown;
}

/** Fila lista para guardar: `before` y `after` ya son JSON. */
export interface AuditRecord {
  userId: string | null;
  entity: string;
  entityId: string;
  action: string;
  before: JsonValue | undefined;
  after: JsonValue | undefined;
}

export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export interface AuditSink {
  write(record: AuditRecord): Promise<void>;
}

/** `Date` pasa a ISO y `undefined` desaparece, igual que en `JSON.stringify`. */
function toJson(value: unknown): JsonValue | undefined {
  return value === undefined ? undefined : (JSON.parse(JSON.stringify(value)) as JsonValue);
}

export async function recordAudit(sink: AuditSink, entry: AuditEntry): Promise<void> {
  if (!entry.entity || !entry.entityId || !entry.action) {
    throw new Error('Auditoría incompleta: entity, entityId y action son obligatorios');
  }
  await sink.write({
    userId: entry.userId,
    entity: entry.entity,
    entityId: entry.entityId,
    action: entry.action,
    before: toJson(entry.before),
    after: toJson(entry.after)
  });
}
