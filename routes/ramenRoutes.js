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
const sharp = require("sharp");
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const path = require("path");

const S3_BUCKET_NAME = process.env.AWS_S3_BUCKET_NAME;
const AWS_REGION = process.env.AWS_S3_REGION;
const AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID;
const AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY;
const s3Client = new S3Client({
  region: AWS_REGION,
  credentials: {
    accessKeyId: AWS_ACCESS_KEY_ID,
    secretAccessKey: AWS_SECRET_ACCESS_KEY,
  },
});

// 방문한 라멘집 추가 API (POST /api/visited-ramen)
router.post(
  "/",
  authenticateToken,
  upload.single("bannerImage"),
  async (req, res, next) => {
    const { name, location, visitDate, members, tags } = req.body;
    let bannerImageUrl;
    const createdBy = req.user._id;

    // ✨ 이미지 최적화 및 S3 업로드 로직 ✨
    if (req.file) {
      try {
        const optimizedImageBuffer = await sharp(req.file.buffer)
          .rotate()
          .resize({ width: 800, fit: "inside", withoutEnlargement: true }) // 라멘 배너에 맞는 크기
          .webp({ quality: 80 })
          .toBuffer();

        const s3Key = `webp/${Date.now().toString()}-${
          path.parse(req.file.originalname).name
        }.webp`; // S3 Key (폴더명/고유이름.webp)
        const uploadParams = {
          Bucket: S3_BUCKET_NAME,
          Key: s3Key,
          Body: optimizedImageBuffer,
          ContentType: "image/webp",
          ACL: "public-read",
        };

        const s3UploadResult = await s3Client.send(
          new PutObjectCommand(uploadParams)
        );
        bannerImageUrl = `https://${S3_BUCKET_NAME}.s3.${AWS_REGION}.amazonaws.com/${s3Key}`;
      } catch (optimizationError) {
        console.error(
          "Image optimization/S3 upload error (banner):",
          optimizationError
        );
        bannerImageUrl =
          RamenRestaurant.schema.paths.bannerImageUrl.defaultValue;
      }
    } else {
      bannerImageUrl = RamenRestaurant.schema.paths.bannerImageUrl.defaultValue;
    }

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
      if (req.file) fs.unlinkSync(req.file.path);
      return res.status(400).json({
        message: "필수 필드를 모두 입력해주세요: 이름, 위치, 방문일자, 멤버",
      });
    }

    try {
      const processedMembers = [];
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
            memberId: existingMember._id,
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

        const populatedRestaurant = await RamenRestaurant.findById(
          restaurant._id
        ).populate("visits.members.memberId", "name nickname imageUrl role");

        res.status(200).json({
          message: "라멘집 재방문 기록이 성공적으로 추가되었습니다.",
          restaurant: populatedRestaurant,
        });
      } else {
        // 첫 방문인 경우: 새로운 라멘집 데이터 생성
        const newRamenRestaurant = new RamenRestaurant({
          name,
          bannerImageUrl: bannerImageUrl,
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

        const populatedRestaurant = await RamenRestaurant.findById(
          newRamenRestaurant._id
        ).populate("visits.members.memberId", "name nickname imageUrl role");

        res.status(201).json({
          message: "새로운 라멘집이 성공적으로 추가되었습니다.",
          restaurant: populatedRestaurant,
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
    const { restaurantId, visitCount, memberName } = req.params; // memberName은 URL 파라미터. 이제 memberId로 찾는게 더 정확.
    const { rating, reviewText } = req.body;
    const loggedInMemberId = req.user._id;

    if (rating === undefined || rating === null || rating < 0 || rating > 5) {
      return res
        .status(400)
        .json({ message: "유효한 별점(0~5)을 입력해주세요." });
    }

    try {
      const restaurant = await RamenRestaurant.findById(restaurantId);
      if (!restaurant) {
        return res
          .status(404)
          .json({ message: "해당 라멘집을 찾을 수 없습니다." });
      }

      const visitIndex = restaurant.visits.findIndex(
        (v) => v.visit_count === parseInt(visitCount)
      );
      if (visitIndex === -1) {
        return res.status(404).json({
          message: `방문 횟수 #${visitCount}에 해당하는 기록을 찾을 수 없습니다.`,
        });
      }
      const targetVisit = restaurant.visits[visitIndex];

      // ✨ 변경: memberId를 기준으로 멤버 찾기 ✨
      const actualMember = await Member.findOne({ name: memberName }); // memberName으로 실제 Member를 찾아 _id를 얻음
      if (!actualMember) {
        // 해당 이름의 멤버가 존재하지 않는 경우
        return res
          .status(404)
          .json({ message: `'${memberName}' 이름의 멤버를 찾을 수 없습니다.` });
      }

      const memberInVisitIndex = targetVisit.members.findIndex(
        (m) => m.memberId.toString() === actualMember._id.toString()
      );
      if (memberInVisitIndex === -1) {
        return res.status(404).json({
          message: `'${memberName}' 이름의 멤버가 해당 방문 기록에 참여하지 않았습니다.`,
        });
      }

      // ✨ 권한 부여: 로그인한 유저 ID와 방문 기록 내 멤버의 _id 비교 ✨
      if (actualMember._id.toString() !== loggedInMemberId) {
        return res
          .status(403)
          .json({ message: "자신의 별점만 수정할 수 있습니다." });
      }

      // 멤버의 별점 및 후기 업데이트
      targetVisit.members[memberInVisitIndex].rating = rating;
      targetVisit.members[memberInVisitIndex].reviewText = reviewText || "";

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

      // 전체 평균 평점 다시 계산
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

      console.log(
        `라멘집 ${restaurant.name}의 ${visitCount}번째 방문에 '${memberName}' 멤버 별점 ${rating}, 후기 업데이트.`
      );

      // ✨ 변경: 응답 시 restaurant 객체의 visits.members.memberId를 populate하여 반환 ✨
      const populatedRestaurant = await RamenRestaurant.findById(
        restaurant._id
      ).populate("visits.members.memberId", "name nickname imageUrl role");

      res.status(200).json({
        message: "멤버 별점 및 후기가 성공적으로 업데이트되었습니다.",
        restaurant: populatedRestaurant,
      });
    } catch (error) {
      console.error("별점 및 후기 업데이트 오류:", error);
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
    const ramenRestaurants = await RamenRestaurant.find({})
      .sort({
        createdAt: -1,
      })
      .populate("visits.members.memberId", "name nickname imageUrl role");
    res.status(200).json(ramenRestaurants);
  } catch (error) {
    console.error("라멘집 조회 오류:", error);
    next(error);
  }
});
// 특정 라멘집 상세 조회 (ID 기준) (GET /api/visited-ramen/:id)
router.get("/:id", async (req, res, next) => {
  try {
    const restaurant = await RamenRestaurant.findById(req.params.id).populate(
      "visits.members.memberId",
      "name nickname imageUrl role"
    );

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

// ✨ 추가: 방문한 라멘집 수정 API (PATCH /api/visited-ramen/:id) ✨
router.patch(
  "/:id",
  authenticateToken,
  upload.single("bannerImage"),
  async (req, res, next) => {
    const { id } = req.params;
    const { name, location, tags } = req.body; // tags는 JSON 문자열로 넘어옴
    const loggedInMemberId = req.user._id;
    const loggedInMemberRole = req.user.role;

    let newBannerImageUrl;
    if (req.file) {
      try {
        const optimizedImageBuffer = await sharp(req.file.buffer)
          .rotate()
          .resize({ width: 800, fit: "inside", withoutEnlargement: true })
          .webp({ quality: 80 })
          .toBuffer();

        const s3Key = `webp/${Date.now().toString()}-${
          path.parse(req.file.originalname).name
        }.webp`; // S3 Key (폴더명/고유이름.webp)
        const uploadParams = {
          Bucket: S3_BUCKET_NAME,
          Key: s3Key,
          Body: optimizedImageBuffer,
          ContentType: "image/webp",
          ACL: "public-read",
        };

        const s3UploadResult = await s3Client.send(
          new PutObjectCommand(uploadParams)
        );
        newBannerImageUrl = `https://${S3_BUCKET_NAME}.s3.${AWS_REGION}.amazonaws.com/${s3Key}`;
      } catch (optimizationError) {
        console.error(
          "Image optimization/S3 upload error (banner):",
          optimizationError
        );
      }
    }

    let parsedTags;
    try {
      if (tags) {
        parsedTags = JSON.parse(tags);
        if (!Array.isArray(parsedTags))
          throw new Error("Tags data is not a valid array.");
      } else {
        parsedTags = [];
      }
    } catch (parseError) {
      return res.status(400).json({
        message: "유효하지 않은 태그 데이터 형식입니다: " + parseError.message,
      });
    }

    try {
      const restaurant = await RamenRestaurant.findById(id);
      if (!restaurant) {
        return res
          .status(404)
          .json({ message: "수정할 라멘집을 찾을 수 없습니다." });
      }

      // ✨ 권한 부여: 관리자이거나 생성자 본인인 경우에만 수정 허용 ✨
      const isOwner =
        restaurant.createdBy &&
        restaurant.createdBy.toString() === loggedInMemberId;
      const isAdmin = loggedInMemberRole === "admin";

      if (!isAdmin && !isOwner) {
        return res
          .status(403)
          .json({ message: "이 라멘집을 수정할 권한이 없습니다." });
      }

      // 이름 (unique 필드이므로 중복 검사)
      if (name !== undefined && name !== restaurant.name) {
        const existingRestaurantWithName = await RamenRestaurant.findOne({
          name: name,
        });
        if (
          existingRestaurantWithName &&
          existingRestaurantWithName._id.toString() !== id
        ) {
          return res
            .status(409)
            .json({ message: "이미 존재하는 라멘집 이름입니다." });
        }
        restaurant.name = name;
      }

      // 위치
      if (location !== undefined) {
        restaurant.location = location;
      }

      // 이미지 배열 업데이트: 새 이미지가 있으면 기존 이미지에 추가
      if (newBannerImageUrl) {
        restaurant.bannerImageUrl = newBannerImageUrl;
      }

      // 태그
      restaurant.tags = parsedTags; // 태그는 받은 대로 덮어쓰기

      await restaurant.save();

      const populatedRestaurant = await RamenRestaurant.findById(
        restaurant._id
      ).populate("visits.members.memberId", "name nickname imageUrl role");

      res.status(200).json({
        message: "라멘집 정보가 성공적으로 업데이트되었습니다.",
        restaurant: populatedRestaurant,
      });
    } catch (error) {
      console.error("라멘집 정보 업데이트 오류:", error);

      if (error.code === 11000) {
        return res
          .status(409)
          .json({ message: "데이터베이스 중복 오류 (이름)." });
      }
      next(error);
    }
  }
);

//============================= 이미지 업로드

// 라멘집 이미지 업로드/수정 API (PATCH /api/visited-ramen/:id/images)
router.patch(
  "/:id/images",
  authenticateToken,
  upload.array("images", 10),
  async (req, res, next) => {
    const { id } = req.params;

    let newImageUrls = [];

    // ✨ 이미지 최적화 및 S3 업로드 로직 ✨
    if (req.files && req.files.length > 0) {
      try {
        for (const file of req.files) {
          console.log(file);
          const optimizedImageBuffer = await sharp(file.buffer)
            .rotate()
            .resize({ width: 800, fit: "inside", withoutEnlargement: true }) // 라멘 에 맞는 크기
            .webp({ quality: 80 })
            .toBuffer();

          const s3Key = `webp/${Date.now().toString()}-${
            path.parse(file.originalname).name
          }.webp`;

          const uploadParams = {
            Bucket: S3_BUCKET_NAME,
            Key: s3Key,
            Body: optimizedImageBuffer,
            ContentType: "image/webp",
            ACL: "public-read",
          };

          await s3Client.send(new PutObjectCommand(uploadParams));

          const uploadedUrl = `https://${S3_BUCKET_NAME}.s3.${AWS_REGION}.amazonaws.com/${s3Key}`;
          console.log(uploadedUrl);
          newImageUrls.push(uploadedUrl);
        }
      } catch (optimizationError) {
        console.error(
          "Image optimization/S3 upload error (banner):",
          optimizationError
        );
        return res.status(500).json({ message: "이미지 업로드 중 오류 발생" });
      }
    }

    try {
      const restaurant = await RamenRestaurant.findById(id);
      if (!restaurant) {
        return res.status(404).json({ message: "라멘집을 찾을 수 없습니다." });
      }

      // 이미지 배열 업데이트: 새 이미지가 있으면 기존 이미지를 덮어씁니다.
      if (newImageUrls.length > 0) {
        restaurant.images = [...restaurant.images, ...newImageUrls];
      } else if (req.body.clearAllImages === "true") {
        restaurant.images = [];
      } else {
        if (
          restaurant.images.length === 0 &&
          Array.isArray(RamenRestaurant.schema.paths.images.defaultValue)
        ) {
          restaurant.images = RamenRestaurant.schema.paths.images.defaultValue;
        }
      }

      await restaurant.save();

      const populatedRestaurant = await RamenRestaurant.findById(
        restaurant._id
      ).populate("visits.members.memberId", "name nickname imageUrl role");

      res.status(200).json({
        message: "라멘집 이미지가 성공적으로 업데이트되었습니다.",
        restaurant: populatedRestaurant,
      });
    } catch (error) {
      console.error("라멘집 이미지 업데이트 오류:", error);
      next(error);
    }
  }
);

// 라멘집 이미지 조회 API (GET /api/visited-ramen/:id/images)
router.get("/:id/images", async (req, res, next) => {
  try {
    const { id } = req.params;
    const restaurant = await RamenRestaurant.findById(id);

    if (!restaurant) {
      return res.status(404).json({ message: "라멘집을 찾을 수 없습니다." });
    }

    // 이미지 배열만 반환
    res.status(200).json({ images: restaurant.images });
  } catch (error) {
    console.error("라멘집 이미지 조회 오류:", error);
    next(error);
  }
});

module.exports = router;
