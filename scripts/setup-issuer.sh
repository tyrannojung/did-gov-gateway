#!/usr/bin/env bash
set -e

echo "🚀 Setting up issuer DID..."

# 1. Generate issuer wallet
echo "1️⃣ Generating issuer wallet..."
pnpm init:issuer

# 2. Start server in background
echo "2️⃣ Starting server..."
pnpm start &
SERVER_PID=$!

# Wait for server to start
sleep 5

# 3. Register issuer DID on chain
echo "3️⃣ Registering issuer DID on chain..."

# Read issuer wallet
ISSUER_WALLET=$(cat src/storage/issuer/issuer.wallet)
PUBLIC_KEY=$(echo $ISSUER_WALLET | jq -r '.publicKey')

# Register issuer DID
curl -X POST http://localhost:8081/dids/issuer/bootstrap \
  -H "Content-Type: application/json" \
  -d "{
    \"publicKeyPem\": \"$PUBLIC_KEY\",
    \"meta\": {
      \"name\": \"정부24 운전면허 발급기관\",
      \"type\": \"government\"
    }
  }"

# Stop server
kill $SERVER_PID

echo "✅ Issuer setup complete!"
echo "You can now start the server with: pnpm dev or pnpm start"