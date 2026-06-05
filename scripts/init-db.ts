import { neon } from '@neondatabase/serverless';

async function main() {
  const DATABASE_URL = process.env.DATABASE_URL!;
  const sql = neon(DATABASE_URL);

  console.log('创建数据库表...');

  // 创建 parse_rules 表
  await sql`
    CREATE TABLE IF NOT EXISTS parse_rules (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(255) NOT NULL,
      description TEXT,
      file_type VARCHAR(50) NOT NULL,
      rule_config JSONB NOT NULL,
      created_by VARCHAR(50) DEFAULT 'manual',
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `;
  console.log('✓ parse_rules 表已创建');

  // 创建 waybills 表
  await sql`
    CREATE TABLE IF NOT EXISTS waybills (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      external_code VARCHAR(255),
      recipient_store VARCHAR(255),
      recipient_name VARCHAR(255),
      recipient_phone VARCHAR(50),
      recipient_address TEXT,
      sku_code VARCHAR(255) NOT NULL,
      sku_name VARCHAR(255) NOT NULL,
      sku_quantity INTEGER NOT NULL,
      sku_spec VARCHAR(255),
      remark TEXT,
      batch_id UUID NOT NULL,
      source_file VARCHAR(255),
      parse_rule_id UUID REFERENCES parse_rules(id),
      status VARCHAR(20) DEFAULT 'imported',
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `;
  console.log('✓ waybills 表已创建');

  // 创建索引
  await sql`CREATE INDEX IF NOT EXISTS idx_waybills_external_code ON waybills(external_code)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_waybills_batch_id ON waybills(batch_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_waybills_created_at ON waybills(created_at)`;
  console.log('✓ 索引已创建');

  console.log('数据库初始化完成！');
  process.exit(0);
}

main().catch(err => {
  console.error('初始化失败:', err);
  process.exit(1);
});
