const express = require('express');
const router = express.Router();
const { ServiceType } = require('../models');
const { protect, authorize, ErrorResponse } = require('../middleware');

// @desc    Get all service types
// @route   GET /api/v1/service-types
// @access  Private
router.get('/', protect, async (req, res, next) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const startIndex = (page - 1) * limit;
    const endIndex = page * limit;
    const total = await ServiceType.countDocuments();

    const query = {};

    // Search by name
    if (req.query.search) {
      query.name = { $regex: req.query.search, $options: 'i' };
    }
   

    // Filter by category
    if (req.query.category) {
      query.category = req.query.category;
    }

    // Filter by active status
    if (req.query.isActive) {
      query.isActive = req.query.isActive === 'true';
    }

    // Filter by minimum credit points
    if (req.query.minCredits) {
      query.creditPoints = { $gte: parseInt(req.query.minCredits) };
    }
    
    // Filter by maximum credit points
    if (req.query.maxCredits) {
      if (!query.creditPoints) query.creditPoints = {};
      query.creditPoints.$lte = parseInt(req.query.maxCredits);
    }

    const serviceTypes = await ServiceType.find(query)
      .populate('createdBy', 'firstName lastName')
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
      count: serviceTypes.length,
      pagination,
      data: serviceTypes
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Get single service type
// @route   GET /api/v1/service-types/:id
// @access  Private
router.get('/:id', protect, async (req, res, next) => {
  try {
    const serviceType = await ServiceType.findById(req.params.id)
      .populate('createdBy', 'firstName lastName');

    if (!serviceType) {
      return next(new ErrorResponse(`Service type not found with id of ${req.params.id}`, 404));
    }

    res.status(200).json({
      success: true,
      data: serviceType
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Create service type
// @route   POST /api/v1/service-types
// @access  Private/Admin
router.post('/', protect, authorize('admin'), async (req, res, next) => {
  try {
    // Add user to req.body as createdBy
    req.body.createdBy = req.user.id;

    const serviceType = await ServiceType.create(req.body);

    res.status(201).json({
      success: true,
      data: serviceType
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Update service type
// @route   PUT /api/v1/service-types/:id
// @access  Private/Admin
router.put('/:id', protect, authorize('admin'), async (req, res, next) => {
  try {
    let serviceType = await ServiceType.findById(req.params.id);

    if (!serviceType) {
      return next(new ErrorResponse(`Service type not found with id of ${req.params.id}`, 404));
    }

    serviceType = await ServiceType.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true
    });

    res.status(200).json({
      success: true,
      data: serviceType
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Delete service type
// @route   DELETE /api/v1/service-types/:id
// @access  Private/Admin
router.delete('/:id', protect, authorize('admin'), async (req, res, next) => {
  try {
    const serviceType = await ServiceType.findById(req.params.id);

    if (!serviceType) {
      return next(new ErrorResponse(`Service type not found with id of ${req.params.id}`, 404));
    }

    // Check if service type is used in any services before deleting
    const Service = require('../models/service.model');
    const serviceCount = await Service.countDocuments({ 
      'serviceItems.serviceType': serviceType._id 
    });

    if (serviceCount > 0) {
      return next(
        new ErrorResponse(
          `This service type cannot be deleted as it's used in ${serviceCount} services. Consider marking it as inactive instead.`,
          400
        )
      );
    }

    await serviceType.remove();

    res.status(200).json({
      success: true,
      data: {}
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Get service type categories
// @route   GET /api/v1/service-types/categories
// @access  Private
router.get('/categories', protect, async (req, res, next) => {
  try {
    const categories = [
      'routine_maintenance',
      'repair',
      'inspection',
      'body_work',
      'washing',
      'other'
    ];

    res.status(200).json({
      success: true,
      data: categories
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;