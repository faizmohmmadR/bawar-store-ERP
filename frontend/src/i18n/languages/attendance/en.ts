export const attendanceEn = {
  // Main titles
  title: "Attendance Management",
  subtitle: "Manage employee attendance and time tracking",
  attendanceRecords: "Attendance Records",
  
  // Actions
  addAttendance: "Add Attendance",
  editAttendance: "Edit Attendance",
  deleteAttendance: "Delete Attendance",
  export: "Export",
  import: "Import from Device",
  bulkImport: "Bulk Import",
  
  // Form fields
  employee: "Employee",
  date: "Date",
  dateRange: "Date Range",
  checkInTime: "Check-in Time",
  checkOutTime: "Check-out Time",
  notes: "Notes",
  workHours: "Work Hours",
  overtimeHours: "Overtime Hours",
  breakTime: "Break Time",
  deviceId: "Device ID",
  employeeDeviceId: "Employee Device ID",
  verificationType: "Verification Type",
  
  // Placeholders
  selectEmployee: "Select Employee",
  deviceIdPlaceholder: "Enter ZKTeco device ID",
  employeeDeviceIdPlaceholder: "Employee ID in device",
  notesPlaceholder: "Enter additional notes...",
  searchPlaceholder: "Search employees...",
  
  // Status options
  status: {
    present: "Present",
    absent: "Absent",
    leave: "On Leave",
    holiday: "Holiday",
    late: "Late"
  },
  
  // Verification types
  verification: {
    fingerprint: "Fingerprint",
    face: "Face Recognition",
    card: "Card",
    password: "Password",
    manual: "Manual Entry"
  },
  
  // Summary
  summary: {
    totalEmployees: "Total Employees",
    present: "Present",
    absent: "Absent",
    onLeave: "On Leave",
    late: "Late",
    attendanceRate: "Attendance Rate"
  },
  
  // Filters
  filters: "Filters",
  allStatuses: "All Statuses",
  search: "Search",
  
  // Validation messages
  validation: {
    employee: "Employee is required",
    date: "Date is required",
    checkInTime: "Check-in time is required for present status"
  },
  
  // Success/Error messages
  addSuccess: "Attendance record added successfully",
  updateSuccess: "Attendance record updated successfully",
  deleteSuccess: "Attendance record deleted successfully",
  confirmDelete: "Are you sure you want to delete this attendance record?",
  
  // Empty states
  noRecords: "No attendance records found",
  
  // Date ranges
  today: "Today",
  thisWeek: "This Week",
  thisMonth: "This Month",
  
  // Time tracking
  checkIn: "Check In",
  checkOut: "Check Out",
  totalHours: "Total Hours",
  
  // Leave management
  leaveManagement: "Leave Management",
  leaveRequests: "Leave Requests",
  addLeaveRequest: "Add Leave Request",
  editLeaveRequest: "Edit Leave Request",
  startDate: "Start Date",
  endDate: "End Date",
  reason: "Reason",
  leaveStatus: {
    pending: "Pending",
    approved: "Approved",
    rejected: "Rejected"
  },
  approveLeave: "Approve",
  rejectLeave: "Reject",
  leaveDuration: "Duration",
  
  // Device integration
  deviceIntegration: "Device Integration",
  syncWithDevice: "Sync with ZKTeco Device",
  lastSync: "Last Sync",
  deviceStatus: "Device Status",
  connected: "Connected",
  disconnected: "Disconnected"
};