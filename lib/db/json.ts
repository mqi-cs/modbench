// Single choke point for JSON-in-a-text-column access. SQLite has no native
// jsonb, so `attributes` and `rawPayload` are stored as serialized text.
// Every read/write of those columns must go through here — see
// specs/08-DEFERRED.md D1: this is what keeps a later move to Postgres jsonb
// a single-file change instead of a codebase-wide one.

export function toJsonColumn(value: unknown): string {
  return JSON.stringify(value);
}

export function fromJsonColumn<T>(text: string): T {
  return JSON.parse(text) as T;
}

export function fromJsonColumnNullable<T>(text: string | null): T | null {
  return text === null ? null : (JSON.parse(text) as T);
}
