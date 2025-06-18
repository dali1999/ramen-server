const express = require("express");
const router = express.Router();
const RamenRestaurant = require("../models/RamenRestaurant");
const Member = require("../models/Member"); // Member 모델 임포트 (existingMember 확인용)
const authenticateToken = require("../middleware/authMiddleware");

// 방문한 라멘집 추가 API (POST /api/visited-ramen)
router.post("/", authenticateToken, async (req, res, next) => {
  const { name, bannerImageUrl, location, visitDate, members: initialVisitMembers } = req.body;

  if (!name || !location || !visitDate) {
    return res.status(400).json({
      message: "필수 필드를 모두 입력해주세요: 이름, 위치, 방문일자",
    });
  }

  try {
    const processedMembers = [];
    if (initialVisitMembers && initialVisitMembers.length > 0) {
      for (const member of initialVisitMembers) {
        const existingMember = await Member.findOne({ name: member.name });
        console.log(existingMember);
        if (!existingMember) {
          return res.status(400).json({ message: `'${member.name}' 이름의 멤버는 존재하지 않습니다.` });
        }
        // 초기 방문 시에는 별점을 받지 않으므로, rating은 null로 저장
        processedMembers.push({
          name: existingMember.name,
          imageUrl: existingMember.imageUrl,
          rating: null,
        });
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
      restaurant.ratingAverage = allMembersCount > 0 ? allRatingsSum / allMembersCount : 0;

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
      console.log(newRamenRestaurant);
    }
  } catch (error) {
    console.error("라멘집 추가/업데이트 오류:", error);
    if (error.code === 11000) {
      // MongoDB의 고유(unique) 인덱스 중복 오류
      return res.status(409).json({ message: `이미 존재하는 라멘집 이름: ${name} (${location})` });
    }
    next(error);
  }
});

// 멤버별 라멘집 별점 추가/수정 API (PATCH /api/visited-ramen/:restaurantId/visits/:visitCount/members/:memberName/rating)
router.patch("/:restaurantId/visits/:visitCount/members/:memberName/rating", authenticateToken, async (req, res, next) => {
  const { restaurantId, visitCount, memberName } = req.params; // URL 파라미터에서 라멘집 ID, 방문 횟수, 멤버 이름 추출
  const { rating } = req.body; // 요청 본문에서 별점 추출

  // 별점 유효성 검사 (0~5점)
  if (rating === undefined || rating === null || rating < 0 || rating > 5) {
    return res.status(400).json({ message: "유효한 별점(0~5)을 입력해주세요." });
  }

  try {
    // 라멘집을 ID로 찾기
    const restaurant = await RamenRestaurant.findById(restaurantId);
    if (!restaurant) {
      return res.status(404).json({ message: "해당 라멘집을 찾을 수 없습니다." });
    }

    // 해당 방문 기록 찾기 (visit_count를 정수로 변환하여 비교)
    const visitIndex = restaurant.visits.findIndex((v) => v.visit_count === parseInt(visitCount));
    if (visitIndex === -1) {
      return res.status(404).json({ message: `방문 횟수 #${visitCount}에 해당하는 기록을 찾을 수 없습니다.` });
    }
    const targetVisit = restaurant.visits[visitIndex]; // 찾은 방문 기록

    // 해당 멤버 찾기 및 별점 업데이트
    const memberIndex = targetVisit.members.findIndex((m) => m.name === memberName);
    if (memberIndex === -1) {
      // 해당 멤버가 방문 기록에 없으면 404 에러
      return res.status(404).json({ message: `'${memberName}' 이름의 멤버를 해당 방문 기록에서 찾을 수 없습니다.` });
    }

    const targetMemberInVisit = targetVisit.members[memberIndex];
    const actualMember = await Member.findOne({ name: targetMemberInVisit.name });

    if (!actualMember || actualMember._id.toString() !== loggedInMemberId) {
      return res.status(403).json({ message: "자신의 별점만 수정할 수 있습니다." });
    }

    // 멤버의 별점 업데이트
    targetVisit.members[memberIndex].rating = rating;

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
    restaurant.ratingAverage = allMembersCount > 0 ? allRatingsSum / allMembersCount : 0; // 0으로 나누는 것 방지

    await restaurant.save(); // 변경된 라멘집 데이터 저장

    console.log(`라멘집 ${restaurant.name}의 ${visitCount}번째 방문에 '${memberName}' 멤버 별점 ${rating}으로 업데이트.`);
    res.status(200).json({ message: "멤버 별점이 성공적으로 업데이트되었습니다.", restaurant });
  } catch (error) {
    console.error("별점 업데이트 오류:", error);
    next(error);
  }
});

// 방문한 라멘집 삭제 API (DELETE /api/visited-ramen/:id)
// authenticateToken 추가 예정
router.delete("/:id", async (req, res, next) => {
  try {
    const { id } = req.params; // URL 파라미터에서 라멘집 ID 추출

    // MongoDB에서 해당 ID의 라멘집을 찾아 삭제
    const result = await RamenRestaurant.findByIdAndDelete(id);

    if (!result) {
      // 삭제할 라멘집을 찾지 못한 경우
      return res.status(404).json({ message: "삭제할 라멘집을 찾을 수 없습니다." });
    }

    console.log(`방문한 라멘집 삭제: ID ${id}`);
    res.status(200).json({ message: "방문한 라멘집이 성공적으로 삭제되었습니다." });
  } catch (error) {
    console.error("방문한 라멘집 삭제 오류:", error);
    next(error);
  }
});

// 모든 방문 라멘집 조회 (GET /api/visited-ramen)
router.get("/", async (req, res, next) => {
  try {
    const ramenRestaurants = await RamenRestaurant.find({}); // 모든 라멘집 데이터 조회
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
      return res.status(404).json({ message: "해당 라멘집을 찾을 수 없습니다." });
    }
    res.status(200).json(restaurant);
  } catch (error) {
    console.error("라멘집 상세 조회 오류:", error);
    next(error);
  }
});

module.exports = router;
