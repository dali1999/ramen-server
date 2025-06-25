const multer = require("multer");
const path = require("path");

const storage = multer.memoryStorage(); // 파일이 디스크에 저장되지 않고 메모리에 버퍼 형태로 저장

const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const filetypes = /jpeg|jpg|png|gif|heic|webp/;
    const mimetype = filetypes.test(file.mimetype);
    const extname = filetypes.test(
      path.extname(file.originalname).toLowerCase()
    );

    if (mimetype && extname) {
      return cb(null, true);
    }
    cb(
      new Error("오류: 이미지 파일만 가능합니다! (jpeg, jpg, png, gif, webp)")
    );
  },
});

module.exports = upload;
