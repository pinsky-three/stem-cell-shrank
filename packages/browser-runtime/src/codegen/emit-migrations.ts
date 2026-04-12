import type { Spec, EntitySpec } from "./parse-spec.js";
import { topologicalSort } from "./parse-spec.js";

function mapSqlType(ty: string): string {
  const m: Record<string, string> = {
    uuid: "UUID",
    string: "TEXT",
    text: "TEXT",
    int: "INTEGER",
    bigint: "BIGINT",
    float: "DOUBLE PRECISION",
    bool: "BOOLEAN",
    timestamp: "TIMESTAMPTZ",
    decimal: "NUMERIC",
    json: "JSONB",
  };
  return m[ty] ?? "TEXT";
}

function zeroDefault(ty: string): string {
  const m: Record<string, string> = {
    uuid: " DEFAULT '00000000-0000-0000-0000-000000000000'::uuid",
    string: " DEFAULT ''",
    text: " DEFAULT ''",
    int: " DEFAULT 0",
    bigint: " DEFAULT 0",
    float: " DEFAULT 0",
    bool: " DEFAULT false",
    timestamp: " DEFAULT now()",
    decimal: " DEFAULT 0",
    json: " DEFAULT '{}'::jsonb",
  };
  return m[ty] ?? "";
}

export function emitMigrations(spec: Spec): string[] {
  const softDelete = spec.config.soft_delete ?? false;
  const sorted = topologicalSort(spec.entities);
  const stmts: string[] = [];

  for (const entity of sorted) {
    const createCols = [
      `${entity.id.name} ${mapSqlType(entity.id.type)} PRIMARY KEY`,
      "created_at TIMESTAMPTZ NOT NULL DEFAULT now()",
      "updated_at TIMESTAMPTZ NOT NULL DEFAULT now()",
    ];

    stmts.push(
      `CREATE TABLE IF NOT EXISTS ${entity.table} (\n  ${createCols.join(",\n  ")}\n)`
    );

    for (const f of entity.fields) {
      let colDef = `${f.name} ${mapSqlType(f.type)}`;
      if (f.required) {
        colDef += " NOT NULL";
        colDef += zeroDefault(f.type);
      }
      if (f.unique) {
        colDef += " UNIQUE";
      }
      if (f.references) {
        const target = spec.entities.find(
          (e) => e.name === f.references!.entity
        );
        if (target) {
          colDef += ` REFERENCES ${target.table}(${f.references.field})`;
        }
      }
      stmts.push(
        `ALTER TABLE ${entity.table} ADD COLUMN IF NOT EXISTS ${colDef}`
      );
    }

    stmts.push(
      `ALTER TABLE ${entity.table} ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now()`
    );
    stmts.push(
      `ALTER TABLE ${entity.table} ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now()`
    );

    if (softDelete) {
      stmts.push(
        `ALTER TABLE ${entity.table} ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ`
      );
    }
  }

  return stmts;
}

export function emitReconcileStatements(
  spec: Spec
): { table: string; expected: string[] }[] {
  const softDelete = spec.config.soft_delete ?? false;
  return spec.entities.map((entity) => {
    const expected = [
      entity.id.name,
      ...entity.fields.map((f) => f.name),
      "created_at",
      "updated_at",
    ];
    if (softDelete) expected.push("deleted_at");
    return { table: entity.table, expected };
  });
}
