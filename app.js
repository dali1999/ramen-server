const express = require("express");
const mongoose = require("mongoose");
require("dotenv").config();
const cors = require("cors");
const path = require("path");

// 분리된 모듈
const authRoutes = require("./routes/authRoutes");
const memberRoutes = require("./routes/memberRoutes");
const ramenRoutes = require("./routes/ramenRoutes");
const plannedRamenRoutes = require("./routes/plannedRamenRoutes");

// 전역 에러 핸들러
const errorHandler = require("./middleware/errorHandler");

const app = express();
const port = process.env.PORT || 3000;

// --- CORS 설정 ---
app.use(
  cors({
    origin: ["http://localhost:5173", "https://ramen-road.netlify.app"],
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// --- 미들웨어 설정 ---
app.use(express.json());
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// --- MongoDB 연결 ---
const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error("❌ MONGODB_URI 환경 변수가 설정되지 않았습니다. .env 파일을 확인해주세요.");
  process.exit(1);
}

mongoose
  .connect(MONGODB_URI)
  .then(() => console.log("✅ MongoDB에 성공적으로 연결되었습니다."))
  .catch((err) => {
    console.error("❌ MongoDB 연결 실패:", err);
    process.exit(1);
  });

// --- 라우터 연결 ---
app.use("/api/auth", authRoutes); // /api/auth/register, /api/auth/login
app.use("/api/members", memberRoutes); // /api/members (조회, 삭제)
app.use("/api/visited-ramen", ramenRoutes); // /api/visited-ramen (추가, 조회, 삭제, 별점 수정)
app.use("/api/planned-ramen", plannedRamenRoutes); // /api/planned-ramen (추가, 조회, 삭제)

// --- 전역 에러 핸들러 (모든 라우터 뒤에 위치해야 함) ---
app.use(errorHandler);

// --- 서버 시작 ---
app.listen(port, () => {
  console.log(`🍜 라멘 API 서버가 http://localhost:${port} 에서 실행 중입니다.`);
  console.log("Ctrl+C를 눌러 서버를 종료하세요.");
});
