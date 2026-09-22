export const KGOS_VERSION = "0.0.0";
export const PRODUCT_NAME = "KG OS";

export type JsonPrimitive = boolean | null | number | string;
export type JsonValue =
  JsonPrimitive | readonly JsonValue[] | { readonly [key: string]: JsonValue };
