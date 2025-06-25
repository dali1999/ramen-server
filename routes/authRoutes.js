const express = require("express");
const router = express.Router();
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const Member = require("../models/Member");
const upload = require("../utils/upload");
const path = require("path");
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const sharp = require("sharp");

const JWT_SECRET = process.env.JWT_SECRET;

const S3_BUCKET_NAME = process.env.AWS_S3_BUCKET_NAME;
const AWS_REGION = process.env.AWS_S3_REGION;
const AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID;
const AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY;
const s3Client = new S3Client({
  region: AWS_REGION,
  credentials: {
    accessKeyId: AWS_ACCESS_KEY_ID,
    secretAccessKey: AWS_SECRET_ACCESS_KEY,
  },
});

// 회원가입 API
router.post("/register", upload.single("profileImage"), async (req, res, next) => {
  const { name, nickname, email, password } = req.body;
  let imageUrl;

  // ✨ 이미지 최적화 및 S3 업로드 로직 ✨
  if (req.file) {
    // 파일이 업로드된 경우
    try {
      // 1. 메모리에 있는 이미지 버퍼를 sharp로 처리
      const optimizedImageBuffer = await sharp(req.file.buffer)
        .rotate()
        .resize({ width: 200, height: 200, fit: "cover", withoutEnlargement: true })
        .webp({ quality: 70 })
        .toBuffer();

      // 2. 최적화된 이미지를 S3에 직접 업로드
      const s3Key = `webp/${Date.now().toString()}-${path.parse(req.file.originalname).name}.webp`; // S3 Key (폴더명/고유이름.webp)
      const uploadParams = {
        Bucket: S3_BUCKET_NAME,
        Key: s3Key,
        Body: optimizedImageBuffer,
        ContentType: "image/webp",
        ACL: "public-read", // 공개 읽기 권한
      };

      const s3UploadResult = await s3Client.send(new PutObjectCommand(uploadParams));
      imageUrl = `https://${S3_BUCKET_NAME}.s3.${AWS_REGION}.amazonaws.com/${s3Key}`;
    } catch (optimizationError) {
      console.error("회원가입 중 Image optimization/S3 upload error:", optimizationError);
    }
  } else {
    imageUrl = MemberSchema.paths.imageUrl.defaultValue;
  }

  if (!name || !email || !password) {
    return res.status(400).json({ message: "이름, 이메일, 비밀번호는 필수입니다." });
  }
  if (password.length < 6) {
    return res.status(400).json({ message: "비밀번호는 최소 6자 이상이어야 합니다." });
  }

  try {
    const newMember = new Member({
      name,
      nickname,
      imageUrl: imageUrl,
      email,
      password,
      role: "user",
    });
    await newMember.save();

    res.status(201).json({
      message: "맨즈가 되셨습니다!",
      member: {
        _id: newMember._id,
        name: newMember.name,
        email: newMember.email,
        imageUrl: newMember.imageUrl,
        nickname: newMember.nickname,
        role: newMember.role,
      },
    });
  } catch (error) {
    console.error("회원가입 오류:", error);

    if (error.code === 11000) {
      return res.status(409).json({ message: "이름 또는 이메일이 이미 존재합니다." });
    }
    next(error); // 전역 에러 핸들러로 전달
  }
});

// 로그인 API
router.post("/login", async (req, res, next) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: "이메일과 비밀번호는 필수입니다." });
  }

  try {
    const member = await Member.findOne({ email });
    if (!member) {
      return res.status(400).json({ message: "등록되지 않은 이메일입니다." });
    }

    const isMatch = await bcrypt.compare(password, member.password);
    if (!isMatch) {
      return res.status(400).json({ message: "비밀번호가 일치하지 않습니다." });
    }

    // JWT 토큰 생성
    const token = jwt.sign(
      {
        _id: member._id,
        name: member.name,
        email: member.email,
        role: member.role,
      }, // 토큰 페이로드
      JWT_SECRET,
      { expiresIn: "1y" } // 토큰 유효 기간
    );

    res.status(200).json({
      message: "로그인 성공!",
      token,
      member: {
        _id: member._id,
        name: member.name,
        nickname: member.nickname,
        email: member.email,
        imageUrl: member.imageUrl,
        role: member.role,
      },
    });
  } catch (error) {
    console.error("로그인 오류:", error);
    next(error); // 전역 에러 핸들러로 전달
  }
});

module.exports = router;
