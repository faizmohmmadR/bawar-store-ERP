import { useFormatAppDate } from '@/hooks/useFormatAppDate';
import { calendarPeriodRange, toGregorianIsoDate } from '@/lib/calendarDate';
import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePickerInput } from "@/components/ui/date-picker-input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLanguage } from "@/contexts/LanguageContext";
import { 
  Calendar, 
  Download, 
  RefreshCw, 
  Users, 
  Clock, 
  TrendingUp, 
  AlertCircle,
  CheckCircle,
  XCircle,
  Fingerprint,
  Wifi,
  WifiOff
} from "lucide-react";
import useFetchObjects from "@/api/useFetchObjects";
import { Attendance, AttendanceSummary } from "@/types/attendance";
import AttendanceTable from "./AttendanceTable";
import AttendanceStats from "./AttendanceStats";
import ZKTecoSync from "./ZKTecoSync";

const AttendanceReports: React.FC = () => {
  const { calendar, formatDate } = useFormatAppDate();
  const { t } = useLanguage();
  const [selectedDate, setSelectedDate] = useState(toGregorianIsoDate(new Date()));
  const [dateRange, setDateRange] = useState("today");
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [showSyncModal, setShowSyncModal] = useState(false);

  const selectedDay = new Date(`${selectedDate}T12:00:00`);
  selectedDay.setDate(selectedDay.getDate() - 6);
  const rangeParams = dateRange === 'today'
    ? { date: selectedDate }
    : {
        date_from: dateRange === 'week' ? toGregorianIsoDate(selectedDay) : calendarPeriodRange('monthly', calendar, selectedDate).dateFrom,
        date_to: selectedDate,
      };
  const filters = {
    ...rangeParams,
    ...(statusFilter !== 'all' && { status: statusFilter }),
    ...(searchTerm && { search: searchTerm }),
  };

  const { data: attendanceData, refetch, isLoading } = useFetchObjects<Attendance[]>({
    queryKey: ["attendance-reports", calendar, selectedDate, dateRange, statusFilter, searchTerm],
    endpoint: "attendances/",
    params: filters,
  });

  const { data: summaryData } = useFetchObjects<AttendanceSummary>({
    queryKey: ["attendance-summary", calendar, selectedDate, dateRange, statusFilter, searchTerm],
    endpoint: "attendances/daily_summary/",
    params: filters,
  });

  const attendances = attendanceData || [];
  const summary = summaryData || {
    total_employees: 0,
    present: 0,
    absent: 0,
    leave: 0,
    late: 0,
    date: selectedDate
  };

  const handleSync = async () => {
    setShowSyncModal(true);
  };

  const handleExport = () => {
    // Export functionality
    const csvContent = "data:text/csv;charset=utf-8," + 
      "Employee,Date,Check In,Check Out,Status,Hours\n" +
      attendances.map(att => 
        `${att.employee_details?.fullname},${formatDate(att.date)},${att.check_in_time || ''},${att.check_out_time || ''},${att.status},${att.work_hours || 0}`
      ).join("\n");
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `attendance_${selectedDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/10 via-background to-accent/10 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Header Section */}
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-gradient-to-r from-primary to-accent rounded-xl">
                <Clock className="h-8 w-8 text-white" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-gray-900">{t("attendance.title")}</h1>
                <p className="text-gray-600 mt-1">{t("attendance.subtitle")}</p>
              </div>
            </div>
            
            <div className="flex flex-wrap gap-3">
              <Button 
                variant="outline" 
                onClick={handleSync}
                className="bg-primary/10 border-primary/30 text-primary hover:bg-primary/15"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                {t("attendance.syncWithDevice")}
              </Button>
              <Button 
                variant="outline" 
                onClick={handleExport}
                className="bg-primary/10 border-primary/30 text-primary hover:bg-primary/15"
              >
                <Download className="h-4 w-4 mr-2" />
                {t("attendance.export")}
              </Button>
            </div>
          </div>
        </div>

        {/* Stats Cards */}
        <AttendanceStats summary={summary} />

        {/* Filters Section */}
        <Card className="shadow-lg border-0 bg-white/80 backdrop-blur-sm">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Calendar className="h-5 w-5 text-primary" />
              {t("attendance.filters")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
              <div>
                <label className="text-sm font-medium text-gray-700 mb-2 block">
                  {t("attendance.dateRange")}
                </label>
                <Select value={dateRange} onValueChange={setDateRange}>
                  <SelectTrigger className="bg-white border-gray-200">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="today">Today</SelectItem>
                    <SelectItem value="week">This Week</SelectItem>
                    <SelectItem value="month">This Month</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <label className="text-sm font-medium text-gray-700 mb-2 block">
                  {t("attendance.date")}
                </label>
                <DatePickerInput
                  value={selectedDate}
                  onChange={setSelectedDate}
                  className="bg-white border-gray-200"
                />
              </div>
              
              <div>
                <label className="text-sm font-medium text-gray-700 mb-2 block">
                  {t("attendance.status")}
                </label>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="bg-white border-gray-200">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("attendance.allStatuses")}</SelectItem>
                    <SelectItem value="present">{t("attendance.status.present")}</SelectItem>
                    <SelectItem value="absent">{t("attendance.status.absent")}</SelectItem>
                    <SelectItem value="leave">{t("attendance.status.leave")}</SelectItem>
                    <SelectItem value="late">{t("attendance.status.late")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <label className="text-sm font-medium text-gray-700 mb-2 block">
                  {t("attendance.search")}
                </label>
                <Input
                  placeholder={t("attendance.searchPlaceholder")}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="bg-white border-gray-200"
                />
              </div>
              
              <div className="flex items-end">
                <Button 
                  variant="outline" 
                  onClick={() => {
                    setStatusFilter("all");
                    setSearchTerm("");
                    setDateRange("today");
                    setSelectedDate(toGregorianIsoDate(new Date()));
                  }}
                  className="w-full"
                >
                  {t("common.reset")}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Attendance Table */}
        <AttendanceTable 
          attendances={attendances} 
          isLoading={isLoading}
          onRefresh={refetch}
        />

        {/* ZKTeco Sync Modal */}
        <ZKTecoSync 
          isOpen={showSyncModal}
          onClose={() => setShowSyncModal(false)}
          onSuccess={() => {
            refetch();
            setShowSyncModal(false);
          }}
        />
      </div>
    </div>
  );
};

export default AttendanceReports;