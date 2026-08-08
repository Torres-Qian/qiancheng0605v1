import "dotenv/config";
import { neon } from "@neondatabase/serverless";
const sql = neon(process.env.DATABASE_URL);
const rows = await sql`SELECT COUNT(*) FROM sku_master`;
console.log("sku_master count:", rows[0].count);
const sample = await sql`SELECT sku_code FROM sku_master WHERE sku_code = 'SKU_10815'`;
console.log("SKU_10815 exists:", sample.length > 0);
