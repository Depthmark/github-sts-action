// Hugo module declaration. This repository ships its documentation as a
// content-only Hugo module that Depthmark/github-sts mounts into the published
// site; see docs/documentation-contract.md.
//
// The module is declared at the repository root, not in docs/, so that the
// tag release-please already creates (vX.Y.Z) resolves it. A module in a
// subdirectory would need a docs/vX.Y.Z tag, which release-please cannot
// produce. There is no Go code here and no dependencies.
module github.com/Depthmark/github-sts-action

go 1.26.1
