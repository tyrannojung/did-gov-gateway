// src/routes/vc.js
import express from "express";
import { signVC } from "../vc-sign.js";
import { getContract } from "../fabric.js";
import {
  getIssuerInfo,
  getLatestLicenseDid,
} from "../utils/key-io.js";
import { DID_CONFIG } from "../config.js";

const r = express.Router();

/*---------------------------------------------------------------
 ▸ POST /vcs/driver-license     —  VC 발급
 
 Request Body:
   {
     "licenseDid": "did:anam145:license:3nGrY8a6xiDNBLkd0TyG4CSx"  // optional
   }
 
 Response (201 Created):
   {
     "@context": ["https://www.w3.org/ns/credentials/v2"],
     "id": "4oHsZ9b7yjEPCMle1UzH5DTy",  // 랜덤 생성된 VC ID
     "type": ["VerifiableCredential", "DriverLicenseVC"],
     "issuer": {
       "id": "did:anam145:issuer:1234567890",
       "name": "Government24"
     },
     "issuanceDate": "2024-01-15T10:30:00.000Z",
     "credentialSubject": {
       "licenseId": "did:anam145:license:3nGrY8a6xiDNBLkd0TyG4CSx"
     },
     "proof": {
       "type": "Secp256r1Signature2018",
       "created": "2024-01-15T10:30:00.000Z",
       "verificationMethod": "did:anam145:issuer:1234567890#keys-1",
       "proofPurpose": "assertionMethod",
       "proofValue": "MEUCIQDx..."  // Issuer 개인키로 서명된 값
     }
   }
 
 Error Response (500):
   {
     "error": "에러 메시지"
   }
 
 Note:
   - licenseDid가 제공되지 않으면 최신 생성된 라이센스 DID 사용
   - VC는 자동으로 서명되어 체인코드에 저장됨
   - 서명은 json-stable-stringify로 정규화 후 생성
 ----------------------------------------------------------------*/
r.post("/driver-license", async (req, res) => {
  try {
    // licenseDid가 제공되지 않으면 최신 것 사용
    const licenseDid = req.body.licenseDid || getLatestLicenseDid();
    const { issuerDid } = getIssuerInfo();

    /* 1) VC skeleton 작성 & 서명 */
    const unsigned = {
      "@context": ["https://www.w3.org/ns/credentials/v2"],
      type: ["VerifiableCredential", "DriverLicenseVC"],
      issuer: { id: issuerDid, name: DID_CONFIG.defaults.issuerName },
      issuanceDate: new Date().toISOString(),
      credentialSubject: { licenseId: licenseDid },
    };
    const signed = signVC(unsigned);

    /* 2) 체인코드 저장 */
    const contract = await getContract();
    await contract.submitTransaction("putVC", JSON.stringify(signed));

    res.status(201).json(signed);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

/*---------------------------------------------------------------
 ▸ GET /vcs/:vcId               —  특정 VC 조회
 
 Request:
   - URL Parameter: vcId (required)
     예시: /vcs/4oHsZ9b7yjEPCMle1UzH5DTy
 
 Response (200 OK):
   {
     "@context": ["https://www.w3.org/ns/credentials/v2"],
     "id": "4oHsZ9b7yjEPCMle1UzH5DTy",
     "type": ["VerifiableCredential", "DriverLicenseVC"],
     "issuer": {
       "id": "did:anam145:issuer:1234567890",
       "name": "Government24"
     },
     "issuanceDate": "2024-01-15T10:30:00.000Z",
     "credentialSubject": {
       "licenseId": "did:anam145:license:3nGrY8a6xiDNBLkd0TyG4CSx"
     },
     "proof": {
       "type": "Secp256r1Signature2018",
       "created": "2024-01-15T10:30:00.000Z",
       "verificationMethod": "did:anam145:issuer:1234567890#keys-1",
       "proofPurpose": "assertionMethod",
       "proofValue": "MEUCIQDx..."
     }
   }
 
 Error Response (404):
   {
     "error": "VC를 찾을 수 없습니다: 4oHsZ9b7yjEPCMle1UzH5DTy"
   }
 
 Note:
   - vcId는 VC 발급 시 생성된 고유 ID
   - 체인코드에서 "VC:" 접두사를 붙여 저장됨
 ----------------------------------------------------------------*/
r.get("/:vcId", async (req, res) => {
  try {
    const contract = await getContract();
    const vcBuf = await contract.evaluateTransaction("getVC", req.params.vcId);
    const vc = JSON.parse(vcBuf.toString());
    res.json(vc);
  } catch (e) {
    res.status(404).json({ error: e.message });
  }
});

/*---------------------------------------------------------------
 ▸ GET /vcs/:vcId/verify        —  VC 검증
 
 Request:
   - URL Parameter: vcId (required)
     예시: /vcs/4oHsZ9b7yjEPCMle1UzH5DTy/verify
 
 Response (200 OK):
   {
     "valid": true,
     "reason": "VC가 유효합니다."
   }
 
 Error Response (200 OK with valid=false):
   {
     "valid": false,
     "reason": "VC를 찾을 수 없습니다."
   }
   또는
   {
     "valid": false,
     "reason": "VC 유효기간이 만료되었거나 아직 활성화되지 않았습니다."
   }
   또는
   {
     "valid": false,
     "reason": "연결된 면허증 DID를 찾을 수 없습니다."
   }
   또는
   {
     "valid": false,
     "reason": "면허증이 유효하지 않습니다. 현재 상태: REVOKED"
   }
   또는
   {
     "valid": false,
     "reason": "VC 서명이 유효하지 않습니다."
   }
 
 Error Response (500):
   {
     "error": "서버 오류 메시지"
   }
 
 검증 프로세스:
   1. VC가 체인에 존재하는지 확인
   2. VC 유효기간 확인 (validFrom ~ validUntil)
   3. 연결된 License DID의 상태 확인 (ACTIVE인지)
   4. Issuer DID에서 공개키를 가져와 서명 검증
   5. 모든 검증 통과 시 valid: true 반환
 
 Note:
   - 이 API는 체인코드의 verifyVC 함수를 직접 호출
   - VC의 모든 무결성을 체인 상에서 검증
 ----------------------------------------------------------------*/
r.get("/:vcId/verify", async (req, res) => {
  try {
    const contract = await getContract();
    const result = await contract.evaluateTransaction("verifyVC", req.params.vcId);
    res.json(JSON.parse(result.toString()));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

export default r;