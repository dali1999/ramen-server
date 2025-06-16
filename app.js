const express = require("express");
const mongoose = require("mongoose");
require("dotenv").config();
const cors = require("cors");

const app = express();
const port = process.env.PORT || 3000;

app.use(
  cors({
    origin: "http://localhost:5173",
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"], // 허용할 HTTP 메소드
    allowedHeaders: ["Content-Type", "Authorization"], // 허용할 요청 헤더
  })
);

app.use(express.json());

const MONGODB_URI = process.env.MONGODB_URI;

mongoose
  .connect(MONGODB_URI)
  .then(() => console.log("✅ MongoDB에 성공적으로 연결되었습니다."))
  .catch((err) => console.error("❌ MongoDB 연결 실패:", err));

// --- 4. Mongoose 스키마 및 모델 정의 ---

// 4.1. 방문 멤버 스키마 (VisitMemberSchema)
// 라멘집 방문 시 함께한 멤버와 그들이 남긴 별점 정보를 정의합니다.
const VisitMemberSchema = new mongoose.Schema(
  {
    name: { type: String, required: true }, // 멤버 이름 (필수)
    rating: { type: Number, min: 0, max: 5, default: null }, // 별점 (0~5점, 초기값은 null 허용)
  },
  { _id: false } // 이 스키마는 다른 문서 안에 중첩되므로, 별도의 _id를 생성하지 않습니다.
);

// 4.2. 방문 기록 스키마 (VisitSchema)
// 라멘집의 특정 방문에 대한 상세 정보를 정의합니다.
const VisitSchema = new mongoose.Schema(
  {
    visit_count: { type: Number, required: true, default: 1 }, // 해당 라멘집 방문 횟수
    visit_date: { type: String, required: true }, // 방문 날짜
    members: [VisitMemberSchema], // 이 방문에 참여한 멤버들 (VisitMemberSchema의 배열)
  },
  { _id: false } // 이 스키마도 다른 문서 안에 중첩되므로, 별도의 _id를 생성하지 않습니다.
);

// 4.3. 라멘집 스키마 (RamenRestaurantSchema)
// 방문한 라멘집의 주요 정보와 모든 방문 기록을 정의합니다.
const RamenRestaurantSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true }, // 라멘집 이름 (필수, 고유해야 함)
  bannerImageUrl: {
    type: String,
    default:
      "https://us.123rf.com/450wm/eclaira/eclaira2302/eclaira230200005/198689430-ciotola-di-noodles-di-ramen-con-carne-di-maiale-e-uova-cibo-asiatico-illustrazione-vettoriale.jpg?ver=6",
  }, // 배너 이미지 URL (기본 이미지 제공)
  location: { type: String, required: true }, // 라멘집 주소 (필수)
  ratingAverage: { type: Number, default: 0, min: 0, max: 5 }, // 라멘집의 전체 평균 별점 (초기 0)
  visits: [VisitSchema], // 이 라멘집의 모든 방문 기록 (VisitSchema의 배열)
});

// 4.4. 멤버 스키마 (MemberSchema)
// 라멘집을 방문할 수 있는 멤버들의 정보를 정의합니다.
const MemberSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true }, // 멤버 이름 (필수, 고유해야 함)
  nickname: { type: String, default: "" }, // 멤버 닉네임 (기본값 빈 문자열)
  imageUrl: {
    type: String,
    default:
      "https://us.123rf.com/450wm/eclaira/eclaira2302/eclaira230200005/198689430-ciotola-di-noodles-di-ramen-con-carne-di-maiale-e-uova-cibo-asiatico-illustrazione-vettoriale.jpg?ver=6",
  }, // 프로필 이미지 URL (기본 이미지 제공)
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
  recommendedBy: { type: String, ref: "Member", required: true },
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
const Member = mongoose.model("Member", MemberSchema);
const PlannedRamenRestaurant = mongoose.model(
  "PlannedRamenRestaurant",
  PlannedRamenRestaurantSchema
);

// ===============================================
// --- 5. API 엔드포인트 정의 ---
// ===============================================

// 5.1. 방문한 라멘집 추가 API (POST /api/visited-ramen)
// - 라멘집 이름, 메인 사진, 위치, 방문일자, 함께 방문한 멤버(별점 없이)를 받습니다.
// - 재방문 시 visit_count가 올라가고, 첫 방문 시 새로운 라멘집 데이터가 생성됩니다.
app.post("/api/visited-ramen", async (req, res) => {
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
app.post("/api/members", async (req, res) => {
  const { name, nickname, imageUrl } = req.body;

  if (!name) {
    return res.status(400).json({ message: "멤버 이름은 필수입니다." });
  }

  try {
    const newMember = new Member({
      name,
      nickname,
      imageUrl,
    });
    await newMember.save(); // 새 멤버 저장
    console.log(`새로운 멤버 추가: ${name}`);
    res.status(201).json({
      message: "멤버가 성공적으로 추가되었습니다.",
      member: newMember,
    });
  } catch (error) {
    console.error("멤버 추가 오류:", error);
    if (error.code === 11000) {
      // MongoDB의 고유(unique) 인덱스 중복 오류
      return res
        .status(409)
        .json({ message: `'${name}' 이름의 멤버가 이미 존재합니다.` });
    }
    res
      .status(500)
      .json({ message: "서버 오류가 발생했습니다.", error: error.message });
  }
});

// 5.3. 방문 예정 라멘집 추가 API (POST /api/planned-ramen)
app.post("/api/planned-ramen", async (req, res) => {
  const {
    name,
    bannerImageUrl,
    location,
    recommendedBy,
    recommendationComment,
  } = req.body;

  if (!name || !location || !recommendedBy) {
    return res.status(400).json({
      message: "방문 예정 라멘집 이름, 위치, 추천한 사람은 필수입니다.",
    });
  }

  try {
    const existingRecommender = await Member.findOne({ name: recommendedBy });
    if (!existingRecommender) {
      return res.status(400).json({
        message: `'${recommendedBy}' 이름의 멤버는 존재하지 않습니다. 먼저 멤버를 추가해주세요.`,
      });
    }

    const newPlannedRamen = new PlannedRamenRestaurant({
      name,
      bannerImageUrl,
      location,
      recommendedBy, // 이전 답변에서 추가됨
      recommendationComment, // 이전 답변에서 추가됨
    });
    await newPlannedRamen.save();
    console.log(`방문 예정 라멘집 추가: ${name}`);
    res.status(201).json({
      message: "방문 예정 라멘집이 성공적으로 추가되었습니다.",
      plannedRamen: newPlannedRamen,
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
app.delete("/api/visited-ramen/:id", async (req, res) => {
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
    const plannedRamenRestaurants = await PlannedRamenRestaurant.find({}); // 모든 방문 예정 라멘집 데이터 조회
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
    );
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
