export interface SettingsExtension {
  source: string;
  entrypoint: string;
  library?: string;
  sha256?: string;
}

export interface SettingsConfig {
  server: { public_origin: string } | null;
  cache: { path: string; max_size_mb: number };
  sqlite: { extensions: SettingsExtension[] };
  fulltext: { analyzer: string };
  embedding: {
    base_url: string;
    model: string;
    dimensions: number;
    similarity: string;
    api_key_env: string;
  };
}

export interface SettingsSnapshot {
  revision: string;
  effective: SettingsConfig;
  saved: SettingsConfig;
  pendingRestart: boolean;
  credential: {
    source: "private_file" | "environment" | "none";
    configured: boolean;
    canUpdate: boolean;
    pendingRestart: boolean;
  };
  runtime: {
    version: string;
    platform: string;
    endpoint: string;
    mcpPath: string;
    parameters: { key: string; value: string; source: string }[];
  };
  databasePath: string;
}

export type SettingsCategory = "display" | "connection" | "retrieval" | "storage" | "runtime";
export type SettingsFetch = (path: string, init?: RequestInit) => Promise<Response>;
export interface SettingsPatch {
  server?: NonNullable<SettingsConfig["server"]>;
  cache?: SettingsConfig["cache"];
  sqlite?: SettingsConfig["sqlite"];
}

export interface EmbeddingTestResult {
  ok: boolean;
  dimensions?: number;
  reason?: string;
  httpStatus?: number;
}
