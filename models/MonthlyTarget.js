const mongoose = require('mongoose');

const monthlyTargetSchema = new mongoose.Schema({
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
  category: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'StaffCategory',
    required: true
  },
  targetCreditPoints: {
    type: Number,
    required: true,
    min: 0
  },
  targetCompletedServices: {
    type: Number,
    required: true,
    min: 0
  },
  bonusThresholds: [{
    achievement: {
      type: Number, // percentage of target
      required: true
    },
    bonusAmount: {
      type: Number,
      required: true
    }
  }],
  serviceTypeTargets: [{
    serviceType: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ServiceType'
    },
    targetCount: {
      type: Number,
      min: 0
    },
    bonusPerExcess: {
      type: Number,
      default: 0
    }
  }],
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

// Compound index for unique month/year/category combination
monthlyTargetSchema.index({ month: 1, year: 1, category: 1 }, { unique: true });

// Virtual for month name
monthlyTargetSchema.virtual('monthName').get(function() {
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  return months[this.month - 1];
});

// Method to calculate bonus for achievement
monthlyTargetSchema.methods.calculateBonus = function(achievedPoints) {
  const achievementPercentage = (achievedPoints / this.targetCreditPoints) * 100;
  
  // Find the highest applicable bonus threshold
  let bonus = 0;
  for (const threshold of this.bonusThresholds.sort((a, b) => a.achievement - b.achievement)) {
    if (achievementPercentage >= threshold.achievement) {
      bonus = threshold.bonusAmount;
    } else {
      break;
    }
  }
  
  return {
    achievementPercentage,
    bonus
  };
};

const MonthlyTarget = mongoose.model('MonthlyTarget', monthlyTargetSchema);

module.exports = MonthlyTarget;