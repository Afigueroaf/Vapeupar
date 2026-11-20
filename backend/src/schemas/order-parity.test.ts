import { describe, expect, it } from 'vitest';
import { DATA_POLICY_VERSION, PublicOrderBodySchema, normalizeColombianMobile } from './order.schema.js';
import * as mirror from '../../../frontend/src/lib/order-form.js';

/**
 * El carrito valida nombre, celular y barrio antes de enviar
 * (`frontend/src/lib/order-form.ts`) para señalar el campo sin gastar una
 * petición. Si las reglas divergen, el cliente vería un formulario que acepta
 * lo que el backend rechaza —o al revés— sin que nada falle a la vista. Esta
 * prueba lo hace fallar, y también si la versión de la política se sube en un
 * lado y no en el otro (cada pedido sería `400`).
 */
const VARIANT = '019299a4-0000-7000-8000-0000000000a1';

function backendAccepts(customer: { name: string; phone: string; neighborhood: string }) {
  return PublicOrderBodySchema.safeParse({
    submissionKey: '019299a4-0000-7000-8000-000000000001',
    customer,
    consent: { accepted: true, policyVersion: DATA_POLICY_VERSION },
    lines: [{ variantId: VARIANT, quantity: 1 }]
  });
}

describe('paridad con el formulario del carrito', () => {
  it('misma versión de la política', () => {
    expect(mirror.DATA_POLICY_VERSION).toBe(DATA_POLICY_VERSION);
  });

  it('normaliza el celular igual', () => {
    for (const input of [
      '3001234567', '300 123 4567', '+57 300-123-4567', '57 (300) 123.4567', '6055551234',
      '300123456', '+1 300 123 4567', '', 'tres'
    ]) {
      expect(mirror.normalizeColombianMobile(input)).toBe(normalizeColombianMobile(input));
    }
  });

  it('acepta y rechaza los mismos datos, y los deja iguales', () => {
    const casos = [
      { name: '  Ana   Pérez ', phone: '300 123 4567', neighborhood: 'Novalito' },
      { name: 'María José O’Neill-Díaz', phone: '+573001234567', neighborhood: 'Barrio 12 de Octubre, Mz. 4 #3' },
      { name: 'A', phone: '3001234567', neighborhood: 'Novalito' },
      { name: 'Ana', phone: '3001234567', neighborhood: 'N' },
      { name: '-Ana', phone: '3001234567', neighborhood: 'Novalito' },
      { name: 'Ana', phone: '3001234567', neighborhood: '<script>' },
      { name: 'Ana2', phone: '3001234567', neighborhood: 'Novalito' },
      { name: 'a'.repeat(80), phone: '3001234567', neighborhood: 'b'.repeat(80) },
      { name: 'a'.repeat(81), phone: '3001234567', neighborhood: 'Novalito' },
      { name: 'Ana', phone: '6055551234', neighborhood: 'Novalito' },
      { name: '   ', phone: '3001234567', neighborhood: 'Novalito' },
      // Más de 30 caracteres: el backend corta antes de normalizar.
      { name: 'Ana', phone: `3001234567${' '.repeat(25)}`, neighborhood: 'Novalito' }
    ];
    for (const customer of casos) {
      const back = backendAccepts(customer);
      const front = mirror.validateCustomer({ ...customer, consent: true });
      expect(front.ok, JSON.stringify(customer)).toBe(back.success);
      if (back.success && front.ok) expect(front.value).toEqual(back.data.customer);
    }
  });
});
