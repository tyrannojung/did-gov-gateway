import express from "express";
import { randomId } from "../id-utils.js";
import { getContract } from "../fabric.js";
import { signVC } from "../vc-sign.js";
import { DID_CONFIG } from "../config.js";
import {
  getIssuerInfo,
  getUserInfo,
} from "../utils/key-io.js";

const r = express.Router();

/*---------------------------------------------------------------
 ▸ POST /licenses              —  운전면허증 DID 생성 및 VC 발급
 
 Request Body:
   {
     "userDid": "did:anam145:user:2mFqX7Z5whEMAKjc9SwF3BRw", // required
     "licenseNumber": "서울-01-123456"  // optional, 기본값: "11-22-33-44"
   }
 
 Response (200 OK):
   {
     "licenseDid": "did:anam145:license:3nGrY8a6xiDNBLkd0TyG4CSx",
     "userDid": "did:anam145:user:2mFqX7Z5whEMAKjc9SwF3BRw",
     "licenseNumber": "서울-01-123456",
     "vc": {
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
         "proofValue": "MEUCIQDx..."  // Base64 인코딩된 서명
       }
     }
   }
 
 Error Response (500):
   {
     "error": "userDid is required"
   }
   또는
   {
     "error": "홀더 DID를 찾을 수 없습니다: did:anam145:user:..."
   }
 
 Note:
   - userDid는 반드시 체인에 등록된 유효한 사용자 DID여야 함
   - License DID와 VC가 동시에 생성되어 발급됨
   - VC는 Issuer의 개인키로 서명되어 체인에 저장됨
   - licenseType은 현재 "일반"으로 고정됨
 ----------------------------------------------------------------*/
r.post("/", async (req, res) => {
  try {
    const { licenseNumber = DID_CONFIG.defaults.licenseNumber, userDid } = req.body;

    // userDid는 필수
    if (!userDid) {
      throw new Error("userDid is required");
    }

    const licenseId = randomId();
    const licenseDid = `did:anam145:license:${licenseId}`;
    const { issuerDid } = getIssuerInfo();

    const contract = await getContract();
    await contract.submitTransaction(
      "createLicenseDID",
      licenseId,
      issuerDid,
      userDid,
      licenseNumber,
      '{"licenseType":"일반"}'
    );

    // 즉시 VC 발급
    const unsigned = {
      "@context": ["https://www.w3.org/ns/credentials/v2"],
      type: ["VerifiableCredential", "DriverLicenseVC"],
      issuer: { id: issuerDid, name: "Government24" },
      issuanceDate: new Date().toISOString(),
      credentialSubject: { licenseId: licenseDid },
    };
    const signed = signVC(unsigned);
    
    // VC 체인코드 저장
    await contract.submitTransaction("putVC", JSON.stringify(signed));

    res.json({
      licenseDid,
      vc: signed,
      userDid,
      licenseNumber,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

/*---------------------------------------------------------------
 ▸ GET /licenses/:licenseId     —  운전면허증 DID Document 조회
 
 Request:
   - URL Parameter: licenseId (required)
     예시: /licenses/45s3FPxvFRdgdbwkWNdjCwxtUg51
     
     주의: 전체 DID가 아닌 ID 부분만 전달
     - 올바른 예: /licenses/45s3FPxvFRdgdbwkWNdjCwxtUg51
     - 잘못된 예: /licenses/did:anam145:license:45s3FPxvFRdgdbwkWNdjCwxtUg51
 
 Response (200 OK):
   {
     "@context": "https://www.w3.org/ns/did/v1",
     "id": "did:anam145:license:45s3FPxvFRdgdbwkWNdjCwxtUg51",
     "type": "LICENSE",
     "created": "2024-01-15T10:30:00.000Z",
     "updated": "2024-01-15T10:30:00.000Z",
     "controller": "did:anam145:issuer:1234567890",
     "holder": "did:anam145:user:2mFqX7Z5whEMAKjc9SwF3BRw",
     "licenseNumber": "A-123-456-7890",
     "verificationMethod": [{
       "id": "did:anam145:license:45s3FPxvFRdgdbwkWNdjCwxtUg51#keys-1",
       "type": "Secp256r1VerificationKey2018",
       "controller": "did:anam145:issuer:1234567890",
       "publicKeyMultibase": "default-issuer-key"
     }],
     "authentication": ["did:anam145:license:45s3FPxvFRdgdbwkWNdjCwxtUg51#keys-1"],
     "additionalInfo": {
       "licenseType": "일반"
     },
     "status": "ACTIVE"
   }
 
 Error Response (404):
   {
     "error": "DID를 찾을 수 없습니다: did:anam145:license:invalid"
   }
 
 Note:
   - licenseId는 randomId()로 생성된 Base58 인코딩 값
   - student.js의 GET /students/:studentId와 동일한 패턴
 ----------------------------------------------------------------*/
r.get("/:licenseId", async (req, res) => {
  try {
    const contract = await getContract();
    const licenseBuf = await contract.evaluateTransaction(
      "getLicenseDID", 
      req.params.licenseId
    );
    const licenseDoc = JSON.parse(licenseBuf.toString());
    res.json(licenseDoc);
  } catch (e) {
    res.status(404).json({ error: e.message });
  }
});

export default r;