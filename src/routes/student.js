/**
 * 학생증 관련 API 라우터
 * 
 * 학생증 DID 생성 및 VC 발급을 담당합니다.
 * 운전면허증과 유사한 구조로 구현되어 있습니다.
 */

import express from "express";
import { randomId } from "../id-utils.js";
import { getContract } from "../fabric.js";
import { signVC } from "../vc-sign.js";
import { DID_CONFIG } from "../config.js";
import { getIssuerInfo } from "../utils/key-io.js";

const r = express.Router();

/*---------------------------------------------------------------
 ▸ POST /students              —  학생증 DID 생성 및 VC 발급
 
 Request Body:
   {
     "userDid": "did:anam145:user:2mFqX7Z5whEMAKjc9SwF3BRw", // required - 학생 DID
     "studentNumber": "2023572504",    // optional, default: "2023000000"
     "university": "Korea University",         // optional, default: "Korea University"
     "department": "Graduate School of Information Security"      // optional, default: "Graduate School of Information Security"
   }
 
 Response (200 OK):
   {
     "studentDid": "did:anam145:student:3nGrY8a6xiDNBLkd0TyG4CSx",
     "userDid": "did:anam145:user:2mFqX7Z5whEMAKjc9SwF3BRw",
     "studentNumber": "2023572504",
     "university": "고려대학교",
     "department": "정보보호대학원",
     "vc": {
       "@context": ["https://www.w3.org/ns/credentials/v2"],
       "id": "4oHsZ9b7yjEPCMle1UzH5DTy",
       "type": ["VerifiableCredential", "StudentCardVC"],
       "issuer": {
         "id": "did:anam145:issuer:1234567890",
         "name": "Government24"  // 동일한 발급기관 사용
       },
       "issuanceDate": "2024-01-15T10:30:00.000Z",
       "credentialSubject": {
         "studentId": "did:anam145:student:3nGrY8a6xiDNBLkd0TyG4CSx",
         "studentNumber": "2023572504",
         "university": "Korea University",
         "department": "Graduate School of Information Security"
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
   - userDid만 필수이고 나머지는 기본값이 제공됨
   - userDid는 반드시 체인에 등록된 유효한 사용자 DID여야 함
   - Student DID와 VC가 동시에 생성되어 발급됨
   - VC는 Issuer의 개인키로 서명되어 체인에 저장됨
   - 하나의 사용자는 여러 개의 VC(운전면허증, 학생증 등)를 가질 수 있음
 ----------------------------------------------------------------*/
r.post("/", async (req, res) => {
  try {
    const { 
      userDid, 
      studentNumber = DID_CONFIG.defaults.studentNumber,
      university = DID_CONFIG.defaults.university,
      department = DID_CONFIG.defaults.department 
    } = req.body;

    // userDid는 필수
    if (!userDid) {
      throw new Error("userDid is required");
    }

    // 학생증 ID 생성 (20바이트 랜덤값을 Base58로 인코딩)
    const studentId = randomId();
    const studentDid = `${DID_CONFIG.prefixes.student}${studentId}`;
    const { issuerDid } = getIssuerInfo();

    // 체인코드 연결
    const contract = await getContract();
    
    // 1. 학생증 DID 생성
    await contract.submitTransaction(
      "createStudentDID",
      studentId,
      issuerDid,
      userDid,
      studentNumber,
      university,
      department,
      JSON.stringify({})  // 추가 정보는 빈 객체
    );

    // 2. 즉시 학생증 VC 발급
    const now = new Date();
    const unsigned = {
      "@context": ["https://www.w3.org/ns/credentials/v2"],
      type: ["VerifiableCredential", "StudentCardVC"],
      issuer: { 
        id: issuerDid, 
        name: "Government24"  // 동일한 발급기관 사용
      },
      issuanceDate: now.toISOString(),
      validFrom: now.toISOString(),
      validUntil: new Date(now.getTime() + 4 * 365 * 24 * 60 * 60 * 1000).toISOString(), // 4년
      credentialSubject: { 
        studentId: studentDid,
        name: DID_CONFIG.defaults.name,
        studentNumber: studentNumber,
        university: university,
        department: department
      },
    };
    
    // VC 서명
    const signed = signVC(unsigned);
    
    // 3. VC를 체인코드에 저장
    await contract.submitTransaction("putVC", JSON.stringify(signed));

    // 4. 응답 반환
    res.json({
      studentDid,
      vc: signed,
      userDid,
      studentNumber,
      university,
      department,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

/*---------------------------------------------------------------
 ▸ GET /students/:studentId     —  학생증 DID Document 조회
 
 Request:
   - URL Parameter: studentId (required)
     예시: /students/3nGrY8a6xiDNBLkd0TyG4CSx
     
     주의: 전체 DID가 아닌 ID 부분만 전달
     - 올바른 예: /students/3nGrY8a6xiDNBLkd0TyG4CSx
     - 잘못된 예: /students/did:anam145:student:3nGrY8a6xiDNBLkd0TyG4CSx
 
 Response (200 OK):
   {
     "@context": "https://www.w3.org/ns/did/v1",
     "id": "did:anam145:student:3nGrY8a6xiDNBLkd0TyG4CSx",
     "type": "STUDENT",
     "created": "2024-01-15T10:30:00.000Z",
     "updated": "2024-01-15T10:30:00.000Z",
     "controller": "did:anam145:issuer:1234567890",
     "holder": "did:anam145:user:2mFqX7Z5whEMAKjc9SwF3BRw",
     "studentNumber": "2023572504",
     "university": "고려대학교",
     "department": "정보보호대학원",
     "verificationMethod": [{
       "id": "did:anam145:student:3nGrY8a6xiDNBLkd0TyG4CSx#keys-1",
       "type": "Secp256r1VerificationKey2018",
       "controller": "did:anam145:issuer:1234567890",
       "publicKeyMultibase": "default-issuer-key"
     }],
     "authentication": ["did:anam145:student:3nGrY8a6xiDNBLkd0TyG4CSx#keys-1"],
     "additionalInfo": {},
     "status": "ACTIVE"
   }
 
 Error Response (404):
   {
     "error": "DID를 찾을 수 없습니다: did:anam145:student:invalid"
   }
 ----------------------------------------------------------------*/
r.get("/:studentId", async (req, res) => {
  try {
    const contract = await getContract();
    const studentBuf = await contract.evaluateTransaction(
      "getStudentDID", 
      req.params.studentId
    );
    const studentDoc = JSON.parse(studentBuf.toString());
    res.json(studentDoc);
  } catch (e) {
    res.status(404).json({ error: e.message });
  }
});

export default r;