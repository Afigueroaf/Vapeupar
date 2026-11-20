import { createHash } from 'node:crypto';
import { relative, resolve, isAbsolute, sep as pathSep } from 'node:path';

/**
 * Planilla del conteo físico inicial (item `carga-datos-reales` del Deathnote).
 * Lógica pura, sin base de datos: el CSV, la validación de cada fila y el plan
 * de movimientos. La escritura la hace `InitialCountService` con
 * `stockService.recordMovement`, que audita y aplica la idempotencia.
 *
 * Formato: UTF-8 con BOM y `;` como separador. Excel en español (Colombia usa
 * coma decimal, así que su separador de listas es `;`) abre así el archivo con
 * doble clic, columnas separadas y tildes bien; sin BOM lo leería como ANSI.
 * Al importar se acepta también `,` y un archivo guardado por Excel como
 * «CSV (delimitado por comas)», que va en Windows-1252 sin BOM.
 */

export const CSV_SEPARATOR = ';';
export const UTF8_BOM = String.fromCharCode(0xfeff);

/** Columnas de la planilla, en orden. Solo `cantidad`, `costoUnitario` y `proveedor` se rellenan. */
export const COUNT_COLUMNS = [
  'variantId',
  'marca',
  'linea',
  'variante',
  'lineSlug',
  'variantSlug',
  'stockSistema',
  'cantidad',
  'costoUnitario',
  'proveedor'
] as const;

const REQUIRED_COLUMNS = ['variantId', 'lineSlug', 'variantSlug', 'cantidad', 'costoUnitario'] as const;

/** Topes de cordura: un valor por encima casi seguro es un error de tecleo. */
export const MAX_QUANTITY = 100_000;
export const MAX_UNIT_COST = 10_000_000;

const OPERATION_KEY_MAX = 100;
const KEY_PREFIX = 'conteo-inicial';
const BATCH_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$/;

export interface CountVariant {
  id: string;
  slug: string;
  name: string;
  active: boolean;
  stockCache: number;
  sortOrder: number;
  productSlug: string;
  productName: string;
  brandName: string;
}

export interface CountSupplier {
  id: string;
  name: string;
  active: boolean;
}

// --- CSV

export class CsvError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CsvError';
  }
}

export interface CsvRecord {
  /** Número de fila tal como lo muestra Excel: la cabecera es la 1. */
  row: number;
  fields: string[];
}

/** Texto del archivo: UTF-8 (con o sin BOM) o, si no es UTF-8 válido, Windows-1252. */
export function decodeCsv(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
}

function escapeField(value: string, separator: string): string {
  return /["\r\n]/.test(value) || value.includes(separator) || value !== value.trim()
    ? `"${value.replace(/"/g, '""')}"`
    : value;
}

/** CSV con BOM, `;` y fin de línea CRLF, como lo escribe Excel en Windows. */
export function toCsv(rows: readonly (readonly string[])[], separator = CSV_SEPARATOR): string {
  return UTF8_BOM + rows.map(r => r.map(f => escapeField(f, separator)).join(separator)).join('\r\n') + '\r\n';
}

/** Separador de la cabecera: `;` salvo que la primera línea solo tenga comas. */
function detectSeparator(text: string): string {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  return !firstLine.includes(';') && firstLine.includes(',') ? ',' : ';';
}

/**
 * RFC 4180 con comillas dobles, campos con saltos de línea y BOM opcional.
 * Devuelve todos los registros, también los vacíos, para que el número de
 * fila coincida con el de Excel.
 */
export function parseCsv(input: string): { separator: string; records: CsvRecord[] } {
  const text = input.startsWith(UTF8_BOM) ? input.slice(1) : input;
  const separator = detectSeparator(text);
  const records: CsvRecord[] = [];
  let fields: string[] = [];
  let field = '';
  let quoted = false;
  let fieldStarted = false;
  let i = 0;

  const endRecord = (): void => {
    fields.push(field);
    records.push({ row: records.length + 1, fields });
    fields = [];
    field = '';
    fieldStarted = false;
  };

  while (i < text.length) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        quoted = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }
    if (ch === '"' && !fieldStarted) {
      quoted = true;
      fieldStarted = true;
      i += 1;
    } else if (ch === separator) {
      fields.push(field);
      field = '';
      fieldStarted = false;
      i += 1;
    } else if (ch === '\r' || ch === '\n') {
      endRecord();
      i += ch === '\r' && text[i + 1] === '\n' ? 2 : 1;
    } else {
      field += ch;
      fieldStarted = true;
      i += 1;
    }
  }
  if (quoted) throw new CsvError(`Comillas sin cerrar en la fila ${records.length + 1}`);
  if (field !== '' || fields.length > 0) endRecord();
  return { separator, records };
}

// --- Valores

type Parsed<T> = { ok: true; value: T } | { ok: false; message: string };

export function parseQuantity(raw: string): Parsed<number> {
  const value = raw.trim();
  if (value === '') return { ok: false, message: 'cantidad vacía (si no hay unidades, pon 0)' };
  if (!/^\d+$/.test(value)) return { ok: false, message: `cantidad "${raw}" no es un entero mayor o igual que 0` };
  const n = Number(value);
  if (n > MAX_QUANTITY) return { ok: false, message: `cantidad ${n} supera el tope de ${MAX_QUANTITY}; revísala` };
  return { ok: true, value: n };
}

/**
 * Pesos colombianos enteros. Acepta `21000`, `21.000` y `$ 21.000` (lo que
 * escribe Excel con formato de moneda en es-CO). Rechaza decimales y la coma,
 * que en español es separador decimal.
 */
export function parseUnitCost(raw: string): Parsed<number> {
  const value = raw.replace(/[\s  ]/g, '').replace(/^\$/, '');
  if (!/^\d+$/.test(value) && !/^\d{1,3}(\.\d{3})+$/.test(value)) {
    return { ok: false, message: `costoUnitario "${raw}" no es un valor en pesos sin decimales (ej. 21000)` };
  }
  const n = Number(value.replace(/\./g, ''));
  if (n <= 0) return { ok: false, message: 'costoUnitario debe ser mayor que 0' };
  if (n > MAX_UNIT_COST) return { ok: false, message: `costoUnitario ${n} supera el tope de ${MAX_UNIT_COST}; revísalo` };
  return { ok: true, value: n };
}

export function isValidBatch(batch: string): boolean {
  return BATCH_PATTERN.test(batch);
}

/**
 * Clave de idempotencia: la misma fila del mismo lote siempre da la misma, así
 * que repetir la importación no duplica movimientos.
 */
export function operationKeyFor(batch: string, lineSlug: string, variantSlug: string): string {
  const key = `${KEY_PREFIX}:${batch}:${lineSlug}/${variantSlug}`;
  if (key.length <= OPERATION_KEY_MAX) return key;
  const hash = createHash('sha256').update(`${lineSlug}/${variantSlug}`).digest('hex').slice(0, 40);
  return `${KEY_PREFIX}:${batch}:${hash}`;
}

export function countReason(batch: string): string {
  return `Conteo físico inicial ${batch}`;
}

// --- Planilla

function byCatalogOrder(a: CountVariant, b: CountVariant): number {
  return a.brandName.localeCompare(b.brandName, 'es')
    || a.productName.localeCompare(b.productName, 'es')
    || a.sortOrder - b.sortOrder
    || a.name.localeCompare(b.name, 'es');
}

/** Una fila por variante activa, ordenadas por marca, línea y orden del catálogo. */
export function buildCountTemplate(variants: readonly CountVariant[]): { csv: string; rows: number } {
  const active = variants.filter(v => v.active).sort(byCatalogOrder);
  const rows = active.map(v => [
    v.id, v.brandName, v.productName, v.name, v.productSlug, v.slug, String(v.stockCache), '', '', ''
  ]);
  return { csv: toCsv([[...COUNT_COLUMNS], ...rows]), rows: rows.length };
}

/**
 * La planilla lleva costos: nunca dentro del repositorio, salvo en
 * `backend/scripts/data/`, que está en `.gitignore`. Devuelve el motivo del
 * rechazo o `undefined` si la ruta es aceptable.
 */
export function rejectOutputPath(target: string, repoRoot: string): string | undefined {
  const absolute = resolve(target);
  const fromRoot = relative(resolve(repoRoot), absolute);
  const inside = fromRoot !== '' && !fromRoot.startsWith('..') && !isAbsolute(fromRoot);
  if (!inside) return undefined;
  const allowed = ['backend', 'scripts', 'data'].join(pathSep) + pathSep;
  if (fromRoot.startsWith(allowed)) return undefined;
  return `${absolute} está dentro del repositorio y la planilla lleva costos: guárdala fuera (p. ej. --out ../../conteo.csv) o en backend/scripts/data/, que git ignora`;
}

// --- Plan

/** Movimiento de este lote que ya está en el libro. */
export interface ExistingCountMovement {
  movementId: string;
  type: 'inbound' | 'adjustment' | string;
  /** Disponible justo después de ese movimiento, según el libro. */
  balanceAfter: number;
  unitCost: number | null;
  supplierId: string | null;
}

export type RowAction =
  | { kind: 'inbound'; quantity: number; unitCost: number; supplierId: string | null }
  | { kind: 'adjustment'; quantity: number; reason: string }
  | { kind: 'unchanged' }
  | { kind: 'replayed'; movementId: string };

export interface PlannedRow {
  row: number;
  variant: CountVariant;
  counted: number;
  stockBefore: number;
  operationKey: string;
  supplierName: string | null;
  action: RowAction;
}

export interface RowIssue {
  /** `null` si el problema no es de una fila concreta. */
  row: number | null;
  message: string;
}

export interface LineTotal {
  lineSlug: string;
  lineName: string;
  variants: number;
  counted: number;
}

export interface CountPlan {
  batch: string;
  dataRows: number;
  rows: PlannedRow[];
  errors: RowIssue[];
  warnings: RowIssue[];
  /** Variantes activas que no tienen fila en la planilla. Bloquean la importación. */
  missing: CountVariant[];
  lines: LineTotal[];
  totals: {
    counted: number;
    inbound: { rows: number; units: number; cost: number };
    adjustment: { rows: number; units: number };
    unchanged: number;
    replayed: number;
  };
  /** Sin errores y sin variantes sin fila. */
  canApply: boolean;
}

export interface PlanInput {
  records: readonly CsvRecord[];
  variants: readonly CountVariant[];
  suppliers: readonly CountSupplier[];
  batch: string;
  /** Movimientos ya registrados, por `operationKey`. */
  existing: ReadonlyMap<string, ExistingCountMovement>;
}

const normalize = (s: string): string => s.trim().toLocaleLowerCase('es');

function emptyPlan(batch: string, errors: RowIssue[]): CountPlan {
  return {
    batch,
    dataRows: 0,
    rows: [],
    errors,
    warnings: [],
    missing: [],
    lines: [],
    totals: { counted: 0, inbound: { rows: 0, units: 0, cost: 0 }, adjustment: { rows: 0, units: 0 }, unchanged: 0, replayed: 0 },
    canApply: false
  };
}

export function planInitialCount(input: PlanInput): CountPlan {
  const { records, variants, suppliers, batch, existing } = input;
  if (!isValidBatch(batch)) {
    return emptyPlan(batch, [{ row: null, message: `--batch "${batch}" no es válido: letras, números, punto, guion o guion bajo, hasta 40` }]);
  }

  const header = records[0];
  if (!header || header.fields.every(f => f.trim() === '')) {
    return emptyPlan(batch, [{ row: null, message: 'La planilla está vacía' }]);
  }
  const columns = new Map<string, number>();
  header.fields.forEach((name, index) => {
    const key = name.trim().toLowerCase();
    if (key && !columns.has(key)) columns.set(key, index);
  });
  const missingColumns = REQUIRED_COLUMNS.filter(c => !columns.has(c.toLowerCase()));
  if (missingColumns.length > 0) {
    return emptyPlan(batch, [{ row: 1, message: `Faltan columnas: ${missingColumns.join(', ')}. Usa la planilla de db:count-template` }]);
  }
  const cell = (record: CsvRecord, column: string): string => {
    const index = columns.get(column.toLowerCase());
    return index === undefined ? '' : (record.fields[index] ?? '').trim();
  };

  const variantsById = new Map(variants.map(v => [v.id, v]));
  const suppliersByName = new Map<string, CountSupplier[]>();
  for (const s of suppliers) {
    const key = normalize(s.name);
    suppliersByName.set(key, [...(suppliersByName.get(key) ?? []), s]);
  }

  const errors: RowIssue[] = [];
  const warnings: RowIssue[] = [];
  const rows: PlannedRow[] = [];
  const seen = new Map<string, number>();
  let dataRows = 0;

  if (existing.size > 0) {
    warnings.push({
      row: null,
      message: `El lote ${batch} ya tiene ${existing.size} movimiento(s) en el libro: esas filas se dan por registradas y el resto se calcula contra el stock actual`
    });
  }

  for (const record of records.slice(1)) {
    if (record.fields.every(f => f.trim() === '')) continue;
    dataRows += 1;
    const row = record.row;
    const rowErrors: string[] = [];

    const variantId = cell(record, 'variantId');
    const variant = variantsById.get(variantId);
    if (!variantId) {
      errors.push({ row, message: 'variantId vacío' });
      continue;
    }
    if (!variant) {
      errors.push({ row, message: `variantId "${variantId}" no existe en la base` });
      continue;
    }
    const firstRow = seen.get(variant.id);
    if (firstRow !== undefined) {
      errors.push({ row, message: `variante repetida (${variant.productSlug}/${variant.slug}): ya está en la fila ${firstRow}` });
      continue;
    }
    seen.set(variant.id, row);
    if (!variant.active) rowErrors.push(`la variante ${variant.productSlug}/${variant.slug} está inactiva`);
    if (cell(record, 'lineSlug') !== variant.productSlug || cell(record, 'variantSlug') !== variant.slug) {
      rowErrors.push(
        `lineSlug/variantSlug "${cell(record, 'lineSlug')}/${cell(record, 'variantSlug')}" no coinciden con la variante ` +
        `${variant.productSlug}/${variant.slug} (¿filas desplazadas al ordenar?)`
      );
    }

    const quantity = parseQuantity(cell(record, 'cantidad'));
    if (!quantity.ok) rowErrors.push(quantity.message);

    const rawCost = cell(record, 'costoUnitario');
    const cost = rawCost === '' ? undefined : parseUnitCost(rawCost);
    if (cost && !cost.ok) rowErrors.push(cost.message);

    const supplierName = cell(record, 'proveedor');
    let supplier: CountSupplier | undefined;
    if (supplierName) {
      const matches = suppliersByName.get(normalize(supplierName)) ?? [];
      if (matches.length === 0) rowErrors.push(`proveedor "${supplierName}" no existe: créalo antes en /admin`);
      else if (matches.length > 1) rowErrors.push(`proveedor "${supplierName}" es ambiguo: hay ${matches.length} con ese nombre`);
      else if (!matches[0].active) rowErrors.push(`proveedor "${supplierName}" está inactivo`);
      else supplier = matches[0];
    }

    if (rowErrors.length > 0 || !quantity.ok) {
      for (const message of rowErrors) errors.push({ row, message });
      continue;
    }

    const counted = quantity.value;
    const unitCost = cost?.ok ? cost.value : undefined;
    const stockBefore = variant.stockCache;
    const operationKey = operationKeyFor(batch, variant.productSlug, variant.slug);
    const previous = existing.get(operationKey);

    const systemStock = cell(record, 'stockSistema');
    if (!previous && systemStock !== '' && systemStock !== String(stockBefore)) {
      warnings.push({ row, message: `el stock cambió desde que se generó la planilla: ${systemStock} → ${stockBefore}` });
    }

    let action: RowAction;
    if (previous) {
      const sameInbound = previous.type !== 'inbound'
        || (previous.unitCost === (unitCost ?? null) && previous.supplierId === (supplier?.id ?? null));
      if (previous.balanceAfter !== counted || !sameInbound) {
        errors.push({
          row,
          message: `el lote ${batch} ya registró esta variante con otros datos (quedó en ${previous.balanceAfter}); ` +
            'para corregir usa un --batch nuevo, que registra un ajuste'
        });
        continue;
      }
      action = { kind: 'replayed', movementId: previous.movementId };
    } else if (counted === stockBefore) {
      action = { kind: 'unchanged' };
    } else if (stockBefore === 0) {
      if (unitCost === undefined) {
        errors.push({ row, message: 'falta costoUnitario: es obligatorio en un ingreso (costo por unidad en pesos)' });
        continue;
      }
      action = { kind: 'inbound', quantity: counted, unitCost, supplierId: supplier?.id ?? null };
    } else {
      if (unitCost !== undefined || supplier) {
        warnings.push({
          row,
          message: `ya había stock (${stockBefore}): se registra un ajuste y el costo y el proveedor no se guardan`
        });
      }
      action = { kind: 'adjustment', quantity: counted - stockBefore, reason: countReason(batch) };
    }

    rows.push({ row, variant, counted, stockBefore, operationKey, supplierName: supplier?.name ?? null, action });
  }

  if (dataRows === 0) errors.push({ row: null, message: 'La planilla no tiene filas de datos' });

  const missing = variants.filter(v => v.active && !seen.has(v.id)).sort(byCatalogOrder);

  const lineMap = new Map<string, LineTotal>();
  const totals: CountPlan['totals'] = {
    counted: 0, inbound: { rows: 0, units: 0, cost: 0 }, adjustment: { rows: 0, units: 0 }, unchanged: 0, replayed: 0
  };
  for (const r of rows) {
    const line = lineMap.get(r.variant.productSlug)
      ?? { lineSlug: r.variant.productSlug, lineName: r.variant.productName, variants: 0, counted: 0 };
    line.variants += 1;
    line.counted += r.counted;
    lineMap.set(line.lineSlug, line);
    totals.counted += r.counted;
    if (r.action.kind === 'inbound') {
      totals.inbound.rows += 1;
      totals.inbound.units += r.action.quantity;
      totals.inbound.cost += r.action.quantity * r.action.unitCost;
    } else if (r.action.kind === 'adjustment') {
      totals.adjustment.rows += 1;
      totals.adjustment.units += r.action.quantity;
    } else if (r.action.kind === 'unchanged') {
      totals.unchanged += 1;
    } else {
      totals.replayed += 1;
    }
  }

  errors.sort((a, b) => (a.row ?? 0) - (b.row ?? 0));
  warnings.sort((a, b) => (a.row ?? 0) - (b.row ?? 0));
  return {
    batch,
    dataRows,
    rows,
    errors,
    warnings,
    missing,
    lines: [...lineMap.values()].sort((a, b) => a.lineName.localeCompare(b.lineName, 'es')),
    totals,
    canApply: errors.length === 0 && missing.length === 0
  };
}

// --- Informe

const pesos = (n: number): string => `$${n.toLocaleString('es-CO')}`;
const signed = (n: number): string => (n > 0 ? `+${n}` : String(n));
const where = (issue: RowIssue): string => (issue.row === null ? '  -' : `  fila ${issue.row}:`);

export function formatPlan(plan: CountPlan): string {
  const out: string[] = [];
  const t = plan.totals;
  out.push(`Lote ${plan.batch}: ${plan.dataRows} filas leídas, ${plan.rows.length} válidas, ${plan.errors.length} errores`);

  const pending = plan.rows.filter(r => r.action.kind === 'inbound' || r.action.kind === 'adjustment');
  out.push('', `Movimientos a registrar (${pending.length}):`);
  for (const r of pending) {
    const ref = `${r.variant.productSlug}/${r.variant.slug}`;
    if (r.action.kind === 'inbound') {
      const supplier = r.supplierName ? `, proveedor ${r.supplierName}` : ', sin proveedor';
      out.push(`  fila ${r.row}: ingreso ${ref} +${r.action.quantity} a ${pesos(r.action.unitCost)}${supplier}`);
    } else if (r.action.kind === 'adjustment') {
      out.push(`  fila ${r.row}: ajuste  ${ref} ${signed(r.action.quantity)} (${r.stockBefore} → ${r.counted})`);
    }
  }

  if (plan.errors.length > 0) {
    out.push('', `Errores (${plan.errors.length}):`);
    for (const e of plan.errors) out.push(`${where(e)} ${e.message}`);
  }
  if (plan.missing.length > 0) {
    out.push('', `Variantes activas sin fila en la planilla (${plan.missing.length}); añádelas o regenera la planilla:`);
    for (const v of plan.missing) out.push(`  - ${v.productSlug}/${v.slug} (${v.brandName} · ${v.productName} · ${v.name})`);
  }
  if (plan.warnings.length > 0) {
    out.push('', `Avisos (${plan.warnings.length}):`);
    for (const w of plan.warnings) out.push(`${where(w)} ${w.message}`);
  }

  out.push('', 'Totales por línea (unidades contadas):');
  for (const l of plan.lines) out.push(`  ${l.lineName} (${l.lineSlug}): ${l.counted} en ${l.variants} variantes`);
  out.push(
    '',
    `Unidades contadas: ${t.counted}`,
    `Ingresos: ${t.inbound.rows} filas, ${t.inbound.units} unidades, costo total ${pesos(t.inbound.cost)}`,
    `Ajustes: ${t.adjustment.rows} filas, ${signed(t.adjustment.units)} unidades netas`,
    `Sin cambio (el stock ya coincide): ${t.unchanged}`,
    `Ya registradas en este lote: ${t.replayed}`
  );
  out.push('', plan.canApply
    ? 'Sin errores: se puede aplicar con --apply.'
    : 'NO se puede aplicar: corrige los errores y las variantes sin fila, y vuelve a ejecutar el --dry-run.');
  return out.join('\n');
}
