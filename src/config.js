// Configuration file for DID Gateway

export const DID_CONFIG = {
  // DID method and prefixes
  method: "anam145",
  prefixes: {
    user: "did:anam145:user:",
    issuer: "did:anam145:issuer:",
    license: "did:anam145:license:",
    student: "did:anam145:student:"  // 학생증 DID 접두사 추가
  },
  
  // Default values
  defaults: {
    licenseNumber: "A-123-456-7890",
    issuerName: "Government24",
    // 학생증 기본값 추가
    studentNumber: "2023000000",
    university: "Korea University",
    department: "Graduate School of Information Security"
  },
  
  // Fabric configuration
  fabric: {
    channelName: process.env.CHANNEL_NAME || "mychannel",
    chaincodeName: process.env.CHAINCODE_NAME || "anamdid",
    asLocalhost: process.env.AS_LOCALHOST !== "false"
  },
  
  // Storage paths
  storage: {
    basePath: process.env.STORAGE_PATH || "src/storage",
    issuerWallet: "issuer/issuer.wallet",
    userWallet: "user/user.wallet",
    userVC: "user/user.vc"
  }
};

export const getDidPrefix = (type) => {
  return DID_CONFIG.prefixes[type] || `did:${DID_CONFIG.method}:${type}:`;
};