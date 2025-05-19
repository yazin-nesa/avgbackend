const mongoose = require('mongoose');

const staffCategorySchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Category name is required'],
    trim: true,
    unique: true
  },
  description: {
    type: String,
    trim: true
  },
  serviceCapabilityRequirements: [{
    serviceType: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ServiceType'
    },
    minimumSkillLevel: {
      type: Number,
      min: 1,
      max: 5,
      default: 1
    },
    certificationRequired: {
      type: Boolean,
      default: false
    }
  }],
  minimumExperience: {
    type: Number, // in months
    default: 0
  },
  baseIncentiveRate: {
    type: Number,
    default: 0
  },
  baseSalary: {
    type: Number,
    required: true,
    min: 0
  },
  active: {
    type: Boolean,
    default: true
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
staffCategorySchema.index({ name: 1 });
staffCategorySchema.index({ active: 1 });

// Method to check if a staff member meets the category requirements
staffCategorySchema.methods.checkEligibility = function(staffMember) {
  // Check minimum experience
  const staffExperience = staffMember.experience || 0;
  if (staffExperience < this.minimumExperience) {
    return {
      eligible: false,
      reason: `Insufficient experience. Required: ${this.minimumExperience} months.`
    };
  }
  
  // Check service capability requirements
  for (const requirement of this.serviceCapabilityRequirements) {
    const staffCapability = staffMember.serviceCapabilities.find(
      cap => cap.serviceType.toString() === requirement.serviceType.toString()
    );
    
    if (!staffCapability) {
      return {
        eligible: false,
        reason: `Missing service capability for required service type.`
      };
    }
    
    if (staffCapability.skillLevel < requirement.minimumSkillLevel) {
      return {
        eligible: false,
        reason: `Insufficient skill level for service type. Required: ${requirement.minimumSkillLevel}.`
      };
    }
    
    if (requirement.certificationRequired && !staffCapability.certified) {
      return {
        eligible: false,
        reason: `Certification required for service type.`
      };
    }
  }
  
  return { eligible: true };
};

const StaffCategory = mongoose.model('StaffCategory', staffCategorySchema);

module.exports = StaffCategory;