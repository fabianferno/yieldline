#!/usr/bin/env zsh
# Push the API's runtime secrets from ../.env to the linked Vercel project (yieldline-api), then deploy.
# Run from agent/:  zsh scripts/vercel-env.sh
set -e
set -a; source ../.env; set +a
for k in ARC_RPC_URL EXPLORER_URL FACILITATOR_PRIVATE_KEY CIRCLE_API_KEY CIRCLE_ENTITY_SECRET ANTHROPIC_API_KEY ANTHROPIC_MODEL; do
  printf "%s" "${(P)k}" | vercel env add $k production --force >/dev/null && echo "set $k"
done
vercel deploy --prod --yes
