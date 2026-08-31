/// <reference types="vite/client" />
/// <reference types="svelte" />

// Content JSON is untyped by design: it is authored by hand and validated by
// scripts/validate.py, which enforces far more than a structural type could.
declare module '$content/*.json' {
  const value: any
  export default value
}
