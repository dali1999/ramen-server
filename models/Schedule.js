const mongoose = require("mongoose");

const ParticipantSchema = new mongoose.Schema(
  {
    member: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Member",
      required: true,
    },
    joinedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
); // _id는 생성하지 않음

const ScheduleSchema = new mongoose.Schema(
  {
    // 어떤 추천 라멘집으로 가는 일정인지
    plannedRamenId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PlannedRamenRestaurant",
      required: true,
    },
    // 일정의 제목 (예: "OOO라멘 정복!")
    title: {
      type: String,
      required: true,
      trim: true,
    },
    // 일정의 주최자 (누가 이 일정을 만들었는지)
    organizer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Member",
      required: true,
    },
    // 일자 및 시간 (ISOString으로 저장)
    dateTime: {
      type: Date,
      required: true,
    },
    // 특이사항 (어디서 모이자 등)
    specialNotes: {
      type: String,
      default: "",
    },
    // 참여자 목록
    participants: [ParticipantSchema],
    // 일정 생성 시간
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true, // createdAt, updatedAt 자동 관리
  }
);

module.exports = mongoose.model("Schedule", ScheduleSchema);
