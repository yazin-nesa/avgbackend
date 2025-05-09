const express = require('express');
const router = express.Router();
const { Complaint } = require('../models');
const { protect, authorize, ErrorResponse } = require('../middleware');

// @desc    Get all complaints
// @route   GET /api/v1/complaints
// @access  Private
router.get('/', protect, async (req, res, next) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const startIndex = (page - 1) * limit;
    const endIndex = page * limit;
    const total = await Complaint.countDocuments();

    const query = {};

    // Search by title or description
    if (req.query.search) {
      query.$or = [
        { title: { $regex: req.query.search, $options: 'i' } },
        { description: { $regex: req.query.search, $options: 'i' } }
      ];
    }

    // Filter by branch
    if (req.query.branch) {
      query.branch = req.query.branch;
    }

    // Filter by category
    if (req.query.category) {
      query.category = req.query.category;
    }

    // Filter by priority
    if (req.query.priority) {
      query.priority = req.query.priority;
    }

    // Filter by status
    if (req.query.status) {
      query.status = req.query.status;
    }

    // Filter by date range
    if (req.query.startDate && req.query.endDate) {
      query.createdAt = {
        $gte: new Date(req.query.startDate),
        $lte: new Date(req.query.endDate)
      };
    }

    const complaints = await Complaint.find(query)
      .populate('filedBy', 'firstName lastName')
      .populate('assignedTo', 'firstName lastName')
      .populate('branch', 'name')
      .populate('vehicle', 'registrationNumber make model')
      .populate('service', 'serviceType startDate')
      .skip(startIndex)
      .limit(limit)
      .sort({ createdAt: -1 });

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
      count: complaints.length,
      pagination,
      data: complaints
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Get single complaint
// @route   GET /api/v1/complaints/:id
// @access  Private
router.get('/:id', protect, async (req, res, next) => {
  try {
    const complaint = await Complaint.findById(req.params.id)
      .populate('filedBy', 'firstName lastName email')
      .populate('assignedTo', 'firstName lastName email')
      .populate('branch', 'name')
      .populate('vehicle', 'registrationNumber make model owner')
      .populate('service', 'serviceType description startDate status')
      .populate({
        path: 'timeline',
        populate: {
          path: 'updatedBy',
          select: 'firstName lastName'
        }
      })
      .populate({
        path: 'attachments',
        populate: {
          path: 'uploadedBy',
          select: 'firstName lastName'
        }
      });

    if (!complaint) {
      return next(new ErrorResponse(`Complaint not found with id of ${req.params.id}`, 404));
    }

    res.status(200).json({
      success: true,
      data: complaint
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Create complaint
// @route   POST /api/v1/complaints
// @access  Private
router.post('/', protect, async (req, res, next) => {
  try {
    // Add user and branch to req.body
    req.body.filedBy = req.user.id;
    if (!req.body.branch) {
      req.body.branch = req.user.branch;
    }

    const complaint = await Complaint.create(req.body);

    res.status(201).json({
      success: true,
      data: complaint
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Update complaint
// @route   PUT /api/v1/complaints/:id
// @access  Private
router.put('/:id', protect, async (req, res, next) => {
  try {
    let complaint = await Complaint.findById(req.params.id);

    if (!complaint) {
      return next(new ErrorResponse(`Complaint not found with id of ${req.params.id}`, 404));
    }

    // Make sure user is admin, complaint owner, or assigned to the complaint
    if (
      req.user.role !== 'admin' &&
      complaint.filedBy.toString() !== req.user.id &&
      (!complaint.assignedTo || complaint.assignedTo.toString() !== req.user.id)
    ) {
      return next(new ErrorResponse('Not authorized to update this complaint', 403));
    }

    // Add status change to timeline if status is being updated
    if (req.body.status && req.body.status !== complaint.status) {
      req.body.timeline = [
        ...complaint.timeline,
        {
          status: req.body.status,
          updatedBy: req.user.id,
          comment: req.body.statusComment || `Status changed to ${req.body.status}`
        }
      ];
    }

    complaint = await Complaint.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true
    });

    res.status(200).json({
      success: true,
      data: complaint
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Delete complaint
// @route   DELETE /api/v1/complaints/:id
// @access  Private/Admin
router.delete('/:id', protect, authorize('admin'), async (req, res, next) => {
  try {
    const complaint = await Complaint.findById(req.params.id);

    if (!complaint) {
      return next(new ErrorResponse(`Complaint not found with id of ${req.params.id}`, 404));
    }

    await complaint.remove();

    res.status(200).json({
      success: true,
      data: {}
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Add complaint attachment
// @route   POST /api/v1/complaints/:id/attachments
// @access  Private
router.post('/:id/attachments', protect, async (req, res, next) => {
  try {
    const complaint = await Complaint.findById(req.params.id);

    if (!complaint) {
      return next(new ErrorResponse(`Complaint not found with id of ${req.params.id}`, 404));
    }

    // Add attachment
    complaint.attachments.push({
      filename: req.body.filename,
      path: req.body.path,
      uploadedBy: req.user.id
    });

    await complaint.save();

    res.status(200).json({
      success: true,
      data: complaint.attachments[complaint.attachments.length - 1]
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Escalate complaint
// @route   PUT /api/v1/complaints/:id/escalate
// @access  Private
router.put('/:id/escalate', protect, async (req, res, next) => {
  try {
    const complaint = await Complaint.findById(req.params.id);

    if (!complaint) {
      return next(new ErrorResponse(`Complaint not found with id of ${req.params.id}`, 404));
    }

    // Update escalation status
    complaint.escalated = {
      status: true,
      date: new Date(),
      reason: req.body.reason,
      escalatedBy: req.user.id
    };

    // Add to timeline
    complaint.timeline.push({
      status: 'escalated',
      updatedBy: req.user.id,
      comment: req.body.reason || 'Complaint escalated'
    });

    await complaint.save();

    res.status(200).json({
      success: true,
      data: complaint
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router; 