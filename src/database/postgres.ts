import { eabort, mapErr } from "../helpers";
import { Logger } from "../logging";
import { IDatabase } from "./types";
import {Client as PgClient} from 'pg';

export class PostgresDatabase implements IDatabase {
    private readonly _logger: Logger
    private readonly _connection!: PgClient;
    private static _instance?: PostgresDatabase;
    private static readonly _authRecordsTableName = 'authorized_records';

    private static readonly _authRecordsTableQuery = `CREATE TABLE IF NOT EXISTS ${PostgresDatabase._authRecordsTableName} 
    (
        id SERIAL PRIMARY KEY,
        uid TEXT NOT NULL UNIQUE,
        discord_uid TEXT NOT NULL UNIQUE,
        access_token TEXT NOT NULL,
        refresh_token TEXT NOT NULL,
        expires BIGINT NOT NULL
    );`

    private static readonly _authRecordsUidIndexQuery = `CREATE INDEX IF NOT EXISTS idx_uid ON ${PostgresDatabase._authRecordsTableName} (uid);`
    private static readonly _authRecordsDuidIndexQuery = `CREATE INDEX IF NOT EXISTS idx_duid ON ${PostgresDatabase._authRecordsTableName} (discord_uid);`

    constructor(con: string) {
        this._logger = Logger.get();
        try {
            this._connection = new PgClient({connectionString: con});
            this._connection.connect();
        } catch (err) {
            if (err instanceof Error) {
                eabort('Error during setting up postgres connection.', mapErr(err));
            } else {
                eabort('Unknown error during postgres setup.');
            }
        }
    }

    async init(): Promise<boolean> {
        try {
            await this._connection.query(PostgresDatabase._authRecordsTableQuery);
            return true;
        } catch (err) {
            if (err instanceof Error) {
                this._logger.warn("Error occured during Postgres init method.", mapErr(err));
            }
            return false;
        }
    }

    async execute(sql: string, params: (string | number)[] = []): Promise<boolean> {
        try {
            await this._connection.query(sql, params);
            return true;
        } catch (err) {
            this._handleError(sql, err);
            return false;
        }
    }

    async upsert(table: string, data: Record<string, string | number>): Promise<boolean> {
        const columns = Object.keys(data);
        const values = Object.values(data);
    
        const placeholders = columns.map((_, index) => `$${index + 1}`).join(", ");
    
        const query = `
            INSERT INTO ${table} (${columns.join(", ")})
            VALUES (${placeholders})
            ON CONFLICT (${columns[0]}) DO UPDATE SET
            ${columns.slice(1).map(col => `${col} = EXCLUDED.${col}`).join(", ")};
        `;
        
        try {
            await this._connection.query(query, values);
            return true;
        } catch (err) {
            this._handleError(query, err);
            return false;
        }
    }

    async selectOne<T>(query: string, params: (string | number)[] = []): Promise<T | null> {
        try {
            const result = await this._connection.query(query, params);
    
            if (result.rows.length > 0) {
                return result.rows[0] as T;
            } else {
                return null;
            }
        } catch (err) {
            this._handleError(query, err);
            return null;
        }
    }

    private _handleError(query: string, err: unknown): boolean {
        if (err && err instanceof Error) {
            this._logger.error(`Error during Postgres query. ${query}`, mapErr(err));
            return false;
        } else if (err) {
            this._logger.error(`Unknown error occured during Postgres query. ${query}`);
            return false;
        }

        return true;
    }
}