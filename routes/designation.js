const express = require('express');
const router = express.Router();
const { Designations } = require('../models');
const { protect, authorize } = require('../middleware');


// @desc    Get all designation
// @route   GET /api/v1/users/designation
// @access  Private/Admin
router.get('/', protect, authorize('admin', 'hr', 'manager'), async (req, res, next) => {
    try {

        const designation = await Designations.find().sort({ createdAt: -1 });

        res.status(200).json({
            success: true,
            data: designation
        });
    } catch (error) {
        next(error);
    }
});


// @desc    Create designation
// @route   POST /api/v1/users/designation
// @access  Private/Admin
router.post('/', protect, authorize('admin', 'hr'), async (req, res, next) => {
    try {
        console.log("creating designation", req.body)
        const designation = await Designations.create(req.body);

        res.status(201).json({
            success: true,
            data: designation
        });
    } catch (error) {
        next(error);
    }
});

// @desc    Delete designation 
// @route   DELETE /api/v1/designation/:name
// @access  Private/Admin
router.delete('/', protect, authorize('admin', 'hr'), async (req, res, next) => {
    try {
      const user = await Designations.findOneAndDelete(req.body.name);

  
      await user.save();
  
      res.status(200).json({
        success: true,
        data: {}
      });
    } catch (error) {
      next(error);
    }
  });
  



module.exports = router;