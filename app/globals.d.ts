// Next.js handles CSS imports through its own build pipeline; tsc needs a
// declaration for the side-effect import in layout.tsx.
declare module "*.css";
