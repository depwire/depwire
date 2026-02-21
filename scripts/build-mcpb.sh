#!/bin/bash
set -e

echo "🔨 Building CodeGraph MCPB bundle..."

# Create clean temp directory
TEMP_DIR="$(mktemp -d)"
echo "📁 Using temp directory: $TEMP_DIR"

# Copy necessary files
echo "📦 Copying files..."
mkdir -p "$TEMP_DIR/server"
cp -r dist/* "$TEMP_DIR/server/"
cp manifest.json "$TEMP_DIR/"
cp icon.png "$TEMP_DIR/"
cp package.json "$TEMP_DIR/"
cp package-lock.json "$TEMP_DIR/"

# Rename mcpb-entry.js to index.js (as specified in manifest)
mv "$TEMP_DIR/server/mcpb-entry.js" "$TEMP_DIR/server/index.js" 2>/dev/null || true

# Install production dependencies only
echo "📥 Installing production dependencies..."
cd "$TEMP_DIR"
npm install --omit=dev --silent

# Remove unnecessary files from node_modules
echo "🧹 Cleaning up..."
find node_modules -name "*.md" -delete
find node_modules -name "*.ts" -delete
find node_modules -name "test" -type d -exec rm -rf {} + 2>/dev/null || true
find node_modules -name "tests" -type d -exec rm -rf {} + 2>/dev/null || true
find node_modules -name "*.map" -delete

# Build MCPB bundle
echo "📦 Creating MCPB bundle..."
mcpb pack

# Copy back to project root
MCPB_FILE=$(ls *.mcpb 2>/dev/null | head -1)
if [ -n "$MCPB_FILE" ]; then
  # Rename to codegraph.mcpb
  cp "$MCPB_FILE" "$OLDPWD/codegraph.mcpb"
  echo "✅ Bundle created: codegraph.mcpb"
  ls -lh "$OLDPWD/codegraph.mcpb"
else
  echo "❌ Failed to create MCPB bundle"
  exit 1
fi

# Cleanup
cd "$OLDPWD"
rm -rf "$TEMP_DIR"

echo "✨ Done!"
