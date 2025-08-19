#!/bin/sh
# If ADOBE_EMBED_API_KEY is set at runtime, copy it to NEXT_PUBLIC_ADOBE_EMBED_API_KEY
if [ -n "$ADOBE_EMBED_API_KEY" ]; then
  export NEXT_PUBLIC_PDF_EMBED_API_KEY="$ADOBE_EMBED_API_KEY"
fi

exec "$@"
