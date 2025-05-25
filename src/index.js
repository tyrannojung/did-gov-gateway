import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import didRoutes from "./routes/did.js";
import licenseRoutes from "./routes/license.js";
import vcRoutes from "./routes/vc.js";
import vpRoutes from "./routes/vp.js";

dotenv.config();
const app = express();

// CORS 설정 - 안드로이드 에뮬레이터에서 접근 가능하도록
app.use(cors({
  origin: "*", // 실제 운영에서는 특정 도메인만 허용
  methods: ["GET", "POST", "PUT", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

app.use(express.json());

app.use("/dids", didRoutes);
app.use("/licenses", licenseRoutes);
app.use("/vcs", vcRoutes);
app.use("/vps", vpRoutes);

const PORT = process.env.PORT || 8081;
app.listen(PORT, () => console.log(`Gov24 API listening on :${PORT}`));
