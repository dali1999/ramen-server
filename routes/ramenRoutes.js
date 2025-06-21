const express = require("express");
const router = express.Router();
const RamenRestaurant = require("../models/RamenRestaurant");
const Member = require("../models/Member"); // Member 모델 임포트 (existingMember 확인용)
const upload = require("../utils/upload");
const {
  authenticateToken,
  authorizeAdmin,
} = require("../middleware/authMiddleware");
const fs = require("fs");

// 방문한 라멘집 추가 API (POST /api/visited-ramen)
router.post(
  "/",
  authenticateToken,
  upload.single("bannerImage"),
  async (req, res, next) => {
    const { name, location, visitDate, members, tags } = req.body;
    const bannerImageUrl = req.file ? req.file.location : undefined;
    const createdBy = req.user._id;

    let initialVisitMembers;
    let restaurantTags;
    try {
      initialVisitMembers = JSON.parse(members);
      if (!Array.isArray(initialVisitMembers)) {
        throw new Error("Members data is not a valid array.");
      }
      restaurantTags = JSON.parse(tags);
      if (!Array.isArray(restaurantTags)) {
        throw new Error("Tags data is not a valid array.");
      }
    } catch (parseError) {
      if (req.file) {
        fs.unlinkSync(req.file.path);
      }
      return res
        .status(400)
        .json({ message: "유효하지 않은 멤버 데이터 형식입니다." });
    }

    if (!name || !location || !visitDate || initialVisitMembers.length === 0) {
      if (req.file) {
        fs.unlink(req.file.path, (err) => {
          if (err) console.error("Error deleting incomplete upload:", err);
        });
      }
      return res.status(400).json({
        message:
          "필수 필드를 모두 입력해주세요: 이름, 위치, 방문일자, 동행 멤버",
      });
    }

    try {
      const processedMembers = [];
      let currentVisitRatingsSum = 0;
      let currentVisitMembersWithRatingCount = 0;

      if (initialVisitMembers && initialVisitMembers.length > 0) {
        for (const member of initialVisitMembers) {
          const existingMember = await Member.findOne({ name: member.name });
          if (!existingMember) {
            if (req.file) {
              fs.unlinkSync(req.file.path);
            }
            return res.status(400).json({
              message: `'${member.name}' 이름의 멤버는 존재하지 않습니다.`,
            });
          }
          processedMembers.push({
            name: existingMember.name,
            imageUrl: existingMember.imageUrl,
            role: existingMember.role,
            rating: null,
            reviewText: "",
          });
        }
      }

      const currentVisitAverage = 0;

      let restaurant = await RamenRestaurant.findOne({ name, location });
      const currentVisitDate = new Date(visitDate + "T00:00:00Z"); // 방문 일자를 Date 객체로 파싱 (UTC 자정)

      if (restaurant) {
        // 재방문인 경우: 기존 라멘집에 새 방문 기록 추가
        const newVisit = {
          visit_count: restaurant.visits.length + 1,
          visit_date: visitDate,
          members: processedMembers,
          visitRatingAverage: currentVisitAverage,
        };
        restaurant.visits.push(newVisit);

        restaurant.tags = restaurantTags;
        restaurant.lastVisitedDate = currentVisitDate; // 마지막 방문 일자 업데이트

        // 전체 평균 평점 다시 계산 (기존 로직 유지)
        let allRatingsSum = 0;
        let allMembersCount = 0;
        restaurant.visits.forEach((visit) => {
          visit.members.forEach((m) => {
            if (m.rating !== null && m.rating !== undefined) {
              allRatingsSum += m.rating;
              allMembersCount++;
            }
          });
        });
        restaurant.ratingAverage =
          allMembersCount > 0 ? allRatingsSum / allMembersCount : 0;

        await restaurant.save();
        console.log(`재방문 기록 추가 및 업데이트: ${name} (${visitDate})`);
        res.status(200).json({
          message: "라멘집 재방문 기록이 성공적으로 추가되었습니다.",
          restaurant,
        });
      } else {
        // 첫 방문인 경우: 새로운 라멘집 데이터 생성
        const newRamenRestaurant = new RamenRestaurant({
          name,
          bannerImageUrl:
            bannerImageUrl ||
            RamenRestaurant.schema.paths.bannerImageUrl.defaultValue,
          location,
          ratingAverage: 0,
          visits: [
            {
              visit_count: 1,
              visit_date: visitDate,
              members: processedMembers,
              visitRatingAverage: currentVisitAverage,
            },
          ],
          tags: restaurantTags,
          lastVisitedDate: currentVisitDate,
          createdBy: createdBy,
        });
        await newRamenRestaurant.save();
        console.log(`새로운 라멘집 추가: ${name}`);
        res.status(201).json({
          message: "새로운 라멘집이 성공적으로 추가되었습니다.",
          restaurant: newRamenRestaurant,
        });
      }
    } catch (error) {
      console.error("라멘집 추가/업데이트 오류:", error);
      if (req.file) {
        fs.unlink(req.file.path, (err) => {
          if (err) console.error("Error deleting failed upload:", err);
        });
      }
      if (error.code === 11000) {
        return res.status(409).json({
          message: `이미 존재하는 라멘집 이름: ${name} (${location})`,
        });
      }
      next(error);
    }
  }
);

// 멤버별 라멘집 별점 추가/수정 API (PATCH /api/visited-ramen/:restaurantId/visits/:visitCount/members/:memberName/rating)
router.patch(
  "/:restaurantId/visits/:visitCount/members/:memberName/rating",
  authenticateToken,
  async (req, res, next) => {
    const { restaurantId, visitCount, memberName } = req.params; // URL 파라미터에서 라멘집 ID, 방문 횟수, 멤버 이름 추출
    const { rating, reviewText } = req.body; // 요청 본문에서 별점 추출
    const loggedInMemberId = req.user._id;

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
          message: `방문 횟수 #${visitCount}에 해당하는 기록을 찾을 수 없습니다.`,
        });
      }
      const targetVisit = restaurant.visits[visitIndex]; // 찾은 방문 기록

      // 해당 멤버 찾기 및 별점 업데이트
      const memberIndex = targetVisit.members.findIndex(
        (m) => m.name === memberName
      );
      if (memberIndex === -1) {
        return res.status(404).json({
          message: `'${memberName}' 이름의 멤버를 해당 방문 기록에서 찾을 수 없습니다.`,
        });
      }

      const targetMemberInVisit = targetVisit.members[memberIndex];
      const actualMember = await Member.findOne({
        name: targetMemberInVisit.name,
      });

      if (!actualMember || actualMember._id.toString() !== loggedInMemberId) {
        return res
          .status(403)
          .json({ message: "자신의 별점만 수정할 수 있습니다." });
      }

      // 멤버의 별점/후기 업데이트
      targetVisit.members[memberIndex].rating = rating;
      targetVisit.members[memberIndex].reviewText = reviewText || "";

      // 해당 방문(visit)의 평균 별점 다시 계산
      let currentVisitRatingsSum = 0;
      let currentVisitMembersWithRatingCount = 0;
      targetVisit.members.forEach((m) => {
        if (m.rating !== null && m.rating !== undefined) {
          currentVisitRatingsSum += m.rating;
          currentVisitMembersWithRatingCount++;
        }
      });
      targetVisit.visitRatingAverage =
        currentVisitMembersWithRatingCount > 0
          ? currentVisitRatingsSum / currentVisitMembersWithRatingCount
          : 0;

      // 라멘집의 전체 평균 별점 다시 계산
      let allRatingsSum = 0;
      let allMembersCount = 0;
      restaurant.visits.forEach((visit) => {
        visit.members.forEach((m) => {
          if (m.rating !== null && m.rating !== undefined) {
            allRatingsSum += m.rating;
            allMembersCount++;
          }
        });
      });
      restaurant.ratingAverage =
        allMembersCount > 0 ? allRatingsSum / allMembersCount : 0;

      await restaurant.save(); // 변경된 라멘집 데이터 저장

      console.log(
        `라멘집 ${restaurant.name}의 ${visitCount}번째 방문에 '${memberName}' 멤버 별점 ${rating}, 후기 업데이트.`
      );
      res.status(200).json({
        message: "멤버 별점 및 후기가 성공적으로 업데이트되었습니다.",
        restaurant,
      });
    } catch (error) {
      console.error("별점 업데이트 오류:", error);
      next(error);
    }
  }
);

// 방문한 라멘집 삭제 API (DELETE /api/visited-ramen/:id)
router.delete("/:id", authenticateToken, async (req, res, next) => {
  try {
    const { id } = req.params;
    const loggedInMemberId = req.user._id;
    const loggedInMemberRole = req.user.role;

    // MongoDB에서 해당 ID의 라멘집을 찾아 삭제
    const restaurant = await RamenRestaurant.findByIdAndDelete(id);

    if (!restaurant) {
      return res
        .status(404)
        .json({ message: "삭제할 라멘집을 찾을 수 없습니다." });
    }

    // 1. 관리자 확인
    if (loggedInMemberRole === "admin") {
      await RamenRestaurant.findByIdAndDelete(id);
      console.log(`관리자에 의해 방문한 라멘집 삭제: ID ${id}`);
      return res.status(200).json({
        message: "방문한 라멘집이 성공적으로 삭제되었습니다. (관리자)",
      });
    }

    // 2. 일반 사용자일 경우, 자신이 생성한 라멘집인지 확인
    if (
      restaurant.createdBy &&
      restaurant.createdBy.toString() === loggedInMemberId
    ) {
      await RamenRestaurant.findByIdAndDelete(id);
      console.log(`생성자에 의해 방문한 라멘집 삭제: ID ${id}`);
      return res.status(200).json({
        message: "방문한 라멘집이 성공적으로 삭제되었습니다. (본인 생성)",
      });
    }

    // 3. 권한 없음 (관리자도 아니고 생성자도 아닌 경우)
    return res
      .status(403)
      .json({ message: "이 라멘집을 삭제할 권한이 없습니다." });
  } catch (error) {
    console.error("방문한 라멘집 삭제 오류:", error);
    next(error);
  }
});

// 모든 방문 라멘집 조회 (GET /api/visited-ramen)
router.get("/", async (req, res, next) => {
  try {
    const ramenRestaurants = await RamenRestaurant.find({}).sort({
      createdAt: -1,
    });
    res.status(200).json(ramenRestaurants);
  } catch (error) {
    console.error("라멘집 조회 오류:", error);
    next(error);
  }
});

// 특정 라멘집 상세 조회 (ID 기준) (GET /api/visited-ramen/:id)
router.get("/:id", async (req, res, next) => {
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
    next(error);
  }
});

module.exports = router;
