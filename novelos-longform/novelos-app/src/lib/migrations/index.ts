import { sql as v001 } from "./V001__global_tables";
import { sql as v002 } from "./V002__project_tables";
import { sql as v003 } from "./V003__seed_genre_templates";
import { sql as v004 } from "./V004__seed_soul_templates";
import { sql as v005 } from "./V005__seed_deai_and_banned";
import { sql as v006 } from "./V006__extended_seed_data";

export interface Migration {
  version: number;
  name: string;
  sql: string;
}

// Global database migrations (schema + seed data for shared tables)
export const globalMigrations: Migration[] = [
  { version: 1, name: "global_tables", sql: v001 },
  { version: 3, name: "seed_genre_templates", sql: v003 },
  { version: 4, name: "seed_soul_templates", sql: v004 },
  { version: 5, name: "seed_deai_and_banned", sql: v005 },
  { version: 6, name: "extended_seed_data", sql: v006 },
];

// Project database migrations (schema only, per-project data)
export const projectMigrations: Migration[] = [
  { version: 2, name: "project_tables", sql: v002 },
];
