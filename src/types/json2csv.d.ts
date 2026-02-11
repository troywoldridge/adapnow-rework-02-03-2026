// src/types/json2csv.d.ts

declare module "json2csv" {
  export function parse<T = any>(input: T | T[], opts?: any): string;
}
