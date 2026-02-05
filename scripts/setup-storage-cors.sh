#!/bin/bash
# Apply CORS config to Firebase Storage so profile picture uploads work from localhost.
# Requires: gcloud CLI (https://cloud.google.com/sdk/docs/install)
# Run from project root: ./scripts/setup-storage-cors.sh

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
CORS_FILE="$PROJECT_ROOT/storage.cors.json"
BUCKET="gs://notus-e026b.firebasestorage.app"

if [ ! -f "$CORS_FILE" ]; then
  echo "Error: storage.cors.json not found at $CORS_FILE"
  exit 1
fi

echo "Applying CORS config to $BUCKET..."
if command -v gcloud &> /dev/null; then
  gcloud storage buckets update "$BUCKET" --cors-file="$CORS_FILE"
  echo "Done. Profile picture uploads should now work from localhost."
elif command -v gsutil &> /dev/null; then
  gsutil cors set "$CORS_FILE" "$BUCKET"
  echo "Done. Profile picture uploads should now work from localhost."
else
  echo "Error: Neither gcloud nor gsutil found. Install Google Cloud SDK:"
  echo "  https://cloud.google.com/sdk/docs/install"
  echo ""
  echo "Or run manually in Google Cloud Shell:"
  echo "  gcloud storage buckets update $BUCKET --cors-file=storage.cors.json"
  exit 1
fi
