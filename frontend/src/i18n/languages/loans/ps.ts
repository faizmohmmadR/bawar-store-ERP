export const loansPs = {
  editPayment: "د تادیې سمون",
  paymentDate: "د تادیې نېټه",
  viewBill: "بل وګورئ",
  searchPayments: "د نوم، بل، مرجع یا یادښت له مخې لټون…",
  paymentValidation: "مثبت مبلغ تر دوو اعشاري رقمونو پورې او د پاتې پور په اندازه ولیکئ او د تادیې نېټه وټاکئ.",
  reportTitle: "د پورونو راپور",
  reportHint: "پورونه چې زه یې غواړم او پورونه چې له ما غوښتل کیږي — مجموعه، تادیه شوي او بیلانس",
  reportLoadError: "د پورونو راپور پورته نه شو.",
  reportByCurrency: "د اسعارو له مخې پورونه",
  reportByCurrencyHint: "د هر اسعار اصلي مبلغونه — نه مخلوط کیږي",
  reportNoData: "په دې دوره کې د پور فعالیت نشته",
  reportOwedToMe: "پورونه چې زه یې غواړم",
  reportOwedToMeHint: "پیسې چې نورو له تاسو پور اخیستي",
  reportIOwe: "پورونه چې له ما غوښتل کیږي",
  reportIOweHint: "پیسې چې تاسو له نورو پور اخیستي",
  reportTotal: "مجموعه",
  reportPaid: "تادیه شوي",
  reportBalance: "بیلانس",
  // Main titles
  title: "د پورونو مدیریت",
  subtitle: "د اخیستل شوي او ورکړل شوي پورونو مدیریت د جامع تعقیب سره",
  
  // Actions
  addLoan: "پور اضافه کړئ",
  editLoan: "پور تصحیح کړئ",
  deleteLoan: "پور حذف کړئ",
  loanDetails: "د پور تفصیلات",
  loanerInformation: "د پور ورکوونکي معلومات",
  loanInformation: "د پور معلومات",
  
  // Form fields
  loaner: "پور ورکوونکی",
  amount: "اندازه",
  loanType: "د پور ډول",
  currency: "اسعار",
  loanDate: "د پور نیټه",
  billNumber: "د بل شمیره",
  billFile: "د بل فایل",
  notes: "یادښتونه",
  statusLabel: "حالت",
  
  // Placeholders
  selectLoaner: "پور ورکوونکی انتخاب کړئ",
  selectCurrency: "اسعار انتخاب کړئ",
  enterAmount: "اندازه دننه کړئ",
  enterBillNumber: "د بل شمیره دننه کړئ",
  enterNotes: "یادښتونه دننه کړئ...",
  searchPlaceholder: "پورونه ولټوئ...",
  
  // Loan types
  type: {
    loanIn: "اخیستل شوی پور",
    loanOut: "ورکړل شوی پور"
  },
  
  // Status options
  status: {
    paid: "تادیه شوی",
    unpaid: "نه تادیه شوی"
  },
  
  // Filters
  allTypes: "ټول ډولونه",
  allStatuses: "ټول حالتونه",
  
  // Statistics
  stats: {
    totalLoanIn: "ټول اخیستل شوی پور",
    totalLoanOut: "ټول ورکړل شوی پور",
    netBalance: "خالص بیلانس",
    unpaidLoanIn: "نه تادیه شوی اخیستل شوی پور",
    unpaidLoanOut: "نه تادیه شوی ورکړل شوی پور",
    totalLoans: "ټول پورونه"
  },
  
  // Validation messages
  validation: {
    loaner: "پور ورکوونکی اړین دی",
    amount: "اندازه باید له 0 څخه ډیره وي",
    currency: "اسعار اړین دی",
    loanerName: "د پور ورکوونکي نوم اړین دی",
    customer: "پیرودونکی اړین دی",
    vendor: "عرضه کوونکی اړین دی",
    amountPaidNegative: "تادیه شوی مقدار منفي نشي کیدی",
    amountPaidExceeds: "تادیه شوی مقدار نشي کولی د پور مقدار څخه زیات وي",
  },
  
  // Success/Error messages
  addSuccess: "پور په بریالیتوب سره اضافه شو",
  updateSuccess: "پور په بریالیتوب سره تازه شو",
  deleteSuccess: "پور په بریالیتوب سره حذف شو",
  markPaidSuccess: "پور د تادیه شوي په توګه نښه شو",
  markUnpaidSuccess: "پور د نه تادیه شوي په توګه نښه شو",
  confirmDelete: "ایا تاسو ډاډه یاست چې غواړئ دا پور حذف کړئ؟",
  
  // Empty states
  noRecords: "د پور هیڅ ریکارډ ونه موندل شو",
  noRecordsDesc: "خپل لومړی د پور ریکارډ په اضافه کولو سره پیل وکړئ",
  
  // File upload
  billFileHint: "ملاتړ شوي فارمټونه: PDF, JPG, PNG, DOC, DOCX (تر 10MB پورې)",
  
  // Loaner management
  loanerManagement: "د پور ورکوونکو مدیریت",
  addLoaner: "پور ورکوونکی اضافه کړئ",
  editLoaner: "پور ورکوونکی تصحیح کړئ",
  loanerName: "د پور ورکوونکي نوم",
  loanerPhone: "تلیفون",
  loanerEmail: "بریښنالیک",
  loanerAddress: "پته",
  selectLoanerFirst: "مهرباني وکړئ لومړی یو پور ورکوونکی اضافه کړئ",
  noLoanersAvailable: "هیڅ فعال پور ورکوونکی شتون نلري. مهرباني وکړئ د پور ورکوونکو مدیریت څخه پور ورکوونکي اضافه کړئ.",
  noLoaners: "هیڅ پور ورکوونکی ونه موندل شو",
  noLoanersDesc: "خپل لومړی پور ورکوونکی په اضافه کولو سره پیل وکړئ",
  addFirstLoaner: "لومړی پور ورکوونکی اضافه کړئ",
  searchLoaners: "پور ورکوونکي ولټوئ...",
  loanerAddSuccess: "پور ورکوونکی په بریالیتوب سره اضافه شو",
  loanerUpdateSuccess: "پور ورکوونکی په بریالیتوب سره تازه شو",
  loanerDeleteSuccess: "پور ورکوونکی په بریالیتوب سره حذف شو",
  confirmDeleteLoaner: "ایا تاسو ډاډه یاست چې غواړئ دا پور ورکوونکی حذف کړئ؟",

  loanerType: "د پور ورکوونکي ډول",
  loanerTypes: {
    customer: "پیرودونکی",
    vendor: "عرضه کوونکی",
  },
  selectCustomer: "پیرودونکی وټاکئ",
  selectVendor: "عرضه کوونکی وټاکئ",
  loanerNameOptional: "اختیاري نوم",
  balanceDue: "پاتې پور",
  recordPayment: "تادیه ثبت کړئ",
  paymentAmount: "د تادیې اندازه",
  paymentHistory: "د تادیو تاریخچه",
  paymentSuccess: "تادیه په بریالیتوب ثبت شوه",
  paymentError: "تادیه ثبت نه شوه",
  notFound: "پور ونه موندل شو",
  filterByLoanerType: "د پور ورکوونکي ډول له مخې فلټر",

  // UI Components
  viewDetails: "تفصیلات وګورئ",
  edit: "سمون",
  delete: "حذف",
  manageLoanRecords: "د پور ریکارډونه مدیریت کړئ",
  filterByType: "د ډول له مخې فلټر",
  filterByStatus: "د حالت له مخې فلټر",
  clearFilters: "فلټرونه پاک کړئ",
  tryAdjustingSearch: "خپل لټون بدل کړئ",
  loadingLoans: "پورونه بارېږي...",
  loadingLoaners: "پور ورکوونکي بارېږي...",
  manageLoanerContacts: "د پور ورکوونکو اړیکې مدیریت کړئ",
  deleteLoaner: "پور ورکوونکی حذف",
  markPaid: "د تادیه شوي په توګه نښه کړئ",
  markUnpaid: "د نه تادیه شوي په توګه نښه کړئ",
  customer: "پیرودونکی",
  vendor: "عرضه کوونکی",

  scenario: {
    customerReceivable: "پیرودونکي له ما څخه پور اخیستی (پیرودونکی ما ته پور دی)",
    customerPayable: "زه له پیرودونکي څخه پور اخیستم (زه پیرودونکي ته پور یم)",
    vendorReceivable: "عرضه کوونکی له ما څخه پور اخیستی (عرضه کوونکی ما ته پور دی)",
    vendorPayable: "زه له عرضه کوونکي څخه پور اخیستم (زه عرضه کوونکي ته پور یم)",
  },

  scenarioDesc: {
    customerReceivable:
      "تاسو دې پیرودونکي ته پور ورکړی. پیرودونکی باید تاسو ته بیرته ورکړي — دا ستاسو د سوداګرۍ پور دی.",
    customerPayable:
      "دې پیرودونکي تاسو ته پور ورکړی. تاسو باید پیرودونکي ته بیرته ورکړئ — دا ستاسو پور دی.",
    vendorReceivable:
      "تاسو دې عرضه کوونکي ته پور ورکړی. عرضه کوونکی باید تاسو ته بیرته ورکړي — دا ستاسو پور دی.",
    vendorPayable:
      "دې عرضه کوونکي تاسو ته پور ورکړی. تاسو باید بیرته ورکړئ — دا ستاسو پور دی.",
    loanInGeneric: "د پور په توګه ترلاسه شوی پیسې — تر بیرته ورکولو پورې تاسو پور لرئ.",
    loanOutGeneric: "د پور په توګه ورکړل شوی پیسې — پور اخیستونکی تاسو ته پور دی.",
  },

  direction: {
    weOwe: "موږ پور یو",
    theyOweUs: "موږ ته پور دی",
  },

  loanTypeHelp: "وټاکئ چې چا له چا څخه پور اخیستی. دا ښیې چې تاسو پور لرئ که بل تاسو ته پور دی.",
  loansCount: "پورونه",
  balanceRemaining: "پاتې",
  optional: "اختیاري",
  maximum: "اعظمي",
  referenceShort: "حواله",
  loanPaymentLabel: "د پور تادیه",
  submittingPayment: "ثبتیږي...",
  noPaymentsFound: "هیڅ تادیه ونه موندل شوه",

  loanManagement: "د پورونو مدیریت",
  manageAllLoans: "د پیرودونکو او عرضه کوونکو ټول پورونه مدیریت کړئ",
  customerReceivable: "له پیرودونکو پور (پیرودونکي موږ ته پور دي)",
  customerPayable: "پیرودونکو ته پور (موږ پیرودونکو ته پور یو)",
  vendorReceivable: "له عرضه کوونکو پور (عرضه کوونکي موږ ته پور دي)",
  vendorPayable: "عرضه کوونکو ته پور (موږ عرضه کوونکو ته پور یو)",
  iOweCustomers: "موږ پیرودونکو ته پور یو",
  customersOweMe: "پیرودونکي موږ ته پور دي",
  iOweVendors: "موږ عرضه کوونکو ته پور یو",
  vendorsOweMe: "عرضه کوونکي موږ ته پور دي",
  noLoansFound: "پور ونه موندل شو",
  loanRecords: "د پورونو ثبتونه",
  totalAmount: "ټوله اندازه",
  paid: "تادیه شوی",
  unpaid: "نه تادیه شوی",
  view: "کتنه",

  loanPayments: "د پور تادیو مدیریت",
  manageLoanPayments: "د پور تادیې ثبت او تعقیب کړئ",
  totalLoans: "ټول پورونه",
  unpaidLoans: "نه تادیه شوي پورونه",
  totalPayments: "ټولې تادیې",
  allLoans: "ټول پورونه",
  customers: "پیرودونکي",
  vendors: "عرضه کوونکي",
  allLoanPayments: "ټولې د پور تادیې",
  addPayment: "تادیه اضافه کړئ",
  addPaymentDesc: "د پور لپاره تادیه:",
  referenceNumber: "د حوالې شمیره",
  submitPayment: "تادیه ثبت کړئ",
  paymentAdded: "تادیه په بریالیتوب سره اضافه شوه",
  paymentFailed: "تادیه ثبت نه شوه",

  enterLoanerName: "د پور ورکوونکي نوم دننه کړئ",
  enterPhone: "د تلیفون شمیره دننه کړئ",
  enterEmail: "بریښنالیک دننه کړئ",
  enterAddress: "پته دننه کړئ",
  enterPaymentNotes: "د تادیې یادښتونه دننه کړئ (اختیاري)",

  fallbackCurrencySymbol: "؋",
  fallbackCurrencyCode: "AFN",

  amountPaid: "تادیه شوی",

  openingBalance: "پخوانۍ پور / مخکې له سیستم",
  openingBalanceShort: "پخوانی",
  openingBalanceDesc:
    "پور مخکې له دې سیستم څخه و. یوازې هغه اضافه کړئ چې لا پور پاتې دی. بشپړ تادیه شوی پور مه اضافه کوئ.",
  remainingBalance: "پاتې پور",
  remainingBalanceHint: "یوازې هغه مقدار ولیکئ چې نن لا پاتې دی.",
  paymentAccount: "تادیه له / ترلاسه په",
  accountIncreases: "دا حساب زیاتېږي (پیسې دننه)",
  accountDecreases: "دا حساب کمېږي (پیسې بهر)",
};
