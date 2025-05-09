const mongoose = require('mongoose');

const branchSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Branch name is required'],
    trim: true,
    unique: true
  },
  address: {
    street: {
      type: String,
      required: [true, 'Street address is required'],
      trim: true
    },
    city: {
      type: String,
      required: [true, 'City is required'],
      trim: true
    },
    state: {
      type: String,
      required: [true, 'State is required'],
      trim: true
    },
    zipCode: {
      type: String,
      required: [true, 'ZIP code is required'],
      trim: true
    }
  },
  phone: {
    type: String,
    required: [true, 'Phone number is required'],
    trim: true
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    trim: true,
    lowercase: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
  },
  manager: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  operatingHours: {
    monday: {
      open: String,
      close: String
    },
    tuesday: {
      open: String,
      close: String
    },
    wednesday: {
      open: String,
      close: String
    },
    thursday: {
      open: String,
      close: String
    },
    friday: {
      open: String,
      close: String
    },
    saturday: {
      open: String,
      close: String
    },
    sunday: {
      open: String,
      close: String
    }
  },
  status: {
    type: String,
    enum: ['active', 'inactive', 'maintenance'],
    default: 'active'
  },
  capacity: {
    vehicles: {
      type: Number,
      required: [true, 'Vehicle capacity is required']
    },
    staff: {
      type: Number,
      required: [true, 'Staff capacity is required']
    }
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual for full address
branchSchema.virtual('fullAddress').get(function() {
  return `${this.address.street}, ${this.address.city}, ${this.address.state} ${this.address.zipCode}`;
});

// Virtual populate for staff
branchSchema.virtual('staff', {
  ref: 'User',
  localField: '_id',
  foreignField: 'branch'
});

const Branch = mongoose.model('Branch', branchSchema);

module.exports = Branch; 