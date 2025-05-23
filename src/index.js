import express from "express";
import dotenv from "dotenv";
import didRoutes from "./routes/did.js";
import licenseRoutes from "./routes/license.js";
import vcRoutes from "./routes/vc.js";
import vpRoutes from "./routes/vp.js";
import keystoreRoutes from "./routes/keystore.js";

dotenv.config();
const app = express();
app.use(express.json());

app.use("/dids", didRoutes);
app.use("/licenses", licenseRoutes);
app.use("/vcs", vcRoutes);
app.use("/vps", vpRoutes);
app.use("/keystore", keystoreRoutes);

app.listen(8080, () => console.log("Gov24 API listening on :8080"));
