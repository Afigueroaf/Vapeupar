import { Db, PrismaDbHandle, defaultDbHandle, prismaAuditSink } from '../db/handle.js';
import { Prisma } from '../generated/prisma/client.js';
import { JsonValue } from '../services/audit.service.js';
import {
  ContentTransaction, ContentVersion, ContentVersionConflictError, NewContentVersion, SiteContentRepository
} from './site-content.repository.js';

type Row = Prisma.SiteContentGetPayload<object>;

function toVersion(row: Row): ContentVersion {
  return {
    key: row.key,
    value: row.value as JsonValue,
    version: row.version,
    publishedAt: row.publishedAt,
    userId: row.userId,
    createdAt: row.createdAt
  };
}

async function findLatest(db: Db, key: string): Promise<ContentVersion | undefined> {
  const row = await db.siteContent.findFirst({ where: { key }, orderBy: { version: 'desc' } });
  return row ? toVersion(row) : undefined;
}

export class PrismaSiteContentRepository implements SiteContentRepository {
  constructor(private readonly db: PrismaDbHandle = defaultDbHandle) {}

  public transaction<T>(work: (tx: ContentTransaction) => Promise<T>): Promise<T> {
    return this.db.transaction(tx => work({
      findLatest: key => findLatest(tx, key),

      async insert(entry: NewContentVersion) {
        try {
          return toVersion(await tx.siteContent.create({
            data: { ...entry, value: entry.value as Prisma.InputJsonValue }
          }));
        } catch (error) {
          // El único índice único es [key, version]: alguien publicó primero.
          if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
            throw new ContentVersionConflictError(entry.key, entry.version);
          }
          throw error;
        }
      },

      audit: prismaAuditSink(tx)
    }));
  }

  public findLatest(key: string): Promise<ContentVersion | undefined> {
    return findLatest(this.db.client(), key);
  }

  public async listVersions(key: string, limit: number): Promise<ContentVersion[]> {
    const rows = await this.db.client().siteContent.findMany({
      where: { key },
      orderBy: { version: 'desc' },
      take: limit
    });
    return rows.map(toVersion);
  }
}
