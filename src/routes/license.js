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
         "name": "정부24 Driver-License"
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
      issuer: { id: issuerDid, name: "정부24 Driver-License" },
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

export default r;