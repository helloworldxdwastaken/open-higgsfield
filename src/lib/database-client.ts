import { Pool } from "@neondatabase/serverless";

export type SqlRow = Record<string, unknown>;
export type SqlClient = (strings: TemplateStringsArray, ...values: unknown[]) => Promise<SqlRow[]>;

type DatabaseGlobal = typeof globalThis & {
    __highfieldSqlPool?: Pool;
    __highfieldSqlClient?: SqlClient;
};
const databaseGlobal = global as DatabaseGlobal;

export function isDatabaseConfigured(): boolean {
    return Boolean(process.env.DATABASE_URL) && process.env.NEXT_PHASE !== "phase-production-build";
}

export function getSql(): SqlClient {
    if (databaseGlobal.__highfieldSqlClient) return databaseGlobal.__highfieldSqlClient;
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error("DATABASE_URL is not configured");
    const pool = new Pool({ connectionString: databaseUrl, max: 5 });
    databaseGlobal.__highfieldSqlPool = pool;
    databaseGlobal.__highfieldSqlClient = async (strings, ...values) => {
        const query = strings.reduce((text, part, index) => `${text}${index ? `$${index}` : ""}${part}`, "");
        const result = await pool.query(query, values);
        return result.rows as SqlRow[];
    };
    return databaseGlobal.__highfieldSqlClient;
}
