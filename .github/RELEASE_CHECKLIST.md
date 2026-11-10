# Release Checklist

After every version bump, complete ALL of the following before considering the release done:

## Code & packages
- [ ] Workbench compatibility class: C1–C7, with reason — recorded at the step directly after the Changelog step in the "CLI release" procedure in docs/canonical/06-OPERATIONS.md
- [ ] package.json, manifest.json, server.json all bumped to new version
- [ ] git tag vX.Y.Z pushed
- [ ] npm publish succeeded (browser auth)
- [ ] mcp-publisher publish succeeded

## GitHub
- [ ] GitHub release created at github.com/depwire/depwire/releases with full changelog
- [ ] Release tagged with the version (vX.Y.Z)

## Website
- [ ] website/index.html language count updated if new language added
- [ ] `npm run website:build && wrangler pages deploy website/dist --project-name depwire`
- [ ] website/index.html new language added to badge row and supported-languages section
- [ ] website/index.html evidence-backed project statistics reviewed
- [ ] website/index.html meta keywords updated

## Cloud / Infrastructure
- [ ] depwire-cloud parser/package.json bumped to match new depwire-cli version
- [ ] Railway auto-deploy confirmed (check https://depwire-cloud-production.up.railway.app)

## README
- [ ] README.md language count updated
- [ ] README.md badge row reflects current state
- [ ] README.md tested-on-real-world-projects table updated
- [ ] grep -i "injection|shell_exec|traversal|bypass|overflow|exploit" README.md returns 0 matches
