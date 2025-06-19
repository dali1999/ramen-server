const jwt = require("jsonwebtoken");
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  console.error("❌ JWT_SECRET 환경 변수가 설정되지 않았습니다. .env 파일을 확인해주세요.");
  process.exit(1);
}

// --- JWT 인증 미들웨어 정의 ---
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (token == null) {
    return res.status(401).json({ message: "인증 토큰이 필요합니다." });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ message: "유효하지 않거나 만료된 토큰입니다." });
    }
    req.user = user;
    next();
  });
};

// ✨ 관리자 역할 확인 미들웨어 ✨
const authorizeAdmin = (req, res, next) => {
  // authenticateToken이 먼저 실행되어 req.user가 채워졌다고 가정
  if (req.user && req.user.role === "admin") {
    next(); // 관리자면 다음 미들웨어 또는 라우트 핸들러로
  } else {
    // 권한 없음
    return res.status(403).json({ message: "관리자 권한이 필요합니다." });
  }
};

module.exports = { authenticateToken, authorizeAdmin };
