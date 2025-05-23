#!/usr/bin/env bash
set -e

issuerId=${1:-$(node -e "console.log(require('bs58').encode(require('crypto').randomBytes(20)))")}
echo "▶ issuerId = $issuerId"

# 1. 키쌍 생성
openssl ecparam -name prime256v1 -genkey -noout -out tmp-prv.pem
openssl ec -in tmp-prv.pem -pubout -out tmp-pub.pem

# 2. wallet 저장 (고정 파일명 issuer.wallet)
node - <<EOF
import fs from 'fs';
import { saveWallet } from './src/utils/key-io.js';
saveWallet(
  'issuer',
  '$issuerId',
  fs.readFileSync('tmp-pub.pem','utf8'),
  fs.readFileSync('tmp-prv.pem','utf8')
);
EOF
rm tmp-*.pem
echo "✔ wallet  : src/storage/issuer/issuer.wallet"

# 3. .env 갱신
envFile=".env"
grep -v '^ISSUER_ID='  "$envFile" | grep -v '^ISSUER_DID=' > "$envFile.tmp"
echo "ISSUER_ID=$issuerId"                    >> "$envFile.tmp"
echo "ISSUER_DID=did:anam145:issuer:$issuerId" >> "$envFile.tmp"
mv "$envFile.tmp" "$envFile"
echo "✔ .env updated"