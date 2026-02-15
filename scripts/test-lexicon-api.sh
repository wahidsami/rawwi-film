#!/usr/bin/env bash
# Minimal test for lexicon Edge Function.
# Usage: ./scripts/test-lexicon-api.sh <BASE_URL> <JWT>
# Example: ./scripts/test-lexicon-api.sh http://127.0.0.1:54321/functions/v1 "eyJ..."

set -e
BASE="${1:-http://127.0.0.1:54321/functions/v1}"
TOKEN="${2:?Pass JWT as second argument}"

echo "GET /lexicon/terms"
curl -s -H "Authorization: Bearer $TOKEN" "$BASE/lexicon/terms" | jq 'if type == "array" then "OK: \(length) terms" else . end'

echo ""
echo "POST /lexicon/terms (minimal)"
RES=$(curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"term":"test-curl-'$(date +%s)'","term_type":"word","category":"other","severity_floor":"medium","enforcement_mode":"mandatory_finding","gcam_article_id":1}' \
  "$BASE/lexicon/terms")
echo "$RES" | jq .
ID=$(echo "$RES" | jq -r '.id')
if [ "$ID" = null ] || [ -z "$ID" ]; then
  echo "POST failed or no id in response"
  exit 1
fi

echo ""
echo "GET /lexicon/history/$ID"
curl -s -H "Authorization: Bearer $TOKEN" "$BASE/lexicon/history/$ID" | jq 'if type == "array" then "OK: \(length) history rows" else . end'

echo ""
echo "PUT /lexicon/terms/$ID (deactivate)"
curl -s -X PUT -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d "{\"is_active\":false,\"change_reason\":\"Test deactivate\"}" \
  "$BASE/lexicon/terms/$ID" | jq .

echo ""
echo "Done. Term id: $ID"
