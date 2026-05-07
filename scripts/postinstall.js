#!/usr/bin/env node

const message = `
╔═══════════════════════════════════════════════════════╗
║                                                       ║
║   ✅ depwire-cli installed successfully!              ║
║                                                       ║
║   Get started:                                        ║
║     depwire parse .                                   ║
║     depwire health .                                  ║
║     depwire security .                                ║
║                                                       ║
║   📊 Cloud dashboard (free):                          ║
║     app.depwire.dev                                   ║
║                                                       ║
║   📖 Docs: depwire.dev                               ║
║   ⭐ GitHub: github.com/depwire/depwire               ║
║                                                       ║
╚═══════════════════════════════════════════════════════╝
`;

// Only show in interactive terminals, not in CI
if (process.stdout.isTTY) {
  console.log(message);
}
