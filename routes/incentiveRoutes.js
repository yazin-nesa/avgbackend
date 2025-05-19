//routes/incentiveRoutes.js

const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const {
  IncentivePolicy,
  StaffCategory,
  MonthlySalary,
  MonthlyTarget
} = require('../models');

// @desc    Get all incentive policies
// @route   GET /api/v1/incentives/policies
// @access  Private (Admin, HR, Manager)
router.get('/policies', protect, authorize('admin', 'hr', 'manager'), async (req, res, next) => {
  try {
    const policies = await IncentivePolicy.find()
      .populate('applicableCategories', 'name')
      .populate('serviceTypeMultipliers.serviceType', 'name');
    
    res.status(200).json({
      success: true,
      count: policies.length,
      data: policies
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Get single incentive policy
// @route   GET /api/v1/incentives/policies/:id
// @access  Private (Admin, HR, Manager)
router.get('/policies/:id', protect, authorize('admin', 'hr', 'manager'), async (req, res, next) => {
  try {
    const policy = await IncentivePolicy.findById(req.params.id)
      .populate('applicableCategories', 'name')
      .populate('serviceTypeMultipliers.serviceType', 'name')
      .populate('createdBy', 'firstName lastName');
    
    if (!policy) {
      return res.status(404).json({
        success: false,
        error: 'Incentive policy not found'
      });
    }
    
    res.status(200).json({
      success: true,
      data: policy
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Create new incentive policy
// @route   POST /api/v1/incentives/policies
// @access  Private (Admin, HR)
router.post('/policies', protect, authorize('admin', 'hr'), async (req, res, next) => {
  try {
    // Add logged in user as the creator
    req.body.createdBy = req.user.id;
    console.log("trying to create policies")
    const policy = await IncentivePolicy.create(req.body);
    
    res.status(201).json({
      success: true,
      data: policy
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Update incentive policy
// @route   PUT /api/v1/incentives/policies/:id
// @access  Private (Admin, HR)
router.put('/policies/:id', protect, authorize('admin', 'hr'), async (req, res, next) => {
  try {
    // Add logged in user as the updater
    req.body.updatedBy = req.user.id;
    
    const policy = await IncentivePolicy.findByIdAndUpdate(
      req.params.id,
      req.body,
      {
        new: true,
        runValidators: true
      }
    );
    
    if (!policy) {
      return res.status(404).json({
        success: false,
        error: 'Incentive policy not found'
      });
    }
    
    res.status(200).json({
      success: true,
      data: policy
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Delete incentive policy
// @route   DELETE /api/v1/incentives/policies/:id
// @access  Private (Admin)
router.delete('/policies/:id', protect, authorize('admin'), async (req, res, next) => {
  try {
    const policy = await IncentivePolicy.findById(req.params.id);
    
    if (!policy) {
      return res.status(404).json({
        success: false,
        error: 'Incentive policy not found'
      });
    }
    
    await policy.remove();
    
    res.status(200).json({
      success: true,
      data: {}
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Get staff categories
// @route   GET /api/v1/incentives/staff-categories
// @access  Private (Admin, HR, Manager)
router.get('/staff-categories', protect, authorize('admin', 'hr', 'manager'), async (req, res, next) => {
  try {
    const categories = await StaffCategory.find();
    
    res.status(200).json({
      success: true,
      count: categories.length,
      data: categories
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Calculate incentive for a staff member
// @route   POST /api/v1/incentives/calculate/:userId
// @access  Private (Admin, HR, Manager)
router.post('/calculate/:userId', protect, authorize('admin', 'hr', 'manager'), async (req, res, next) => {
  try {
    const { month, year } = req.body;
    
    if (!month || !year) {
      return res.status(400).json({
        success: false,
        error: 'Please provide month and year'
      });
    }
    
    // This would call the incentive calculation service
    // We'll implement this in the controller/service
    const user = await User.findById(req.params.userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }
    
    // For now, just return a placeholder
    // In the actual implementation, this would call a service to calculate incentives
    res.status(200).json({
      success: true,
      data: {
        userId: req.params.userId,
        staffName: `${user.firstName} ${user.lastName}`,
        month,
        year,
        calculatedIncentive: 0, // Placeholder
        message: 'Calculation service to be implemented'
      }
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Save monthly salary and incentive record
// @route   POST /api/v1/incentives/monthly-record
// @access  Private (Admin, HR)
router.post('/monthly-record', protect, authorize('admin', 'hr'), async (req, res, next) => {
  try {
    // Add logged in user as the creator
    req.body.createdBy = req.user.id;
    
    const record = await MonthlySalary.create(req.body);
    
    res.status(201).json({
      success: true,
      data: record
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Get monthly salary records for a user
// @route   GET /api/v1/incentives/monthly-records/:userId
// @access  Private (Admin, HR, Manager or Self)
router.get('/monthly-records/:userId', protect, async (req, res, next) => {
  try {
    // Check if user is trying to access own records or has proper authorization
    if (
      req.user.id !== req.params.userId && 
      !['admin', 'hr', 'manager'].includes(req.user.role)
    ) {
      return res.status(403).json({
        success: false,
        error: 'Not authorized to access this resource'
      });
    }
    
    const records = await MonthlySalary.find({ user: req.params.userId })
      .sort({ year: -1, month: -1 });
    
    res.status(200).json({
      success: true,
      count: records.length,
      data: records
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Set monthly targets for staff category
// @route   POST /api/v1/incentives/targets
// @access  Private (Admin, HR)
router.post('/targets', protect, authorize('admin', 'hr'), async (req, res, next) => {
  try {
    // Add logged in user as the creator
    req.body.createdBy = req.user.id;
    
    const target = await MonthlyTarget.create(req.body);
    
    res.status(201).json({
      success: true,
      data: target
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Get monthly targets
// @route   GET /api/v1/incentives/targets
// @access  Private (Admin, HR, Manager)
router.get('/targets', protect, authorize('admin', 'hr', 'manager'), async (req, res, next) => {
  try {
    const { month, year, category } = req.query;
    const query = {};
    
    if (month) query.month = month;
    if (year) query.year = year;
    if (category) query.staffCategory = category;
    
    const targets = await MonthlyTarget.find(query)
      .populate('staffCategory', 'name')
      .sort({ year: -1, month: -1 });
    
    res.status(200).json({
      success: true,
      count: targets.length,
      data: targets
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;