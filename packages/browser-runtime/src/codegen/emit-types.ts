import type { Spec, EntitySpec, FieldSpec } from "./parse-spec.js";

function mapTsType(ty: string): string {
  switch (ty) {
    case "uuid":
    case "string":
    case "text":
      return "string";
    case "int":
    case "bigint":
    case "float":
    case "decimal":
      return "number";
    case "bool":
      return "boolean";
    case "timestamp":
      return "string";
    case "json":
      return "unknown";
    default:
      return "unknown";
  }
}

function toSnakeCase(s: string): string {
  return s.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
}

function emitEntityInterface(entity: EntitySpec, softDelete: boolean): string {
  const lines: string[] = [];
  lines.push(`export interface ${entity.name} {`);
  lines.push(`  ${entity.id.name}: ${mapTsType(entity.id.type)};`);
  for (const f of entity.fields) {
    const tsType = mapTsType(f.type);
    const opt = f.required ? "" : "?";
    lines.push(`  ${f.name}${opt}: ${tsType};`);
  }
  lines.push(`  created_at: string;`);
  lines.push(`  updated_at: string;`);
  if (softDelete) {
    lines.push(`  deleted_at?: string;`);
  }
  lines.push(`}`);
  return lines.join("\n");
}

function emitCreateInput(entity: EntitySpec): string {
  const lines: string[] = [];
  lines.push(`export interface Create${entity.name}Input {`);
  for (const f of entity.fields) {
    const tsType = mapTsType(f.type);
    const opt = f.required ? "" : "?";
    lines.push(`  ${f.name}${opt}: ${tsType};`);
  }
  lines.push(`}`);
  return lines.join("\n");
}

function emitUpdateInput(entity: EntitySpec): string {
  const lines: string[] = [];
  lines.push(`export interface Update${entity.name}Input {`);
  for (const f of entity.fields) {
    const tsType = mapTsType(f.type);
    lines.push(`  ${f.name}?: ${tsType};`);
  }
  lines.push(`}`);
  return lines.join("\n");
}

export function emitTypes(spec: Spec): string {
  const softDelete = spec.config.soft_delete ?? false;
  const parts: string[] = [];
  parts.push("// Auto-generated from specs/self.yaml — do not edit");
  parts.push("");
  parts.push(
    `export interface ListParams { limit: number; offset: number; }`
  );
  parts.push(
    `export interface ListResult<T> { rows: T[]; total: number; }`
  );
  parts.push("");

  for (const entity of spec.entities) {
    parts.push(emitEntityInterface(entity, softDelete));
    parts.push("");
    parts.push(emitCreateInput(entity));
    parts.push("");
    parts.push(emitUpdateInput(entity));
    parts.push("");
  }

  return parts.join("\n");
}
