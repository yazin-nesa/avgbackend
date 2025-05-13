const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const {
    User,
    Branch,
    Vehicle,
    Service,
    Complaint,
    ServiceType
} = require('../models');
const { protect, authorize } = require('../middleware');


// Dashboard summary stats - Key metrics like total vehicles, active services, pending complaints, etc.     - done
// Branch performance metrics - Compare branches by service volume, revenue, etc.                           - done
// Service analytics - Service types breakdown, revenue, completion times                                   - done
// Staff performance - Technician efficiency, credit points, services completed                             - done
// Vehicle analytics - Most common makes/models, service frequency, etc.
// Complaint analytics - Issues by category, resolution time, satisfaction
// Revenue analytics - Financial performance, payment methods, outstanding payments
// Temporal analytics - Performance trends over time (daily, monthly, yearly)

// @desc    Get dashboard summary stats
// @route   GET /api/v1/admin/analytics/dashboard-summary
// @access  Private/Admin
router.get('/dashboard-summary', protect, authorize('admin'), async (req, res, next) => {
    try {
        // Get counts from different collections
        const [
            totalVehicles,
            activeVehicles,
            totalServices,
            pendingServices,
            inProgressServices,
            completedServices,
            totalComplaints,
            openComplaints,
            totalStaff,
            totalBranches,
            activeBranches
        ] = await Promise.all([
            Vehicle.countDocuments(),
            Vehicle.countDocuments({ status: 'active' }),
            Service.countDocuments(),
            Service.countDocuments({ status: 'pending' }),
            Service.countDocuments({ status: 'in_progress' }),
            Service.countDocuments({ status: 'completed' }),
            Complaint.countDocuments(),
            Complaint.countDocuments({ status: { $in: ['open', 'in_progress'] } }),
            User.countDocuments({ role: { $in: ['staff', 'manager'] } }),
            Branch.countDocuments(),
            Branch.countDocuments({ status: 'active' })
        ]);

        // Calculate service completion rate
        const serviceCompletionRate = totalServices > 0
            ? ((completedServices / totalServices) * 100).toFixed(2)
            : 0;

        // Calculate complaint resolution rate
        const resolvedComplaints = await Complaint.countDocuments({ status: { $in: ['resolved', 'closed'] } });
        const complaintResolutionRate = totalComplaints > 0
            ? ((resolvedComplaints / totalComplaints) * 100).toFixed(2)
            : 0;

        // Get revenue info
        const services = await Service.find({ status: 'completed' });
        const totalRevenue = services.reduce((acc, service) => acc + service.totalCost, 0);

        // Get most recent services and complaints for quick overview
        const recentServices = await Service.find()
            .sort({ createdAt: -1 })
            .limit(5)
            .populate('vehicle', 'registrationNumber make model')
            .populate('branch', 'name');

        const recentComplaints = await Complaint.find()
            .sort({ createdAt: -1 })
            .limit(5)
            .populate('filedBy', 'firstName lastName')
            .populate('branch', 'name');

        res.status(200).json({
            success: true,
            data: {
                vehicleStats: {
                    total: totalVehicles,
                    active: activeVehicles,
                    inactivePercentage: totalVehicles > 0
                        ? (((totalVehicles - activeVehicles) / totalVehicles) * 100).toFixed(2)
                        : 0
                },
                serviceStats: {
                    total: totalServices,
                    pending: pendingServices,
                    inProgress: inProgressServices,
                    completed: completedServices,
                    completionRate: serviceCompletionRate
                },
                complaintStats: {
                    total: totalComplaints,
                    open: openComplaints,
                    resolutionRate: complaintResolutionRate
                },
                staffStats: {
                    total: totalStaff
                },
                branchStats: {
                    total: totalBranches,
                    active: activeBranches
                },
                financialStats: {
                    totalRevenue: totalRevenue.toFixed(2)
                },
                recentActivity: {
                    services: recentServices,
                    complaints: recentComplaints
                }
            }
        });
    } catch (error) {
        next(error);
    }
});

// @desc    Get branch performance metrics
// @route   GET /api/v1/admin/analytics/branch-performance
// @access  Private/Admin
router.get('/branch-performance', protect, authorize('admin'), async (req, res, next) => {
    try {
        // Get all branches
        const branches = await Branch.find();

        // Create an array to store branch performance data
        const branchPerformance = [];

        // For each branch, get their performance metrics
        for (const branch of branches) {
            // Get counts for this branch
            const [
                totalVehicles,
                activeVehicles,
                totalServices,
                completedServices,
                totalComplaints,
                resolvedComplaints,
                staffCount
            ] = await Promise.all([
                Vehicle.countDocuments({ branch: branch._id }),
                Vehicle.countDocuments({ branch: branch._id, status: 'active' }),
                Service.countDocuments({ branch: branch._id }),
                Service.countDocuments({ branch: branch._id, status: 'completed' }),
                Complaint.countDocuments({ branch: branch._id }),
                Complaint.countDocuments({ branch: branch._id, status: { $in: ['resolved', 'closed'] } }),
                User.countDocuments({ branch: branch._id, status: 'active' })
            ]);

            // Calculate service completion rate
            const serviceCompletionRate = totalServices > 0
                ? ((completedServices / totalServices) * 100).toFixed(2)
                : 0;

            // Calculate complaint resolution rate
            const complaintResolutionRate = totalComplaints > 0
                ? ((resolvedComplaints / totalComplaints) * 100).toFixed(2)
                : 0;

            // Calculate average service time
            const completedServicesData = await Service.find({
                branch: branch._id,
                status: 'completed',
                startDate: { $exists: true },
                completionDate: { $exists: true }
            });

            let averageServiceTime = 0;

            if (completedServicesData.length > 0) {
                const totalServiceTime = completedServicesData.reduce((acc, service) => {
                    const serviceTime = service.completionDate - service.startDate;
                    return acc + serviceTime;
                }, 0);

                // Average time in hours
                averageServiceTime = (totalServiceTime / completedServicesData.length) / (1000 * 60 * 60);
            }

            // Calculate revenue for this branch
            const services = await Service.find({ branch: branch._id, status: 'completed' });
            const totalRevenue = services.reduce((acc, service) => acc + service.totalCost, 0);

            // Calculate average service cost
            const averageServiceCost = completedServices > 0
                ? (totalRevenue / completedServices).toFixed(2)
                : 0;

            // Gather metrics for top service types at this branch
            const serviceItems = await Service.aggregate([
                { $match: { branch: branch._id } },
                { $unwind: '$serviceItems' },
                {
                    $lookup: {
                        from: 'servicetypes',
                        localField: 'serviceItems.serviceType',
                        foreignField: '_id',
                        as: 'serviceTypeInfo'
                    }
                },
                { $unwind: '$serviceTypeInfo' },
                {
                    $group: {
                        _id: '$serviceItems.serviceType',
                        name: { $first: '$serviceTypeInfo.name' },
                        count: { $sum: 1 },
                        revenue: { $sum: '$serviceItems.laborCost' }
                    }
                },
                { $sort: { count: -1 } },
                { $limit: 5 }
            ]);

            // Add branch performance data to array
            branchPerformance.push({
                _id: branch._id,
                name: branch.name,
                address: branch.fullAddress,
                manager: branch.manager,
                stats: {
                    vehicles: {
                        total: totalVehicles,
                        active: activeVehicles
                    },
                    services: {
                        total: totalServices,
                        completed: completedServices,
                        completionRate: serviceCompletionRate,
                        averageServiceTime: averageServiceTime.toFixed(2)
                    },
                    complaints: {
                        total: totalComplaints,
                        resolved: resolvedComplaints,
                        resolutionRate: complaintResolutionRate
                    },
                    staff: {
                        count: staffCount
                    },
                    financial: {
                        totalRevenue: totalRevenue.toFixed(2),
                        averageServiceCost: averageServiceCost
                    },
                    topServices: serviceItems
                }
            });
        }

        res.status(200).json({
            success: true,
            count: branchPerformance.length,
            data: branchPerformance
        });
    } catch (error) {
        next(error);
    }
});

// @desc    Get service analytics
// @route   GET /api/v1/admin/analytics/service-analytics
// @access  Private/Admin
router.get('/service-analytics', protect, authorize('admin'), async (req, res, next) => {
    try {
        // Get date range from query parameters or default to last 30 days
        const endDate = new Date();
        const startDate = req.query.startDate
            ? new Date(req.query.startDate)
            : new Date(endDate - 30 * 24 * 60 * 60 * 1000);

        // Get all service types for reference
        const serviceTypes = await ServiceType.find();

        // Service type performance analysis
        const serviceTypeAnalytics = await Service.aggregate([
            {
                $match: {
                    createdAt: { $gte: startDate, $lte: endDate }
                }
            },
            { $unwind: '$serviceItems' },
            {
                $lookup: {
                    from: 'servicetypes',
                    localField: 'serviceItems.serviceType',
                    foreignField: '_id',
                    as: 'serviceTypeInfo'
                }
            },
            { $unwind: '$serviceTypeInfo' },
            {
                $group: {
                    _id: '$serviceItems.serviceType',
                    name: { $first: '$serviceTypeInfo.name' },
                    category: { $first: '$serviceTypeInfo.category' },
                    count: { $sum: 1 },
                    revenue: { $sum: '$serviceItems.laborCost' },
                    partsCost: {
                        $sum: {
                            $reduce: {
                                input: '$serviceItems.parts',
                                initialValue: 0,
                                in: { $add: ['$$value', '$$this.totalCost'] }
                            }
                        }
                    },
                    averageLaborHours: { $avg: '$serviceItems.laborHours' },
                    completedCount: {
                        $sum: {
                            $cond: [{ $eq: ['$serviceItems.status', 'completed'] }, 1, 0]
                        }
                    },
                    completionTimeSum: {
                        $sum: {
                            $cond: [
                                {
                                    $and: [
                                        { $eq: ['$serviceItems.status', 'completed'] },
                                        { $ne: ['$serviceItems.startTime', null] },
                                        { $ne: ['$serviceItems.completionTime', null] }
                                    ]
                                },
                                {
                                    $divide: [
                                        { $subtract: ['$serviceItems.completionTime', '$serviceItems.startTime'] },
                                        3600000  // Convert ms to hours
                                    ]
                                },
                                0
                            ]
                        }
                    }
                }
            },
            {
                $project: {
                    name: 1,
                    category: 1,
                    count: 1,
                    revenue: 1,
                    partsCost: 1,
                    averageLaborHours: 1,
                    completedCount: 1,
                    averageCompletionTime: {
                        $cond: [
                            { $gt: ['$completedCount', 0] },
                            { $divide: ['$completionTimeSum', '$completedCount'] },
                            0
                        ]
                    },
                    completionRate: {
                        $cond: [
                            { $gt: ['$count', 0] },
                            { $multiply: [{ $divide: ['$completedCount', '$count'] }, 100] },
                            0
                        ]
                    },
                    totalRevenue: { $add: ['$revenue', '$partsCost'] }
                }
            },
            { $sort: { count: -1 } }
        ]);

        // Service category distribution
        const categoryDistribution = await Service.aggregate([
            { $match: { createdAt: { $gte: startDate, $lte: endDate } } },
            { $unwind: '$serviceItems' },
            {
                $lookup: {
                    from: 'servicetypes',
                    localField: 'serviceItems.serviceType',
                    foreignField: '_id',
                    as: 'serviceTypeInfo'
                }
            },
            { $unwind: '$serviceTypeInfo' },
            {
                $group: {
                    _id: '$serviceTypeInfo.category',
                    count: { $sum: 1 },
                    revenue: { $sum: '$serviceItems.laborCost' },
                    partsCost: {
                        $sum: {
                            $reduce: {
                                input: '$serviceItems.parts',
                                initialValue: 0,
                                in: { $add: ['$$value', '$$this.totalCost'] }
                            }
                        }
                    }
                }
            },
            {
                $project: {
                    category: '$_id',
                    count: 1,
                    revenue: 1,
                    partsCost: 1,
                    totalRevenue: { $add: ['$revenue', '$partsCost'] }
                }
            },
            { $sort: { count: -1 } }
        ]);

        // Time to completion analysis
        const completionTimesByType = await Service.aggregate([
            {
                $match: {
                    status: 'completed',
                    startDate: { $exists: true },
                    completionDate: { $exists: true },
                    createdAt: { $gte: startDate, $lte: endDate }
                }
            },
            {
                $project: {
                    serviceTime: {
                        $divide: [
                            { $subtract: ['$completionDate', '$startDate'] },
                            3600000  // Convert ms to hours
                        ]
                    },
                    estimatedTime: {
                        $divide: [
                            { $subtract: ['$estimatedCompletionDate', '$startDate'] },
                            3600000  // Convert ms to hours
                        ]
                    }
                }
            },
            {
                $group: {
                    _id: null,
                    averageServiceTime: { $avg: '$serviceTime' },
                    minServiceTime: { $min: '$serviceTime' },
                    maxServiceTime: { $max: '$serviceTime' },
                    totalServices: { $sum: 1 },
                    onTimeCount: {
                        $sum: {
                            $cond: [
                                { $lte: ['$serviceTime', '$estimatedTime'] },
                                1,
                                0
                            ]
                        }
                    }
                }
            },
            {
                $project: {
                    _id: 0,
                    averageServiceTime: { $round: ['$averageServiceTime', 2] },
                    minServiceTime: { $round: ['$minServiceTime', 2] },
                    maxServiceTime: { $round: ['$maxServiceTime', 2] },
                    totalServices: 1,
                    onTimePercentage: {
                        $round: [
                            { $multiply: [{ $divide: ['$onTimeCount', '$totalServices'] }, 100] },
                            2
                        ]
                    }
                }
            }
        ]);

        // Parts usage analysis
        const partsAnalytics = await Service.aggregate([
            { $match: { createdAt: { $gte: startDate, $lte: endDate } } },
            { $unwind: '$serviceItems' },
            { $unwind: '$serviceItems.parts' },
            {
                $group: {
                    _id: '$serviceItems.parts.name',
                    totalUsage: { $sum: '$serviceItems.parts.quantity' },
                    totalCost: { $sum: '$serviceItems.parts.totalCost' },
                    averageCostPerUnit: { $avg: '$serviceItems.parts.unitCost' },
                    servicesCount: { $addToSet: '$_id' }
                }
            },
            {
                $project: {
                    partName: '$_id',
                    totalUsage: 1,
                    totalCost: 1,
                    averageCostPerUnit: { $round: ['$averageCostPerUnit', 2] },
                    servicesCount: { $size: '$servicesCount' }
                }
            },
            { $sort: { totalUsage: -1 } },
            { $limit: 20 }
        ]);

        // Revenue trend (daily for the date range)
        const revenueTrend = await Service.aggregate([
            {
                $match: {
                    status: 'completed',
                    createdAt: { $gte: startDate, $lte: endDate }
                }
            },
            {
                $group: {
                    _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
                    revenue: { $sum: '$totalCost' },
                    serviceCount: { $sum: 1 }
                }
            },
            {
                $project: {
                    date: '$_id',
                    revenue: { $round: ['$revenue', 2] },
                    serviceCount: 1,
                    _id: 0
                }
            },
            { $sort: { date: 1 } }
        ]);

        res.status(200).json({
            success: true,
            data: {
                timeframe: {
                    startDate,
                    endDate
                },
                serviceTypeAnalytics,
                categoryDistribution,
                completionTimeMetrics: completionTimesByType[0] || {
                    averageServiceTime: 0,
                    minServiceTime: 0,
                    maxServiceTime: 0,
                    totalServices: 0,
                    onTimePercentage: 0
                },
                partsAnalytics,
                revenueTrend
            }
        });
    } catch (error) {
        next(error);
    }
});

// @desc    Get staff performance analytics
// @route   GET /api/v1/admin/analytics/staff-performance
// @access  Private/Admin
router.get('/staff-performance', protect, authorize('admin'), async (req, res, next) => {
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


// @desc    Get vehicle analytics
// @route   GET /api/v1/admin/analytics/vehicle-analytics
// @access  Private/Admin
router.get('/vehicle-analytics', protect, authorize('admin'), async (req, res, next) => {
    try {
        const startDate = req.query.startDate ? new Date(req.query.startDate) : new Date(Date.now() - 365 * 24 * 60 * 60 * 1000); // Default to last year
        const endDate = req.query.endDate ? new Date(req.query.endDate) : new Date();

        // 1. Most Common Makes and Models
        const commonMakesModels = await Vehicle.aggregate([
            {
                $group: {
                    _id: { make: '$make', model: '$model' },
                    count: { $sum: 1 }
                }
            },
            {
                $sort: { count: -1 }
            },
            {
                $group: {
                    _id: '$_id.make',
                    models: {
                        $push: { model: '$_id.model', count: '$count' }
                    },
                    totalCount: { $sum: '$count' }
                }
            },
            {
                $sort: { totalCount: -1 }
            },
            {
                $project: {
                    _id: 0,
                    make: '$_id',
                    models: 1,
                    totalCount: 1
                }
            },
            {
                $limit: 10 // Top 10 makes
            }
        ]);

        // 2. Service Frequency
        const serviceFrequency = await Service.aggregate([
            {
                $match: {
                    createdAt: { $gte: startDate, $lte: endDate }
                }
            },
            {
                $group: {
                    _id: '$vehicle',
                    serviceCount: { $sum: 1 },
                    firstServiceDate: { $min: '$createdAt' },
                    lastServiceDate: { $max: '$createdAt' }
                }
            },
            {
                $lookup: {
                    from: 'vehicles',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'vehicleInfo'
                }
            },
            {
                $unwind: '$vehicleInfo'
            },
            {
                $project: {
                    _id: 0,
                    vehicleId: '$_id',
                    registrationNumber: '$vehicleInfo.registrationNumber',
                    make: '$vehicleInfo.make',
                    model: '$vehicleInfo.model',
                    serviceCount: 1,
                    averageInterval: {
                        $divide: [
                            { $subtract: ['$lastServiceDate', '$firstServiceDate'] },
                            { $multiply: [24, 60, 60, 1000] } // Convert milliseconds to days
                        ]
                    }

                }
            },
            {
                $sort: { serviceCount: -1 }
            },
            {
                $limit: 10
            }
        ]);

        // 3. Vehicle Types Distribution
        const vehicleTypeDistribution = await Vehicle.aggregate([
            {
                $group: {
                    _id: '$type',
                    count: { $sum: 1 }
                }
            },
            {
                $project: {
                    _id: 0,
                    type: '$_id',
                    count: 1
                }
            }
        ]);

        res.status(200).json({
            success: true,
            data: {
                commonMakesModels,
                serviceFrequency,
                vehicleTypeDistribution
            }
        });

    } catch (error) {
        next(error);
    }
});

// @desc    Get complaint analytics
// @route   GET /api/v1/admin/analytics/complaint-analytics
// @access  Private/Admin
router.get('/complaint-analytics', protect, authorize('admin'), async (req, res, next) => {
    try {
        const startDate = req.query.startDate ? new Date(req.query.startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // Default to last 30 days
        const endDate = req.query.endDate ? new Date(req.query.endDate) : new Date();

        // 1. Complaint Category Breakdown
        const categoryBreakdown = await Complaint.aggregate([
            {
                $match: {
                    createdAt: { $gte: startDate, $lte: endDate }
                }
            },
            {
                $group: {
                    _id: '$category',
                    count: { $sum: 1 }
                }
            },
            {
                $project: {
                    _id: 0,
                    category: '$_id',
                    count: 1
                }
            }
        ]);

        // 2. Complaint Status Overview
        const statusOverview = await Complaint.aggregate([
            {
                $match: {
                    createdAt: { $gte: startDate, $lte: endDate }
                }
            },
            {
                $group: {
                    _id: '$status',
                    count: { $sum: 1 }
                }
            },
            {
                $project: {
                    _id: 0,
                    status: '$_id',
                    count: 1
                }
            }
        ]);

        // 3. Average Resolution Time
        const resolutionTimes = await Complaint.aggregate([
            {
                $match: {
                    status: { $in: ['resolved', 'closed'] },
                    createdAt: { $gte: startDate, $lte: endDate },
                    'resolution.date': { $ne: null }
                }
            },
            {
                $project: {
                    timeToResolve: {
                        $divide: [
                            { $subtract: ['$resolution.date', '$createdAt'] },
                            3600000 // Convert milliseconds to hours
                        ]
                    }
                }
            },
            {
                $group: {
                    _id: null,
                    averageResolutionTime: { $avg: '$timeToResolve' },
                    minResolutionTime: { $min: '$timeToResolve' },
                    maxResolutionTime: { $max: '$timeToResolve' }
                }
            },
            {
                $project: {
                    _id: 0,
                    averageResolutionTime: { $round: ['$averageResolutionTime', 2] },
                    minResolutionTime: { $round: ['$minResolutionTime', 2] },
                    maxResolutionTime: { $round: ['$maxResolutionTime', 2] }
                }
            }
        ]);

        // 4. Customer Satisfaction (if feedback is available)
        const satisfactionMetrics = await Complaint.aggregate([
            {
                $match: {
                    'resolution.feedback.rating': { $exists: true },
                    createdAt: { $gte: startDate, $lte: endDate }
                }
            },
            {
                $group: {
                    _id: null,
                    averageRating: { $avg: '$resolution.feedback.rating' },
                    totalFeedbackCount: { $sum: 1 }
                }
            },
            {
                $project: {
                    _id: 0,
                    averageRating: { $round: ['$averageRating', 2] },
                    totalFeedbackCount: 1
                }
            }
        ]);

        res.status(200).json({
            success: true,
            data: {
                categoryBreakdown,
                statusOverview,
                resolutionTimes: resolutionTimes[0] || { // Handle empty result
                    averageResolutionTime: 0,
                    minResolutionTime: 0,
                    maxResolutionTime: 0
                },
                satisfactionMetrics: satisfactionMetrics[0] || { // Handle empty result
                    averageRating: 0,
                    totalFeedbackCount: 0
                }
            }
        });

    } catch (error) {
        next(error);
    }
});


// @desc    Get revenue analytics
// @route   GET /api/v1/admin/analytics/revenue-analytics
// @access  Private/Admin
router.get('/revenue-analytics', protect, authorize('admin'), async (req, res, next) => {
    try {
        const startDate = req.query.startDate ? new Date(req.query.startDate) : new Date(Date.now() - 365 * 24 * 60 * 60 * 1000); // Default to last year
        const endDate = req.query.endDate ? new Date(req.query.endDate) : new Date();

        // 1. Total Revenue
        const totalRevenue = await Service.aggregate([
            {
                $match: {
                    status: 'completed',
                    createdAt: { $gte: startDate, $lte: endDate }
                }
            },
            {
                $group: {
                    _id: null,
                    totalRevenue: { $sum: '$totalCost' }
                }
            },
            {
                $project: {
                    _id: 0,
                    totalRevenue: { $round: ['$totalRevenue', 2] }
                }
            }
        ]);

        // 2. Revenue by Branch
        const revenueByBranch = await Service.aggregate([
            {
                $match: {
                    status: 'completed',
                    createdAt: { $gte: startDate, $lte: endDate }
                }
            },
            {
                $group: {
                    _id: '$branch',
                    revenue: { $sum: '$totalCost' }
                }
            },
            {
                $lookup: {
                    from: 'branches',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'branchInfo'
                }
            },
            {
                $unwind: '$branchInfo'
            },
            {
                $project: {
                    _id: 0,
                    branchId: '$_id',
                    branchName: '$branchInfo.name',
                    revenue: { $round: ['$revenue', 2] }
                }
            },
            {
                $sort: { revenue: -1 }
            }
        ]);

        // 3. Revenue by Service Type
        const revenueByServiceType = await Service.aggregate([
            {
                $match: {
                    status: 'completed',
                    createdAt: { $gte: startDate, $lte: endDate }
                }
            },
            { $unwind: '$serviceItems' },
            {
                $group: {
                    _id: '$serviceItems.serviceType',
                    revenue: { $sum: '$serviceItems.laborCost' }
                }
            },
            {
                $lookup: {
                    from: 'servicetypes',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'serviceTypeInfo'
                }
            },
            { $unwind: '$serviceTypeInfo' },
            {
                $project: {
                    _id: 0,
                    serviceTypeId: '$_id',
                    serviceTypeName: '$serviceTypeInfo.name',
                    revenue: { $round: ['$revenue', 2] }
                }
            },
            {
                $sort: { revenue: -1 }
            }
        ]);

        // 4. Payment Method Distribution
        const paymentMethodDistribution = await Service.aggregate([
            {
                $match: {
                    status: 'completed',
                    createdAt: { $gte: startDate, $lte: endDate }
                }
            },
            { $unwind: '$paymentDetails' },
            {
                $group: {
                    _id: '$paymentDetails.method',
                    totalAmount: { $sum: '$paymentDetails.amount' },
                    count: { $sum: 1 }
                }
            },
            {
                $project: {
                    _id: 0,
                    method: '$_id',
                    totalAmount: { $round: ['$totalAmount', 2] },
                    count: 1
                }
            }
        ]);

        // 5. Outstanding Payments (assuming paymentStatus field exists)
        const outstandingPayments = await Service.aggregate([
            {
                $match: {
                    paymentStatus: { $ne: 'completed' },
                    createdAt: { $gte: startDate, $lte: endDate }
                }
            },
            {
                $group: {
                    _id: null,
                    totalOutstanding: { $sum: '$totalCost' },
                    count: { $sum: 1 }
                }
            },
            {
                $project: {
                    _id: 0,
                    totalOutstanding: { $round: ['$totalOutstanding', 2] },
                    count: 1
                }
            }
        ]);

        res.status(200).json({
            success: true,
            data: {
                totalRevenue: totalRevenue[0] ? totalRevenue[0].totalRevenue : 0,
                revenueByBranch,
                revenueByServiceType,
                paymentMethodDistribution,
                outstandingPayments: outstandingPayments[0] || { totalOutstanding: 0, count: 0 }
            }
        });

    } catch (error) {
        next(error);
    }
});

module.exports = router;