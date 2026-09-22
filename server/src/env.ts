export interface Env {
  MATCHMAKER: DurableObjectNamespace;
  MATCH_ROOM: DurableObjectNamespace;
  GAME_DB: D1Database;
  ASSETS?: Fetcher;
  SSO_SHARED_SECRET: string;
  GAME_SESSION_SECRET: string;
  SSO_ISSUER_URL: string;
  MM_SHARDS?: string;
  ROOM_CAP_MAX?: string;
  DEV_AUTH?: string;
  /** Optional Workers Rate Limiting binding. */
  API_LIMIT?: { limit(o: { key: string }): Promise<{ success: boolean }> };
}
