# Releasing

Releases are cut locally; there is no CI (no GitHub Actions minutes are used).

1. Make sure `CHANGELOG.md` has the notes under `## Unreleased`.
2. Run the GPU check: `npm run test:gpu` (add `-- --adapter=GPU2` to use a monitorless GPU).
3. Log in to npm once: `npm login` (2FA prompts appear during publish).
4. Dry run, which changes nothing and shows the tarball contents and the release notes:

   ```bash
   npm run release -- 0.1.0 --dry-run
   ```

5. Release:

   ```bash
   npm run release -- 0.1.0
   ```

   The script checks that `main` is clean and in sync with `origin`, runs `node --test`, moves the
   Unreleased notes under the version, bumps `package.json`, commits `Release v0.1.0`, tags
   `v0.1.0`, pushes with tags, runs `npm publish --access public` and creates the GitHub release
   with `gh release create`.

The script pushes the release commit and tag before publishing, so a published version always has
its tag on GitHub. If a step fails it stops and prints the exact commands to resume; do not re-tag.
