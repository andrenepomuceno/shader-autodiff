# 003 Release pipeline and public package

So other people (three.js users in particular) can use the library.

Done: MIT license, package metadata and types, local release script (`scripts/release.mjs`,
docs/releasing.md), three.js example.

Left:
- Make the GitHub repository public (owner approved on 2026-10-18).
- Cut v0.1.0 with `npm run release -- 0.1.0` after a dry run; check the CDN import in README works.
