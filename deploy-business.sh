#!/bin/sh
echo "CF_PAGES_TOKEN set: ${#CF_PAGES_TOKEN} chars"
export CLOUDFLARE_API_TOKEN="$CF_PAGES_TOKEN"
echo "CLOUDFLARE_API_TOKEN set: ${#CLOUDFLARE_API_TOKEN} chars"
npx wrangler pages deploy dist-business
