
if [ -n "$ADOBE_EMBED_API_KEY" ]; then
  export NEXT_PUBLIC_ADOBE_EMBED_API_KEY="$ADOBE_EMBED_API_KEY"
fi

exec "$@"
