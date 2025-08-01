import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import didRoutes from "./routes/did.js";
import licenseRoutes from "./routes/license.js";
import studentRoutes from "./routes/student.js";
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

// Request logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  
  // Log request body for POST/PUT
  if ((req.method === 'POST' || req.method === 'PUT') && req.body) {
    console.log('Request body:', JSON.stringify(req.body, null, 2));
  }
  
  // Log response
  const originalSend = res.send;
  res.send = function(data) {
    res.send = originalSend;
    const duration = Date.now() - start;
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} - ${res.statusCode} (${duration}ms)`);
    
    // Log error responses
    if (res.statusCode >= 400) {
      console.error('Error response:', data);
    }
    
    return res.send(data);
  };
  
  next();
});

app.use("/dids", didRoutes);
app.use("/licenses", licenseRoutes);
app.use("/students", studentRoutes);
app.use("/vcs", vcRoutes);
app.use("/vps", vpRoutes);

const PORT = process.env.PORT || 8081;
app.listen(PORT, () => console.log(`Gov24 API listening on :${PORT}`));
