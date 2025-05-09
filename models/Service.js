const mongoose = require('mongoose');

const serviceSchema = new mongoose.Schema({
  vehicle: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vehicle',
    required: [true, 'Vehicle is required']
  },
  serviceType: {
    type: String,
    enum: ['routine_maintenance', 'repair', 'inspection', 'body_work', 'other'],
    required: [true, 'Service type is required']
  },
  description: {
    type: String,
    required: [true, 'Service description is required'],
    trim: true
  },
  startDate: {
    type: Date,
    required: [true, 'Start date is required'],
    default: Date.now
  },
  completionDate: {
    type: Date
  },
  estimatedCompletionDate: {
    type: Date,
    required: [true, 'Estimated completion date is required']
  },
  technicians: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'At least one technician is required']
  }],
  status: {
    type: String,
    enum: ['pending', 'in_progress', 'completed', 'cancelled'],
    default: 'pending'
  },
  mileageAtService: {
    type: Number,
    required: [true, 'Mileage at service is required']
  },
  parts: [{
    name: {
      type: String,
      required: true
    },
    quantity: {
      type: Number,
      required: true,
      min: 1
    },
    unitCost: {
      type: Number,
      required: true,
      min: 0
    },
    totalCost: {
      type: Number,
      required: true,
      min: 0
    }
  }],
  laborHours: {
    type: Number,
    required: true,
    min: 0
  },
  laborCost: {
    type: Number,
    required: true,
    min: 0
  },
  totalCost: {
    type: Number,
    required: true,
    min: 0
  },
  paymentStatus: {
    type: String,
    enum: ['pending', 'partial', 'completed'],
    default: 'pending'
  },
  paymentDetails: [{
    amount: {
      type: Number,
      required: true,
      min: 0
    },
    method: {
      type: String,
      enum: ['cash', 'credit_card', 'debit_card', 'check', 'bank_transfer'],
      required: true
    },
    date: {
      type: Date,
      required: true,
      default: Date.now
    },
    reference: String
  }],
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
  }],
  warranty: {
    warrantyPeriod: Number, // in days
    expiryDate: Date,
    terms: String
  }
}, {
  timestamps: true
});

// Calculate total parts cost
serviceSchema.pre('save', function(next) {
  if (this.parts && this.parts.length > 0) {
    this.parts.forEach(part => {
      part.totalCost = part.quantity * part.unitCost;
    });
  }
  next();
});

// Calculate total service cost
serviceSchema.pre('save', function(next) {
  const partsCost = this.parts.reduce((total, part) => total + part.totalCost, 0);
  this.totalCost = partsCost + this.laborCost;
  next();
});

// Index for faster queries
serviceSchema.index({ vehicle: 1, startDate: -1 });
serviceSchema.index({ status: 1, branch: 1 });
serviceSchema.index({ 'paymentStatus': 1 });

const Service = mongoose.model('Service', serviceSchema);

module.exports = Service; 