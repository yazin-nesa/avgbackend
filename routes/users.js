const express = require('express');
const router = express.Router();
const { User, ServiceType, Designation } = require('../models');
const { protect, authorize, ErrorResponse } = require('../middleware');
const multer = require('multer');
const XLSX = require('xlsx');

// Set up multer storage
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      file.mimetype === 'application/vnd.ms-excel') {
      cb(null, true);
    } else {
      cb(new Error('Only Excel files are allowed'), false);
    }
  }
});

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


// @desc    Bulk upload users from Excel
// @route   POST /api/v1/users/bulk-upload
// @access  Private/Admin/HR
router.post('/bulk-upload', protect, authorize('admin', 'hr'), upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      return next(new ErrorResponse('Please upload an Excel file', 400));
    }

    // Read the Excel file
    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(worksheet);

    // Default branch ID (you may want to pass this as a parameter)
    const defaultBranchId = req.body.branchId;
    if (!defaultBranchId) {
      return next(new ErrorResponse('Please provide a default branch ID', 400));
    }

    // Verify if the branch exists
    const branch = await Branch.findById(defaultBranchId);
    if (!branch) {
      return next(new ErrorResponse(`Branch not found with id of ${defaultBranchId}`, 404));
    }

    const results = {
      successful: [],
      failed: []
    };

    // Process each row
    for (const row of data) {
      try {
        // Generate username and password
        const username = (row.Name.substring(0, 3).toLowerCase() + row.ID).replace(/\s+/g, '');
        const password = `AVG${row.ID}`;

        // Map Excel columns to user schema
        const userData = {
          firstName: row.Name.split(' ')[0],
          lastName: row.Name.split(' ').slice(1).join(' '),
          email: `${username}@yourdomain.com`, // You might want to use a real email pattern
          password,
          branch: defaultBranchId,
          role: 'staff', // Default role
          status: 'active',
          phone: '', // Not provided in Excel
        };

        // Set service-related fields based on designation
        userData.primaryServiceCategory = mapDepartmentToCategory(row.Department);

        // Check if user already exists (by ID or email)
        const existingUser = await User.findOne({
          $or: [
            { email: userData.email }
          ]
        });

        let user;
        if (existingUser) {
          // Update existing user
          user = await User.findByIdAndUpdate(existingUser._id, userData, {
            new: true,
            runValidators: true
          });
          results.successful.push({ id: row.ID, name: row.Name, action: 'updated' });
        } else {
          // Create new user
          user = await User.create(userData);
          results.successful.push({ id: row.ID, name: row.Name, action: 'created' });
        }
      } catch (error) {
        results.failed.push({
          id: row.ID,
          name: row.Name,
          error: error.message
        });
      }
    }

    res.status(200).json({
      success: true,
      data: {
        total: data.length,
        successful: results.successful.length,
        failed: results.failed.length,
        details: results
      }
    });

  } catch (error) {
    next(error);
  }
});

// Helper function to map department to service category
function mapDepartmentToCategory(department) {
  // Map department to category
  switch (department.toUpperCase()) {
    case 'SERVICE':
      return 'routine_maintenance';
    case 'SALES':
      return 'administration';
    case 'PARTS':
      return 'repair';
    default:
      return 'administration';
  }
}

router.get('/staff-performance', protect, authorize('admin','hr'), async (req, res, next) => {
  try {
      // Optional filters
      const branchId = req.query.branchId;
      const dateRange = {
          start: req.query.startDate ? new Date(req.query.startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
          end: req.query.endDate ? new Date(req.query.endDate) : new Date()
      };

      // Base query
      const query = { role: 'staff' };
      if (branchId) query.branch = branchId;

      // Get all technical staff
      const staffMembers = await User.find(query)
          .populate('branch', 'name')
          .select('-password');

      // Array to store staff performance data
      const staffPerformance = [];

      // For each staff member, get their performance metrics
      for (const staff of staffMembers) {
          // Find all services where this staff member was a technician
          const servicesQuery = {
              'serviceItems.technicians.technician': staff._id,
              createdAt: { $gte: dateRange.start, $lte: dateRange.end }
          };

          // Services where staff participated
          const services = await Service.find(servicesQuery)
              .populate('serviceItems.serviceType', 'name category creditPoints')
              .populate('branch', 'name');

          // Initialize counters
          let totalServiceItems = 0;
          let completedServiceItems = 0;
          let totalLaborHours = 0;
          let totalCreditPointsEarned = 0;
          let serviceRevenue = 0;
          const serviceTypeBreakdown = {};

          // Process all services to extract staff performance metrics
          for (const service of services) {
              for (const serviceItem of service.serviceItems) {
                  // Check if this staff member is assigned to this service item
                  const techInfo = serviceItem.technicians.find(
                      tech => tech.technician.toString() === staff._id.toString()
                  );

                  if (techInfo) {
                      // Count total service items
                      totalServiceItems++;

                      // Count completed service items
                      if (serviceItem.status === 'completed') {
                          completedServiceItems++;

                          // Add labor hours and credit points
                          totalLaborHours += serviceItem.laborHours;
                          totalCreditPointsEarned += techInfo.creditPoints || 0;

                          // Calculate revenue contribution (divide by number of technicians)
                          const technicianCount = serviceItem.technicians.length;
                          const laborRevenue = serviceItem.laborCost / technicianCount;
                          serviceRevenue += laborRevenue;

                          // Update service type breakdown
                          const serviceTypeName = serviceItem.serviceType.name;
                          if (!serviceTypeBreakdown[serviceTypeName]) {
                              serviceTypeBreakdown[serviceTypeName] = {
                                  count: 0,
                                  revenue: 0,
                                  creditPoints: 0,
                                  category: serviceItem.serviceType.category
                              };
                          }

                          serviceTypeBreakdown[serviceTypeName].count++;
                          serviceTypeBreakdown[serviceTypeName].revenue += laborRevenue;
                          serviceTypeBreakdown[serviceTypeName].creditPoints += techInfo.creditPoints || 0;
                      }
                  }
              }
          }

          // Calculate average service times if possible
          const completedServicesWithTimes = await Service.aggregate([
              {
                  $match: {
                      'serviceItems.technicians.technician': new mongoose.Types.ObjectId(staff._id),
                      'serviceItems.status': 'completed',
                      'serviceItems.startTime': { $exists: true },
                      'serviceItems.completionTime': { $exists: true },
                      createdAt: { $gte: dateRange.start, $lte: dateRange.end }
                  }
              },
              { $unwind: '$serviceItems' },
              {
                  $match: {
                      'serviceItems.status': 'completed',
                      'serviceItems.startTime': { $exists: true },
                      'serviceItems.completionTime': { $exists: true }
                  }
              },
              {
                  $addFields: {
                      containsTechnician: {
                          $in: [
                              new mongoose.Types.ObjectId(staff._id),
                              '$serviceItems.technicians.technician'
                          ]
                      },
                      completionTime: {
                          $divide: [
                              { $subtract: ['$serviceItems.completionTime', '$serviceItems.startTime'] },
                              3600000 // Convert ms to hours
                          ]
                      }
                  }
              },
              {
                  $match: {
                      containsTechnician: true
                  }
              },
              {
                  $group: {
                      _id: null,
                      avgCompletionTime: { $avg: '$completionTime' },
                      minCompletionTime: { $min: '$completionTime' },
                      maxCompletionTime: { $max: '$completionTime' },
                      count: { $sum: 1 }
                  }
              }
          ]);

          // Look for service quality indicators in complaints
          const relatedComplaints = await Complaint.countDocuments({
              $or: [
                  { 'assignedTo': staff._id },
                  { 'resolution.resolvedBy': staff._id }
              ],
              createdAt: { $gte: dateRange.start, $lte: dateRange.end }
          });

          // Get average satisfaction rating if available
          const satisfactionMetrics = await Complaint.aggregate([
              {
                  $match: {
                      'resolution.resolvedBy': new mongoose.Types.ObjectId(staff._id),
                      'resolution.feedback.rating': { $exists: true },
                      createdAt: { $gte: dateRange.start, $lte: dateRange.end }
                  }
              },
              {
                  $group: {
                      _id: null,
                      avgRating: { $avg: '$resolution.feedback.rating' },
                      count: { $sum: 1 }
                  }
              }
          ]);

          // Calculate completion rate
          const completionRate = totalServiceItems > 0
              ? (completedServiceItems / totalServiceItems) * 100
              : 0;

          // Calculate productivity metrics
          const productivityPerHour = totalLaborHours > 0
              ? serviceRevenue / totalLaborHours
              : 0;

          // Format service type breakdown as array
          const serviceTypesArray = Object.keys(serviceTypeBreakdown).map(name => ({
              name,
              ...serviceTypeBreakdown[name]
          }));

          // Add staff performance data to array
          staffPerformance.push({
              _id: staff._id,
              name: `${staff.firstName} ${staff.lastName}`,
              email: staff.email,
              branch: staff.branch,
              totalCreditPoints: staff.totalCreditPoints,
              period: {
                  serviceItems: {
                      total: totalServiceItems,
                      completed: completedServiceItems,
                      completionRate: completionRate.toFixed(2)
                  },
                  laborHours: totalLaborHours.toFixed(2),
                  creditPointsEarned: totalCreditPointsEarned,
                  revenue: serviceRevenue.toFixed(2),
                  productivity: {
                      revenuePerHour: productivityPerHour.toFixed(2)
                  },
                  serviceTimeMetrics: completedServicesWithTimes.length > 0 ? {
                      average: completedServicesWithTimes[0].avgCompletionTime.toFixed(2),
                      minimum: completedServicesWithTimes[0].minCompletionTime.toFixed(2),
                      maximum: completedServicesWithTimes[0].maxCompletionTime.toFixed(2),
                      count: completedServicesWithTimes[0].count
                  } : null,
                  serviceTypes: serviceTypesArray.sort((a, b) => b.count - a.count),
                  customerSatisfaction: satisfactionMetrics.length > 0 ? {
                      averageRating: satisfactionMetrics[0].avgRating.toFixed(2),
                      ratingsCount: satisfactionMetrics[0].count
                  } : null,
                  complaints: relatedComplaints
              }
          });
      }

      // Sort staff by productivity (revenue per hour)
      staffPerformance.sort((a, b) =>
          parseFloat(b.period.productivity.revenuePerHour) - parseFloat(a.period.productivity.revenuePerHour)
      );

      // Calculate staff specializations by service category
      const staffSpecializations = await User.aggregate([
          { $match: { role: 'staff' } },
          { $unwind: '$serviceCapabilities' },
          {
              $lookup: {
                  from: 'servicetypes',
                  localField: 'serviceCapabilities.serviceType',
                  foreignField: '_id',
                  as: 'serviceTypeInfo'
              }
          },
          { $unwind: '$serviceTypeInfo' },
          {
              $group: {
                  _id: {
                      category: '$serviceTypeInfo.category',
                      branchId: '$branch'
                  },
                  staffCount: { $addToSet: '$_id' },
                  avgSkillLevel: { $avg: '$serviceCapabilities.skillLevel' }
              }
          },
          {
              $lookup: {
                  from: 'branches',
                  localField: '_id.branchId',
                  foreignField: '_id',
                  as: 'branchInfo'
              }
          },
          { $unwind: '$branchInfo' },
          {
              $project: {
                  _id: 0,
                  category: '$_id.category',
                  branchId: '$_id.branchId',
                  branchName: '$branchInfo.name',
                  staffCount: { $size: '$staffCount' },
                  avgSkillLevel: { $round: ['$avgSkillLevel', 2] }
              }
          },
          { $sort: { staffCount: -1 } }
      ]);

      res.status(200).json({
          success: true,
          data: {
              dateRange,
              staffPerformance,
              staffSpecializations,
              topPerformers: {
                  byRevenue: staffPerformance
                      .sort((a, b) => parseFloat(b.period.revenue) - parseFloat(a.period.revenue))
                      .slice(0, 5)
                      .map(staff => ({
                          name: staff.name,
                          branchName: staff.branch?.name,
                          revenue: staff.period.revenue
                      })),
                  byCompletionRate: staffPerformance
                      .filter(staff => staff.period.serviceItems.total >= 5) // Minimum threshold
                      .sort((a, b) => parseFloat(b.period.serviceItems.completionRate) - parseFloat(a.period.serviceItems.completionRate))
                      .slice(0, 5)
                      .map(staff => ({
                          name: staff.name,
                          branchName: staff.branch?.name,
                          completionRate: staff.period.serviceItems.completionRate,
                          totalServices: staff.period.serviceItems.total
                      })),
                  byCreditsEarned: staffPerformance
                      .sort((a, b) => b.period.creditPointsEarned - a.period.creditPointsEarned)
                      .slice(0, 5)
                      .map(staff => ({
                          name: staff.name,
                          branchName: staff.branch?.name,
                          creditPoints: staff.period.creditPointsEarned
                      }))
              }
          }
      });
  } catch (error) {
      next(error);
  }
});


module.exports = router;