// src/routes/vp.js
import express from "express";
import stringify from "json-stable-stringify";
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
   - Android에서 VP 서명 시 JSON을 문자열화할 때 슬래시(/)를 이스케이프 처리해야 함
   - Challenge는 재사용 공격 방지를 위해 매번 새로운 값 사용
   - VP의 verifiableCredential은 체인에 저장된 VC와 동일해야 함
 ----------------------------------------------------------------*/
r.post("/verify", async (req, res) => {
  console.log("VP verification request received");
  try {
    const { vp, challenge } = req.body;
    console.log("Request body:", JSON.stringify(req.body, null, 2));
    

    /* ① VP 구조 검증 */
    console.log("Checking VP structure...");
    if (!vp || !vp.verifiableCredential || !vp.proof || !vp.holder) {
      const structureError = {
        hasVp: !!vp,
        hasVC: !!(vp && vp.verifiableCredential),
        hasProof: !!(vp && vp.proof),
        hasHolder: !!(vp && vp.holder)
      };
      console.log("VP structure validation failed:", structureError);
      return res.status(400).json({ valid: false, reason: "Invalid VP structure - missing required fields" });
    }
    console.log("VP structure OK");
    
    if (!vp.proof.proofValue || !vp.proof.challenge) {
      console.log("VP proof structure validation failed");
      return res.status(400).json({ valid: false, reason: "Invalid VP proof structure" });
    }
    console.log("VP proof structure OK");

    /* ② VC on-chain 검증 */
    const vcId = vp.verifiableCredential.id;
    console.log("Verifying VC on chain, vcId:", vcId);
    if (!vcId) {
      return res.status(400).json({ valid: false, reason: "VC ID not found in VP" });
    }
    const contract = await getContract();
    console.log("Got contract, verifying VC...");
    const check = JSON.parse(
      (await contract.evaluateTransaction("verifyVC", vcId)).toString()
    );
    console.log("VC verification result:", check);
    if (!check.valid) {
      return res.status(400).json({ valid: false, reason: "VC invalid" });
    }
    console.log("VC is valid");

    /* ③ holder 공개키 확보 - 체인에서 DID Document 조회 */
    const holderDid = vp.holder;
    console.log("Getting holder DID document for:", holderDid);
    
    let pubPem;
    try {
      // 체인에서 DID Document 가져오기
      const didDocBuf = await contract.evaluateTransaction("getDID", holderDid);
      console.log("DID document buffer received");
      const didDoc = JSON.parse(didDocBuf.toString());
      console.log("DID document parsed:", JSON.stringify(didDoc, null, 2));
      
      // 공개키 추출
      if (!didDoc.verificationMethod || didDoc.verificationMethod.length === 0) {
        throw new Error("No verification method found in DID document");
      }
      // publicKeyPem 또는 publicKeyMultibase에서 공개키 찾기
      pubPem = didDoc.verificationMethod[0].publicKeyPem || 
               didDoc.verificationMethod[0].publicKeyMultibase;
    } catch (error) {
      console.error("Error retrieving DID document:", error);
      return res.status(400).json({ valid: false, reason: "Holder key not found: " + error.message });
    }

    /* ④ VP 서명 확인 */
    console.log("Starting VP signature verification...");
    if (!pubPem) {
      return res.status(400).json({ valid: false, reason: "Public key not found in DID document" });
    }
    
    // Android와 동일한 방식으로 VP 재구성
    const unsigned = {
      "@context": vp["@context"],
      "type": vp.type,
      "holder": vp.holder,
      "verifiableCredential": vp.verifiableCredential
    };
    
    // Android의 JSONObject.toString()과 동일하게 슬래시를 이스케이프 처리
    const canonicalJson = JSON.stringify(unsigned).replace(/\//g, '\\/');
    console.log("Canonical JSON for verification:", canonicalJson);
    
    const verify = createVerify("SHA256").update(canonicalJson).end();
    const sigOK = verify.verify(
      pubPem,
      Buffer.from(vp.proof.proofValue, "base64")
    );
    console.log("Signature verification result:", sigOK);

    /* ⑤ challenge 비교 */
    const challengeOK = vp.proof.challenge === challenge;
    console.log("Challenge verification:", challengeOK, `(expected: ${challenge}, got: ${vp.proof.challenge})`);

    const finalResult = sigOK && challengeOK;
    console.log("Final verification result:", finalResult);

    res.json({
      valid: finalResult,
      reason: sigOK
        ? challengeOK
          ? "VP valid"
          : "challenge mismatch"
        : "signature mismatch",
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

export default r;