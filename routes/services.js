const express = require('express');
const router = express.Router();
const { Service, Vehicle } = require('../models');
const { protect, authorize, ErrorResponse } = require('../middleware');

// @desc    Get all services
// @route   GET /api/v1/services
// @access  Private
router.get('/', protect, async (req, res, next) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const startIndex = (page - 1) * limit;
    const endIndex = page * limit;
    const total = await Service.countDocuments();

    const query = {};

    // Search by description
    if (req.query.search) {
      query.description = { $regex: req.query.search, $options: 'i' };
    }

    // Filter by branch
    if (req.query.branch) {
      query.branch = req.query.branch;
    }

    // Filter by vehicle
    if (req.query.vehicle) {
      query.vehicle = req.query.vehicle;
    }

    // Filter by service type
    if (req.query.serviceType) {
      query.serviceType = req.query.serviceType;
    }

    // Filter by status
    if (req.query.status) {
      query.status = req.query.status;
    }

    // Filter by date range
    if (req.query.startDate && req.query.endDate) {
      query.startDate = {
        $gte: new Date(req.query.startDate),
        $lte: new Date(req.query.endDate)
      };
    }

    const services = await Service.find(query)
      .populate('vehicle', 'registrationNumber make model')
      .populate('technicians', 'firstName lastName')
      .populate('branch', 'name')
      .skip(startIndex)
      .limit(limit)
      .sort({ startDate: -1 });

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
      count: services.length,
      pagination,
      data: services
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Get single service
// @route   GET /api/v1/services/:id
// @access  Private
router.get('/:id', protect, async (req, res, next) => {
  try {
    const service = await Service.findById(req.params.id)
      .populate('vehicle', 'registrationNumber make model owner')
      .populate('technicians', 'firstName lastName')
      .populate('branch', 'name')
      .populate({
        path: 'notes',
        populate: {
          path: 'createdBy',
          select: 'firstName lastName'
        }
      });

    if (!service) {
      return next(new ErrorResponse(`Service not found with id of ${req.params.id}`, 404));
    }

    res.status(200).json({
      success: true,
      data: service
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Create service
// @route   POST /api/v1/services
// @access  Private
router.post('/', protect, async (req, res, next) => {
  try {
    // Add branch from user if not provided
    if (!req.body.branch) {
      req.body.branch = req.user.branch;
    }

    // Check if vehicle exists
    const vehicle = await Vehicle.findById(req.body.vehicle);
    if (!vehicle) {
      return next(new ErrorResponse(`Vehicle not found with id of ${req.body.vehicle}`, 404));
    }

    // Create service
    const service = await Service.create(req.body);

    // Update vehicle's last service and next service due
    vehicle.lastService = service.startDate;
    vehicle.nextServiceDue = service.estimatedCompletionDate;
    vehicle.status = 'in_service';
    await vehicle.save();

    res.status(201).json({
      success: true,
      data: service
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Update service
// @route   PUT /api/v1/services/:id
// @access  Private
router.put('/:id', protect, async (req, res, next) => {
  try {
    let service = await Service.findById(req.params.id);

    if (!service) {
      return next(new ErrorResponse(`Service not found with id of ${req.params.id}`, 404));
    }

    // Make sure user is admin or from the same branch
    if (req.user.role !== 'admin' && service.branch.toString() !== req.user.branch.toString()) {
      return next(new ErrorResponse('Not authorized to update this service', 403));
    }

    service = await Service.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true
    });

    // If service is completed, update vehicle status
    if (req.body.status === 'completed' && service.status === 'completed') {
      const vehicle = await Vehicle.findById(service.vehicle);
      if (vehicle) {
        vehicle.status = 'active';
        vehicle.lastService = service.completionDate;
        await vehicle.save();
      }
    }

    res.status(200).json({
      success: true,
      data: service
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Delete service
// @route   DELETE /api/v1/services/:id
// @access  Private/Admin
router.delete('/:id', protect, authorize('admin'), async (req, res, next) => {
  try {
    const service = await Service.findById(req.params.id);

    if (!service) {
      return next(new ErrorResponse(`Service not found with id of ${req.params.id}`, 404));
    }

    // Only allow deletion of pending services
    if (service.status !== 'pending') {
      return next(new ErrorResponse('Cannot delete services that have started or completed', 400));
    }

    await service.remove();

    res.status(200).json({
      success: true,
      data: {}
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Add service note
// @route   POST /api/v1/services/:id/notes
// @access  Private
router.post('/:id/notes', protect, async (req, res, next) => {
  try {
    const service = await Service.findById(req.params.id);

    if (!service) {
      return next(new ErrorResponse(`Service not found with id of ${req.params.id}`, 404));
    }

    // Add note
    service.notes.push({
      content: req.body.content,
      createdBy: req.user.id
    });

    await service.save();

    res.status(200).json({
      success: true,
      data: service.notes[service.notes.length - 1]
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router; 