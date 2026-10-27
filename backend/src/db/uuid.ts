const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Las columnas de id son `uuid`: un valor con otro formato haría fallar la consulta. */
export function isUuid(value: string): boolean {
  return UUID.test(value);
}
