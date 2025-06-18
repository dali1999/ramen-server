const express = require("express");
const router = express.Router();
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const Member = require("../models/Member");
const upload = require("../utils/upload");

const JWT_SECRET = process.env.JWT_SECRET;

// 회원가입 API
router.post("/register", upload.single("profileImage"), async (req, res, next) => {
    const { name, nickname, email, password } = req.body;
    const imageUrl = req.file ? `/uploads/${req.file.filename}` : undefined;

    if (!name || !email || !password) {
        if (req.file) {
            fs.unlinkSync(req.file.path);
        }
        return res.status(400).json({ message: "이름, 이메일, 비밀번호는 필수입니다." });
    }
    if (password.length < 6) {
        if (req.file) {
            fs.unlinkSync(req.file.path);
        }
        return res.status(400).json({ message: "비밀번호는 최소 6자 이상이어야 합니다." });
    }

    try {
        const newMember = new Member({
            name,
            nickname,
            imageUrl: imageUrl || MemberSchema.paths.imageUrl.defaultValue,
            email,
            password,
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
            },
        });
    } catch (error) {
        console.error("회원가입 오류:", error);
        if (req.file) {
            fs.unlinkSync(req.file.path);
        }
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
            { _id: member._id, name: member.name, email: member.email }, // 토큰 페이로드
            JWT_SECRET,
            { expiresIn: "10h" } // 토큰 유효 기간
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
            },
        });
    } catch (error) {
        console.error("로그인 오류:", error);
        next(error); // 전역 에러 핸들러로 전달
    }
});

module.exports = router;
