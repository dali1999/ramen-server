const mongoose = require("mongoose");
const bcrypt = require("bcrypt");

// 4.4. 멤버 스키마 (MemberSchema)
const MemberSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  nickname: { type: String, default: "맨즈" },
  imageUrl: {
    type: String,
    default: "", // 기본 이미지 넣기
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
  },
  password: { type: String, required: true, minlength: 6 },
  role: {
    type: String,
    enum: ["user", "admin"], // 'user' 또는 'admin'만 가능
    default: "user", // 기본값은 'user'
  },
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
