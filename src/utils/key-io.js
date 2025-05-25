// src/utils/key-io.js
import fs from "fs";
import path from "path";

/** -----------------------------------------------------------------
 *  walletPath("issuer") ➜ src/storage/issuer/issuer.wallet
 *  walletPath("user")   ➜ src/storage/user/user.wallet
 * ----------------------------------------------------------------*/
export function walletPath(type) {
  if (type === "issuer") {
    return path.join("src", "storage", "issuer", "issuer.wallet");
  }
  if (type === "user") {
    return path.join("src", "storage", "user", "user.wallet");
  }
  throw new Error(`unknown wallet type: ${type}`);
}

/* PEM → base64  (헤더/푸터/개행 제거) */
export function pem2b64(pem) {
  return pem.replace(/-----[^-]+-----|\s+/g, "");
}

/* base64 → PEM (type = PUBLIC KEY | PRIVATE KEY) */
export function b642pem(b64, type) {
  const body = b64.match(/.{1,64}/g).join("\n");
  return `-----BEGIN ${type}-----\n${body}\n-----END ${type}-----\n`;
}

/* 저장 */
export function saveWallet(type, id, pubPem, prvPem) {
  const file = walletPath(type);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(
    file,
    JSON.stringify(
      {
        id,
        did: `did:anam145:${type}:${id}`,
        publicKey: pem2b64(pubPem),
        privateKey: pem2b64(prvPem),
      },
      null,
      2
    )
  );
  return file;
}

/* 읽어서 PEM 복구 */
export function loadWalletPem(type, userId = null) {
  let walletData;
  
  if (type === "user" && userId) {
    // 특정 사용자 ID의 키를 로드하려고 시도
    try {
      const customPath = path.join("src", "storage", "user", `${userId}.wallet`);
      if (fs.existsSync(customPath)) {
        walletData = JSON.parse(fs.readFileSync(customPath));
      } else {
        // 기본 user.wallet 사용
        walletData = JSON.parse(fs.readFileSync(walletPath(type)));
      }
    } catch (e) {
      // 기본 user.wallet 사용
      walletData = JSON.parse(fs.readFileSync(walletPath(type)));
    }
  } else {
    walletData = JSON.parse(fs.readFileSync(walletPath(type)));
  }
  
  const { publicKey, privateKey } = walletData;
  return {
    pubPem: b642pem(publicKey, "PUBLIC KEY"),
    prvPem: b642pem(privateKey, "EC PRIVATE KEY"),
  };
}

export function getIssuerInfo() {
  try {
    const issuerWallet = JSON.parse(
      fs.readFileSync(path.join("src", "storage", "issuer", "issuer.wallet"))
    );
    return {
      issuerId: issuerWallet.id,
      issuerDid: issuerWallet.did,
    };
  } catch (e) {
    throw new Error(
      "Issuer 키스토어를 찾을 수 없습니다. 먼저 init:issuer를 실행해주세요."
    );
  }
}

export function getUserInfo() {
  try {
    const userWallet = JSON.parse(
      fs.readFileSync(path.join("src", "storage", "user", "user.wallet"))
    );
    return {
      userId: userWallet.id,
      userDid: userWallet.did,
    };
  } catch (e) {
    throw new Error(
      "User 키스토어를 찾을 수 없습니다. 먼저 사용자를 생성해주세요."
    );
  }
}

/* VC 관리 함수들 */
export function saveUserVC(vcObj) {
  const file = path.join("src", "storage", "user", "user.vc");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(vcObj, null, 2));
  return file;
}

export function getUserVC() {
  try {
    const file = path.join("src", "storage", "user", "user.vc");
    return JSON.parse(fs.readFileSync(file));
  } catch (e) {
    throw new Error("사용자 VC를 찾을 수 없습니다. 먼저 VC를 발급해주세요.");
  }
}


/* 라이센스 DID 관리 - VC에서 추출 */
export function getLatestLicenseDid() {
  try {
    const vc = getUserVC();
    return vc.credentialSubject.licenseId;
  } catch (e) {
    throw new Error(
      "라이센스 DID를 찾을 수 없습니다. 먼저 라이센스를 발급해주세요."
    );
  }
}