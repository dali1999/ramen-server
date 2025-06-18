const mongoose = require("mongoose");
const bcrypt = require("bcrypt");

// 4.4. 멤버 스키마 (MemberSchema)
const MemberSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true },
    nickname: { type: String, default: "맨즈" },
    imageUrl: {
        type: String,
        default: "/uploads/default-profile.png",
    },
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true,
    },
    password: { type: String, required: true, minlength: 6 },
});

// 비밀번호 해싱 미들웨어 (저장하기 전에 실행)
MemberSchema.pre("save", async function (next) {
    if (this.isModified("password")) {
        // 비밀번호가 변경되었을 때만 해싱
        this.password = await bcrypt.hash(this.password, 10);
    }
    next();
});

module.exports = mongoose.model("Member", MemberSchema);
