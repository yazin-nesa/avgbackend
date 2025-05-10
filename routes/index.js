const express = require('express');
const router = express.Router();

// Import route files
const auth = require('./auth');
const users = require('./users');
const branches = require('./branches');
const vehicles = require('./vehicles');
const services = require('./services');
const complaints = require('./complaints');
const settings = require('./settings');
const serviceTypeRoutes = require('./servicetype')

// Mount routes
router.use('/auth', auth);
router.use('/users', users);
router.use('/branches', branches);
router.use('/vehicles', vehicles);
router.use('/service-types', serviceTypeRoutes);
router.use('/services', services);
router.use('/complaints', complaints);
router.use('/settings', settings);

module.exports = router; 