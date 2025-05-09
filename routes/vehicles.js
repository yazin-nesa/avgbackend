const express = require('express');
const router = express.Router();
const { Vehicle, Service } = require('../models');
const { protect, authorize, ErrorResponse } = require('../middleware');

// @desc    Get all vehicles
// @route   GET /api/v1/vehicles
// @access  Private
router.get('/', protect, async (req, res, next) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const startIndex = (page - 1) * limit;
    const endIndex = page * limit;
    const total = await Vehicle.countDocuments();

    const query = {};

    // Search by registration number, make, model, or owner name
    if (req.query.search) {
      query.$or = [
        { registrationNumber: { $regex: req.query.search, $options: 'i' } },
        { make: { $regex: req.query.search, $options: 'i' } },
        { model: { $regex: req.query.search, $options: 'i' } },
        { 'owner.name': { $regex: req.query.search, $options: 'i' } }
      ];
    }

    // Filter by branch
    if (req.query.branch) {
      query.branch = req.query.branch;
    }

    // Filter by type
    if (req.query.type) {
      query.type = req.query.type;
    }

    // Filter by status
    if (req.query.status) {
      query.status = req.query.status;
    }

    const vehicles = await Vehicle.find(query)
      .populate('branch', 'name')
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
      count: vehicles.length,
      pagination,
      data: vehicles
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Get single vehicle
// @route   GET /api/v1/vehicles/:id
// @access  Private
router.get('/:id', protect, async (req, res, next) => {
  try {
    const vehicle = await Vehicle.findById(req.params.id)
      .populate('branch', 'name')
      .populate({
        path: 'serviceHistory',
        select: 'serviceType description startDate completionDate status totalCost',
        options: { sort: { startDate: -1 } }
      });

    if (!vehicle) {
      return next(new ErrorResponse(`Vehicle not found with id of ${req.params.id}`, 404));
    }

    res.status(200).json({
      success: true,
      data: vehicle
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Create vehicle
// @route   POST /api/v1/vehicles
// @access  Private
router.post('/', protect, async (req, res, next) => {
  try {
    // Add branch from user if not provided
    if (!req.body.branch) {
      req.body.branch = req.user.branch;
    }

    const vehicle = await Vehicle.create(req.body);

    res.status(201).json({
      success: true,
      data: vehicle
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Update vehicle
// @route   PUT /api/v1/vehicles/:id
// @access  Private
router.put('/:id', protect, async (req, res, next) => {
  try {
    let vehicle = await Vehicle.findById(req.params.id);

    if (!vehicle) {
      return next(new ErrorResponse(`Vehicle not found with id of ${req.params.id}`, 404));
    }

    // Make sure user is admin or from the same branch
    if (req.user.role !== 'admin' && vehicle.branch.toString() !== req.user.branch.toString()) {
      return next(new ErrorResponse('Not authorized to update this vehicle', 403));
    }

    vehicle = await Vehicle.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true
    });

    res.status(200).json({
      success: true,
      data: vehicle
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Delete vehicle
// @route   DELETE /api/v1/vehicles/:id
// @access  Private/Admin
router.delete('/:id', protect, authorize('admin'), async (req, res, next) => {
  try {
    const vehicle = await Vehicle.findById(req.params.id);

    if (!vehicle) {
      return next(new ErrorResponse(`Vehicle not found with id of ${req.params.id}`, 404));
    }

    // Check if vehicle has active services
    const activeServices = await Service.countDocuments({
      vehicle: req.params.id,
      status: { $in: ['pending', 'in_progress'] }
    });

    if (activeServices > 0) {
      return next(new ErrorResponse('Cannot delete vehicle with active services', 400));
    }

    await vehicle.remove();

    res.status(200).json({
      success: true,
      data: {}
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Get vehicle service history
// @route   GET /api/v1/vehicles/:id/services
// @access  Private
router.get('/:id/services', protect, async (req, res, next) => {
  try {
    const vehicle = await Vehicle.findById(req.params.id);

    if (!vehicle) {
      return next(new ErrorResponse(`Vehicle not found with id of ${req.params.id}`, 404));
    }

    const services = await Service.find({ vehicle: req.params.id })
      .populate('technicians', 'firstName lastName')
      .sort({ startDate: -1 });

    res.status(200).json({
      success: true,
      count: services.length,
      data: services
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router; 