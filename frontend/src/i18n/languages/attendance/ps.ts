export const attendancePs = {
  // Main titles
  title: "د حاضرۍ مدیریت",
  subtitle: "د کارمندانو حاضري او وخت تعقیب اداره کړئ",
  attendanceRecords: "د حاضرۍ ریکارډونه",
  
  // Actions
  addAttendance: "حاضري اضافه کړئ",
  editAttendance: "حاضري تصحیح کړئ",
  deleteAttendance: "حاضري حذف کړئ",
  export: "صادرول",
  import: "له وسیلې څخه واردول",
  bulkImport: "ډله ییز واردول",
  
  // Form fields
  employee: "کارمند",
  date: "نیټه",
  dateRange: "د نیټې حد",
  checkInTime: "د ننوتلو وخت",
  checkOutTime: "د وتلو وخت",
  notes: "یادښتونه",
  workHours: "د کار ساعتونه",
  overtimeHours: "اضافي کار ساعتونه",
  breakTime: "د استراحت وخت",
  deviceId: "د وسیلې پیژندنه",
  employeeDeviceId: "په وسیله کې د کارمند پیژندنه",
  verificationType: "د تایید ډول",
  
  // Placeholders
  selectEmployee: "کارمند انتخاب کړئ",
  deviceIdPlaceholder: "د ZKTeco وسیلې پیژندنه دننه کړئ",
  employeeDeviceIdPlaceholder: "په وسیله کې د کارمند پیژندنه",
  notesPlaceholder: "اضافي یادښتونه دننه کړئ...",
  searchPlaceholder: "کارمندان ولټوئ...",
  
  // Status options
  status: {
    present: "حاضر",
    absent: "غایب",
    leave: "رخصتي",
    holiday: "رخصتي",
    late: "ناوخته"
  },
  
  // Verification types
  verification: {
    fingerprint: "د ګوتې نښه",
    face: "د مخ پیژندنه",
    card: "کارت",
    password: "پټنوم",
    manual: "لاسي ننوتل"
  },
  
  // Summary
  summary: {
    totalEmployees: "ټول کارمندان",
    present: "حاضر",
    absent: "غایب",
    onLeave: "رخصتي",
    late: "ناوخته",
    attendanceRate: "د حاضرۍ کچه"
  },
  
  // Filters
  filters: "فلټرونه",
  allStatuses: "ټول حالتونه",
  search: "لټون",
  
  // Validation messages
  validation: {
    employee: "کارمند اړین دی",
    date: "نیټه اړینه ده",
    checkInTime: "د حاضر حالت لپاره د ننوتلو وخت اړین دی"
  },
  
  // Success/Error messages
  addSuccess: "د حاضرۍ ریکارډ په بریالیتوب سره اضافه شو",
  updateSuccess: "د حاضرۍ ریکارډ په بریالیتوب سره تازه شو",
  deleteSuccess: "د حاضرۍ ریکارډ په بریالیتوب سره حذف شو",
  confirmDelete: "ایا تاسو ډاډه یاست چې غواړئ دا د حاضرۍ ریکارډ حذف کړئ؟",
  
  // Empty states
  noRecords: "د حاضرۍ هیڅ ریکارډ ونه موندل شو",
  
  // Date ranges
  today: "نن",
  thisWeek: "دا اونۍ",
  thisMonth: "دا میاشت",
  
  // Time tracking
  checkIn: "ننوتل",
  checkOut: "وتل",
  totalHours: "ټول ساعتونه",
  
  // Leave management
  leaveManagement: "د رخصتۍ مدیریت",
  leaveRequests: "د رخصتۍ غوښتنې",
  addLeaveRequest: "د رخصتۍ غوښتنه اضافه کړئ",
  editLeaveRequest: "د رخصتۍ غوښتنه تصحیح کړئ",
  startDate: "د پیل نیټه",
  endDate: "د پای نیټه",
  reason: "دلیل",
  leaveStatus: {
    pending: "په انتظار کې",
    approved: "تایید شوی",
    rejected: "رد شوی"
  },
  approveLeave: "تایید",
  rejectLeave: "رد",
  leaveDuration: "موده",
  
  // Device integration
  deviceIntegration: "د وسیلې یوځای کول",
  syncWithDevice: "د ZKTeco وسیلې سره همغږي کول",
  lastSync: "وروستۍ همغږي",
  deviceStatus: "د وسیلې حالت",
  connected: "وصل شوی",
  disconnected: "قطع شوی"
};
