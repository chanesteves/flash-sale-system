import { registerAs } from '@nestjs/config';

export const databaseConfig = registerAs('database', () => ({
  url:
    process.env['DATABASE_URL'] ||
    'postgresql://flash_sale_user:flash_sale_password@localhost:5432/flash_sale_db',
}));

export type DatabaseConfig = ReturnType<typeof databaseConfig>;
