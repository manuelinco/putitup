#!/bin/sh
CLOUDFLARE_API_TOKEN="$CF_PAGES_TOKEN" npx wrangler pages deploy dist-business
