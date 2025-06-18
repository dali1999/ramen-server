const mongoose = require("mongoose");

// 방문 예정 라멘집 스키마
const PlannedRamenRestaurantSchema = new mongoose.Schema({
    name: { type: String, required: true }, // 라멘집 이름 (필수)
    bannerImageUrl: {
        type: String,
        default:
            "https://us.123rf.com/450wm/eclaira/eclaira2302/eclaira230200005/198689430-ciotola-di-noodles-di-ramen-con-carne-di-maiale-e-uova-cibo-asiatico-illustrazione-vettoriale.jpg?ver=6",
    }, // 배너 이미지 URL (기본 이미지 제공)
    location: { type: String, required: true }, // 라멘집 주소 (필수)
    recommendedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Member",
        required: true,
    },
    recommendationComment: { type: String, default: "" },
});
// MongoDB 복합 유니크 인덱스 생성: 'name'과 'location' 조합이 고유해야 함
PlannedRamenRestaurantSchema.index({ name: 1, location: 1 }, { unique: true });

module.exports = mongoose.model("PlannedRamenRestaurant", PlannedRamenRestaurantSchema);
