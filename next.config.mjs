import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
export default {
  // better-sqlite3 is a native module: keep it external to the server
  // bundle so Next doesn't try to trace/bundle the .node binary.
  serverExternalPackages: ["better-sqlite3"],
  typescript: {
    // Next 15 cannot drive TypeScript 7 (it needs the JS compiler API that
    // TS7's native compiler doesn't expose). The project is on TS7 and the
    // spec pins Next 15, so rather than downgrade the compiler or jump a
    // Next major, type-checking stays where it already was: `tsc --noEmit`
    // runs over the whole repo (app/ and components/ included, see
    // tsconfig include) and is part of the verification run before every
    // commit. This flag skips Next's DUPLICATE check, not the only one.
    ignoreBuildErrors: true,
  },
  // Set the "@/" alias explicitly rather than relying on tsconfig paths
  // pickup, which didn't resolve under this Next/tsconfig combination.
  // Same reason as the typescript block: Next's lint step also loads the
  // TS compiler API. Repo-wide type checking runs via `tsc --noEmit`.
  eslint: { ignoreDuringBuilds: true },
  webpack(config) {
    config.resolve.alias["@"] = root;
    return config;
  },
};
