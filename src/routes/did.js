// src/routes/did.js
import express from "express";
import fs from "fs";
import path from "path";
import { randomId } from "../id-utils.js";
import { getContract } from "../fabric.js";
import { b642pem, getUserInfo } from "../utils/key-io.js";

const r = express.Router();

/*------------------------------------------------------------------
 ▸ GET /dids/:did            : 체인코드에서 DID JSON 조회
 
 Request:
   - URL Parameter: did (required)
     예시: /dids/did:anam145:user:2mFqX7Z5whEMAKjc9SwF3BRw
 
 Response (200 OK):
   {
     "@context": "https://www.w3.org/ns/did/v1",
     "id": "did:anam145:user:2mFqX7Z5whEMAKjc9SwF3BRw",
     "type": "USER", // USER | ISSUER | LICENSE
     "created": "2024-01-15T10:30:00.000Z",
     "updated": "2024-01-15T10:30:00.000Z",
     "controller": "did:anam145:user:2mFqX7Z5whEMAKjc9SwF3BRw",
     "verificationMethod": [{
       "id": "did:anam145:user:2mFqX7Z5whEMAKjc9SwF3BRw#keys-1",
       "type": "Secp256r1VerificationKey2018",
       "controller": "did:anam145:user:2mFqX7Z5whEMAKjc9SwF3BRw",
       "publicKeyPem": "-----BEGIN PUBLIC KEY-----\n..."
     }],
     "authentication": ["did:anam145:user:2mFqX7Z5whEMAKjc9SwF3BRw#keys-1"],
     "additionalInfo": {"name": "홍길동", "email": "hong@example.com"},
     "status": "ACTIVE"
   }
 
 Error Response (404):
   {
     "error": "DID를 찾을 수 없습니다: did:anam145:user:invalid"
   }
 -----------------------------------------------------------------*/
r.get("/:did(*)", async (req, res) => {
  try {
    const contract = await getContract();
    const buf = await contract.evaluateTransaction("getDID", req.params.did);
    res.json(JSON.parse(buf.toString()));
  } catch (e) {
    res.status(404).json({ error: e.message });
  }
});

/*------------------------------------------------------------------
 ▸ POST /dids/user           : User-DID 생성
 
 Request Body:
   {
     "publicKeyPem": "Base64로 인코딩된 공개키 또는 PEM 형식 (required)",
     "meta": {  // 선택사항 - 추가 사용자 정보
       "name": "홍길동",
       "email": "hong@example.com",
       "phone": "010-1234-5678"
     }
   }
 
 Response (201 Created):
   {
     "userId": "2mFqX7Z5whEMAKjc9SwF3BRw",  // Base58로 인코딩된 랜덤 ID
     "did": "did:anam145:user:2mFqX7Z5whEMAKjc9SwF3BRw"
   }
 
 Error Response (500):
   {
     "error": "publicKeyPem is required"  // 필수 필드 누락
   }
   또는
   {
     "error": "이미 존재하는 유저 DID입니다: did:anam145:user:..."  // 중복 DID
   }
 
 Note:
   - publicKeyPem은 Secp256r1 (P-256) 곡선으로 생성된 공개키여야 함
   - Base64 인코딩된 DER 형식 또는 PEM 형식 모두 지원
   - userId는 20바이트 랜덤 값을 Base58로 인코딩하여 생성
 -----------------------------------------------------------------*/
r.post("/user", async (req, res) => {
  console.log(`[DID] Creating user DID...`);
  try {
    const { publicKey, additionalInfo = {} } = req.body;

    // publicKey가 제공되지 않으면 에러
    if (!publicKey) {
      throw new Error("publicKey is required");
    }

    // userId 생성 (20바이트 nonce + Base58)
    const userId = randomId();
    const userDid = `did:anam145:user:${userId}`;

    // Base64로 인코딩된 경우 PEM으로 변환
    let pubPem = publicKey;
    if (!publicKey.includes("-----BEGIN")) {
      pubPem = b642pem(publicKey, "PUBLIC KEY");
    }

    const contract = await getContract();
    await contract.submitTransaction(
      "createUserDID",
      userId,
      pubPem,
      JSON.stringify(additionalInfo)
    );

    res.status(201).json({
      userId,
      did: userDid,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

/*------------------------------------------------------------------
 ▸ POST /dids/issuer/bootstrap : Issuer-DID 부트스트랩
 
 Request Body:
   {
     "publicKeyPem": "Base64로 인코딩된 발급기관 공개키 (required)",
     "meta": {  // 선택사항 - 발급기관 추가 정보
       "name": "정부24",
       "type": "government",
       "website": "https://www.gov24.go.kr"
     }
   }
 
 Response (201 Created):
   {
     "issuerId": "1nFqX7Z5whEMAKjc9SwF3BRw",
     "did": "did:anam145:issuer:1nFqX7Z5whEMAKjc9SwF3BRw"
   }
 
 Error Response (500):
   {
     "error": "이미 존재 Issuer DID: did:anam145:issuer:..."
   }
   또는
   {
     "error": "허가되지 않은 MSP: Org3MSP"  // 권한 없는 조직
   }
 
 Note:
   - 이 API는 발급기관 초기 설정 시에만 사용됨
   - ISSUER_ID가 환경변수에 설정되어 있으면 해당 값 사용, 없으면 랜덤 생성
   - 체인코드에서 Org1MSP 또는 Org2MSP만 호출 가능하도록 제한됨
   - 일반적으로 setup:issuer 스크립트에서 자동 호출됨
 -----------------------------------------------------------------*/
r.post("/issuer/bootstrap", async (req, res) => {
  try {
    const { publicKeyPem: pubB64, meta = {} } = req.body;
    const pubPem = b642pem(pubB64, "PUBLIC KEY");

    const issuerId = process.env.ISSUER_ID || randomId();
    const contract = await getContract();
    await contract.submitTransaction(
      "createIssuerDID",
      issuerId,
      pubPem,
      JSON.stringify(meta)
    );

    res.status(201).json({
      issuerId,
      did: `did:anam145:issuer:${issuerId}`,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

export default r;