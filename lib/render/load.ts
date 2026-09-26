// Approved parts for the render manifest, read-only. `vendorKey` scopes to
// one tenant's catalog: the parts that vendor lists. Outputs stay shared,
// because a job's hash depends on geometry, not on who asked.

import Database from "better-sqlite3";
import type { RenderPart } from "./shape-keys";

export function loadRenderParts(dbPath = "data/modbench.db", vendorKey?: string): RenderPart[] {
  const db = new Database(dbPath, { readonly: true });
  try {
    const rows = (
      vendorKey
        ? db
            .prepare(
              `select distinct p.id, p.category, p.family, p.name, p.attributes from parts p
               join listings l on l.part_id = p.id join vendors v on v.id = l.vendor_id
               where p.review_state = 'approved' and v.key = ?`,
            )
            .all(vendorKey)
        : db.prepare("select id, category, family, name, attributes from parts where review_state = 'approved'").all()
    ) as { id: string; category: string; family: string; name: string; attributes: string }[];
    return rows.map((r) => ({ ...r, attributes: JSON.parse(r.attributes || "{}") as Record<string, unknown> }));
  } finally {
    db.close();
  }
}
