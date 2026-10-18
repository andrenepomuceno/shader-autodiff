# 003 Release pipeline and public package

So other people (three.js users in particular) can use the library.

- Local release script, no GitHub Actions: tests, version bump, CHANGELOG, tag, `npm publish`,
  GitHub release. Dry-run mode.
- Package metadata: license, repository, keywords, `exports`, `sideEffects: false`, types
  (hand-written `.d.ts`), files list; works from a CDN as plain ESM (no build).
- three.js example: `ShaderMaterial` with a user-typed SDF or height field, normals from the
  emitted gradient.
- Decisions for the owner: license, npm name, making the repository public, npm account/2FA.
