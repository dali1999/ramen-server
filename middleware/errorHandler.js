const multer = require("multer");

const errorHandler = (err, req, res, next) => {
  console.error("Global Error Handler caught an error:", err);

  // Multer 오류인 경우 (파일 업로드 관련)
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ message: `파일 업로드 오류: ${err.message}` });
  }
  // custom fileFilter에서 throw new Error() 등으로 직접 에러 객체를 던진 경우
  if (err instanceof Error && err.message.startsWith("오류:")) {
    return res.status(400).json({ message: err.message });
  }

  // MongoDB 중복 키 오류 (스키마에서 unique: true 설정 시)
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0];
    const value = err.keyValue[field];
    return res.status(409).json({ message: `이미 존재하는 ${field}입니다: ${value}` });
  }

  // 일반적인 서버 오류
  res.status(500).json({
    message: "서버 내부 오류가 발생했습니다.",
    error: err.message || "알 수 없는 서버 오류",
  });
};

module.exports = errorHandler;
