const express = require("express");
const router = express.Router();
const Schedule = require("../models/Schedule");
const PlannedRamenRestaurant = require("../models/PlannedRamenRestaurant");
const Member = require("../models/Member");
const { authenticateToken } = require("../middleware/authMiddleware");

// 1. 일정 잡기 API (POST /api/schedules)
router.post("/", authenticateToken, async (req, res, next) => {
  const { plannedRamenId, title, dateTime, specialNotes } = req.body;
  const organizerId = req.user._id;

  if (!plannedRamenId || !title || !dateTime) {
    return res.status(400).json({ message: "선택 라멘집, 제목, 일자 및 시간은 필수입니다." });
  }

  try {
    // 1. 추천 라멘집이 실제로 존재하는지 확인
    const existingPlannedRamen = await PlannedRamenRestaurant.findById(plannedRamenId);
    if (!existingPlannedRamen) {
      return res.status(404).json({ message: "선택된 추천 라멘집을 찾을 수 없습니다." });
    }

    // 2. 주최자(organizer) 정보 확인
    const organizerMember = await Member.findById(organizerId);
    if (!organizerMember) {
      return res.status(400).json({ message: "인증된 사용자가 유효하지 않습니다. 다시 로그인해주세요." });
    }

    // 3. 새 일정 생성
    const newSchedule = new Schedule({
      plannedRamenId,
      title,
      organizer: organizerId,
      dateTime: new Date(dateTime), // Date 객체로 변환
      specialNotes,
      participants: [{ member: organizerId }], // 일정 잡은 사람은 기본 참여자로 추가
    });

    await newSchedule.save();

    // 4. 생성된 일정을 프론트엔드에서 바로 사용할 수 있도록 populate하여 반환
    const populatedSchedule = await Schedule.findById(newSchedule._id)
      .populate("plannedRamenId", "name location bannerImageUrl")
      .populate("organizer", "name nickname imageUrl")
      .populate("participants.member", "name nickname imageUrl");

    console.log(`새로운 라멘로드 일정 생성: ${title} (라멘집: ${existingPlannedRamen.name})`);
    res.status(201).json({ message: "라멘로드 일정이 성공적으로 생성되었습니다.", schedule: populatedSchedule });
  } catch (error) {
    console.error("일정 생성 오류:", error);
    next(error);
  }
});

// 2. 모든 일정 조회 API (GET /api/schedules)
router.get("/", async (req, res, next) => {
  try {
    const schedules = await Schedule.find()
      .populate("plannedRamenId", "name location bannerImageUrl") // 추천 라멘집 정보 포함
      .populate("organizer", "name nickname imageUrl") // 주최자 정보 포함
      .populate("participants.member", "name nickname imageUrl") // 참여자 정보 포함
      .sort({ dateTime: 1 }); // 다가오는 일정 순서로 정렬

    res.status(200).json(schedules);
  } catch (error) {
    console.error("일정 조회 오류:", error);
    next(error);
  }
});

// 3. 특정 일정에 참여하기 API (POST /api/schedules/:id/join)
router.post("/:id/join", authenticateToken, async (req, res, next) => {
  const { id } = req.params; // 일정 ID
  const participantId = req.user._id; // JWT 토큰에서 참여자 ID 가져오기

  try {
    const schedule = await Schedule.findById(id);
    if (!schedule) {
      return res.status(404).json({ message: "해당 일정을 찾을 수 없습니다." });
    }

    // 이미 참여자인지 확인
    const isAlreadyParticipant = schedule.participants.some((p) => p.member.toString() === participantId);
    if (isAlreadyParticipant) {
      return res.status(409).json({ message: "이미 참여하고 있는 일정입니다." });
    }

    // 참여자 추가
    schedule.participants.push({ member: participantId });
    await schedule.save();

    // 업데이트된 일정을 populate하여 반환
    const populatedSchedule = await Schedule.findById(schedule._id)
      .populate("plannedRamenId", "name location bannerImageUrl")
      .populate("organizer", "name nickname imageUrl")
      .populate("participants.member", "name nickname imageUrl");

    console.log(`멤버 ${req.user.name}가 일정 ${schedule.title}에 참여했습니다.`);
    res.status(200).json({ message: "일정 참여가 완료되었습니다.", schedule: populatedSchedule });
  } catch (error) {
    console.error("일정 참여 오류:", error);
    next(error);
  }
});

// 4. 특정 일정에서 나가기 API (DELETE /api/schedules/:id/leave)
router.delete("/:id/leave", authenticateToken, async (req, res, next) => {
  const { id } = req.params; // 일정 ID
  const participantId = req.user._id; // JWT 토큰에서 참여자 ID 가져오기

  try {
    const schedule = await Schedule.findById(id);
    if (!schedule) {
      return res.status(404).json({ message: "해당 일정을 찾을 수 없습니다." });
    }

    // 참여자 목록에서 해당 멤버 제거
    const initialParticipantCount = schedule.participants.length;
    schedule.participants = schedule.participants.filter((p) => p.member.toString() !== participantId);

    if (schedule.participants.length === initialParticipantCount) {
      return res.status(400).json({ message: "이 일정에 참여하고 있지 않습니다." });
    }

    // 만약 나가는 사람이 주최자인데, 아무도 없으면 일정을 삭제할지, 다른 로직을 넣을지 고려
    // 여기서는 일단 나갈 수 있도록만 합니다.
    await schedule.save();

    // 업데이트된 일정을 populate하여 반환
    const populatedSchedule = await Schedule.findById(schedule._id)
      .populate("plannedRamenId", "name location bannerImageUrl")
      .populate("organizer", "name nickname imageUrl")
      .populate("participants.member", "name nickname imageUrl");

    console.log(`멤버 ${req.user.name}가 일정 ${schedule.title}에서 나갔습니다.`);
    res.status(200).json({ message: "일정에서 성공적으로 나갔습니다.", schedule: populatedSchedule });
  } catch (error) {
    console.error("일정 나가기 오류:", error);
    next(error);
  }
});

module.exports = router;
