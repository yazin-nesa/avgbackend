const express = require('express');
const router = express.Router();
const { Settings } = require('../models');
const { protect, authorize, ErrorResponse } = require('../middleware');

// @desc    Get settings
// @route   GET /api/v1/settings
// @access  Private
router.get('/', protect, async (req, res, next) => {
  try {
    const settings = await Settings.findOne().sort({ createdAt: -1 });

    if (!settings) {
      return next(new ErrorResponse('No settings found', 404));
    }

    res.status(200).json({
      success: true,
      data: settings
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Update settings
// @route   PUT /api/v1/settings
// @access  Private/Admin
router.put('/', protect, authorize('admin'), async (req, res, next) => {
  try {
    let settings = await Settings.findOne().sort({ createdAt: -1 });

    if (!settings) {
      // Create new settings if none exist
      req.body.updatedBy = req.user.id;
      settings = await Settings.create(req.body);
    } else {
      // Update existing settings
      req.body.updatedBy = req.user.id;
      settings = await Settings.findByIdAndUpdate(settings._id, req.body, {
        new: true,
        runValidators: true
      });
    }

    res.status(200).json({
      success: true,
      data: settings
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Update notification settings
// @route   PUT /api/v1/settings/notifications
// @access  Private/Admin
router.put('/notifications', protect, authorize('admin'), async (req, res, next) => {
  try {
    let settings = await Settings.findOne().sort({ createdAt: -1 });

    if (!settings) {
      return next(new ErrorResponse('No settings found', 404));
    }

    settings.notifications = {
      ...settings.notifications,
      ...req.body
    };
    settings.updatedBy = req.user.id;

    await settings.save();

    res.status(200).json({
      success: true,
      data: settings.notifications
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Update service settings
// @route   PUT /api/v1/settings/service
// @access  Private/Admin
router.put('/service', protect, authorize('admin'), async (req, res, next) => {
  try {
    let settings = await Settings.findOne().sort({ createdAt: -1 });

    if (!settings) {
      return next(new ErrorResponse('No settings found', 404));
    }

    settings.service = {
      ...settings.service,
      ...req.body
    };
    settings.updatedBy = req.user.id;

    await settings.save();

    res.status(200).json({
      success: true,
      data: settings.service
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Update security settings
// @route   PUT /api/v1/settings/security
// @access  Private/Admin
router.put('/security', protect, authorize('admin'), async (req, res, next) => {
  try {
    let settings = await Settings.findOne().sort({ createdAt: -1 });

    if (!settings) {
      return next(new ErrorResponse('No settings found', 404));
    }

    settings.security = {
      ...settings.security,
      ...req.body
    };
    settings.updatedBy = req.user.id;

    await settings.save();

    res.status(200).json({
      success: true,
      data: settings.security
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Update maintenance settings
// @route   PUT /api/v1/settings/maintenance
// @access  Private/Admin
router.put('/maintenance', protect, authorize('admin'), async (req, res, next) => {
  try {
    let settings = await Settings.findOne().sort({ createdAt: -1 });

    if (!settings) {
      return next(new ErrorResponse('No settings found', 404));
    }

    settings.maintenance = {
      ...settings.maintenance,
      ...req.body
    };
    settings.updatedBy = req.user.id;

    await settings.save();

    res.status(200).json({
      success: true,
      data: settings.maintenance
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Update analytics settings
// @route   PUT /api/v1/settings/analytics
// @access  Private/Admin
router.put('/analytics', protect, authorize('admin'), async (req, res, next) => {
  try {
    let settings = await Settings.findOne().sort({ createdAt: -1 });

    if (!settings) {
      return next(new ErrorResponse('No settings found', 404));
    }

    settings.analytics = {
      ...settings.analytics,
      ...req.body
    };
    settings.updatedBy = req.user.id;

    await settings.save();

    res.status(200).json({
      success: true,
      data: settings.analytics
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router; 