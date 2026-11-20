import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  COUNT_COLUMNS,
  CountVariant,
  CsvError,
  ExistingCountMovement,
  buildCountTemplate,
  decodeCsv,
  formatPlan,
  operationKeyFor,
  parseCsv,
  parseQuantity,
  parseUnitCost,
  planInitialCount,
  rejectOutputPath,
  toCsv,
  UTF8_BOM
} from './initial-count.js';

function variant(overrides: Partial<CountVariant> & Pick<CountVariant, 'id' | 'slug'>): CountVariant {
  return {
    name: overrides.slug, active: true, stockCache: 0, sortOrder: 0,
    productSlug: 'lifepod-eco-3', productName: 'ECO 3', brandName: 'LifePod', ...overrides
  };
}

const MANGO = variant({ id: 'v-mango', slug: 'mango-ice', name: 'Mango Ice' });
const MENTA = variant({ id: 'v-menta', slug: 'menta', name: 'Menta', sortOrder: 1 });
const ONE = variant({ id: 'v-blue', slug: 'electric-blue', productSlug: 'lifepod-one', productName: 'ONE', stockCache: 4 });
const VARIANTS = [MANGO, MENTA, ONE];
const SUPPLIERS = [{ id: 's-1', name: 'Distribuidora Norte', active: true }];

const HEADER = COUNT_COLUMNS.join(';');
function line(v: CountVariant, cantidad: string, costo = '', proveedor = ''): string {
  return [v.id, v.brandName, v.productName, v.name, v.productSlug, v.slug, String(v.stockCache), cantidad, costo, proveedor].join(';');
}
function plan(rows: string[], existing = new Map<string, ExistingCountMovement>(), batch = '2026-11') {
  return planInitialCount({
    records: parseCsv([HEADER, ...rows].join('\r\n')).records,
    variants: VARIANTS,
    suppliers: SUPPLIERS,
    batch,
    existing
  });
}

describe('CSV', () => {
  it('escribe BOM, ; y CRLF, y entrecomilla lo que lo necesita', () => {
    const csv = toCsv([['a', 'b;c', 'di"jo'], ['x', ' y', 'línea\nnueva']]);
    expect(csv.startsWith(UTF8_BOM)).toBe(true);
    expect(csv).toBe(UTF8_BOM + 'a;"b;c";"di""jo"\r\nx;" y";"línea\nnueva"\r\n');
  });

  it('lee lo que escribe: ida y vuelta con BOM y ;', () => {
    const rows = [['a', 'b;c', 'di"jo'], ['x', ' y', 'línea\nnueva']];
    const parsed = parseCsv(toCsv(rows));
    expect(parsed.separator).toBe(';');
    expect(parsed.records.map(r => r.fields)).toEqual(rows);
  });

  it('acepta coma como separador si la cabecera no tiene ;', () => {
    const parsed = parseCsv('a,b\n1,"2,5"\n');
    expect(parsed.separator).toBe(',');
    expect(parsed.records[1].fields).toEqual(['1', '2,5']);
  });

  it('numera las filas como Excel aunque haya filas vacías', () => {
    const parsed = parseCsv('h\r\n\r\nvalor\r\n');
    expect(parsed.records.map(r => [r.row, r.fields])).toEqual([[1, ['h']], [2, ['']], [3, ['valor']]]);
  });

  it('falla con comillas sin cerrar', () => {
    expect(() => parseCsv('a;"b\n')).toThrow(CsvError);
  });

  it('decodifica UTF-8 con BOM y Windows-1252 (CSV guardado por Excel)', () => {
    expect(decodeCsv(new TextEncoder().encode(UTF8_BOM + 'cañón'))).toBe('cañón');
    expect(decodeCsv(Uint8Array.from([0x63, 0x61, 0xf1, 0xf3, 0x6e]))).toBe('cañón');
  });
});

describe('valores', () => {
  it('cantidad: entero >= 0', () => {
    expect(parseQuantity(' 12 ')).toEqual({ ok: true, value: 12 });
    expect(parseQuantity('0')).toEqual({ ok: true, value: 0 });
    for (const bad of ['', '-1', '2.5', '2,5', 'diez', '100001']) expect(parseQuantity(bad).ok).toBe(false);
  });

  it('costo: pesos enteros positivos, con o sin puntos de miles y signo $', () => {
    expect(parseUnitCost('21000')).toEqual({ ok: true, value: 21000 });
    expect(parseUnitCost('21.000')).toEqual({ ok: true, value: 21000 });
    expect(parseUnitCost('$ 1.250.000')).toEqual({ ok: true, value: 1250000 });
    for (const bad of ['0', '-5', '21,5', '21000,00', '2.10', 'abc', '20000000']) expect(parseUnitCost(bad).ok).toBe(false);
  });

  it('operationKey determinista y nunca de más de 100 caracteres', () => {
    expect(operationKeyFor('2026-11', 'lifepod-eco-3', 'mango-ice')).toBe('conteo-inicial:2026-11:lifepod-eco-3/mango-ice');
    const long = operationKeyFor('b'.repeat(40), 'l'.repeat(60), 'v'.repeat(60));
    expect(long.length).toBeLessThanOrEqual(100);
    expect(long).toBe(operationKeyFor('b'.repeat(40), 'l'.repeat(60), 'v'.repeat(60)));
  });

  it('la planilla no se escribe dentro del repo salvo en backend/scripts/data', () => {
    const root = resolve('/repo');
    expect(rejectOutputPath(resolve('/repo/conteo.csv'), root)).toMatch(/fuera/);
    expect(rejectOutputPath(resolve('/repo/backend/conteo.csv'), root)).toMatch(/fuera/);
    expect(rejectOutputPath(resolve('/repo/backend/scripts/data/conteo.csv'), root)).toBeUndefined();
    expect(rejectOutputPath(resolve('/conteo.csv'), root)).toBeUndefined();
    expect(rejectOutputPath(resolve('/repo-otro/conteo.csv'), root)).toBeUndefined();
  });
});

describe('buildCountTemplate', () => {
  it('una fila por variante activa, ordenada, con la cantidad y el costo vacíos', () => {
    const inactive = variant({ id: 'v-off', slug: 'retirada', active: false });
    const { csv, rows } = buildCountTemplate([ONE, MENTA, inactive, MANGO]);
    expect(rows).toBe(3);
    const records = parseCsv(csv).records.map(r => r.fields);
    expect(records[0]).toEqual([...COUNT_COLUMNS]);
    expect(records.slice(1).map(r => r[0])).toEqual(['v-mango', 'v-menta', 'v-blue']);
    expect(records[3]).toEqual(['v-blue', 'LifePod', 'ONE', 'electric-blue', 'lifepod-one', 'electric-blue', '4', '', '', '']);
  });
});

describe('planInitialCount', () => {
  it('ingreso si no había stock, ajuste si había, y nada si ya coincide', () => {
    const p = plan([line(MANGO, '10', '21.000', 'distribuidora norte'), line(MENTA, '0'), line(ONE, '6', '21000')]);
    expect(p.errors).toEqual([]);
    expect(p.canApply).toBe(true);
    expect(p.rows.map(r => r.action)).toEqual([
      { kind: 'inbound', quantity: 10, unitCost: 21000, supplierId: 's-1' },
      { kind: 'unchanged' },
      { kind: 'adjustment', quantity: 2, reason: 'Conteo físico inicial 2026-11' }
    ]);
    expect(p.warnings.map(w => w.row)).toEqual([4]);
    expect(p.totals).toMatchObject({ counted: 16, inbound: { rows: 1, units: 10, cost: 210000 }, adjustment: { rows: 1, units: 2 }, unchanged: 1 });
    expect(p.lines).toEqual([
      { lineSlug: 'lifepod-eco-3', lineName: 'ECO 3', variants: 2, counted: 10 },
      { lineSlug: 'lifepod-one', lineName: 'ONE', variants: 1, counted: 6 }
    ]);
  });

  it('proveedor opcional: sin él, el ingreso va sin supplierId', () => {
    const p = plan([line(MANGO, '3', '20000'), line(MENTA, '0'), line(ONE, '4')]);
    expect(p.rows[0].action).toEqual({ kind: 'inbound', quantity: 3, unitCost: 20000, supplierId: null });
  });

  it('reporta cada error con su número de fila y bloquea la aplicación', () => {
    const p = plan([
      line(MANGO, '-1'),
      line({ ...MENTA, productSlug: 'otra-linea' }, '1', '1000'),
      line(ONE, '4', 'mil', 'Proveedor Fantasma'),
      ['no-existe', '', '', '', 'x', 'y', '0', '1', '1', ''].join(';'),
      line(MANGO, '1', '1000')
    ]);
    expect(p.canApply).toBe(false);
    expect(p.errors.map(e => e.row)).toEqual([2, 3, 4, 4, 5, 6]);
    const text = p.errors.map(e => e.message).join('\n');
    expect(text).toMatch(/cantidad "-1"/);
    expect(text).toMatch(/filas desplazadas/);
    expect(text).toMatch(/costoUnitario "mil"/);
    expect(text).toMatch(/Proveedor Fantasma" no existe/);
    expect(text).toMatch(/no-existe" no existe/);
    expect(text).toMatch(/ya está en la fila 2/);
  });

  it('un ingreso sin costo es error', () => {
    const p = plan([line(MANGO, '5'), line(MENTA, '0'), line(ONE, '4')]);
    expect(p.errors).toEqual([{ row: 2, message: expect.stringMatching(/falta costoUnitario/) }]);
    expect(p.canApply).toBe(false);
  });

  it('las variantes activas sin fila bloquean la aplicación', () => {
    const p = plan([line(MANGO, '0'), line(ONE, '4')]);
    expect(p.errors).toEqual([]);
    expect(p.missing.map(v => v.id)).toEqual(['v-menta']);
    expect(p.canApply).toBe(false);
  });

  it('exige las columnas de la planilla y un lote válido', () => {
    const noCols = planInitialCount({ records: parseCsv('variantId;cantidad\nv-mango;1').records, variants: VARIANTS, suppliers: [], batch: 'x', existing: new Map() });
    expect(noCols.errors[0].message).toMatch(/Faltan columnas: lineSlug, variantSlug, costoUnitario/);
    expect(plan([line(MANGO, '0')], new Map(), 'lote con espacios').errors[0].message).toMatch(/--batch/);
  });

  it('una fila ya registrada en el lote se da por hecha si cuadra, y es error si cambió', () => {
    const key = operationKeyFor('2026-11', 'lifepod-eco-3', 'mango-ice');
    const existing = new Map([[key, { movementId: 'm1', type: 'inbound', balanceAfter: 10, unitCost: 21000, supplierId: null }]]);
    const mango = { ...MANGO, stockCache: 10 };
    const rows = (cantidad: string, costo: string) => [line(mango, cantidad, costo), line(MENTA, '0'), line(ONE, '4')];
    const variants = [mango, MENTA, ONE];
    const run = (r: string[]) => planInitialCount({ records: parseCsv([HEADER, ...r].join('\n')).records, variants, suppliers: SUPPLIERS, batch: '2026-11', existing });

    const same = run(rows('10', '21000'));
    expect(same.canApply).toBe(true);
    expect(same.rows[0].action).toEqual({ kind: 'replayed', movementId: 'm1' });
    expect(same.totals.replayed).toBe(1);

    expect(run(rows('12', '21000')).errors[0].message).toMatch(/--batch nuevo/);
    expect(run(rows('10', '22000')).errors[0].message).toMatch(/--batch nuevo/);
  });
});

describe('formatPlan', () => {
  it('informe con movimientos, errores por fila, variantes sin fila y totales', () => {
    const ok = formatPlan(plan([line(MANGO, '10', '21000', 'Distribuidora Norte'), line(MENTA, '0'), line(ONE, '6')]));
    expect(ok).toContain('Lote 2026-11: 3 filas leídas, 3 válidas, 0 errores');
    expect(ok).toContain('fila 2: ingreso lifepod-eco-3/mango-ice +10 a $21.000, proveedor Distribuidora Norte');
    expect(ok).toContain('fila 4: ajuste  lifepod-one/electric-blue +2 (4 → 6)');
    expect(ok).toContain('ECO 3 (lifepod-eco-3): 10 en 2 variantes');
    expect(ok).toContain('Ingresos: 1 filas, 10 unidades, costo total $210.000');
    expect(ok).toContain('se puede aplicar con --apply');

    const bad = formatPlan(plan([line(MANGO, 'x')]));
    expect(bad).toContain('fila 2: cantidad "x"');
    expect(bad).toContain('- lifepod-eco-3/menta');
    expect(bad).toContain('NO se puede aplicar');
  });
});
