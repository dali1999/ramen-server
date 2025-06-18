const jwt = require("jsonwebtoken");
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  console.error("❌ JWT_SECRET 환경 변수가 설정되지 않았습니다. .env 파일을 확인해주세요.");
  // 실제 프로덕션에서는 이 위치에서 프로세스를 종료하기보다,
  // 앱 시작 시 유효성 검사를 통해 미리 처리하는 것이 좋습니다.
  // process.exit(1);
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

module.exports = authenticateToken;
