const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  firstName: {
    type: String,
    required: [true, 'First name is required'],
    trim: true
  },
  lastName: {
    type: String,
    required: [true, 'Last name is required'],
    trim: true
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    trim: true,
    lowercase: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [6, 'Password must be at least 6 characters long'],
    select: false
  },
  role: {
    type: String,
    enum: ['admin', 'manager', 'staff', 'hr'],
    default: 'staff'
  },
  // Added staff designation for incentive policy application
  designation: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Designations',
    required: [true, 'Staff designation is required']
  },
  // Service capabilities
  serviceCapabilities: [{
    serviceType: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ServiceType',
      required: true
    },
    skillLevel: {
      type: Number,
      min: 1,
      max: 5,
      default: 1
    },
    certified: {
      type: Boolean,
      default: false
    },
    totalCreditsEarned: {
      type: Number,
      default: 0
    },
    completedServices: {
      type: Number,
      default: 0
    }
  }],
  totalCreditPoints: {
    type: Number,
    default: 0
  },
  // Keep a category field for filtering purposes
  primaryServiceCategory: {
    type: mongoose.Schema.Types.ObjectId,
      ref: 'StaffCategory',
      required: true
  },
  phone: {
    type: String,
    trim: true
  },
  branch: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Branch',
    required: [true, 'Branch is required']
  },
  status: {
    type: String,
    enum: ['active', 'inactive'],
    default: 'active'
  },
  lastLogin: {
    type: Date
  },
  // Added salary information for incentive calculations
  salary: {
    base: {
      type: Number,
      required: [true, 'Base salary is required'],
      min: 0
    },
    currency: {
      type: String,
      default: 'USD'
    },
    paymentFrequency: {
      type: String,
      enum: ['weekly', 'biweekly', 'monthly'],
      default: 'monthly'
    },
    effectiveDate: {
      type: Date,
      default: Date.now
    }
  },
  // Salary and incentive history
  paymentHistory: [{
    period: {
      month: Number,
      year: Number,
      startDate: Date,
      endDate: Date
    },
    salary: {
      amount: Number,
      currency: String
    },
    incentives: [{
      policy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'IncentivePolicy'
      },
      amount: Number,
      calculationDetails: mongoose.Schema.Types.Mixed
    }],
    totalIncentive: Number,
    totalPay: Number,
    paymentDate: Date,
    paymentReference: String
  }]
}, {
  timestamps: true
});

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Method to compare password
userSchema.methods.comparePassword = async function(candidatePassword) {
  try {
    return await bcrypt.compare(candidatePassword, this.password);
  } catch (error) {
    throw new Error(error);
  }
};

// Method to add credit points for a service
userSchema.methods.addServiceCredits = async function(serviceTypeId, creditsEarned) {
  const serviceCapabilityIndex = this.serviceCapabilities.findIndex(
    cap => cap.serviceType.toString() === serviceTypeId.toString()
  );
  
  if (serviceCapabilityIndex !== -1) {
    this.serviceCapabilities[serviceCapabilityIndex].totalCreditsEarned += creditsEarned;
    this.serviceCapabilities[serviceCapabilityIndex].completedServices += 1;
  }
  
  this.totalCreditPoints += creditsEarned;
  await this.save();
};

// Virtual for full name
userSchema.virtual('fullName').get(function() {
  return `${this.firstName} ${this.lastName}`;
});

// Method to get incentive payments for a specific period
userSchema.methods.getIncentivesForPeriod = async function(month, year) {
  const IncentivePayment = mongoose.model('IncentivePayment');
  
  return await IncentivePayment.find({
    user: this._id,
    'period.month': month,
    'period.year': year
  }).populate('policy');
};

// Method to update payment history with new salary and incentives
userSchema.methods.updatePaymentHistory = async function(paymentData) {
  // Check if entry already exists for this period
  const existingEntryIndex = this.paymentHistory.findIndex(
    entry => entry.period.month === paymentData.period.month && 
            entry.period.year === paymentData.period.year
  );
  
  if (existingEntryIndex !== -1) {
    // Update existing entry
    this.paymentHistory[existingEntryIndex] = {
      ...this.paymentHistory[existingEntryIndex],
      ...paymentData,
      // Recalculate totals
      totalIncentive: paymentData.incentives.reduce((sum, inc) => sum + inc.amount, 0),
      totalPay: paymentData.salary.amount + 
                paymentData.incentives.reduce((sum, inc) => sum + inc.amount, 0)
    };
  } else {
    // Add new entry
    this.paymentHistory.push({
      ...paymentData,
      totalIncentive: paymentData.incentives.reduce((sum, inc) => sum + inc.amount, 0),
      totalPay: paymentData.salary.amount + 
                paymentData.incentives.reduce((sum, inc) => sum + inc.amount, 0)
    });
  }
  
  return await this.save();
};

// Additional indexes
userSchema.index({ designation: 1 });
userSchema.index({ 'paymentHistory.period.month': 1, 'paymentHistory.period.year': 1 });

const User = mongoose.model('User', userSchema);

module.exports = User;