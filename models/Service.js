const mongoose = require('mongoose');

const serviceSchema = new mongoose.Schema({
  vehicle: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vehicle',
    required: [true, 'Vehicle is required']
  },
  serviceItems: [{
    serviceType: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ServiceType',
      required: [true, 'Service type is required']
    },
    description: {
      type: String,
      required: [true, 'Service description is required'],
      trim: true
    },
    technicians: [{
      technician: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: [true, 'At least one staff member is required']
      },
      creditPoints: {
        type: Number,
        default: 0
      },
      creditsAssigned: {
        type: Boolean,
        default: false
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
    status: {
      type: String,
      enum: ['pending', 'in_progress', 'completed', 'cancelled'],
      default: 'pending'
    },
    startTime: {
      type: Date
    },
    completionTime: {
      type: Date
    }
  }],
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
  status: {
    type: String,
    enum: ['pending', 'in_progress', 'completed', 'cancelled'],
    default: 'pending'
  },
  mileageAtService: {
    type: Number,
    required: [true, 'Mileage at service is required']
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

// Pre-save hooks for calculations
serviceSchema.pre('save', function(next) {
  // Calculate total parts cost for each service item
  if (this.serviceItems && this.serviceItems.length > 0) {
    this.serviceItems.forEach(serviceItem => {
      if (serviceItem.parts && serviceItem.parts.length > 0) {
        serviceItem.parts.forEach(part => {
          part.totalCost = part.quantity * part.unitCost;
        });
      }
    });
  }
  
  // Calculate total service cost
  let totalServiceCost = 0;
  if (this.serviceItems && this.serviceItems.length > 0) {
    this.serviceItems.forEach(serviceItem => {
      const partsCost = serviceItem.parts.reduce((total, part) => total + part.totalCost, 0);
      const serviceCost = partsCost + serviceItem.laborCost;
      totalServiceCost += serviceCost;
    });
  }
  this.totalCost = totalServiceCost;
  
  // Update overall service status based on individual service items
  if (this.serviceItems && this.serviceItems.length > 0) {
    const allCompleted = this.serviceItems.every(service => service.status === 'completed');
    const allCancelled = this.serviceItems.every(service => service.status === 'cancelled');
    const hasPending = this.serviceItems.some(service => service.status === 'pending');
    const hasInProgress = this.serviceItems.some(service => service.status === 'in_progress');

    if (allCompleted) {
      this.status = 'completed';
      if (!this.completionDate) {
        this.completionDate = new Date();
      }
    } else if (allCancelled) {
      this.status = 'cancelled';
    } else if (hasInProgress) {
      this.status = 'in_progress';
    } else if (hasPending) {
      this.status = 'pending';
    }
  }
  
  next();
});

// Method to assign credit points to technicians when service is completed
serviceSchema.methods.assignCreditPoints = async function(serviceItemId, User) {
  const serviceItemIndex = this.serviceItems.findIndex(
    item => item._id.toString() === serviceItemId.toString()
  );
  
  if (serviceItemIndex === -1 || this.serviceItems[serviceItemIndex].status !== 'completed') {
    return false;
  }
  
  // If credits already assigned, skip
  if (this.serviceItems[serviceItemIndex].technicians.every(tech => tech.creditsAssigned)) {
    return true;
  }
  
  const serviceItem = this.serviceItems[serviceItemIndex];
  
  // Get the service type details to know how many points to assign
  const ServiceType = mongoose.model('ServiceType');
  const serviceType = await ServiceType.findById(serviceItem.serviceType);
  
  if (!serviceType) {
    return false;
  }
  
  // Divide credit points among technicians
  const techniciansCount = serviceItem.technicians.length;
  const pointsPerTechnician = serviceType.creditPoints / techniciansCount;
  
  // Assign points to each technician
  for (const techInfo of serviceItem.technicians) {
    if (!techInfo.creditsAssigned) {
      // Update the technician in the service document
      techInfo.creditPoints = pointsPerTechnician;
      techInfo.creditsAssigned = true;
      
      // Update the technician's user document
      const user = await User.findById(techInfo.technician);
      if (user) {
        await user.addServiceCredits(serviceType._id, pointsPerTechnician);
      }
    }
  }
  
  await this.save();
  return true;
};

// Index for faster queries
serviceSchema.index({ vehicle: 1, startDate: -1 });
serviceSchema.index({ status: 1, branch: 1 });
serviceSchema.index({ 'paymentStatus': 1 });
serviceSchema.index({ 'serviceItems.serviceType': 1 });
serviceSchema.index({ 'serviceItems.technicians.technician': 1 });

const Service = mongoose.model('Service', serviceSchema);

module.exports = Service;