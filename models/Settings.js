const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema({
  company: {
    name: {
      type: String,
      required: [true, 'Company name is required'],
      trim: true
    },
    logo: String,
    email: {
      type: String,
      required: [true, 'Company email is required'],
      trim: true,
      lowercase: true,
      match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
    },
    phone: {
      type: String,
      required: [true, 'Company phone number is required'],
      trim: true
    },
    address: {
      street: String,
      city: String,
      state: String,
      zipCode: String,
      country: String
    },
    website: String,
    taxId: String
  },
  notifications: {
    email: {
      enabled: {
        type: Boolean,
        default: true
      },
      serviceReminders: {
        type: Boolean,
        default: true
      },
      appointmentReminders: {
        type: Boolean,
        default: true
      },
      complaintUpdates: {
        type: Boolean,
        default: true
      },
      paymentReceipts: {
        type: Boolean,
        default: true
      }
    },
    sms: {
      enabled: {
        type: Boolean,
        default: false
      },
      serviceReminders: {
        type: Boolean,
        default: false
      },
      appointmentReminders: {
        type: Boolean,
        default: false
      }
    }
  },
  service: {
    defaultLaborRate: {
      type: Number,
      required: [true, 'Default labor rate is required'],
      min: 0
    },
    minimumLaborHours: {
      type: Number,
      default: 1,
      min: 0
    },
    workingHours: {
      start: String,
      end: String
    },
    appointmentDuration: {
      type: Number,
      default: 60, // in minutes
      min: 15
    },
    maxAppointmentsPerSlot: {
      type: Number,
      default: 3,
      min: 1
    }
  },
  security: {
    passwordPolicy: {
      minLength: {
        type: Number,
        default: 8
      },
      requireUppercase: {
        type: Boolean,
        default: true
      },
      requireNumbers: {
        type: Boolean,
        default: true
      },
      requireSpecialChars: {
        type: Boolean,
        default: true
      }
    },
    sessionTimeout: {
      type: Number,
      default: 3600 // in seconds
    },
    maxLoginAttempts: {
      type: Number,
      default: 5
    },
    lockoutDuration: {
      type: Number,
      default: 900 // in seconds
    }
  },
  maintenance: {
    backupEnabled: {
      type: Boolean,
      default: true
    },
    backupFrequency: {
      type: String,
      enum: ['daily', 'weekly', 'monthly'],
      default: 'daily'
    },
    backupTime: String,
    retentionPeriod: {
      type: Number,
      default: 30 // in days
    }
  },
  analytics: {
    trackUserActivity: {
      type: Boolean,
      default: true
    },
    retentionPeriod: {
      type: Number,
      default: 365 // in days
    }
  },
  lastUpdated: {
    type: Date,
    default: Date.now
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

// Update lastUpdated timestamp before saving
settingsSchema.pre('save', function(next) {
  this.lastUpdated = new Date();
  next();
});

const Settings = mongoose.model('Settings', settingsSchema);

module.exports = Settings; 