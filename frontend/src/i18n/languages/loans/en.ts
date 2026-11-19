export const loansEn = {
  editPayment: "Edit Payment",
  paymentDate: "Payment Date",
  viewBill: "View Bill",
  searchPayments: "Search by person, bill, reference or notes…",
  paymentValidation: "Enter a positive amount with up to two decimal places, within the remaining balance, and choose a payment date.",
  reportTitle: "Loans Report",
  reportHint: "Loans owed to me and loans I owe — total, paid, and balance",
  reportLoadError: "Could not load the loans report.",
  reportByCurrency: "Loans by currency",
  reportByCurrencyHint: "Native amounts per currency — not mixed",
  reportNoData: "No loan activity in this period",
  reportOwedToMe: "Loans owed to me",
  reportOwedToMeHint: "Money others borrowed from you",
  reportIOwe: "Loans I owe",
  reportIOweHint: "Money you borrowed from others",
  reportTotal: "Total",
  reportPaid: "Paid",
  reportBalance: "Balance",
  // Main titles
  title: "Loan Management",
  subtitle: "Manage loans in and out with comprehensive tracking",
  
  // Actions
  addLoan: "Add Loan",
  editLoan: "Edit Loan",
  deleteLoan: "Delete Loan",
  loanDetails: "Loan Details",
  markPaid: "Mark as Paid",
  markUnpaid: "Mark as Unpaid",
  loanerInformation: "Loaner Information",
  loanInformation: "Loan Information",
  
  // Form fields
  loaner: "Loaner",
  amount: "Amount",
  loanType: "Loan Type",
  currency: "Currency",
  loanDate: "Loan Date",
  billNumber: "Bill Number",
  billFile: "Bill File",
  notes: "Notes",
  statusLabel: "Status",
  
  // Placeholders
  selectLoaner: "Select Loaner",
  selectCurrency: "Select Currency",
  enterAmount: "Enter amount",
  enterBillNumber: "Enter bill number",
  enterNotes: "Enter notes...",
  searchPlaceholder: "Search loans...",
  
  // Loan types
  type: {
    loanIn: "Loan In",
    loanOut: "Loan Out"
  },
  
  // Status options
  status: {
    paid: "Paid",
    unpaid: "Unpaid"
  },
  
  // Filters
  allTypes: "All Types",
  allStatuses: "All Statuses",
  
  // Statistics
  stats: {
    totalLoanIn: "Total Loan In",
    totalLoanOut: "Total Loan Out",
    netBalance: "Net Balance",
    unpaidLoanIn: "Unpaid Loan In",
    unpaidLoanOut: "Unpaid Loan Out",
    totalLoans: "Total Loans"
  },
  
  // Success/Error messages
  addSuccess: "Loan added successfully",
  updateSuccess: "Loan updated successfully",
  deleteSuccess: "Loan deleted successfully",
  markPaidSuccess: "Loan marked as paid",
  markUnpaidSuccess: "Loan marked as unpaid",
  confirmDelete: "Are you sure you want to delete this loan?",
  
  // Empty states
  noRecords: "No loan records found",
  noRecordsDesc: "Start by adding your first loan record",
  
  // File upload
  billFileHint: "Supported formats: PDF, JPG, PNG, DOC, DOCX (Max 10MB)",
  
  // Loaner management
  loanerManagement: "Loaner Management",
  addLoaner: "Add Loaner",
  loanerName: "Loaner Name",
  loanerPhone: "Phone",
  loanerEmail: "Email",
  loanerAddress: "Address",
  selectLoanerFirst: "Please add a loaner first",
  noLoanersAvailable: "No active loaners available. Please add loaners from Loaner Management.",
  noLoaners: "No Loaners Found",
  noLoanersDesc: "Start by adding your first loaner",
  addFirstLoaner: "Add First Loaner",
  searchLoaners: "Search loaners...",
  loanerAddSuccess: "Loaner added successfully",
  loanerUpdateSuccess: "Loaner updated successfully",
  loanerDeleteSuccess: "Loaner deleted successfully",
  confirmDeleteLoaner: "Are you sure you want to delete this loaner?",
  
  // Amount labels

  openingBalance: "Opening Balance / Historical Loan",
  openingBalanceShort: "Opening",
  openingBalanceDesc:
    "Loan existed before this system. Enter only if money is still owed. Finished loans are not added.",
  remainingBalance: "Remaining balance owed",
  remainingBalanceHint: "Enter the amount still owed today.",
  paymentAccount: "Paid from / Received in",
  accountIncreases: "This account increases (money in)",
  accountDecreases: "This account decreases (money out)",

  validation: {
    loaner: "Loaner is required",
    amount: "Amount must be greater than 0",
    currency: "Currency is required",
    loanerName: "Loaner name is required",
    customer: "Customer is required",
    vendor: "Vendor is required",
    amountPaidNegative: "Amount paid cannot be negative",
    amountPaidExceeds: "Amount paid cannot exceed the loan amount",
  },
  
  // UI Components
  viewDetails: "View Details",
  edit: "Edit",
  delete: "Delete",
  editLoaner: "Edit Loaner",
  deleteLoaner: "Delete Loaner",
  manageLoanRecords: "Manage loan records",
  manageLoanerContacts: "Manage loaner contacts",
  filterByType: "Filter by type",
  filterByStatus: "Filter by status",
  clearFilters: "Clear Filters",
  tryAdjustingSearch: "Try adjusting your search terms",
  loadingLoans: "Loading loans...",
  loadingLoaners: "Loading loaners...",

  loanerType: "Loaner Type",
  loanerTypes: {
    customer: "Customer",
    vendor: "Supplier / Vendor",
  },
  selectCustomer: "Select Customer",
  selectVendor: "Select Vendor",
  customer: "Customer",
  vendor: "Vendor",
  loanerNameOptional: "Optional display name",
  balanceDue: "Balance Due",
  recordPayment: "Record Payment",
  paymentAmount: "Payment Amount",
  paymentSuccess: "Payment recorded successfully",
  paymentError: "Failed to record payment",
  notFound: "Loan not found",
  filterByLoanerType: "Filter by loaner type",

  scenario: {
    customerReceivable: "Customer borrowed from me (they owe me)",
    customerPayable: "I borrowed from customer (I owe them)",
    vendorReceivable: "Vendor borrowed from me (they owe me)",
    vendorPayable: "I borrowed from vendor (I owe them)",
  },

  scenarioDesc: {
    customerReceivable:
      "You gave a loan to this customer. They must repay you — this is money owed TO your business.",
    customerPayable:
      "This customer lent money to you. You must repay them — this is money YOU owe.",
    vendorReceivable:
      "You gave a loan to this vendor. They must repay you — this is money owed TO your business.",
    vendorPayable:
      "This vendor lent money to you (e.g. credit or advance). You must repay them — this is money YOU owe.",
    loanInGeneric: "Money received as a loan — you may owe the lender until repaid.",
    loanOutGeneric: "Money given as a loan — the borrower owes you until repaid.",
  },

  direction: {
    weOwe: "We owe",
    theyOweUs: "They owe us",
  },

  loanTypeHelp: "Select who borrowed from whom. This determines whether you are owed money or you owe money.",
  loansCount: "loans",
  balanceRemaining: "remaining",
  optional: "Optional",
  maximum: "Maximum",
  referenceShort: "Ref",
  loanPaymentLabel: "Loan payment",
  submittingPayment: "Submitting...",
  noPaymentsFound: "No payments found",

  // Loan Management Dashboard
  loanManagement: "Loan Management",
  manageAllLoans: "Manage all customer and vendor loans",
  customerReceivable: "Customer Receivable (Customers owe me)",
  customerPayable: "Customer Payable (I owe customers)",
  vendorReceivable: "Vendor Receivable (Vendors owe me)",
  vendorPayable: "Vendor Payable (I owe vendors)",
  iOweCustomers: "I Owe Customers",
  customersOweMe: "Customers Owe Me",
  iOweVendors: "I Owe Vendors",
  vendorsOweMe: "Vendors Owe Me",
  loanRecords: "Loan Records",
  noLoansFound: "No loans found",
  totalAmount: "Total Amount",
  paid: "Paid",
  unpaid: "Unpaid",
  view: "View",

  // Loan Payments Page
  loanPayments: "Loan Payment Management",
  manageLoanPayments: "Record and track loan payments",
  totalLoans: "Total Loans",
  unpaidLoans: "Unpaid Loans",
  totalPayments: "Total Payments",
  allLoans: "All Loans",
  customers: "Customers",
  vendors: "Vendors",
  paymentHistory: "Payment History",
  allLoanPayments: "All loan payments",
  addPayment: "Add Payment",
  addPaymentDesc: "Payment for loan:",
  referenceNumber: "Reference Number",
  submitPayment: "Submit Payment",
  paymentAdded: "Payment added successfully",
  paymentFailed: "Failed to add payment",

  // Loaner form placeholders
  enterLoanerName: "Enter loaner name",
  enterPhone: "Enter phone number",
  enterEmail: "Enter email address",
  enterAddress: "Enter address",
  enterPaymentNotes: "Enter payment notes (optional)",

  // Currency fallbacks
  fallbackCurrencySymbol: "؋",
  fallbackCurrencyCode: "AFN",

  // Amount labels
  amountPaid: "Paid",
};