const express = require("express");
const router = express.Router();
const Member = require("../models/Member");
const authenticateToken = require("../middleware/authMiddleware");

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
            return res.status(404).json({ message: "삭제할 멤버를 찾을 수 없습니다." });
        }

        console.log(`멤버 삭제: ID ${id} (${result.name})`);
        res.status(200).json({ message: "계정이 성공적으로 삭제되었습니다." });
    } catch (error) {
        console.error("Error deleting member:", error);
        next(error);
    }
});

module.exports = router;
