const mongoose = require("mongoose");

// 방문 멤버 스키마
const VisitMemberSchema = new mongoose.Schema(
  {
    // name: { type: String, required: true },
    // imageUrl: { type: String },
    // role: { type: String, enum: ["user", "admin"], default: "user" },
    memberId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Member",
      required: false,
    },
    rating: { type: Number, min: 0, max: 5, default: null },
    reviewText: { type: String, default: "" },
  },
  { _id: false }
);

// 방문 기록 스키마
const VisitSchema = new mongoose.Schema(
  {
    visit_count: { type: Number, required: true, default: 1 },
    visit_date: { type: String, required: true },
    members: [VisitMemberSchema],
    visitRatingAverage: { type: Number, default: 0, min: 0, max: 5 },
  },
  { _id: false }
);

// 라멘집 스키마 (RamenRestaurantSchema)
const RamenRestaurantSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true }, // 라멘집 이름 (필수, 고유)
    bannerImageUrl: {
      type: String,
      default:
        "https://us.123rf.com/450wm/eclaira/eclaira2302/eclaira230200005/198689430-ciotola-di-noodles-di-ramen-con-carne-di-maiale-e-uova-cibo-asiatico-illustrazione-vettoriale.jpg?ver=6",
    },
    location: { type: String, required: true },
    ratingAverage: { type: Number, default: 0, min: 0, max: 5 },
    visits: [VisitSchema],
    tags: [{ type: String }],
    lastVisitedDate: { type: Date, default: Date.now },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Member",
      required: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("RamenRestaurant", RamenRestaurantSchema);
