import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dialect: 'postgresql',
  driver: 'pglite',
  schema: './src/main/db/schema.ts',
  out: './drizzle',
  dbCredentials: {
    url: './.moon-pglite-dev'
  },
  migrations: {
    table: '__drizzle_migrations',
    schema: 'public'
  },
  strict: true,
  verbose: true
})
