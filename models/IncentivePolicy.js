const mongoose = require('mongoose');

const incentivePolicySchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Policy name is required'],
    trim: true,
    unique: true
  },
  description: {
    type: String,
    trim: true
  },
  formulaDefinition: {
    type: String,
    required: [true, 'Formula definition is required'],
    trim: true,
    // This will store the formula in a parsable format:
    // e.g., "baseAmount + (totalCreditPoints * multiplier) + (targetAchievement * bonusRate)"
  },
  variables: [{
    name: {
      type: String,
      required: true,
      trim: true
    },
    description: {
      type: String,
      trim: true
    },
    defaultValue: {
      type: Number,
      default: 0
    }
  }],
  applicableCategories: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'StaffCategory'
  }],
  serviceTypeMultipliers: [{
    serviceType: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ServiceType'
    },
    multiplier: {
      type: Number,
      default: 1.0
    }
  }],
  thresholds: [{
    metricName: {
      type: String,
      required: true,
      trim: true
    },
    threshold: {
      type: Number,
      required: true
    },
    bonusAmount: {
      type: Number,
      required: true
    }
  }],
  active: {
    type: Boolean,
    default: true
  },
  effectiveFrom: {
    type: Date,
    required: true,
    default: Date.now
  },
  effectiveTo: {
    type: Date
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

// Index for faster queries
incentivePolicySchema.index({ name: 1 });
incentivePolicySchema.index({ active: 1, effectiveFrom: 1, effectiveTo: 1 });
incentivePolicySchema.index({ 'applicableCategories': 1 });

// Method to check if policy is applicable to a staff category
incentivePolicySchema.methods.isApplicableTo = function(categoryId) {
  return this.applicableCategories.some(
    category => category.toString() === categoryId.toString()
  );
};

// Method to evaluate the formula with provided values
incentivePolicySchema.methods.calculateIncentive = function(values) {
  try {
    // This is a simplified version - in production you'd use a formula parser library
    // or a safer evaluation method
    const formula = this.formulaDefinition;
    
    // Replace variables with their values
    let calculationFormula = formula;
    for (const [key, value] of Object.entries(values)) {
      calculationFormula = calculationFormula.replace(
        new RegExp(key, 'g'), 
        value
      );
    }
    
    // Provide default values for variables not supplied
    this.variables.forEach(variable => {
      if (!calculationFormula.includes(variable.name)) {
        calculationFormula = calculationFormula.replace(
          new RegExp(variable.name, 'g'), 
          variable.defaultValue
        );
      }
    });
    
    // Safely evaluate the formula
    // In production, use a formula parser library instead of eval
    // This is just for demonstration
    return Function('"use strict";return (' + calculationFormula + ')')();
  } catch (error) {
    console.error('Error calculating incentive:', error);
    return 0;
  }
};

const IncentivePolicy = mongoose.model('IncentivePolicy', incentivePolicySchema);

module.exports = IncentivePolicy;