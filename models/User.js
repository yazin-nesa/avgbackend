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
  // Replace department with serviceCapabilities
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
    type: String,
    enum: ['routine_maintenance', 'repair', 'inspection', 'body_work', 'washing', 'other', 'administration'],
    default: 'administration'
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
  }
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

const User = mongoose.model('User', userSchema);

module.exports = User;