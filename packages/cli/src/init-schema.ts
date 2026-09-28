type InitValueKind =
  | "cache-path"
  | "positive-integer"
  | "string"
  | "url"
  | "dimensions"
  | "similarity"
  | "credential-env";

export interface InitFieldSpec {
  flag: string;
  section: "cache" | "fulltext" | "embedding";
  key: string;
  label: { en: string; zh: string };
  recommended: string;
  automaticDefault: boolean;
  kind: InitValueKind;
  help: { en: string; zh: string };
}

export const INIT_FIELD_SPECS = [
  {
    flag: "--cache-path",
    section: "cache",
    key: "path",
    label: { en: "Path", zh: "路径" },
    recommended: "cache/openai-compatible.db",
    automaticDefault: false,
    kind: "cache-path",
    help: {
      en: "Embedding cache path, relative to .kgos unless absolute",
      zh: "Embedding 缓存路径；相对路径以 .kgos 为基准"
    }
  },
  {
    flag: "--cache-max-size-mb",
    section: "cache",
    key: "max_size_mb",
    label: { en: "Maximum size (MB)", zh: "最大容量（MB）" },
    recommended: "4096",
    automaticDefault: false,
    kind: "positive-integer",
    help: { en: "Embedding cache size limit in MiB", zh: "Embedding 缓存容量上限（MiB）" }
  },
  {
    flag: "--fulltext-analyzer",
    section: "fulltext",
    key: "analyzer",
    label: { en: "Analyzer", zh: "分词器" },
    recommended: "jieba",
    automaticDefault: true,
    kind: "string",
    help: {
      en: "FTS5 tokenizer specification; new Instances default to jieba",
      zh: "FTS5 tokenizer specification；新 Instance 默认 jieba"
    }
  },
  {
    flag: "--embedding-base-url",
    section: "embedding",
    key: "base_url",
    label: { en: "Base URL", zh: "Base URL" },
    recommended: "https://api.openai.com/v1",
    automaticDefault: false,
    kind: "url",
    help: { en: "OpenAI-compatible API root", zh: "OpenAI-compatible API 根地址" }
  },
  {
    flag: "--embedding-model",
    section: "embedding",
    key: "model",
    label: { en: "Model", zh: "模型" },
    recommended: "text-embedding-3-small",
    automaticDefault: false,
    kind: "string",
    help: { en: "Embedding model identifier", zh: "Embedding 模型标识" }
  },
  {
    flag: "--embedding-dimensions",
    section: "embedding",
    key: "dimensions",
    label: { en: "Dimensions", zh: "维度" },
    recommended: "1536",
    automaticDefault: false,
    kind: "dimensions",
    help: { en: "Embedding dimensions, 1..4096", zh: "Embedding 维度，1..4096" }
  },
  {
    flag: "--embedding-similarity",
    section: "embedding",
    key: "similarity",
    label: { en: "Similarity", zh: "相似度" },
    recommended: "cosine",
    automaticDefault: false,
    kind: "similarity",
    help: { en: "cosine or euclidean", zh: "cosine 或 euclidean" }
  },
  {
    flag: "--embedding-api-key-env",
    section: "embedding",
    key: "api_key_env",
    label: { en: "API key environment variable", zh: "API Key 环境变量" },
    recommended: "OPENAI_API_KEY",
    automaticDefault: false,
    kind: "credential-env",
    help: {
      en: "Environment variable containing the API key; empty means no authentication",
      zh: "保存 API Key 的环境变量名；空字符串表示无需认证"
    }
  }
] as const satisfies readonly InitFieldSpec[];

export type InitField = (typeof INIT_FIELD_SPECS)[number]["flag"];

export const INIT_FIELDS = INIT_FIELD_SPECS.map((spec) => spec.flag) as readonly InitField[];
