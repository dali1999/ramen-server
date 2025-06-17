const express = require("express");
const mongoose = require("mongoose");
require("dotenv").config();
const cors = require("cors");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const app = express();
const port = process.env.PORT || 3000;

app.use(
  cors({
    origin: "http://localhost:5173",
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(express.json());
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

const MONGODB_URI = process.env.MONGODB_URI;
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  console.error(
    "❌ JWT_SECRET 환경 변수가 설정되지 않았습니다. .env 파일을 확인해주세요."
  );
  process.exit(1);
}

mongoose
  .connect(MONGODB_URI)
  .then(() => console.log("✅ MongoDB에 성공적으로 연결되었습니다."))
  .catch((err) => console.error("❌ MongoDB 연결 실패:", err));

// --- Multer Storage Configuration ---
const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    cb(
      null,
      file.fieldname + "-" + Date.now() + path.extname(file.originalname)
    );
  },
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const filetypes = /jpeg|jpg|png|gif|webp/;
    const mimetype = filetypes.test(file.mimetype);
    const extname = filetypes.test(
      path.extname(file.originalname).toLowerCase()
    );

    if (mimetype && extname) {
      return cb(null, true);
    }
    cb("오류: 이미지 파일만 가능합니다!");
  },
});

// --- 4. Mongoose 스키마 및 모델 정의 ---

// 4.1. 방문 멤버 스키마 (VisitMemberSchema)
// 라멘집 방문 시 함께한 멤버와 그들이 남긴 별점 정보를 정의합니다.
const VisitMemberSchema = new mongoose.Schema(
  {
    name: { type: String, required: true }, // 멤버 이름 (필수)
    rating: { type: Number, min: 0, max: 5, default: null }, // 별점 (0~5점, 초기값은 null 허용)
  },
  { _id: false }
);

// 4.2. 방문 기록 스키마 (VisitSchema)
// 라멘집의 특정 방문에 대한 상세 정보를 정의합니다.
const VisitSchema = new mongoose.Schema(
  {
    visit_count: { type: Number, required: true, default: 1 }, // 해당 라멘집 방문 횟수
    visit_date: { type: String, required: true }, // 방문 날짜
    members: [VisitMemberSchema], // 이 방문에 참여한 멤버들 (VisitMemberSchema의 배열)
  },
  { _id: false }
);

// 4.3. 라멘집 스키마 (RamenRestaurantSchema)
// 방문한 라멘집의 주요 정보와 모든 방문 기록을 정의합니다.
const RamenRestaurantSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true }, // 라멘집 이름 (필수, 고유해야 함)
  bannerImageUrl: {
    type: String,
    default:
      "https://us.123rf.com/450wm/eclaira/eclaira2302/eclaira230200005/198689430-ciotola-di-noodles-di-ramen-con-carne-di-maiale-e-uova-cibo-asiatico-illustrazione-vettoriale.jpg?ver=6",
  },
  location: { type: String, required: true }, // 라멘집 주소 (필수)
  ratingAverage: { type: Number, default: 0, min: 0, max: 5 }, // 라멘집의 전체 평균 별점 (초기 0)
  visits: [VisitSchema], // 이 라멘집의 모든 방문 기록 (VisitSchema의 배열)
});

// 4.4. 멤버 스키마 (MemberSchema)
// 라멘집을 방문할 수 있는 멤버들의 정보를 정의합니다.
const MemberSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  nickname: { type: String, default: "" },
  imageUrl: {
    type: String,
    default: "",
  },
  // ✨ 추가: 로그인 인증을 위한 필드 ✨
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

// 4.5. 방문 예정 라멘집 스키마 (PlannedRamenRestaurantSchema)
// 아직 방문하지 않았지만 방문할 예정인 라멘집 정보를 정의합니다.
const PlannedRamenRestaurantSchema = new mongoose.Schema({
  name: { type: String, required: true }, // 라멘집 이름 (필수)
  bannerImageUrl: {
    type: String,
    default:
      "https://us.123rf.com/450wm/eclaira/eclaira2302/eclaira230200005/198689430-ciotola-di-noodles-di-ramen-con-carne-di-maiale-e-uova-cibo-asiatico-illustrazione-vettoriale.jpg?ver=6",
  }, // 배너 이미지 URL (기본 이미지 제공)
  location: { type: String, required: true }, // 라멘집 주소 (필수)
  recommendedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Member",
    required: true,
  },
  recommendationComment: { type: String, default: "" },
});
// MongoDB 복합 유니크 인덱스 생성: 'name'과 'location' 조합이 고유해야 함
PlannedRamenRestaurantSchema.index({ name: 1, location: 1 }, { unique: true });

// 4.6. Mongoose 모델 정의
// 정의된 스키마들을 기반으로 실제 MongoDB 컬렉션과 상호작용할 수 있는 모델을 생성합니다.
const RamenRestaurant = mongoose.model(
  "RamenRestaurant",
  RamenRestaurantSchema
);
const Member = mongoose.model("Member", MemberSchema); // 'Member'는 인증 가능한 사용자 역할
const PlannedRamenRestaurant = mongoose.model(
  "PlannedRamenRestaurant",
  PlannedRamenRestaurantSchema
);

// --- JWT 인증 미들웨어 정의 ---
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1]; // 'Bearer TOKEN' 형식

  if (token == null) {
    return res.status(401).json({ message: "인증 토큰이 필요합니다." });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res
        .status(403)
        .json({ message: "유효하지 않거나 만료된 토큰입니다." });
    }
    req.user = user; // 토큰에서 추출된 사용자 정보 (예: _id, name, email)를 req 객체에 저장
    next(); // 다음 미들웨어 또는 라우트 핸들러로 제어권 넘기기
  });
};

// ===============================================
// --- 5. API 엔드포인트 정의 ---
// ===============================================

// 5.0.1. 회원가입 API (POST /api/auth/register)
app.post(
  "/api/auth/register",
  upload.single("profileImage"),
  (req, res, next) => {
    upload.single("profileImage")(req, res, function (err) {
      if (err instanceof multer.MulterError) {
        // Multer 오류 (예: 파일 크기 초과)
        return res
          .status(400)
          .json({ message: `파일 업로드 오류: ${err.message}` });
      } else if (err) {
        // 기타 알 수 없는 오류 (예: fileFilter에서 전달한 문자열)
        // fileFilter에서 `cb("오류: 이미지 파일만 가능합니다!")`와 같이 문자열을 넘기면 이 부분으로 들어옵니다.
        return res.status(400).json({ message: err }); // err가 문자열이므로 그대로 반환
      }
      next(); // 오류 없으면 다음 미들웨어(async (req, res) => { ... })로 진행
    });
  },
  async (req, res) => {
    const { name, nickname, email, password } = req.body;
    const imageUrl = req.file ? `/uploads/${req.file.filename}` : undefined;

    if (!name || !email || !password) {
      if (req.file) {
        fs.unlink(req.file.path, (err) => {
          if (err) console.error("Error deleting incomplete upload:", err);
        });
      }
      return res
        .status(400)
        .json({ message: "이름, 이메일, 비밀번호는 필수입니다." });
    }
    if (password.length < 6) {
      if (req.file) {
        fs.unlink(req.file.path, (err) => {
          if (err) console.error("Error deleting incomplete upload:", err);
        });
      }
      return res
        .status(400)
        .json({ message: "비밀번호는 최소 6자 이상이어야 합니다." });
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
      console.log("123123123");
      console.log(req.file);
      console.log(imageUrl);
      res.status(201).json({
        message: "맨즈가 되셨습니다!",
        member: {
          _id: newMember._id,
          name: newMember.name,
          email: newMember.email,
          imageUrl: newMember.imageUrl,
        },
      });
    } catch (error) {
      console.error("Registration error:", error);
      if (req.file) {
        fs.unlink(req.file.path, (err) => {
          if (err) console.error("Error deleting failed upload:", err);
        });
      }
      if (error.code === 11000) {
        return res
          .status(409)
          .json({ message: "Name or email already exists." });
      }
      res
        .status(500)
        .json({ message: "A server error occurred.", error: error.message });
    }
  }
);

// 5.0.2. 로그인 API (POST /api/auth/login)
app.post("/api/auth/login", async (req, res) => {
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
    res
      .status(500)
      .json({ message: "서버 오류가 발생했습니다.", error: error.message });
  }
});

// 5.1. 방문한 라멘집 추가 API (POST /api/visited-ramen)
// - 라멘집 이름, 메인 사진, 위치, 방문일자, 함께 방문한 멤버(별점 없이)를 받습니다.
// - 재방문 시 visit_count가 올라가고, 첫 방문 시 새로운 라멘집 데이터가 생성됩니다.
app.post("/api/visited-ramen", authenticateToken, async (req, res) => {
  const {
    name,
    bannerImageUrl,
    location,
    visitDate,
    members: initialVisitMembers,
  } = req.body;

  // 필수 필드 유효성 검사
  if (!name || !location || !visitDate) {
    return res.status(400).json({
      message: "필수 필드를 모두 입력해주세요: name, location, visitDate",
    });
  }

  try {
    const processedMembers = [];
    if (initialVisitMembers && initialVisitMembers.length > 0) {
      for (const member of initialVisitMembers) {
        // 멤버가 시스템에 등록된 멤버인지 확인
        const existingMember = await Member.findOne({ name: member.name });
        if (!existingMember) {
          return res.status(400).json({
            message: `'${member.name}' 이름의 멤버는 존재하지 않습니다. 먼저 멤버를 추가해주세요.`,
          });
        }
        // 초기 방문 시에는 별점을 받지 않으므로, rating은 null로 저장
        processedMembers.push({ name: member.name, rating: null });
      }
    }

    // 라멘집 이름과 위치로 기존 라멘집을 찾습니다.
    let restaurant = await RamenRestaurant.findOne({ name, location });

    if (restaurant) {
      // 재방문인 경우: 기존 라멘집에 새 방문 기록 추가
      const newVisit = {
        visit_count: restaurant.visits.length + 1, // 기존 방문 횟수 + 1
        visit_date: visitDate,
        members: processedMembers, // 현재 방문의 멤버들 (별점은 null)
      };
      restaurant.visits.push(newVisit);

      // 모든 방문의 모든 별점을 합산하여 평균 별점 다시 계산
      let allRatingsSum = 0;
      let allMembersCount = 0;
      restaurant.visits.forEach((visit) => {
        visit.members.forEach((m) => {
          if (m.rating !== null && m.rating !== undefined) {
            // null이 아닌 유효한 별점만 합산
            allRatingsSum += m.rating;
            allMembersCount++;
          }
        });
      });
      restaurant.ratingAverage =
        allMembersCount > 0 ? allRatingsSum / allMembersCount : 0;

      await restaurant.save(); // 변경사항 저장
      console.log(`재방문 기록 추가 및 업데이트: ${name} (${visitDate})`);
      res.status(200).json({
        message: "라멘집 재방문 기록이 성공적으로 추가되었습니다.",
        restaurant,
      });
    } else {
      // 첫 방문인 경우: 새로운 라멘집 데이터 생성
      const newRamenRestaurant = new RamenRestaurant({
        name,
        bannerImageUrl,
        location,
        ratingAverage: 0, // 첫 방문 시에는 별점이 없으므로 평균 별점은 0으로 초기화
        visits: [
          {
            visit_count: 1, // 첫 방문이므로 1
            visit_date: visitDate, // 방문 날짜를 Date 객체로 변환
            members: processedMembers, // 첫 방문의 멤버들 (별점은 null)
          },
        ],
      });
      await newRamenRestaurant.save(); // 새로운 라멘집 저장
      console.log(`새로운 라멘집 추가: ${name}`);
      res.status(201).json({
        message: "새로운 라멘집이 성공적으로 추가되었습니다.",
        restaurant: newRamenRestaurant,
      });
    }
  } catch (error) {
    console.error("라멘집 추가/업데이트 오류:", error);
    if (error.code === 11000) {
      // MongoDB의 고유(unique) 인덱스 중복 오류
      return res
        .status(409)
        .json({ message: `이미 존재하는 라멘집 이름: ${name} (${location})` });
    }
    res
      .status(500)
      .json({ message: "서버 오류가 발생했습니다.", error: error.message });
  }
});

// 5.2. 멤버 추가 API (POST /api/members)
// - 새로운 멤버를 시스템에 등록합니다. 이름은 필수입니다.
// app.post("/api/members", async (req, res) => {
//   const { name, nickname, imageUrl } = req.body;

//   if (!name) {
//     return res.status(400).json({ message: "멤버 이름은 필수입니다." });
//   }

//   try {
//     const newMember = new Member({
//       name,
//       nickname,
//       imageUrl,
//     });
//     await newMember.save(); // 새 멤버 저장
//     console.log(`새로운 멤버 추가: ${name}`);
//     res.status(201).json({
//       message: "멤버가 성공적으로 추가되었습니다.",
//       member: newMember,
//     });
//   } catch (error) {
//     console.error("멤버 추가 오류:", error);
//     if (error.code === 11000) {
//       // MongoDB의 고유(unique) 인덱스 중복 오류
//       return res
//         .status(409)
//         .json({ message: `'${name}' 이름의 멤버가 이미 존재합니다.` });
//     }
//     res
//       .status(500)
//       .json({ message: "서버 오류가 발생했습니다.", error: error.message });
//   }
// });

// 5.3. 방문 예정 라멘집 추가 API (POST /api/planned-ramen)
app.post("/api/planned-ramen", authenticateToken, async (req, res) => {
  const { name, bannerImageUrl, location, recommendationComment } = req.body;
  const recommenderId = req.user._id;

  if (!name || !location) {
    return res.status(400).json({
      message: "방문 예정 라멘집 이름과 위치는 필수입니다.",
    });
  }

  try {
    const existingRecommender = await Member.findById(recommenderId);
    if (!existingRecommender) {
      return res.status(400).json({
        message: `인증된 사용자가 유효하지 않습니다. 다시 로그인해주세요.`,
      });
    }

    const newPlannedRamen = new PlannedRamenRestaurant({
      name,
      bannerImageUrl,
      location,
      recommendedBy: recommenderId,
      recommendationComment,
    });
    await newPlannedRamen.save();
    console.log(`방문 예정 라멘집 추가: ${name}`);
    res.status(201).json({
      message: "방문 예정 라멘집이 성공적으로 추가되었습니다.",
      plannedRamen: {
        ...newPlannedRamen._doc, // 문서의 원본 데이터
        recommendedBy: {
          // populate된 Member 객체 형태로 반환
          _id: existingRecommender._id,
          name: existingRecommender.name,
          nickname: existingRecommender.nickname,
          imageUrl: existingRecommender.imageUrl,
        },
      },
    });
  } catch (error) {
    console.error("방문 예정 라멘집 추가 오류:", error);
    if (error.code === 11000) {
      return res.status(409).json({
        message: `'${name}' (${location}) 은(는) 이미 방문 예정 목록에 있습니다.`,
      });
    }
    res
      .status(500)
      .json({ message: "서버 오류가 발생했습니다.", error: error.message });
  }
});

// 5.4. 멤버별 라멘집 별점 추가/수정 API (PATCH /api/visited-ramen/:restaurantId/visits/:visitCount/members/:memberName/rating)
// - 특정 라멘집의 특정 방문 기록에 대해, 특정 멤버의 별점을 추가하거나 수정합니다.
app.patch(
  "/api/visited-ramen/:restaurantId/visits/:visitCount/members/:memberName/rating",
  authenticateToken,
  async (req, res) => {
    const { restaurantId, visitCount, memberName } = req.params; // URL 파라미터에서 라멘집 ID, 방문 횟수, 멤버 이름 추출
    const { rating } = req.body; // 요청 본문에서 별점 추출

    // 별점 유효성 검사 (0~5점)
    if (rating === undefined || rating === null || rating < 0 || rating > 5) {
      return res
        .status(400)
        .json({ message: "유효한 별점(0~5)을 입력해주세요." });
    }

    try {
      // 라멘집을 ID로 찾기
      const restaurant = await RamenRestaurant.findById(restaurantId);
      if (!restaurant) {
        return res
          .status(404)
          .json({ message: "해당 라멘집을 찾을 수 없습니다." });
      }

      // 해당 방문 기록 찾기 (visit_count를 정수로 변환하여 비교)
      const visitIndex = restaurant.visits.findIndex(
        (v) => v.visit_count === parseInt(visitCount)
      );
      if (visitIndex === -1) {
        return res.status(404).json({
          message: `방문 횟수 ${visitCount}에 해당하는 기록을 찾을 수 없습니다.`,
        });
      }
      const targetVisit = restaurant.visits[visitIndex]; // 찾은 방문 기록

      // 해당 멤버 찾기 및 별점 업데이트
      const memberIndex = targetVisit.members.findIndex(
        (m) => m.name === memberName
      );
      if (memberIndex === -1) {
        // 해당 멤버가 방문 기록에 없으면 404 에러
        return res.status(404).json({
          message: `'${memberName}' 이름의 멤버를 해당 방문 기록에서 찾을 수 없습니다. 멤버를 먼저 추가해주세요.`,
        });
      }

      // 멤버의 별점 업데이트
      targetVisit.members[memberIndex].rating = rating;

      // 라멘집의 전체 평균 별점 다시 계산
      let allRatingsSum = 0;
      let allMembersCount = 0;
      restaurant.visits.forEach((visit) => {
        visit.members.forEach((m) => {
          if (m.rating !== null && m.rating !== undefined) {
            // 유효한 별점(null이 아닌)만 합산
            allRatingsSum += m.rating;
            allMembersCount++;
          }
        });
      });
      restaurant.ratingAverage =
        allMembersCount > 0 ? allRatingsSum / allMembersCount : 0; // 0으로 나누는 것 방지

      await restaurant.save(); // 변경된 라멘집 데이터 저장

      console.log(
        `라멘집 ${restaurant.name}의 ${visitCount}번째 방문에 '${memberName}' 멤버 별점 ${rating}으로 업데이트.`
      );
      res.status(200).json({
        message: "멤버 별점이 성공적으로 업데이트되었습니다.",
        restaurant,
      });
    } catch (error) {
      console.error("별점 업데이트 오류:", error);
      res
        .status(500)
        .json({ message: "서버 오류가 발생했습니다.", error: error.message });
    }
  }
);

// ✨ 5.5. 방문한 라멘집 삭제 API (DELETE /api/visited-ramen/:id) ✨
// - 특정 ID의 방문한 라멘집 데이터를 삭제합니다.
app.delete("/api/visited-ramen/:id", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params; // URL 파라미터에서 라멘집 ID 추출

    // MongoDB에서 해당 ID의 라멘집을 찾아 삭제
    const result = await RamenRestaurant.findByIdAndDelete(id);

    if (!result) {
      // 삭제할 라멘집을 찾지 못한 경우
      return res
        .status(404)
        .json({ message: "삭제할 라멘집을 찾을 수 없습니다." });
    }

    console.log(`방문한 라멘집 삭제: ID ${id}`);
    res
      .status(200)
      .json({ message: "방문한 라멘집이 성공적으로 삭제되었습니다." });
  } catch (error) {
    console.error("방문한 라멘집 삭제 오류:", error);
    res
      .status(500)
      .json({ message: "서버 오류가 발생했습니다.", error: error.message });
  }
});

// ✨ 5.6. 방문 예정 라멘집 삭제 API (DELETE /api/planned-ramen/:id) ✨
// - 특정 ID의 방문 예정 라멘집 데이터를 삭제합니다.
app.delete("/api/planned-ramen/:id", async (req, res) => {
  try {
    const { id } = req.params; // URL 파라미터에서 라멘집 ID 추출

    // MongoDB에서 해당 ID의 방문 예정 라멘집을 찾아 삭제
    const result = await PlannedRamenRestaurant.findByIdAndDelete(id);

    if (!result) {
      // 삭제할 라멘집을 찾지 못한 경우
      return res
        .status(404)
        .json({ message: "삭제할 방문 예정 라멘집을 찾을 수 없습니다." });
    }

    console.log(`방문 예정 라멘집 삭제: ID ${id}`);
    res
      .status(200)
      .json({ message: "방문 예정 라멘집이 성공적으로 삭제되었습니다." });
  } catch (error) {
    console.error("방문 예정 라멘집 삭제 오류:", error);
    res
      .status(500)
      .json({ message: "서버 오류가 발생했습니다.", error: error.message });
  }
});

// ✨ 5.6. 멤버 삭제 API (DELETE /api/members/:id) ✨
// - 특정 ID의 방문 예정 라멘집 데이터를 삭제합니다.
app.delete("/api/members/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const result = await Member.findByIdAndDelete(id);

    if (!result) {
      // 삭제할 라멘집을 찾지 못한 경우
      return res
        .status(404)
        .json({ message: "삭제할 멤버를 찾을 수 없습니다." });
    }

    console.log(`멤버 삭제: ID ${result.name}`);
    res.status(200).json({ message: "계정이 성공적으로 삭제되었습니다." });
  } catch (error) {
    console.error("멤버 삭제 오류:", error);
    res
      .status(500)
      .json({ message: "서버 오류가 발생했습니다.", error: error.message });
  }
});

// ===============================================
// --- (선택사항) 데이터 확인을 위한 GET 엔드포인트 ---
// ===============================================

// 모든 방문 라멘집 조회 (GET /api/visited-ramen)
app.get("/api/visited-ramen", async (req, res) => {
  try {
    const ramenRestaurants = await RamenRestaurant.find({}); // 모든 라멘집 데이터 조회
    res.status(200).json(ramenRestaurants);
  } catch (error) {
    console.error("라멘집 조회 오류:", error);
    res
      .status(500)
      .json({ message: "서버 오류가 발생했습니다.", error: error.message });
  }
});

// 특정 라멘집 상세 조회 (ID 기준) (GET /api/visited-ramen/:id)
app.get("/api/visited-ramen/:id", async (req, res) => {
  try {
    const restaurant = await RamenRestaurant.findById(req.params.id);
    if (!restaurant) {
      return res
        .status(404)
        .json({ message: "해당 라멘집을 찾을 수 없습니다." });
    }
    res.status(200).json(restaurant);
  } catch (error) {
    console.error("라멘집 상세 조회 오류:", error);
    res
      .status(500)
      .json({ message: "서버 오류가 발생했습니다.", error: error.message });
  }
});

// 모든 멤버 조회 (GET /api/members)
app.get("/api/members", async (req, res) => {
  try {
    const members = await Member.find({}); // 모든 멤버 데이터 조회
    res.status(200).json(members);
  } catch (error) {
    console.error("멤버 조회 오류:", error);
    res
      .status(500)
      .json({ message: "서버 오류가 발생했습니다.", error: error.message });
  }
});

// 모든 방문 예정 라멘집 조회 (GET /api/planned-ramen)
app.get("/api/planned-ramen", async (req, res) => {
  try {
    const plannedRamenRestaurants = await PlannedRamenRestaurant.find(
      {}
    ).populate("recommendedBy", "name nickname imageUrl"); // 모든 방문 예정 라멘집 데이터 조회
    res.status(200).json(plannedRamenRestaurants);
  } catch (error) {
    console.error("방문 예정 라멘집 조회 오류:", error);
    res
      .status(500)
      .json({ message: "서버 오류가 발생했습니다.", error: error.message });
  }
});

// 특정 방문 예정 라멘집 상세 조회 (ID 기준)
app.get("/api/planned-ramen/:id", async (req, res) => {
  try {
    const plannedRamenRestaurants = await PlannedRamenRestaurant.findById(
      req.params.id
    ).populate("recommendedBy", "name nickname imageUrl");
    if (!plannedRamenRestaurants) {
      return res
        .status(404)
        .json({ message: "해당 라멘집을 찾을 수 없습니다." });
    }
    res.status(200).json(plannedRamenRestaurants);
  } catch (error) {
    console.error("추천 라멘집 조회 오류:", error);
    res
      .status(500)
      .json({ message: "서버 오류가 발생했습니다.", error: error.message });
  }
});

// --- 6. 서버 시작 ---
app.listen(port, () => {
  console.log(
    `🍜 라멘 API 서버가 http://localhost:${port} 에서 실행 중입니다.`
  );
  console.log("Ctrl+C를 눌러 서버를 종료하세요.");
});
