const express = require('express');
const router = express.Router();
const { StaffCategory } = require('../models');
const { protect, authorize } = require('../middleware');


// @desc    Get all designation
// @route   GET /api/v1/users/designation
// @access  Private/Admin
router.get('/', protect, authorize('admin', 'hr', 'manager'), async (req, res, next) => {
    try {

        const designation = await StaffCategory.find().sort({ createdAt: -1 });

        res.status(200).json({
            success: true,
            data: designation
        });
    } catch (error) {
        next(error);
    }
});

module.exports = router;