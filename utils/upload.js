const multer = require("multer");
const aws = require("aws-sdk");
const multerS3 = require("multer-s3");

const S3_BUCKET_NAME = process.env.AWS_S3_BUCKET_NAME;
const AWS_REGION = process.env.AWS_S3_REGION;
const AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID;
const AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY;

// S3 인스턴스 생성
const s3 = new aws.S3({
  accessKeyId: AWS_ACCESS_KEY_ID,
  secretAccessKey: AWS_SECRET_ACCESS_KEY,
  region: AWS_REGION,
});

// Multer-S3 스토리지 설정
const s3Storage = multerS3({
  s3: s3,
  bucket: S3_BUCKET_NAME,
  acl: "public-read", // ✨ 중요: 업로드된 파일에 공개 읽기 권한 부여
  contentType: multerS3.AUTO_CONTENT_TYPE, // 파일 타입 자동 감지
  key: function (req, file, cb) {
    // S3에 저장될 파일명 (unique한 이름 사용)
    cb(null, `images/<span class="math-inline">\{Date\.now\(\)\.toString\(\)\}\-</span>{file.originalname}`);
  },
});

const upload = multer({
  storage: s3Storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const filetypes = /jpeg|jpg|png|gif|webp/;
    const mimetype = filetypes.test(file.mimetype);
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());

    if (mimetype && extname) {
      return cb(null, true);
    }
    cb(new Error("오류: 이미지 파일만 가능합니다! (jpeg, jpg, png, gif, webp)"));
  },
});

module.exports = upload;
