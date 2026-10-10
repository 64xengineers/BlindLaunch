# Toolchain

Checked on this development machine on 2026-10-10. Do not treat missing
Solana, Anchor, or Arcium versions as pins. Those tools are not installed
yet, and their versions must come from the current Arcium installer and
example manifests before the program or circuit is written.

| Tool | Status |
| --- | --- |
| Git | 2.50.1 |
| Node.js | v25.8.2 (installed; not separately pinned to an LTS line) |
| npm | 11.11.1 |
| pnpm | 10.18.0, activated with Corepack and recorded in `package.json` |
| Docker | 29.1.3 |
| Rust | not installed |
| Solana CLI | not installed |
| Anchor | not installed |
| Arcium | not installed |

The JavaScript workspace uses pnpm only. Do not add an npm or Yarn lockfile.

Phase 1 auction math does not need Rust, Solana, Anchor, or Arcium. Install
those from the current Arcium documentation before building the program or
the encrypted instruction, and record the versions that installer selects in
this file.
