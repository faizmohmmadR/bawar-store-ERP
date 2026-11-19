export const attendanceFa = {
  // Main titles
  title: "مدیریت حاضری",
  subtitle: "مدیریت حاضری و ردیابی زمان کارمندان",
  attendanceRecords: "سوابق حاضری",
  
  // Actions
  addAttendance: "افزودن حضور",
  editAttendance: "تعدیل حضور",
  deleteAttendance: "حذف حضور",
  export: "خروجی",
  import: "وارد کردن از دستگاه",
  bulkImport: "وارد کردن دستهجمعی",
  
  // Form fields
  employee: "کارمند",
  date: "تاریخ",
  dateRange: "بازه زمانی",
  checkInTime: "زمان ورود",
  checkOutTime: "زمان خروج",
  notes: "یادداشتها",
  workHours: "ساعات کار",
  overtimeHours: "ساعات اضافهکاری",
  breakTime: "زمان استراحت",
  deviceId: "شناسه دستگاه",
  employeeDeviceId: "شناسه کارمند در دستگاه",
  verificationType: "نوع تایید",
  
  // Placeholders
  selectEmployee: "کارمند را انتخاب کنید",
  deviceIdPlaceholder: "شناسه دستگاه ZKTeco را وارد کنید",
  employeeDeviceIdPlaceholder: "شناسه کارمند در دستگاه",
  notesPlaceholder: "یادداشتهای اضافی را وارد کنید...",
  searchPlaceholder: "جستجوی کارمندان...",
  
  // Status options
  status: {
    present: "حاضر",
    absent: "غایب",
    leave: "رخصتی",
    holiday: "تعطیل",
    late: "تاخیر"
  },
  
  // Verification types
  verification: {
    fingerprint: "اثر انگشت",
    face: "تشخیص چهره",
    card: "کارت",
    password: "رمز عبور",
    manual: "ورود دستی"
  },
  
  // Summary
  summary: {
    totalEmployees: "کل کارمندان",
    present: "حاضر",
    absent: "غایب",
    onLeave: "رخصتی",
    late: "تاخیر",
    attendanceRate: "نرخ حضور"
  },
  
  // Filters
  filters: "فیلترها",
  allStatuses: "همه وضعیتها",
  search: "جستجو",
  
  // Validation messages
  validation: {
    employee: "کارمند الزامی است",
    date: "تاریخ الزامی است",
    checkInTime: "زمان ورود برای وضعیت حاضر الزامی است"
  },
  
  // Success/Error messages
  addSuccess: "سابقه حضور با موفقیت اضافه شد",
  updateSuccess: "سابقه حضور با موفقیت بهروزرسانی شد",
  deleteSuccess: "سابقه حضور با موفقیت حذف شد",
  confirmDelete: "آیا مطمئن هستید که میخواهید این سابقه حضور را حذف کنید؟",
  
  // Empty states
  noRecords: "هیچ سابقه حضوری یافت نشد",
  
  // Date ranges
  today: "امروز",
  thisWeek: "این هفته",
  thisMonth: "این ماه",
  
  // Time tracking
  checkIn: "ورود",
  checkOut: "خروج",
  totalHours: "کل ساعات",
  
  // Leave management
  leaveManagement: "مدیریت رخصتی",
  leaveRequests: "درخواستهای رخصتی",
  addLeaveRequest: "افزودن درخواست رخصتی",
  editLeaveRequest: "تعدیل درخواست رخصتی",
  startDate: "تاریخ شروع",
  endDate: "تاریخ پایان",
  reason: "دلیل",
  leaveStatus: {
    pending: "در انتظار",
    approved: "تایید شده",
    rejected: "رد شده"
  },
  approveLeave: "تایید",
  rejectLeave: "رد",
  leaveDuration: "مدت",
  
  // Device integration
  deviceIntegration: "یکپارچهسازی دستگاه",
  syncWithDevice: "همگامسازی با دستگاه ZKTeco",
  lastSync: "آخرین همگامسازی",
  deviceStatus: "وضعیت دستگاه",
  connected: "متصل",
  disconnected: "قطع شده"
};
