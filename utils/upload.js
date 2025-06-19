const multer = require("multer");
const { S3Client } = require("@aws-sdk/client-s3");
const multerS3 = require("multer-s3");
const path = require("path");

const S3_BUCKET_NAME = process.env.AWS_S3_BUCKET_NAME;
const AWS_REGION = process.env.AWS_S3_REGION;
const AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID;
const AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY;

// S3Client 인스턴스 생성 (v3 방식)
const s3Client = new S3Client({
  region: AWS_REGION,
  credentials: {
    // 자격 증명 설정
    accessKeyId: AWS_ACCESS_KEY_ID,
    secretAccessKey: AWS_SECRET_ACCESS_KEY,
  },
});

// Multer-S3 스토리지 설정 (v3 호환)
const s3Storage = multerS3({
  s3: s3Client,
  bucket: S3_BUCKET_NAME,
  acl: "public-read", // 파일에 공개 읽기 권한 부여
  contentType: multerS3.AUTO_CONTENT_TYPE, // 파일 타입 자동 감지
  key: function (req, file, cb) {
    // S3에 저장될 파일명 (unique한 이름 사용)
    // 예: profile-images/1678888888888-originalFilename.png
    const filename = `images/${Date.now().toString()}-${file.originalname}`;
    cb(null, filename);
  },
});

const upload = multer({
  storage: s3Storage, // S3 스토리지 사용
  limits: { fileSize: 5 * 1024 * 1024 }, // 파일 크기 제한 (5MB)
  fileFilter: (req, file, cb) => {
    // 허용할 이미지 파일 타입 정의
    const filetypes = /jpeg|jpg|png|gif|webp/;
    // 파일 MIME 타입 검사
    const mimetype = filetypes.test(file.mimetype);
    // 파일 확장자 검사 (원본 파일명에서 확장자 추출 후 소문자로 변환)
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());

    if (mimetype && extname) {
      return cb(null, true); // 유효한 파일이면 허용
    }
    // 유효하지 않은 파일이면 Error 객체를 던져서 전역 에러 핸들러에서 잡도록 합니다.
    cb(new Error("오류: 이미지 파일만 가능합니다! (jpeg, jpg, png, gif, webp)"));
  },
});

module.exports = upload;
