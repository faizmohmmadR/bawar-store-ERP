export const loansFa = {
  editPayment: "تعدیل پرداخت",
  paymentDate: "تاریخ پرداخت",
  viewBill: "مشاهده بل",
  searchPayments: "جستجو با نام، شماره بل، مرجع یا یادداشت…",
  paymentValidation: "مبلغ مثبت با حداکثر دو رقم اعشار و در حد باقی‌مانده قرض وارد کنید و تاریخ پرداخت را انتخاب کنید.",
  reportTitle: "گزارش قرضه‌ها",
  reportHint: "قرض‌هایی که از دیگران می‌خواهید و قرض‌هایی که از شما می‌خواهند — مجموع، پرداخته‌شده و بیلانس",
  reportLoadError: "گزارش قرضه‌ها بارگیری نشد.",
  reportByCurrency: "قرضه بر اساس ارز",
  reportByCurrencyHint: "مبالغ بومی هر ارز — بدون مخلوط کردن",
  reportNoData: "فعالیت قرضه‌ای در این دوره نیست",
  reportOwedToMe: "قرض‌هایی که از دیگران می‌خواهم",
  reportOwedToMeHint: "پولی که دیگران از شما قرض گرفته‌اند",
  reportIOwe: "قرض‌هایی که از من می‌خواهند",
  reportIOweHint: "پولی که شما از دیگران قرض گرفته‌اید",
  reportTotal: "مجموع",
  reportPaid: "پرداخته‌شده",
  reportBalance: "بیلانس",
  // Main titles
  title: "مدیریت قرضه‌ها",
  subtitle: "مدیریت قرضه‌های دریافتی و پرداختی با ردیابی جامع",
  loanRecords: "سوابق قرضه",
  
  // Actions
  addLoan: "افزودن قرضه",
  loanDetails: "جزئیات قرضه",
  markPaid: "علامتگذاری به عنوان پرداخت شده",
  markUnpaid: "علامتگذاری به عنوان پرداخت نشده",
  loanerInformation: "معلومات قرضه‌دهنده",
  loanInformation: "معلومات قرضه",
  
  // Form fields
  loaner: "قرضه‌دهنده",
  amount: "مبلغ",
  loanType: "نوع قرضه",
  currency: "ارز",
  loanDate: "تاریخ قرضه",
  billNumber: "شماره بل",
  billFile: "فایل بل",
  notes: "یادداشتها",
  statusLabel: "وضعیت",
  
  // Placeholders
  selectLoaner: "قرضه‌دهنده را انتخاب کنید",
  selectCurrency: "ارز را انتخاب کنید",
  enterAmount: "مبلغ را وارد کنید",
  enterBillNumber: "شماره بل را وارد کنید",
  enterNotes: "یادداشتها را وارد کنید...",
  searchPlaceholder: "جستجوی قرضه‌ها...",
  
  // Loan types
  type: {
    loanIn: "قرضه دریافتی",
    loanOut: "قرضه پرداختی"
  },
  
  // Status options
  status: {
    paid: "پرداخت شده",
    unpaid: "پرداخت نشده"
  },
  
  // Filters
  allTypes: "همه انواع",
  allStatuses: "همه وضعیتها",
  
  // Statistics
  stats: {
    totalLoanIn: "کل قرضه دریافتی",
    totalLoanOut: "کل قرضه پرداختی",
    netBalance: "باقی‌مانده خالص",
    unpaidLoanIn: "قرضه دریافتی پرداخت نشده",
    unpaidLoanOut: "قرضه پرداختی پرداخت نشده",
    totalLoans: "کل قرضه‌ها"
  },
  
  // Validation messages
  validation: {
    loaner: "قرضه‌دهنده الزامی است",
    amount: "مبلغ باید بیشتر از 0 باشد",
    currency: "ارز الزامی است",
    loanerName: "نام قرضه‌دهنده الزامی است",
    customer: "مشتری الزامی است",
    vendor: "فروشنده الزامی است",
    amountPaidNegative: "مبلغ پرداخت شده نمی‌تواند منفی باشد",
    amountPaidExceeds: "مبلغ پرداخت شده نمی‌تواند از مبلغ قرض بیشتر باشد",
  },
  
  // Success/Error messages
  addSuccess: "قرضه با موفقیت اضافه شد",
  updateSuccess: "قرضه با موفقیت بهروزرسانی شد",
  deleteSuccess: "قرضه با موفقیت حذف شد",
  markPaidSuccess: "قرضه به عنوان پرداخت شده علامتگذاری شد",
  markUnpaidSuccess: "قرضه به عنوان پرداخت نشده علامتگذاری شد",
  confirmDelete: "آیا مطمئن هستید که میخواهید این قرضه را حذف کنید؟",
  
  // Empty states
  noRecords: "هیچ سابقه قرضه‌ای یافت نشد",
  noRecordsDesc: "با افزودن اولین سابقه قرضه خود شروع کنید",
  
  // File upload
  billFileHint: "فرمتهای پشتیبانی شده: PDF, JPG, PNG, DOC, DOCX (حداکثر 10MB)",
  
  // Loaner management
  loanerManagement: "مدیریت قرضه‌دهندگان",
  addLoaner: "افزودن قرضه‌دهنده",
  loanerName: "نام قرضه‌دهنده",
  loanerPhone: "تلیفون",
  loanerEmail: "ایمیل",
  loanerAddress: "آدرس",
  selectLoanerFirst: "لطفاً ابتدا یک قرضه‌دهنده اضافه کنید",
  noLoanersAvailable: "هیچ قرضه‌دهنده فعالی در دسترس نیست. لطفاً از مدیریت قرضه‌دهندگان، قرضه‌دهنده اضافه کنید.",
  noLoaners: "هیچ قرضه‌دهنده‌ای یافت نشد",
  noLoanersDesc: "با افزودن اولین قرضه‌دهنده خود شروع کنید",
  addFirstLoaner: "افزودن اولین قرضه‌دهنده",
  searchLoaners: "جستجوی قرضه‌دهندگان...",
  loanerAddSuccess: "قرضه‌دهنده با موفقیت اضافه شد",
  loanerUpdateSuccess: "قرضه‌دهنده با موفقیت بهروزرسانی شد",
  loanerDeleteSuccess: "قرضه‌دهنده با موفقیت حذف شد",
  confirmDeleteLoaner: "آیا مطمئن هستید که میخواهید این قرضه‌دهنده را حذف کنید؟",
  
  // UI Components
  viewDetails: "مشاهده جزئیات",
  edit: "تعدیل",
  delete: "حذف",
  editLoan: "تعدیل قرضه",
  deleteLoan: "حذف قرضه",
  editLoaner: "تعدیل قرضه‌دهنده",
  deleteLoaner: "حذف قرضه‌دهنده",
  manageLoanRecords: "مدیریت سوابق قرضه",
  manageLoanerContacts: "مدیریت مخاطبین قرضه‌دهنده",
  filterByType: "فیلتر بر اساس نوع",
  filterByStatus: "فیلتر بر اساس وضعیت",
  clearFilters: "پاک کردن فیلترها",
  tryAdjustingSearch: "عبارات جستجو را تنظیم کنید",
  loadingLoans: "در حال بارگذاری قرضه‌ها...",
  loadingLoaners: "در حال بارگذاری قرضه‌دهندگان...",

  loanerType: "نوع قرضه‌دهنده",
  loanerTypes: {
    customer: "مشتری",
    vendor: "فروشنده",
  },
  selectCustomer: "انتخاب مشتری",
  selectVendor: "انتخاب فروشنده",
  customer: "مشتری",
  vendor: "فروشنده",
  loanerNameOptional: "نام نمایشی (اختیاری)",
  balanceDue: "باقی‌مانده بدهی",
  recordPayment: "ثبت پرداخت",
  paymentAmount: "مبلغ پرداخت",
  paymentHistory: "تاریخچه پرداختها",
  paymentSuccess: "پرداخت با موفقیت ثبت شد",
  paymentError: "ثبت پرداخت ناموفق بود",
  notFound: "قرضه یافت نشد",
  filterByLoanerType: "فیلتر بر اساس نوع قرضه‌دهنده",

  scenario: {
    customerReceivable: "قرضی که مشتری از من گرفته (مشتری به من بدهکار است)",
    customerPayable: "قرضی که من از مشتری گرفته‌ام (من به مشتری بدهکارم)",
    vendorReceivable: "قرضی که فروشنده از من گرفته (فروشنده به من بدهکار است)",
    vendorPayable: "قرضی که من از فروشنده گرفته‌ام (من به فروشنده بدهکارم)",
  },

  scenarioDesc: {
    customerReceivable:
      "شما به این مشتری قرض داده‌اید. مشتری باید به شما بازپرداخت کند — این مبلغ به نفع کسب‌وکار شماست.",
    customerPayable:
      "این مشتری به شما قرض داده است. شما باید به مشتری بازپرداخت کنید — این بدهی شماست.",
    vendorReceivable:
      "شما به این فروشنده قرض داده‌اید. فروشنده باید به شما بازپرداخت کند — این مبلغ به نفع شماست.",
    vendorPayable:
      "این فروشنده به شما قرض داده است (مثلاً اعتبار یا پیش‌پرداخت). شما باید بازپرداخت کنید — این بدهی شماست.",
    loanInGeneric: "پول دریافتی به‌عنوان قرض — ممکن است تا بازپرداخت به لندقرض‌دار بدهکار باشید.",
    loanOutGeneric: "پول پرداختی به‌عنوان قرض — قرض‌گیرنده تا بازپرداخت به شما بدهکار است.",
  },

  direction: {
    weOwe: "ما بدهکاریم",
    theyOweUs: "به ما بدهکارند",
  },

  loanTypeHelp: "مشخص کنید چه کسی از چه کسی قرض گرفته. این تعیین می‌کند شما طلبکارید یا بدهکار.",
  loansCount: "قرض",
  balanceRemaining: "باقی‌مانده",
  optional: "اختیاری",
  maximum: "حداکثر",
  referenceShort: "مرجع",
  loanPaymentLabel: "پرداخت قرض",
  submittingPayment: "در حال ثبت...",
  noPaymentsFound: "هیچ پرداختی یافت نشد",

  // Loan Management Dashboard
  loanManagement: "مدیریت جامع قرضه‌ها",
  manageAllLoans: "مدیریت تمام قرضه‌های مشتریان و فروشندگان",
  customerReceivable: "قرض از مشتریان (مشتریان به من بدهکار)",
  customerPayable: "قرض به مشتریان (من به مشتریان بدهکار)",
  vendorReceivable: "قرض از فروشندگان (فروشندگان به من بدهکار)",
  vendorPayable: "قرض به فروشندگان (من به فروشندگان بدهکار)",
  iOweCustomers: "من به مشتریان بدهکارم",
  customersOweMe: "مشتریان به من بدهکارند",
  iOweVendors: "من به فروشندگان بدهکارم",
  vendorsOweMe: "فروشندگان به من بدهکارند",
  noLoansFound: "هیچ قرضی یافت نشد",
  totalAmount: "کل مبلغ",
  paid: "پرداخت شده",
  unpaid: "پرداخت نشده",
  view: "مشاهده",

  // Loan Payments Page
  loanPayments: "مدیریت پرداخت قرضه‌ها",
  manageLoanPayments: "ثبت و پیگیری پرداختهای قرض",
  totalLoans: "کل قرضه‌ها",
  unpaidLoans: "قرضه‌های پرداخت نشده",
  totalPayments: "کل پرداختها",
  allLoans: "همه قرضه‌ها",
  customers: "مشتریان",
  vendors: "فروشندگان",
  allLoanPayments: "همه پرداختهای قرض",
  addPayment: "افزودن پرداخت",
  addPaymentDesc: "پرداخت برای قرض:",
  referenceNumber: "شماره مرجع",
  submitPayment: "ثبت پرداخت",
  paymentAdded: "پرداخت با موفقیت اضافه شد",
  paymentFailed: "ثبت پرداخت ناموفق",

  enterLoanerName: "نام قرضه‌دهنده را وارد کنید",
  enterPhone: "شماره تلیفون را وارد کنید",
  enterEmail: "آدرس ایمیل را وارد کنید",
  enterAddress: "آدرس را وارد کنید",
  enterPaymentNotes: "یادداشت پرداخت را وارد کنید (اختیاری)",

  fallbackCurrencySymbol: "؋",
  fallbackCurrencyCode: "AFN",

  amountPaid: "پرداخت شده",

  openingBalance: "قرض سابقه / قبل از سیستم",
  openingBalanceShort: "سابقه",
  openingBalanceDesc:
    "قرض قبل از این سیستم بوده. فقط وقتی اضافه کنید که هنوز پول بدهکار است. قرض تمام‌شده را اضافه نکنید.",
  remainingBalance: "باقی‌مانده بدهی",
  remainingBalanceHint: "فقط مبلغی را وارد کنید که هنوز بدهکار است.",
  paymentAccount: "پرداخت از / دریافت در",
  accountIncreases: "این حساب افزایش می‌یابد (ورود پول)",
  accountDecreases: "این حساب کاهش می‌یابد (خروج پول)",
};
