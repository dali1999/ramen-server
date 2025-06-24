const express = require("express");
const router = express.Router();
const PlannedRamenRestaurant = require("../models/PlannedRamenRestaurant");
const Member = require("../models/Member"); // Member 모델 임포트 (추천자 확인용)
const { authenticateToken, authorizeAdmin } = require("../middleware/authMiddleware");
const upload = require("../utils/upload");

// 방문 예정 라멘집 추가 API (POST /api/planned-ramen)
router.post("/", authenticateToken, upload.single("plannedBannerImage"), async (req, res, next) => {
  const { name, location, recommendationComment } = req.body;
  const bannerImageUrl = req.file ? req.file.location : undefined;
  const recommenderId = req.user._id;

  if (!name || !location) {
    if (req.file) {
      // TODO: S3 delete object logic here if recommender invalid
    }
    return res.status(400).json({
      message: "방문 예정 라멘집 이름과 위치는 필수입니다.",
    });
  }

  try {
    const existingRecommender = await Member.findById(recommenderId);
    if (!existingRecommender) {
      if (req.file) {
        // TODO: S3 delete object logic here if recommender invalid
      }
      return res.status(400).json({
        message: `인증된 사용자가 유효하지 않습니다. 다시 로그인해주세요.`,
      });
    }

    const newPlannedRamen = new PlannedRamenRestaurant({
      name,
      bannerImageUrl: bannerImageUrl || PlannedRamenRestaurant.schema.paths.bannerImageUrl.defaultValue,
      location,
      recommendedBy: recommenderId,
      recommendationComment,
    });
    await newPlannedRamen.save();
    console.log(`방문 예정 라멘집 추가: ${name}`);

    const populatedPlannedRamen = await PlannedRamenRestaurant.findById(newPlannedRamen._id).populate(
      "recommendedBy",
      "name nickname imageUrl role"
    );

    res.status(201).json({
      message: "방문 예정 라멘집이 성공적으로 추가되었습니다.",
      plannedRamen: populatedPlannedRamen,
    });
  } catch (error) {
    console.error("Error adding planned ramen:", error);
    if (req.file) {
      // 오류 시 업로드된 파일 삭제 (S3에서 수동 삭제 필요)
    }
    if (error.code === 11000) {
      return res.status(409).json({ message: `이미 존재하는 라멘집: ${name} (${location})` });
    }
    next(error);
  }
});

// 방문 예정 라멘집 삭제 API (DELETE /api/planned-ramen/:id)
router.delete("/:id", authenticateToken, async (req, res, next) => {
  try {
    const { id } = req.params;
    const loggedInMemberId = req.user._id;
    const loggedInMemberRole = req.user.role;

    const restaurant = await PlannedRamenRestaurant.findByIdAndDelete(id);

    if (!restaurant) {
      return res.status(404).json({ message: "삭제할 추천 라멘집을 찾을 수 없습니다." });
    }

    // 1. 관리자 확인
    if (loggedInMemberRole === "admin") {
      await PlannedRamenRestaurant.findByIdAndDelete(id);
      console.log(`관리자에 의해 추천 라멘집 삭제: ID ${id}`);
      return res.status(200).json({
        message: "추천 라멘집이 성공적으로 삭제되었습니다. (관리자)",
      });
    }

    // 2. 일반 사용자일 경우, 자신이 생성한 라멘집인지 확인
    if (restaurant.recommendedBy && restaurant.recommendedBy._id.toString() === loggedInMemberId) {
      await PlannedRamenRestaurant.findByIdAndDelete(id);
      console.log(`생성자에 의해 추천 라멘집 삭제: ID ${id}`);
      return res.status(200).json({
        message: "추천 라멘집이 성공적으로 삭제되었습니다. (본인 생성)",
      });
    }

    // 3. 권한 없음 (관리자도 아니고 생성자도 아닌 경우)
    return res.status(403).json({ message: "이 라멘집을 삭제할 권한이 없습니다." });
  } catch (error) {
    console.error("추천 라멘집 삭제 오류:", error);
    next(error);
  }
});

// 모든 방문 예정 라멘집 조회 (GET /api/planned-ramen)
router.get("/", async (req, res, next) => {
  // authenticateToken을 여기에도 적용할 수 있음
  try {
    const plannedRamenRestaurants = await PlannedRamenRestaurant.find({})
      .populate("recommendedBy", "name nickname imageUrl role")
      .sort({ createdAt: -1 });
    res.status(200).json(plannedRamenRestaurants);
  } catch (error) {
    console.error("Error fetching planned ramen restaurants:", error);
    next(error);
  }
});

// 특정 방문 예정 라멘집 상세 조회 (ID 기준) (GET /api/planned-ramen/:id)
router.get("/:id", async (req, res, next) => {
  // authenticateToken을 여기에도 적용할 수 있음
  try {
    const plannedRamenRestaurant = await PlannedRamenRestaurant.findById(req.params.id).populate(
      "recommendedBy",
      "name nickname imageUrl role"
    );
    if (!plannedRamenRestaurant) {
      return res.status(404).json({ message: "해당 라멘집을 찾을 수 없습니다." });
    }
    res.status(200).json(plannedRamenRestaurant);
  } catch (error) {
    console.error("Error fetching planned ramen restaurant details:", error);
    next(error);
  }
});

module.exports = router;
