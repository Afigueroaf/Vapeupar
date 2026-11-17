import { describe, expect, it } from 'vitest';
import { InMemorySiteContentRepository } from '../repositories/in-memory-site-content.repository.js';
import { LOW_STOCK_KEY, SettingsError, SettingsService } from './settings.service.js';

const OWNER = { userId: '019299a4-0000-7000-8000-000000000001' };

describe('SettingsService — umbral de bajo stock (decisión #5)', () => {
  it('sin configurar, usa el valor por defecto', async () => {
    const service = new SettingsService(new InMemorySiteContentRepository());
    expect(await service.getLowStockThreshold()).toBe(5);
  });

  it('cada cambio es una versión nueva con su auditoría', async () => {
    const repository = new InMemorySiteContentRepository();
    const service = new SettingsService(repository);
    await service.setLowStockThreshold(8, OWNER);
    await service.setLowStockThreshold(3, OWNER);

    expect(await service.getLowStockThreshold()).toBe(3);
    expect((await repository.listVersions(LOW_STOCK_KEY, 10)).map(v => v.version)).toEqual([2, 1]);
    expect(repository.audits.map(a => [a.action, a.before, a.after])).toEqual([
      ['setting.update', { threshold: 5 }, { threshold: 8 }],
      ['setting.update', { threshold: 8 }, { threshold: 3 }]
    ]);
  });

  it('guardar el mismo valor no crea versión ni auditoría', async () => {
    const repository = new InMemorySiteContentRepository();
    const service = new SettingsService(repository);
    await service.setLowStockThreshold(8, OWNER);
    await service.setLowStockThreshold(8, OWNER);
    expect(repository.audits).toHaveLength(1);
  });

  it('rechaza valores que no son enteros no negativos', async () => {
    const service = new SettingsService(new InMemorySiteContentRepository());
    await expect(service.setLowStockThreshold(-1, OWNER)).rejects.toBeInstanceOf(SettingsError);
    await expect(service.setLowStockThreshold(2.5, OWNER)).rejects.toBeInstanceOf(SettingsError);
  });
});
