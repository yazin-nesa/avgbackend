//routes/IncentiveCalculationService.js
const mongoose = require('mongoose');
const User = require('../models/User');
const Service = require('../models/Service');
const IncentivePolicy = require('../models/IncentivePolicy');
const StaffCategory = require('../models/StaffCategory');
const MonthlyTarget = require('../models/MonthlyTarget');
const MonthlySalary = require('../models/MonthlySalary');
const mathjs = require('mathjs');

class IncentiveCalculationService {
  /**
   * Calculate incentive for a staff member for a specific month and year
   * @param {string} staffId - Staff member ID
   * @param {number} month - Month (1-12)
   * @param {number} year - Year
   * @param {string} categoryId - Staff category ID
   * @param {string} policyId - Incentive policy ID
   * @param {object} options - Additional options
   * @returns {Promise<object>} - Calculated incentive details
   */
  static async calculateStaffIncentive(staffId, month, year, categoryId, policyId, options = {}) {
    try {
      // Get the staff member
      const staff = await User.findById(staffId);
      if (!staff) {
        throw new Error('Staff member not found');
      }
      
      // Get the staff category
      const category = await StaffCategory.findById(categoryId);
      if (!category) {
        throw new Error('Staff category not found');
      }
      
      // Get the incentive policy
      const policy = await IncentivePolicy.findById(policyId);
      if (!policy) {
        throw new Error('Incentive policy not found');
      }
      
      // Check if the policy is applicable to the category
      if (!policy.isApplicableTo(categoryId)) {
        throw new Error('The selected policy is not applicable to this staff category');
      }
      
      // Get the monthly target for this category
      const monthlyTarget = await MonthlyTarget.findOne({
        month,
        year,
        category: categoryId
      });
      
      if (!monthlyTarget) {
        throw new Error(`No monthly target found for ${month}/${year} for the selected category`);
      }
      
      // Calculate the start and end dates for the month
      const startDate = new Date(year, month - 1, 1);
      const endDate = new Date(year, month, 0); // Last day of the month
      
      // Get all completed services for this staff member in the given month
      const completedServices = await this.getStaffCompletedServices(staffId, startDate, endDate);
      
      // Calculate performance metrics
      const performanceMetrics = await this.calculatePerformanceMetrics(
        staff, 
        completedServices, 
        monthlyTarget
      );
      
      // Prepare variables for the incentive formula
      const variables = {
        baseSalary: category.baseSalary,
        baseIncentiveRate: category.baseIncentiveRate,
        totalCreditPoints: performanceMetrics.totalCreditPoints,
        completedServices: performanceMetrics.completedServices,
        targetAchievementPercentage: performanceMetrics.targetAchievementPercentage,
        targetCreditPoints: monthlyTarget.targetCreditPoints,
        targetCompletedServices: monthlyTarget.targetCompletedServices,
        // Add any custom variables from options
        ...options.variables
      };
      
      // Calculate the incentive breakdown
      const incentiveBreakdown = {
        baseIncentive: this.calculateBaseIncentive(variables, policy),
        targetBonus: this.calculateTargetBonus(performanceMetrics, monthlyTarget),
        serviceTypeBonus: this.calculateServiceTypeBonus(
          performanceMetrics.serviceTypeBreakdown, 
          monthlyTarget.serviceTypeTargets,
          policy
        ),
        specialBonus: options.specialBonus || 0,
        specialBonusReason: options.specialBonusReason || '',
        deductions: options.deductions || 0,
        deductionReason: options.deductionReason || ''
      };
      
      // Create the result object
      const result = {
        staff: staffId,
        month,
        year,
        staffCategory: categoryId,
        baseSalary: category.baseSalary,
        performanceMetrics,
        incentiveBreakdown,
        incentivePolicy: policyId,
        calculationDetails: {
          formula: policy.formulaDefinition,
          variableValues: variables
        }
      };
      
      return result;
    } catch (error) {
      console.error('Error calculating incentive:', error);
      throw error;
    }
  }
  
  /**
   * Get completed services for a staff member in a date range
   * @param {string} staffId - Staff member ID
   * @param {Date} startDate - Start date
   * @param {Date} endDate - End date
   * @returns {Promise<Array>} - List of completed services
   */
  static async getStaffCompletedServices(staffId, startDate, endDate) {
    try {
      const services = await Service.find({
        'serviceItems.technicians.technician': staffId,
        'serviceItems.status': 'completed',
        'serviceItems.completionTime': { $gte: startDate, $lte: endDate }
      }).populate('serviceItems.serviceType');
      
      return services;
    } catch (error) {
      console.error('Error getting staff completed services:', error);
      throw error;
    }
  }
  
  /**
   * Calculate performance metrics for a staff member
   * @param {object} staff - Staff member
   * @param {Array} completedServices - Completed services
   * @param {object} monthlyTarget - Monthly target
   * @returns {object} - Performance metrics
   */
  static async calculatePerformanceMetrics(staff, completedServices, monthlyTarget) {
    // Initialize metrics
    const metrics = {
      totalCreditPoints: 0,
      completedServices: 0,
      targetAchievementPercentage: 0,
      serviceTypeBreakdown: []
    };
    
    // Process each service
    for (const service of completedServices) {
      for (const serviceItem of service.serviceItems) {
        // Find if this staff member was assigned to this service item
        const technicianInfo = serviceItem.technicians.find(
          tech => tech.technician.toString() === staff._id.toString()
        );
        
        if (technicianInfo && serviceItem.status === 'completed') {
          const serviceType = serviceItem.serviceType;
          
          // Add to total credit points
          metrics.totalCreditPoints += technicianInfo.creditPoints || 0;
          
          // Increment completed services count
          metrics.completedServices++;
          
          // Update service type breakdown
          const existingBreakdown = metrics.serviceTypeBreakdown.find(
            item => item.serviceType.toString() === serviceType._id.toString()
          );
          
          if (existingBreakdown) {
            existingBreakdown.count++;
            existingBreakdown.creditPoints += technicianInfo.creditPoints || 0;
          } else {
            metrics.serviceTypeBreakdown.push({
              serviceType: serviceType._id,
              count: 1,
              creditPoints: technicianInfo.creditPoints || 0
            });
          }
        }
      }
    }
    
    // Calculate target achievement percentage
    if (monthlyTarget && monthlyTarget.targetCreditPoints > 0) {
      metrics.targetAchievementPercentage = 
        (metrics.totalCreditPoints / monthlyTarget.targetCreditPoints) * 100;
    }
    
    return metrics;
  }
  
  /**
   * Calculate base incentive using the policy formula
   * @param {object} variables - Formula variables
   * @param {object} policy - Incentive policy
   * @returns {number} - Base incentive amount
   */
  static calculateBaseIncentive(variables, policy) {
    try {
      // Use mathjs to safely evaluate the formula
      const formula = policy.formulaDefinition;
      
      // Create a scope with all the variables
      const scope = { ...variables };
      
      // Evaluate the formula
      const result = mathjs.evaluate(formula, scope);
      
      return Math.max(0, result); // Ensure non-negative result
    } catch (error) {
      console.error('Error calculating base incentive:', error);
      return 0;
    }
  }
  
  /**
   * Calculate target bonus based on achievement
   * @param {object} performanceMetrics - Staff performance metrics
   * @param {object} monthlyTarget - Monthly target
   * @returns {number} - Target bonus amount
   */
  static calculateTargetBonus(performanceMetrics, monthlyTarget) {
    try {
      const { bonus } = monthlyTarget.calculateBonus(performanceMetrics.totalCreditPoints);
      return bonus;
    } catch (error) {
      console.error('Error calculating target bonus:', error);
      return 0;
    }
  }
  
  /**
   * Calculate service type bonus
   * @param {Array} serviceTypeBreakdown - Service type breakdown
   * @param {Array} serviceTypeTargets - Service type targets
   * @param {object} policy - Incentive policy
   * @returns {number} - Service type bonus amount
   */
  static calculateServiceTypeBonus(serviceTypeBreakdown, serviceTypeTargets, policy) {
    try {
      let bonus = 0;
      
      // Process each service type
      for (const serviceType of serviceTypeBreakdown) {
        // Find the target for this service type
        const target = serviceTypeTargets.find(
          t => t.serviceType.toString() === serviceType.serviceType.toString()
        );
        
        if (target && serviceType.count > target.targetCount) {
          // Calculate excess services
          const excess = serviceType.count - target.targetCount;
          
          // Calculate bonus for this service type
          const serviceTypeBonus = excess * target.bonusPerExcess;
          
          // Find multiplier for this service type if exists
          const multiplierInfo = policy.serviceTypeMultipliers.find(
            m => m.serviceType.toString() === serviceType.serviceType.toString()
          );
          
          const multiplier = multiplierInfo ? multiplierInfo.multiplier : 1.0;
          
          // Add to total bonus with multiplier
          bonus += serviceTypeBonus * multiplier;
        }
      }
      
      return bonus;
    } catch (error) {
      console.error('Error calculating service type bonus:', error);
      return 0;
    }
  }
  
  /**
   * Create or update monthly salary record
   * @param {object} incentiveData - Calculated incentive data
   * @param {string} actionBy - User ID of person performing the action
   * @returns {Promise<object>} - Monthly salary record
   */
  static async saveIncentiveData(incentiveData, actionBy) {
    try {
      // Check if a record already exists
      let monthlySalary = await MonthlySalary.findOne({
        staff: incentiveData.staff,
        month: incentiveData.month,
        year: incentiveData.year
      });
      
      if (monthlySalary) {
        // Update existing record
        Object.assign(monthlySalary, incentiveData);
        monthlySalary.updatedBy = actionBy;
      } else {
        // Create new record
        monthlySalary = new MonthlySalary({
          ...incentiveData,
          createdBy: actionBy,
          updatedBy: actionBy
        });
      }
      
      await monthlySalary.save();
      return monthlySalary;
    } catch (error) {
      console.error('Error saving incentive data:', error);
      throw error;
    }
  }
  
  /**
   * Calculate incentives for all staff in a category for a specific month
   * @param {string} categoryId - Staff category ID
   * @param {number} month - Month (1-12)
   * @param {number} year - Year
   * @param {string} policyId - Incentive policy ID
   * @param {string} actionBy - User ID of person performing the action
   * @returns {Promise<Array>} - List of calculated incentives
   */
  static async calculateCategoryIncentives(categoryId, month, year, policyId, actionBy) {
    try {
      // Get all active staff in this category
      const staffList = await User.find({
        primaryServiceCategory: categoryId,
        status: 'active'
      });
      
      const results = [];
      
      // Calculate incentive for each staff member
      for (const staff of staffList) {
        try {
          const incentiveData = await this.calculateStaffIncentive(
            staff._id,
            month,
            year,
            categoryId,
            policyId
          );
          
          // Save the incentive data
          const savedRecord = await this.saveIncentiveData(incentiveData, actionBy);
          results.push(savedRecord);
        } catch (error) {
          console.error(`Error calculating incentive for staff ${staff._id}:`, error);
          // Continue with next staff member
        }
      }
      
      return results;
    } catch (error) {
      console.error('Error calculating category incentives:', error);
      throw error;
    }
  }
}

module.exports = IncentiveCalculationService;