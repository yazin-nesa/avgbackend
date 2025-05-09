const mongoose = require('mongoose');

const complaintSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Complaint title is required'],
    trim: true
  },
  description: {
    type: String,
    required: [true, 'Complaint description is required'],
    trim: true
  },
  category: {
    type: String,
    enum: ['service_quality', 'customer_service', 'pricing', 'delay', 'parts', 'other'],
    required: [true, 'Complaint category is required']
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium'
  },
  status: {
    type: String,
    enum: ['open', 'in_progress', 'resolved', 'closed'],
    default: 'open'
  },
  vehicle: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vehicle'
  },
  service: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Service'
  },
  branch: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Branch',
    required: [true, 'Branch is required']
  },
  filedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User who filed the complaint is required']
  },
  assignedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  resolution: {
    description: String,
    date: Date,
    resolvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    feedback: {
      rating: {
        type: Number,
        min: 1,
        max: 5
      },
      comment: String,
      date: Date
    }
  },
  timeline: [{
    status: {
      type: String,
      enum: ['open', 'in_progress', 'resolved', 'closed'],
      required: true
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    comment: String,
    date: {
      type: Date,
      default: Date.now
    }
  }],
  attachments: [{
    filename: String,
    path: String,
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    uploadDate: {
      type: Date,
      default: Date.now
    }
  }],
  dueDate: {
    type: Date
  },
  escalated: {
    status: {
      type: Boolean,
      default: false
    },
    date: Date,
    reason: String,
    escalatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  }
}, {
  timestamps: true
});

// Add status change to timeline
complaintSchema.pre('save', function(next) {
  if (this.isModified('status')) {
    this.timeline.push({
      status: this.status,
      updatedBy: this.assignedTo || this.filedBy,
      date: new Date()
    });
  }
  next();
});

// Index for faster queries
complaintSchema.index({ status: 1, branch: 1 });
complaintSchema.index({ filedBy: 1, createdAt: -1 });
complaintSchema.index({ priority: 1, status: 1 });

const Complaint = mongoose.model('Complaint', complaintSchema);

module.exports = Complaint; 