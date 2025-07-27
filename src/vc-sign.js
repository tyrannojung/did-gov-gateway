import stringify from "json-stable-stringify";
import { createSign } from "crypto";
import { randomId } from "./id-utils.js";
import { loadWalletPem, getIssuerInfo } from "./utils/key-io.js";

/**
 * VC(Verifiable Credential)에 디지털 서명을 추가하는 함수
 *
 * @param {Object} vc - 서명할 VC 객체 (proof 필드 없는 상태)
 * @returns {Object} - proof가 추가된 서명된 VC
 *
 * 서명 프로세스:
 * 1. 발급기관(Issuer) 정보와 개인키를 가져옴
 * 2. VC에 고유 ID 할당
 * 3. VC를 정규화(deterministic JSON)하여 서명 대상 데이터 생성
 * 4. SHA256 해시 후 Issuer 개인키로 ECDSA 서명
 * 5. proof 객체를 VC에 추가하여 반환
 *
 * 암호화 상세:
 * - 서명 알고리즘: ECDSA with SHA-256
 * - 타원곡선: Secp256r1 (P-256, prime256v1)
 * - 키 생성: scripts/gen-issuer-wallet.sh에서 OpenSSL로 생성
 * - Node.js crypto 모듈이 PEM 개인키의 곡선 정보를 자동으로 인식하여 서명
 */
export function signVC(vc) {
  // 1. 발급기관 정보 가져오기 (.env에서 ISSUER_ID, ISSUER_DID 읽음)
  const { issuerId, issuerDid } = getIssuerInfo();

  // 2. 발급기관의 개인키 가져오기 (src/storage/issuer/issuer.wallet에서)
  const { prvPem } = loadWalletPem("issuer");

  // 3. VC에 고유 ID 생성 (20바이트 랜덤값을 Base58로 인코딩)
  vc.id = randomId();

  // 4. VC를 결정론적 JSON으로 변환 (항상 동일한 문자열 생성)
  // json-stable-stringify는 객체의 키를 정렬하여 일관된 문자열 생성
  const canon = Buffer.from(stringify(vc));

  // 5. SHA256 서명 객체 생성 및 데이터 입력
  const sign = createSign("SHA256");
  sign.update(canon).end();

  // 6. proof 객체 생성 및 VC에 추가
  vc.proof = {
    // W3C 표준 서명 타입 (Secp256r1 = P-256 곡선 사용)
    type: "Secp256r1Signature2018",

    // 서명 생성 시각
    created: new Date().toISOString(),

    // 서명에 사용된 키 식별자 (DID Document의 verificationMethod)
    verificationMethod: `${issuerDid}#keys-1`,

    // 서명 목적 (assertionMethod = 주장/진술을 위한 서명)
    proofPurpose: "assertionMethod",

    // 실제 서명값 (개인키로 서명 후 Base64 인코딩)
    // 주의: 서명 알고리즘은 prvPem 개인키의 타입에 따라 자동 결정됨
    // 이 프로젝트는 gen-issuer-wallet.sh에서 prime256v1(Secp256r1) 키를 생성하므로
    // sign.sign()은 자동으로 ECDSA with P-256 서명을 수행함
    proofValue: sign.sign(prvPem).toString("base64"),
  };

  // 7. 서명이 추가된 VC 반환
  return vc;
}
