import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import { createRequire } from 'node:module'
import path from 'node:path'

const require = createRequire(import.meta.url)

type PrismaClientLike = {
  [key: string]: any
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClientLike }

function createClient(): PrismaClientLike {
  const { PrismaClient } = require('@prisma/client') as {
    PrismaClient?: new (options?: { adapter?: unknown }) => PrismaClientLike
  }

  if (!PrismaClient) {
    throw new Error('PrismaClient export not found in @prisma/client')
  }

  const adapter = new PrismaBetterSqlite3({
    url: `file:${path.join(process.cwd(), 'prisma/dev.db')}`,
  })

  return new PrismaClient({ adapter })
}

export const prisma = globalForPrisma.prisma || createClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
