const mongoose = require('mongoose');

const monthlySalarySchema = new mongoose.Schema({
  staff: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  month: {
    type: Number,
    required: true,
    min: 1,
    max: 12
  },
  year: {
    type: Number,
    required: true
  },
  staffCategory: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'StaffCategory',
    required: true
  },
  baseSalary: {
    type: Number,
    required: true,
    min: 0
  },
  performanceMetrics: {
    totalCreditPoints: {
      type: Number,
      default: 0
    },
    completedServices: {
      type: Number,
      default: 0
    },
    targetAchievementPercentage: {
      type: Number,
      default: 0
    },
    serviceTypeBreakdown: [{
      serviceType: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'ServiceType'
      },
      count: {
        type: Number,
        default: 0
      },
      creditPoints: {
        type: Number,
        default: 0
      }
    }]
  },
  incentiveBreakdown: {
    baseIncentive: {
      type: Number,
      default: 0
    },
    targetBonus: {
      type: Number,
      default: 0
    },
    serviceTypeBonus: {
      type: Number,
      default: 0
    },
    specialBonus: {
      type: Number,
      default: 0
    },
    specialBonusReason: String,
    deductions: {
      type: Number,
      default: 0
    },
    deductionReason: String
  },
  totalIncentive: {
    type: Number,
    default: 0
  },
  grossSalary: {
    type: Number,
    default: 0
  },
  paymentStatus: {
    type: String,
    enum: ['pending', 'processed', 'paid'],
    default: 'pending'
  },
  paymentDate: {
    type: Date
  },
  paymentMethod: {
    type: String,
    enum: ['bank_transfer', 'check', 'cash'],
  },
  paymentReference: String,
  notes: String,
  incentivePolicy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'IncentivePolicy',
    required: true
  },
  calculationDetails: {
    formula: String,
    variableValues: mongoose.Schema.Types.Mixed
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Compound index for unique staff/month/year combination
monthlySalarySchema.index({ staff: 1, month: 1, year: 1 }, { unique: true });
monthlySalarySchema.index({ month: 1, year: 1 });
monthlySalarySchema.index({ paymentStatus: 1 });

// Virtual for month name
monthlySalarySchema.virtual('monthName').get(function() {
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  return months[this.month - 1];
});

// Pre-save hook to calculate gross salary
monthlySalarySchema.pre('save', function(next) {
  // Calculate total incentive
  this.totalIncentive = 
    this.incentiveBreakdown.baseIncentive + 
    this.incentiveBreakdown.targetBonus + 
    this.incentiveBreakdown.serviceTypeBonus + 
    this.incentiveBreakdown.specialBonus - 
    this.incentiveBreakdown.deductions;
  
  // Calculate gross salary
  this.grossSalary = this.baseSalary + this.totalIncentive;
  
  next();
});

const MonthlySalary = mongoose.model('MonthlySalary', monthlySalarySchema);

module.exports = MonthlySalary;