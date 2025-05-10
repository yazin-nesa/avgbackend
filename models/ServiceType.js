const mongoose = require('mongoose');

const serviceTypeSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Service type name is required'],
    trim: true,
    unique: true
  },
  description: {
    type: String,
    trim: true
  },
  creditPoints: {
    type: Number,
    required: [true, 'Credit points are required'],
    min: 0,
    default: 0
  },
  isActive: {
    type: Boolean,
    default: true
  },
  category: {
    type: String,
    enum: ['routine_maintenance', 'repair', 'inspection', 'body_work', 'washing', 'other'],
    // required: [true, 'Category is required']
  },
  estimatedTime: {
    type: Number, // in hours
    min: 0
  },
  basePrice: {
    type: Number,
    min: 0
  },
  requiredSkillLevel: {
    type: Number, // 1-5 scale
    min: 1,
    max: 5,
    default: 1
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Index for faster lookup
serviceTypeSchema.index({ name: 1 });
serviceTypeSchema.index({ category: 1 });
serviceTypeSchema.index({ isActive: 1 });

const ServiceType = mongoose.model('ServiceType', serviceTypeSchema);

module.exports = ServiceType;