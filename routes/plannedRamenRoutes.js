const express = require("express");
const router = express.Router();
const PlannedRamenRestaurant = require("../models/PlannedRamenRestaurant");
const Member = require("../models/Member"); // Member 모델 임포트 (추천자 확인용)
const authenticateToken = require("../middleware/authMiddleware");

// 방문 예정 라멘집 추가 API (POST /api/planned-ramen)
router.post("/", authenticateToken, async (req, res, next) => {
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
        ...newPlannedRamen._doc,
        recommendedBy: {
          _id: existingRecommender._id,
          name: existingRecommender.name,
          nickname: existingRecommender.nickname,
          imageUrl: existingRecommender.imageUrl,
        },
      },
    });
  } catch (error) {
    console.error("Error adding planned ramen:", error);
    if (error.code === 11000) {
      return res.status(409).json({ message: `이미 존재하는 라멘집: ${name} (${location})` });
    }
    next(error);
  }
});

// 방문 예정 라멘집 삭제 API (DELETE /api/planned-ramen/:id)
// authenticateToken 추가 예정
router.delete("/:id", authenticateToken, async (req, res, next) => {
  try {
    const { id } = req.params;
    // const loggedInMemberId = req.user._id;

    const result = await PlannedRamenRestaurant.findByIdAndDelete(id);

    if (!result) {
      return res.status(404).json({ message: "삭제할 방문 예정 라멘집을 찾을 수 없습니다." });
    }

    console.log(`방문 예정 라멘집 삭제: ID ${id}`);
    res.status(200).json({ message: "방문 예정 라멘집이 성공적으로 삭제되었습니다." });
  } catch (error) {
    console.error("Error deleting planned ramen restaurant:", error);
    next(error);
  }
});

// 모든 방문 예정 라멘집 조회 (GET /api/planned-ramen)
router.get("/", async (req, res, next) => {
  // authenticateToken을 여기에도 적용할 수 있음
  try {
    const plannedRamenRestaurants = await PlannedRamenRestaurant.find({}).populate("recommendedBy", "name nickname imageUrl");
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
    const plannedRamenRestaurant = await PlannedRamenRestaurant.findById(req.params.id).populate("recommendedBy", "name nickname imageUrl");
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
