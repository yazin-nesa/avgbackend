const express = require('express');
const router = express.Router();
const { Service, Vehicle, User } = require('../models');
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
      query['serviceItems.description'] = { $regex: req.query.search, $options: 'i' };
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
      query['serviceItems.serviceType'] = req.query.serviceType;
    }

    // Filter by technician
    if (req.query.technician) {
      query['serviceItems.technicians.technician'] = req.query.technician;
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
      .populate({
        path: 'serviceItems.serviceType',
        select: 'name category creditPoints'
      })
      .populate({
        path: 'serviceItems.technicians.technician',
        select: 'firstName lastName'
      })
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
      .populate({
        path: 'serviceItems.serviceType',
        select: 'name category creditPoints'
      })
      .populate({
        path: 'serviceItems.technicians.technician',
        select: 'firstName lastName'
      })
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

// @desc    Update service item status
// @route   PUT /api/v1/services/:id/service-item/:serviceItemId
// @access  Private
router.put('/:id/service-item/:serviceItemId', protect, async (req, res, next) => {
  try {
    const service = await Service.findById(req.params.id);

    if (!service) {
      return next(new ErrorResponse(`Service not found with id of ${req.params.id}`, 404));
    }

    // Make sure user is admin or from the same branch
    if (req.user.role !== 'admin' && service.branch.toString() !== req.user.branch.toString()) {
      return next(new ErrorResponse('Not authorized to update this service', 403));
    }

    // Find the service item
    const serviceItemIndex = service.serviceItems.findIndex(
      item => item._id.toString() === req.params.serviceItemId
    );

    if (serviceItemIndex === -1) {
      return next(new ErrorResponse(`Service item not found with id of ${req.params.serviceItemId}`, 404));
    }

    // Update service item
    Object.keys(req.body).forEach(key => {
      service.serviceItems[serviceItemIndex][key] = req.body[key];
    });

    // If service item is completed, add completion time if not already set
    if (req.body.status === 'completed' && !service.serviceItems[serviceItemIndex].completionTime) {
      service.serviceItems[serviceItemIndex].completionTime = new Date();
      
      // Assign credit points to technicians
      await service.assignCreditPoints(req.params.serviceItemId, User);
    }

    await service.save();

    res.status(200).json({
      success: true,
      data: service
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Add technician to service item
// @route   POST /api/v1/services/:id/service-item/:serviceItemId/technician
// @access  Private
router.post('/:id/service-item/:serviceItemId/technician', protect, async (req, res, next) => {
  try {
    const service = await Service.findById(req.params.id);

    if (!service) {
      return next(new ErrorResponse(`Service not found with id of ${req.params.id}`, 404));
    }

    // Find the service item
    const serviceItemIndex = service.serviceItems.findIndex(
      item => item._id.toString() === req.params.serviceItemId
    );

    if (serviceItemIndex === -1) {
      return next(new ErrorResponse(`Service item not found with id of ${req.params.serviceItemId}`, 404));
    }

    // Check if technician exists
    const user = await User.findById(req.body.technician);
    if (!user) {
      return next(new ErrorResponse(`User not found with id of ${req.body.technician}`, 404));
    }

    // Check if technician already assigned to this service item
    const isAlreadyAssigned = service.serviceItems[serviceItemIndex].technicians.some(
      tech => tech.technician.toString() === req.body.technician
    );

    if (isAlreadyAssigned) {
      return next(new ErrorResponse('Technician already assigned to this service item', 400));
    }

    // Add technician
    service.serviceItems[serviceItemIndex].technicians.push({
      technician: req.body.technician,
      creditPoints: 0,
      creditsAssigned: false
    });

    await service.save();

    res.status(200).json({
      success: true,
      data: service.serviceItems[serviceItemIndex]
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Remove technician from service item
// @route   DELETE /api/v1/services/:id/service-item/:serviceItemId/technician/:technicianId
// @access  Private
router.delete('/:id/service-item/:serviceItemId/technician/:technicianId', protect, async (req, res, next) => {
  try {
    const service = await Service.findById(req.params.id);

    if (!service) {
      return next(new ErrorResponse(`Service not found with id of ${req.params.id}`, 404));
    }

    // Find the service item
    const serviceItemIndex = service.serviceItems.findIndex(
      item => item._id.toString() === req.params.serviceItemId
    );

    if (serviceItemIndex === -1) {
      return next(new ErrorResponse(`Service item not found with id of ${req.params.serviceItemId}`, 404));
    }

    // Find technician index
    const technicianIndex = service.serviceItems[serviceItemIndex].technicians.findIndex(
      tech => tech.technician.toString() === req.params.technicianId
    );

    if (technicianIndex === -1) {
      return next(new ErrorResponse(`Technician not found in this service item`, 404));
    }

    // Cannot remove technician if service is completed and credits assigned
    if (service.serviceItems[serviceItemIndex].status === 'completed' && 
        service.serviceItems[serviceItemIndex].technicians[technicianIndex].creditsAssigned) {
      return next(new ErrorResponse('Cannot remove technician from completed service with credits assigned', 400));
    }

    // Remove technician
    service.serviceItems[serviceItemIndex].technicians.splice(technicianIndex, 1);

    await service.save();

    res.status(200).json({
      success: true,
      data: service.serviceItems[serviceItemIndex]
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Add service item to service
// @route   POST /api/v1/services/:id/service-item
// @access  Private
router.post('/:id/service-item', protect, async (req, res, next) => {
  try {
    const service = await Service.findById(req.params.id);

    if (!service) {
      return next(new ErrorResponse(`Service not found with id of ${req.params.id}`, 404));
    }

    // Make sure user is admin or from the same branch
    if (req.user.role !== 'admin' && service.branch.toString() !== req.user.branch.toString()) {
      return next(new ErrorResponse('Not authorized to update this service', 403));
    }

    // Add service item
    service.serviceItems.push(req.body);
    await service.save();

    res.status(200).json({
      success: true,
      data: service.serviceItems[service.serviceItems.length - 1]
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Delete service item
// @route   DELETE /api/v1/services/:id/service-item/:serviceItemId
// @access  Private
router.delete('/:id/service-item/:serviceItemId', protect, authorize('admin', 'manager'), async (req, res, next) => {
  try {
    const service = await Service.findById(req.params.id);

    if (!service) {
      return next(new ErrorResponse(`Service not found with id of ${req.params.id}`, 404));
    }

    // Make sure user is admin or from the same branch
    if (req.user.role !== 'admin' && service.branch.toString() !== req.user.branch.toString()) {
      return next(new ErrorResponse('Not authorized to update this service', 403));
    }

    // Find the service item
    const serviceItemIndex = service.serviceItems.findIndex(
      item => item._id.toString() === req.params.serviceItemId
    );

    if (serviceItemIndex === -1) {
      return next(new ErrorResponse(`Service item not found with id of ${req.params.serviceItemId}`, 404));
    }

    // Only allow deletion if service item is pending
    if (service.serviceItems[serviceItemIndex].status !== 'pending') {
      return next(new ErrorResponse('Cannot delete service items that have started or completed', 400));
    }

    // Remove service item
    service.serviceItems.splice(serviceItemIndex, 1);
    await service.save();

    res.status(200).json({
      success: true,
      data: {}
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

// @desc    Get technician credit report
// @route   GET /api/v1/services/technician-credits
// @access  Private/Admin
router.get('/technician-credits', protect, authorize('admin', 'manager', 'hr'), async (req, res, next) => {
  try {
    const query = {
      status: 'completed'
    };

    // Filter by technician
    if (req.query.technician) {
      query['serviceItems.technicians.technician'] = req.query.technician;
    }

    // Filter by date range
    if (req.query.startDate && req.query.endDate) {
      query.completionDate = {
        $gte: new Date(req.query.startDate),
        $lte: new Date(req.query.endDate)
      };
    }

    // Filter by branch
    if (req.query.branch) {
      query.branch = req.query.branch;
    }

    const services = await Service.find(query)
      .populate({
        path: 'serviceItems.serviceType',
        select: 'name category creditPoints'
      })
      .populate({
        path: 'serviceItems.technicians.technician',
        select: 'firstName lastName'
      });

    // Process data to get credits by technician
    const technicianCredits = {};
    
    services.forEach(service => {
      service.serviceItems.forEach(item => {
        if (item.status === 'completed') {
          item.technicians.forEach(tech => {
            const techId = tech.technician._id.toString();
            const techName = `${tech.technician.firstName} ${tech.technician.lastName}`;
            
            if (!technicianCredits[techId]) {
              technicianCredits[techId] = {
                id: techId,
                name: techName,
                totalCredits: 0,
                serviceCount: 0,
                services: []
              };
            }
            
            technicianCredits[techId].totalCredits += tech.creditPoints;
            technicianCredits[techId].serviceCount += 1;
            technicianCredits[techId].services.push({
              serviceId: service._id,
              serviceDate: service.completionDate,
              serviceType: item.serviceType.name,
              creditPoints: tech.creditPoints
            });
          });
        }
      });
    });

    res.status(200).json({
      success: true,
      count: Object.keys(technicianCredits).length,
      data: Object.values(technicianCredits)
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;