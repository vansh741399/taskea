import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// Database URL must come from environment variables.
// Set DATABASE_URL and DIRECT_URL in your Vercel project settings or local .env file.
if (!process.env.DATABASE_URL) {
  throw new Error(
    'DATABASE_URL environment variable is not set. ' +
    'Please set it in your Vercel project settings (Production/Preview/Development) ' +
    'or in a local .env file. Example: ' +
    'postgresql://user:password@host:port/database?sslmode=require'
  )
}

if (!process.env.DIRECT_URL) {
  // DIRECT_URL is used by Prisma for migrations. If not set, fall back to DATABASE_URL.
  process.env.DIRECT_URL = process.env.DATABASE_URL
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ['error'],
  })

// Always reuse the same PrismaClient instance to prevent connection pool exhaustion
globalForPrisma.prisma = db
