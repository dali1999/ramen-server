const mongoose = require("mongoose");

// 방문 멤버 스키마
const VisitMemberSchema = new mongoose.Schema(
    {
        name: { type: String, required: true }, // 멤버 이름 (필수)
        imageUrl: { type: String },
        rating: { type: Number, min: 0, max: 5, default: null }, // 별점 (0~5점, 초기값은 null 허용)
    },
    { _id: false }
);

// 방문 기록 스키마
const VisitSchema = new mongoose.Schema(
    {
        visit_count: { type: Number, required: true, default: 1 }, // 해당 라멘집 방문 횟수
        visit_date: { type: String, required: true }, // 방문 날짜
        members: [VisitMemberSchema], // 이 방문에 참여한 멤버들 (VisitMemberSchema의 배열)
    },
    { _id: false }
);

// 라멘집 스키마 (RamenRestaurantSchema)
const RamenRestaurantSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true }, // 라멘집 이름 (필수, 고유해야 함)
    bannerImageUrl: {
        type: String,
        default:
            "https://us.123rf.com/450wm/eclaira/eclaira2302/eclaira230200005/198689430-ciotola-di-noodles-di-ramen-con-carne-di-maiale-e-uova-cibo-asiatico-illustrazione-vettoriale.jpg?ver=6",
    },
    location: { type: String, required: true }, // 라멘집 주소 (필수)
    ratingAverage: { type: Number, default: 0, min: 0, max: 5 }, // 라멘집의 전체 평균 별점 (초기 0)
    visits: [VisitSchema], // 이 라멘집의 모든 방문 기록 (VisitSchema의 배열)
});

module.exports = mongoose.model("RamenRestaurant", RamenRestaurantSchema);
