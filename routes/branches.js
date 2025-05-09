const express = require('express');
const router = express.Router();
const { Branch, User, Vehicle, Service, Complaint } = require('../models');
const { protect, authorize, ErrorResponse } = require('../middleware');

// @desc    Get all branches
// @route   GET /api/v1/branches
// @access  Private
router.get('/', protect, async (req, res, next) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const startIndex = (page - 1) * limit;
    const endIndex = page * limit;
    const total = await Branch.countDocuments();

    const query = {};

    // Search by name
    if (req.query.search) {
      query.name = { $regex: req.query.search, $options: 'i' };
    }

    // Filter by status
    if (req.query.status) {
      query.status = req.query.status;
    }

    const branches = await Branch.find(query)
      .populate('manager', 'firstName lastName email')
      .skip(startIndex)
      .limit(limit)
      .sort({ name: 1 });

    // Pagination result
    const pagination = {};

    if (endIndex < total) {
      pagination.next = {
        page: page + 1,
        limit
      };
    }

    if (startIndex > 0) {
      pagination.prev = {
        page: page - 1,
        limit
      };
    }

    res.status(200).json({
      success: true,
      count: branches.length,
      pagination,
      data: branches
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Get single branch
// @route   GET /api/v1/branches/:id
// @access  Private
router.get('/:id', protect, async (req, res, next) => {
  try {
    const branch = await Branch.findById(req.params.id)
      .populate('manager', 'firstName lastName email')
      .populate({
        path: 'staff',
        select: 'firstName lastName email role status',
        options: { sort: { firstName: 1 } }
      });

    if (!branch) {
      return next(new ErrorResponse(`Branch not found with id of ${req.params.id}`, 404));
    }

    res.status(200).json({
      success: true,
      data: branch
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Create branch
// @route   POST /api/v1/branches
// @access  Private/Admin
router.post('/', protect, authorize('admin'), async (req, res, next) => {
  try {
    const branch = await Branch.create(req.body);

    res.status(201).json({
      success: true,
      data: branch
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Update branch
// @route   PUT /api/v1/branches/:id
// @access  Private/Admin
router.put('/:id', protect, authorize('admin'), async (req, res, next) => {
  try {
    const branch = await Branch.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true
    });

    if (!branch) {
      return next(new ErrorResponse(`Branch not found with id of ${req.params.id}`, 404));
    }

    res.status(200).json({
      success: true,
      data: branch
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Delete branch
// @route   DELETE /api/v1/branches/:id
// @access  Private/Admin
router.delete('/:id', protect, authorize('admin'), async (req, res, next) => {
  try {
    const branch = await Branch.findById(req.params.id);

    if (!branch) {
      return next(new ErrorResponse(`Branch not found with id of ${req.params.id}`, 404));
    }

    // Check if branch has staff
    const staffCount = await User.countDocuments({ branch: req.params.id });
    if (staffCount > 0) {
      return next(new ErrorResponse('Cannot delete branch with assigned staff', 400));
    }

    // Check if branch has vehicles
    const vehicleCount = await Vehicle.countDocuments({ branch: req.params.id });
    if (vehicleCount > 0) {
      return next(new ErrorResponse('Cannot delete branch with assigned vehicles', 400));
    }

    await branch.remove();

    res.status(200).json({
      success: true,
      data: {}
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Get branch statistics
// @route   GET /api/v1/branches/:id/stats
// @access  Private
router.get('/:id/stats', protect, async (req, res, next) => {
  try {
    const branch = await Branch.findById(req.params.id);

    if (!branch) {
      return next(new ErrorResponse(`Branch not found with id of ${req.params.id}`, 404));
    }

    const stats = {
      staffCount: await User.countDocuments({ branch: req.params.id }),
      vehicleCount: await Vehicle.countDocuments({ branch: req.params.id }),
      activeServices: await Service.countDocuments({
        branch: req.params.id,
        status: { $in: ['pending', 'in_progress'] }
      }),
      completedServices: await Service.countDocuments({
        branch: req.params.id,
        status: 'completed',
        completionDate: {
          $gte: new Date(new Date().setDate(new Date().getDate() - 30)) // Last 30 days
        }
      }),
      openComplaints: await Complaint.countDocuments({
        branch: req.params.id,
        status: { $in: ['open', 'in_progress'] }
      })
    };

    res.status(200).json({
      success: true,
      data: stats
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router; 