import YAML from "yaml";

export interface FieldRef {
  entity: string;
  field: string;
}

export interface FieldSpec {
  name: string;
  type: string;
  required: boolean;
  unique?: boolean;
  references?: FieldRef;
}

export interface EntitySpec {
  name: string;
  table: string;
  id: { name: string; type: string };
  fields: FieldSpec[];
}

export interface RelationSpec {
  name: string;
  kind: "has_many" | "belongs_to";
  source: string;
  target: string;
  foreign_key: string;
}

export interface ConfigSpec {
  visibility?: string;
  backend?: string;
  api?: boolean;
  soft_delete?: boolean;
}

export interface Spec {
  version: number;
  config: ConfigSpec;
  entities: EntitySpec[];
  relations: RelationSpec[];
}

export function parseSpec(yamlStr: string): Spec {
  const raw = YAML.parse(yamlStr);
  if (raw.version !== 1) {
    throw new Error(`unsupported spec version ${raw.version}`);
  }
  return {
    version: raw.version,
    config: raw.config ?? {},
    entities: (raw.entities ?? []).map(parseEntity),
    relations: raw.relations ?? [],
  };
}

function parseEntity(raw: Record<string, unknown>): EntitySpec {
  const fields = (raw.fields as Record<string, unknown>[]).map(
    (f): FieldSpec => ({
      name: f.name as string,
      type: f.type as string,
      required: (f.required as boolean) ?? false,
      unique: (f.unique as boolean) ?? false,
      references: f.references
        ? {
            entity: (f.references as Record<string, string>).entity,
            field: (f.references as Record<string, string>).field,
          }
        : undefined,
    })
  );
  return {
    name: raw.name as string,
    table: raw.table as string,
    id: raw.id as { name: string; type: string },
    fields,
  };
}

export function topologicalSort(entities: EntitySpec[]): EntitySpec[] {
  const nameToIdx = new Map(entities.map((e, i) => [e.name, i]));
  const inDegree = new Array(entities.length).fill(0);
  const adj: number[][] = entities.map(() => []);

  for (let i = 0; i < entities.length; i++) {
    for (const field of entities[i].fields) {
      if (field.references) {
        const depIdx = nameToIdx.get(field.references.entity);
        if (depIdx !== undefined && depIdx !== i) {
          adj[depIdx].push(i);
          inDegree[i]++;
        }
      }
    }
  }

  const queue: number[] = [];
  for (let i = 0; i < inDegree.length; i++) {
    if (inDegree[i] === 0) queue.push(i);
  }

  const sorted: EntitySpec[] = [];
  while (queue.length > 0) {
    const idx = queue.shift()!;
    sorted.push(entities[idx]);
    for (const next of adj[idx]) {
      inDegree[next]--;
      if (inDegree[next] === 0) queue.push(next);
    }
  }

  return sorted.length < entities.length ? [...entities] : sorted;
}
