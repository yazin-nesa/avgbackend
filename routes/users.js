const express = require('express');
const router = express.Router();
const { User, ServiceType } = require('../models');
const { protect, authorize, ErrorResponse } = require('../middleware');

// @desc    Get all users
// @route   GET /api/v1/users
// @access  Private/Admin
router.get('/', protect, authorize('admin', 'hr', 'manager'), async (req, res, next) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const startIndex = (page - 1) * limit;
    const endIndex = page * limit;
    const total = await User.countDocuments();

    const query = {};

    // Search by name or email
    if (req.query.search) {
      query.$or = [
        { firstName: { $regex: req.query.search, $options: 'i' } },
        { lastName: { $regex: req.query.search, $options: 'i' } },
        { email: { $regex: req.query.search, $options: 'i' } }
      ];
    }

    // Filter by role
    if (req.query.role) {
      query.role = req.query.role;
    }

    // Filter by branch
    if (req.query.branch) {
      query.branch = req.query.branch;
    }

    // Filter by status
    if (req.query.status) {
      query.status = req.query.status;
    }

    // Filter by primary service category
    if (req.query.primaryServiceCategory) {
      query.primaryServiceCategory = req.query.primaryServiceCategory;
    }

    // Filter by service capability
    if (req.query.serviceCapability) {
      query['serviceCapabilities.serviceType'] = req.query.serviceCapability;
    }

    // Filter by minimum skill level
    if (req.query.minSkillLevel) {
      query['serviceCapabilities.skillLevel'] = { $gte: parseInt(req.query.minSkillLevel) };
    }

    const users = await User.find(query)
      .select('-password')
      .populate('branch', 'name')
      .populate({
        path: 'serviceCapabilities.serviceType',
        select: 'name category'
      })
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
      count: users.length,
      pagination,
      data: users
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Get single user
// @route   GET /api/v1/users/:id
// @access  Private/Admin
router.get('/:id', protect, authorize('admin', 'hr', 'manager'), async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id)
      .select('-password')
      .populate('branch', 'name')
      .populate({
        path: 'serviceCapabilities.serviceType',
        select: 'name category creditPoints'
      });

    if (!user) {
      return next(new ErrorResponse(`User not found with id of ${req.params.id}`, 404));
    }

    res.status(200).json({
      success: true,
      data: user
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Create user
// @route   POST /api/v1/users
// @access  Private/Admin
router.post('/', protect, authorize('admin', 'hr'), async (req, res, next) => {
  try {
    const user = await User.create(req.body);

    res.status(201).json({
      success: true,
      data: user
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Update user
// @route   PUT /api/v1/users/:id
// @access  Private/Admin
router.put('/:id', protect, authorize('admin', 'hr'), async (req, res, next) => {
  try {
    const user = await User.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true
    });

    if (!user) {
      return next(new ErrorResponse(`User not found with id of ${req.params.id}`, 404));
    }

    res.status(200).json({
      success: true,
      data: user
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Delete user
// @route   DELETE /api/v1/users/:id
// @access  Private/Admin
router.delete('/:id', protect, authorize('admin'), async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return next(new ErrorResponse(`User not found with id of ${req.params.id}`, 404));
    }

    // Prevent admin from deleting themselves
    if (user._id.toString() === req.user.id) {
      return next(new ErrorResponse('Cannot delete your own account', 400));
    }

    await user.remove();

    res.status(200).json({
      success: true,
      data: {}
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Add service capability to user
// @route   POST /api/v1/users/:id/service-capabilities
// @access  Private/Admin
router.post('/:id/service-capabilities', protect, authorize('admin', 'hr'), async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return next(new ErrorResponse(`User not found with id of ${req.params.id}`, 404));
    }

    // Check if serviceType exists
    const serviceType = await ServiceType.findById(req.body.serviceType);
    if (!serviceType) {
      return next(new ErrorResponse(`Service type not found with id of ${req.body.serviceType}`, 404));
    }

    // Check if user already has this capability
    const existingCapability = user.serviceCapabilities.find(
      cap => cap.serviceType.toString() === req.body.serviceType
    );

    if (existingCapability) {
      return next(new ErrorResponse('User already has this service capability', 400));
    }

    // Add capability
    user.serviceCapabilities.push({
      serviceType: req.body.serviceType,
      skillLevel: req.body.skillLevel || 1,
      certified: req.body.certified || false
    });

    // If first capability, set as primary
    if (user.serviceCapabilities.length === 1) {
      user.primaryServiceCategory = serviceType.category;
    }

    await user.save();

    res.status(200).json({
      success: true,
      data: user.serviceCapabilities[user.serviceCapabilities.length - 1]
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Update user service capability
// @route   PUT /api/v1/users/:id/service-capabilities/:capabilityId
// @access  Private/Admin
router.put('/:id/service-capabilities/:capabilityId', protect, authorize('admin', 'hr'), async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return next(new ErrorResponse(`User not found with id of ${req.params.id}`, 404));
    }

    // Find capability
    const capabilityIndex = user.serviceCapabilities.findIndex(
      cap => cap._id.toString() === req.params.capabilityId
    );

    if (capabilityIndex === -1) {
      return next(new ErrorResponse(`Service capability not found with id of ${req.params.capabilityId}`, 404));
    }

    // Update capability
    Object.keys(req.body).forEach(key => {
      user.serviceCapabilities[capabilityIndex][key] = req.body[key];
    });

    await user.save();

    res.status(200).json({
      success: true,
      data: user.serviceCapabilities[capabilityIndex]
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Delete user service capability
// @route   DELETE /api/v1/users/:id/service-capabilities/:capabilityId
// @access  Private/Admin
router.delete('/:id/service-capabilities/:capabilityId', protect, authorize('admin', 'hr'), async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return next(new ErrorResponse(`User not found with id of ${req.params.id}`, 404));
    }

    // Find capability
    const capabilityIndex = user.serviceCapabilities.findIndex(
      cap => cap._id.toString() === req.params.capabilityId
    );

    if (capabilityIndex === -1) {
      return next(new ErrorResponse(`Service capability not found with id of ${req.params.capabilityId}`, 404));
    }

    // Remove capability
    user.serviceCapabilities.splice(capabilityIndex, 1);

    // Update primary service category if needed
    if (user.serviceCapabilities.length > 0) {
      const primaryCapability = user.serviceCapabilities[0];
      const serviceType = await ServiceType.findById(primaryCapability.serviceType);
      if (serviceType) {
        user.primaryServiceCategory = serviceType.category;
      } else {
        user.primaryServiceCategory = 'administration';
      }
    } else {
      user.primaryServiceCategory = 'administration';
    }

    await user.save();

    res.status(200).json({
      success: true,
      data: {}
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Get users by service capability
// @route   GET /api/v1/users/by-service-type/:serviceTypeId
// @access  Private
router.get('/by-service-type/:serviceTypeId', protect, async (req, res, next) => {
  try {
    const serviceType = await ServiceType.findById(req.params.serviceTypeId);
    if (!serviceType) {
      return next(new ErrorResponse(`Service type not found with id of ${req.params.serviceTypeId}`, 404));
    }

    const users = await User.find({
      'serviceCapabilities.serviceType': req.params.serviceTypeId,
      status: 'active'
    })
      .select('firstName lastName serviceCapabilities')
      .populate({
        path: 'serviceCapabilities.serviceType',
        select: 'name'
      });

    // Filter to only include relevant service capabilities
    const filteredUsers = users.map(user => {
      const filteredCapabilities = user.serviceCapabilities.filter(
        cap => cap.serviceType._id.toString() === req.params.serviceTypeId
      );
      return {
        _id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        fullName: `${user.firstName} ${user.lastName}`,
        serviceCapability: filteredCapabilities[0]
      };
    });

    // Sort by skill level (higher first)
    filteredUsers.sort((a, b) => b.serviceCapability.skillLevel - a.serviceCapability.skillLevel);

    res.status(200).json({
      success: true,
      count: filteredUsers.length,
      data: filteredUsers
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Get user service statistics
// @route   GET /api/v1/users/:id/service-stats
// @access  Private/Admin
router.get('/:id/service-stats', protect, authorize('admin', 'hr', 'manager'), async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return next(new ErrorResponse(`User not found with id of ${req.params.id}`, 404));
    }

    // Get service capabilities with full details
    const userData = await User.findById(req.params.id)
      .populate({
        path: 'serviceCapabilities.serviceType',
        select: 'name category creditPoints'
      });

    // Add service type names for easier reading
    const serviceStats = userData.serviceCapabilities.map(cap => {
      return {
        serviceTypeId: cap.serviceType._id,
        serviceTypeName: cap.serviceType.name,
        serviceTypeCategory: cap.serviceType.category,
        skillLevel: cap.skillLevel,
        certified: cap.certified,
        completedServices: cap.completedServices,
        totalCreditsEarned: cap.totalCreditsEarned
      };
    });

    res.status(200).json({
      success: true,
      data: {
        userId: user._id,
        userName: `${user.firstName} ${user.lastName}`,
        totalCreditPoints: user.totalCreditPoints,
        serviceStats
      }
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;