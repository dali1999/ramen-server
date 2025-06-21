const express = require("express");
const router = express.Router();
const Member = require("../models/Member");
const { authenticateToken } = require("../middleware/authMiddleware");
const RamenRestaurant = require("../models/RamenRestaurant");
const PlannedRamenRestaurant = require("../models/PlannedRamenRestaurant");
const upload = require("../utils/upload");

// 모든 멤버 조회 (GET /api/members)
router.get("/", async (req, res, next) => {
  try {
    const members = await Member.find({}, { password: 0 }); // 비밀번호 제외
    res.status(200).json(members);
  } catch (error) {
    console.error("Error fetching members:", error);
    next(error);
  }
});

// 내 정보 조회 API (GET /api/members/me)
router.get("/me", authenticateToken, async (req, res, next) => {
  try {
    const loggedInMemberId = req.user._id; // JWT 토큰에서 로그인한 사용자 ID 가져오기

    // 1. 나의 회원가입 정보 조회 (비밀번호 제외)
    const myInfo = await Member.findById(loggedInMemberId, { password: 0 });
    if (!myInfo) {
      return res
        .status(404)
        .json({ message: "사용자 정보를 찾을 수 없습니다." });
    }

    // 2. 내가 방문한 라멘집들 및 총 방문 횟수 계산
    const visitedRamenByMe = await RamenRestaurant.find({
      "visits.members.name": myInfo.name,
    });

    let totalVisitsCount = 0;
    const myVisitedRestaurants = [];
    visitedRamenByMe.forEach((restaurant) => {
      const myVisitsInThisRestaurant = restaurant.visits.filter((visit) =>
        visit.members.some((member) => member.name === myInfo.name)
      );

      myVisitsInThisRestaurant.forEach((myVisit) => {
        totalVisitsCount++; // 총 방문 횟수 증가
      });

      // 내가 참여한 방문 기록의 요약 정보만 포함하여 배열에 추가
      myVisitedRestaurants.push({
        _id: restaurant._id,
        name: restaurant.name,
        location: restaurant.location,
        bannerImageUrl: restaurant.bannerImageUrl,
        myVisits: myVisitsInThisRestaurant.map((visit) => ({
          visit_count: visit.visit_count,
          visit_date: visit.visit_date,
          myRating:
            visit.members.find((m) => m.name === myInfo.name)?.rating || null,
          myReviewText:
            visit.members.find((m) => m.name === myInfo.name)?.reviewText || "",
        })),
        overallRatingAverage: restaurant.ratingAverage,
      });
    });

    // 3. 내가 추천한 라멘집들
    const recommendedRamenByMe = await PlannedRamenRestaurant.find({
      recommendedBy: loggedInMemberId, // 내가 추천한 라멘집 찾기 (ID로 검색)
    }).populate("recommendedBy", "name nickname imageUrl"); // 추천 멤버 정보도 함께 가져오기

    res.status(200).json({
      myInfo: {
        _id: myInfo._id,
        name: myInfo.name,
        nickname: myInfo.nickname,
        email: myInfo.email,
        imageUrl: myInfo.imageUrl,
        role: myInfo.role,
        createdAt: myInfo.createdAt,
      },
      stats: {
        totalParticipatedVisits: totalVisitsCount,
        totalRecommendedRamen: recommendedRamenByMe.length,
      },
      myVisitedRamen: myVisitedRestaurants,
      myRecommendedRamen: recommendedRamenByMe,
    });
  } catch (error) {
    console.error("Error fetching user profile:", error);
    next(error);
  }
});

// 내 정보 수정 API (PATCH /api/members/me)
router.patch(
  "/me",
  authenticateToken,
  upload.single("profileImage"),
  async (req, res, next) => {
    const loggedInMemberId = req.user._id;
    const { name, nickname } = req.body;
    const newProfileImageUrl = req.file ? req.file.location : undefined;

    try {
      const member = await Member.findById(loggedInMemberId);
      console.log(member);
      if (!member) {
        if (req.file) fs.unlinkSync(req.file.path);
        return res
          .status(404)
          .json({ message: "사용자 정보를 찾을 수 없습니다." });
      }

      if (name !== undefined) {
        if (name !== member.name) {
          const existingMemberWithName = await Member.findOne({ name: name });
          if (existingMemberWithName) {
            if (req.file) {
              fs.unlinkSync(req.file.path);
            }
            return res
              .status(409)
              .json({ message: "이미 사용 중인 이름입니다." });
          }
        }
        member.name = name;
      }

      // 닉네임 업데이트
      if (nickname !== undefined) {
        member.nickname = nickname;
      }

      // 이미지 URL 업데이트
      if (newProfileImageUrl !== undefined) {
        member.imageUrl = newProfileImageUrl;
      } else {
        // 파일이 업로드되지 않았지만, imageUrl을 비우거나 기본값으로 되돌리고 싶을 수 있습니다.
        // 현재 로직은 파일을 보내지 않으면 기존 이미지를 유지합니다.
        // 만약 '이미지 없음' 버튼 등을 통해 이미지를 비울 수 있게 하려면 추가 로직 필요.
        // 예를 들어, req.body.clearImage: true 같은 필드를 받아서 member.imageUrl = Member.schema.paths.imageUrl.defaultValue;
      }

      await member.save();

      res.status(200).json({
        message: "회원 정보가 성공적으로 업데이트되었습니다.",
        member: {
          _id: member._id,
          name: member.name,
          nickname: member.nickname,
          email: member.email,
          imageUrl: member.imageUrl,
          role: member.role,
          createdAt: member.createdAt,
        },
      });
    } catch (error) {
      console.error("Error updating user profile:", error);
      if (req.file) {
        fs.unlinkSync(req.file.path);
      }
      if (error.code === 11000) {
        return res.status(409).json({ message: "데이터베이스 중복 오류." });
      }
      next(error);
    }
  }
);

// 멤버 삭제 API (DELETE /api/members/:id)
// authenticateToken 추후 추가 예정
router.delete("/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    // const loggedInMemberId = req.user._id;

    // if (id !== loggedInMemberId) {
    //     return res.status(403).json({ message: "자신의 계정만 삭제할 수 있습니다." });
    // }

    const result = await Member.findByIdAndDelete(id);

    if (!result) {
      return res
        .status(404)
        .json({ message: "삭제할 멤버를 찾을 수 없습니다." });
    }

    console.log(`멤버 삭제: ID ${id} (${result.name})`);
    res.status(200).json({ message: "계정이 성공적으로 삭제되었습니다." });
  } catch (error) {
    console.error("Error deleting member:", error);
    next(error);
  }
});

module.exports = router;
