const mongoose = require('mongoose');

const vehicleSchema = new mongoose.Schema({
  registrationNumber: {
    type: String,
    required: [true, 'Registration number is required'],
    unique: true,
    trim: true,
    uppercase: true
  },
  make: {
    type: String,
    required: [true, 'Vehicle make is required'],
    trim: true
  },
  model: {
    type: String,
    required: [true, 'Vehicle model is required'],
    trim: true
  },
  year: {
    type: Number,
    required: [true, 'Vehicle year is required']
  },
  owner: {
    name: {
      type: String,
      required: [true, 'Owner name is required'],
      trim: true
    },
    phone: {
      type: String,
      required: [true, 'Owner phone number is required'],
      trim: true
    },
    email: {
      type: String,
      required: [true, 'Owner email is required'],
      trim: true,
      lowercase: true,
      match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
    },
    address: {
      street: String,
      city: String,
      state: String,
      zipCode: String
    }
  },
  type: {
    type: String,
    enum: ['sedan', 'suv', 'hatchback', 'truck', 'van', 'motorcycle', 'other'],
    required: [true, 'Vehicle type is required']
  },
  color: {
    type: String,
    trim: true
  },
  vin: {
    type: String,
    trim: true,
    uppercase: true
  },
  mileage: {
    type: Number,
    required: [true, 'Current mileage is required']
  },
  lastService: {
    type: Date
  },
  nextServiceDue: {
    type: Date
  },
  insuranceInfo: {
    provider: String,
    policyNumber: String,
    expiryDate: Date
  },
  status: {
    type: String,
    enum: ['active', 'in_service', 'completed', 'inactive'],
    default: 'active'
  },
  branch: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Branch',
    required: [true, 'Branch is required']
  },
  notes: [{
    content: {
      type: String,
      required: true
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }]
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual for vehicle full name
vehicleSchema.virtual('fullName').get(function() {
  return `${this.year} ${this.make} ${this.model}`;
});

// Virtual populate for service history
vehicleSchema.virtual('serviceHistory', {
  ref: 'Service',
  localField: '_id',
  foreignField: 'vehicle'
});

// Index for faster queries
vehicleSchema.index({ registrationNumber: 1, branch: 1 });
vehicleSchema.index({ 'owner.email': 1 });
vehicleSchema.index({ status: 1 });

const Vehicle = mongoose.model('Vehicle', vehicleSchema);

module.exports = Vehicle; 