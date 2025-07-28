// src/routes/vp.js
import express from "express";
import { createVerify } from "crypto";
import { getContract } from "../fabric.js";

const r = express.Router();

/*───────────────────────────────────────────────────────────
 ▸ POST /vps/verify           – VP 검증 (Android에서 생성한 VP)
 
 Request Body:
   {
     "challenge": "random-challenge-string-12345",  // required - 검증자가 제공한 난수
     "vp": {  // required - 사용자가 생성한 VP
       "@context": ["https://www.w3.org/ns/credentials/v2"],
       "type": ["VerifiablePresentation"],
       "holder": "did:anam145:user:2mFqX7Z5whEMAKjc9SwF3BRw",
       "verifiableCredential": {
         // VC 전체 내용 (위의 /vcs/:vcId 응답과 동일)
         "@context": ["https://www.w3.org/ns/credentials/v2"],
         "id": "4oHsZ9b7yjEPCMle1UzH5DTy",
         "type": ["VerifiableCredential", "DriverLicenseVC"],
         "issuer": { ... },
         "issuanceDate": "...",
         "credentialSubject": { ... },
         "proof": { ... }
       },
       "proof": {
         "type": "Secp256r1Signature2018",
         "created": "2024-01-15T10:35:00.000Z",
         "verificationMethod": "did:anam145:user:2mFqX7Z5whEMAKjc9SwF3BRw#keys-1",
         "proofPurpose": "authentication",
         "challenge": "random-challenge-string-12345",  // 동일한 challenge
         "proofValue": "MEYCIQCx..."  // Holder 개인키로 서명된 값
       }
     }
   }
 
 Response (200 OK):
   {
     "valid": true,
     "reason": "VP valid"
   }
 
 Error Response (400 Bad Request):
   {
     "valid": false,
     "reason": "Invalid VP structure - missing required fields"
   }
   또는
   {
     "valid": false,
     "reason": "VC invalid"  // 체인에서 VC 검증 실패
   }
   또는
   {
     "valid": false,
     "reason": "challenge mismatch"  // challenge 값 불일치
   }
   또는
   {
     "valid": false,
     "reason": "signature mismatch"  // VP 서명 검증 실패
   }
 
 Error Response (500):
   {
     "error": "서버 오류 메시지"
   }
 
 검증 프로세스:
   1. VP 구조 유효성 검사 (필수 필드 확인)
   2. 포함된 VC를 체인코드에서 검증 (verifyVC)
   3. Holder의 DID Document에서 공개키 추출
   4. VP의 서명을 Holder 공개키로 검증
   5. Challenge 값 일치 확인
 
 Note:
   - Android는 내부적으로 = 를 \u003d로 인코딩하여 서명 (서버가 자동 변환)
   - Challenge는 재사용 공격 방지를 위해 매번 새로운 값 사용
   - VP의 verifiableCredential은 체인에 저장된 VC와 동일해야 함
 ----------------------------------------------------------------*/
r.post("/verify", async (req, res) => {
  try {
    const { vp, challenge } = req.body;
    

    /* ① VP 구조 검증 */
    if (!vp || !vp.verifiableCredential || !vp.proof || !vp.holder) {
      return res.status(400).json({ valid: false, reason: "Invalid VP structure - missing required fields" });
    }
    
    if (!vp.proof.proofValue || !vp.proof.challenge) {
      return res.status(400).json({ valid: false, reason: "Invalid VP proof structure" });
    }

    /* ② VC on-chain 검증 */
    const vcId = vp.verifiableCredential.id;
    if (!vcId) {
      return res.status(400).json({ valid: false, reason: "VC ID not found in VP" });
    }
    const contract = await getContract();
    const check = JSON.parse(
      (await contract.evaluateTransaction("verifyVC", vcId)).toString()
    );
    if (!check.valid) {
      return res.status(400).json({ valid: false, reason: "VC invalid" });
    }

    /* ③ holder 공개키 확보 - 체인에서 DID Document 조회 */
    const holderDid = vp.holder;
    
    let pubPem;
    try {
      // 체인에서 DID Document 가져오기
      const didDocBuf = await contract.evaluateTransaction("getDID", holderDid);
      const didDoc = JSON.parse(didDocBuf.toString());
      
      // 공개키 추출
      if (!didDoc.verificationMethod || didDoc.verificationMethod.length === 0) {
        throw new Error("No verification method found in DID document");
      }
      // publicKeyPem 또는 publicKeyMultibase에서 공개키 찾기
      pubPem = didDoc.verificationMethod[0].publicKeyPem || 
               didDoc.verificationMethod[0].publicKeyMultibase;
    } catch (error) {
      return res.status(400).json({ valid: false, reason: "Holder key not found: " + error.message });
    }

    /* ④ VP 서명 확인 */
    if (!pubPem) {
      return res.status(400).json({ valid: false, reason: "Public key not found in DID document" });
    }
    
    // Android와 동일한 방식으로 VP 재구성 (필드 순서 중요!)
    // Android 로그를 보면 @context, holder, type, verifiableCredential 순서
    // 중요: verifiableCredential은 Android가 보낸 그대로 사용해야 함 (재구성하면 안됨)
    const unsigned = {
      "@context": vp["@context"],
      "holder": vp.holder,
      "type": vp.type,
      "verifiableCredential": vp.verifiableCredential
    };
    
    // Android는 슬래시 이스케이프를 하지 않음 - 일반 JSON.stringify 사용
    let canonicalJson = JSON.stringify(unsigned);
    
    // Android는 내부적으로 = 를 \u003d로 이스케이프해서 서명함
    // verifiableCredential.proof.proofValue의 = 를 \u003d로 변경
    canonicalJson = canonicalJson.replace(
      /"proofValue":"([^"]+)"/g, 
      (match, value) => {
        return `"proofValue":"${value.replace(/=/g, '\\u003d')}"`;
      }
    );
    
    // Android는 VP + challenge를 연결해서 서명함!
    const dataToSign = canonicalJson + challenge;
    
    // 디버깅을 위한 로그 추가
    console.log("Server canonical JSON:", canonicalJson);
    console.log("Server data to sign:", dataToSign);
    console.log("Challenge from client:", challenge);
    
    const verify = createVerify("SHA256").update(dataToSign).end();
    const sigOK = verify.verify(
      pubPem,
      Buffer.from(vp.proof.proofValue, "base64")
    );

    /* ⑤ challenge 비교 */
    const challengeOK = vp.proof.challenge === challenge;

    const finalResult = sigOK && challengeOK;

    const response = {
      valid: finalResult,
      reason: sigOK
        ? challengeOK
          ? "VP valid"
          : "challenge mismatch"
        : "signature mismatch",
    };
    
    console.log("VP verification result:", response);
    res.json(response);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

export default r;