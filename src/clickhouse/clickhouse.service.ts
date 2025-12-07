import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, ClickHouseClient } from '@clickhouse/client';

@Injectable()
export class ClickHouseService implements OnModuleInit, OnModuleDestroy {
  private client: ClickHouseClient;

  constructor(private configService: ConfigService) {}

  async onModuleInit() {
    this.client = createClient({
      url: this.configService.get<string>('CLICKHOUSE_HOST'),
      database: this.configService.get<string>('CLICKHOUSE_DATABASE'),
      username: this.configService.get<string>('CLICKHOUSE_USER'),
      password: this.configService.get<string>('CLICKHOUSE_PASSWORD'),
    });
  }

  async onModuleDestroy() {
    await this.client.close();
  }

  async query<T>(sql: string): Promise<T[]> {
    const result = await this.client.query({
      query: sql,
      format: 'JSONEachRow',
    });
    return result.json();
  }

  async getTableSchema(tableName: string): Promise<string> {
    const result = await this.client.query({
      query: `DESCRIBE TABLE ${tableName}`,
      format: 'JSONEachRow',
    });
    const columns = await result.json<{ name: string; type: string }>();
    return columns.map((col) => `${col.name} (${col.type})`).join(', ');
  }

  async getTables(): Promise<string[]> {
    const result = await this.client.query({
      query: 'SHOW TABLES',
      format: 'JSONEachRow',
    });
    const tables = await result.json<{ name: string }>();
    return tables.map((t) => t.name);
  }
}
