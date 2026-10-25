import "dotenv/config";
import express from "express";
import { authRouter } from "./routes/auth.js";
import { integrationsRouter } from "./routes/integrations.js";
import { postsRouter } from "./routes/posts.js";

const app = express();
app.use(express.json({ limit: "10mb" }));

app.get("/", (_req, res) => {
  res.send("social-poster: ดูบัญชีที่เชื่อมไว้ที่ GET /integrations, เชื่อม YouTube ที่ /auth/youtube/start");
});

app.use(authRouter);
app.use(integrationsRouter);
app.use(postsRouter);

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => {
  console.log(`social-poster listening on port ${port}`);
});
