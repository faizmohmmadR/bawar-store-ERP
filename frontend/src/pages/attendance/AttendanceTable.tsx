import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/contexts/LanguageContext";
import { 
  Clock, 
  User, 
  Fingerprint, 
  Eye,
  CreditCard,
  Key,
  Edit3,
  MoreHorizontal,
  RefreshCw
} from "lucide-react";
import { Attendance } from "@/types/attendance";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

interface AttendanceTableProps {
  attendances: Attendance[];
  isLoading: boolean;
  onRefresh: () => void;
}

const AttendanceTable: React.FC<AttendanceTableProps> = ({ 
  attendances, 
  isLoading, 
  onRefresh 
}) => {
  const { t } = useLanguage();

  const getStatusBadge = (status: string, isLate?: boolean) => {
    const statusConfig = {
      present: { 
        variant: isLate ? "destructive" : "default" as const, 
        label: isLate ? t("attendance.status.late") : t("attendance.status.present"),
        className: isLate ? "bg-red-100 text-red-700 border-red-200" : "bg-primary/15 text-primary border-primary/30"
      },
      absent: { 
        variant: "destructive" as const, 
        label: t("attendance.status.absent"),
        className: "bg-red-100 text-red-700 border-red-200"
      },
      leave: { 
        variant: "secondary" as const, 
        label: t("attendance.status.leave"),
        className: "bg-primary/15 text-primary border-primary/30"
      },
      holiday: { 
        variant: "outline" as const, 
        label: t("attendance.status.holiday"),
        className: "bg-accent/15 text-accent border-accent/30"
      },
      late: { 
        variant: "destructive" as const, 
        label: t("attendance.status.late"),
        className: "bg-accent/15 text-accent border-orange-200"
      }
    };

    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.present;
    
    return (
      <Badge className={`${config.className} font-medium`}>
        {config.label}
      </Badge>
    );
  };

  const getVerificationIcon = (type: string) => {
    const icons = {
      fingerprint: <Fingerprint className="h-4 w-4 text-primary" />,
      face: <Eye className="h-4 w-4 text-primary" />,
      card: <CreditCard className="h-4 w-4 text-accent" />,
      password: <Key className="h-4 w-4 text-accent" />,
      manual: <Edit3 className="h-4 w-4 text-gray-600" />
    };
    return icons[type as keyof typeof icons] || icons.manual;
  };

  const formatTime = (time?: string | null) => {
    if (!time) return "--:--";
    return new Date(`2000-01-01T${time}`).toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  if (isLoading) {
    return (
      <Card className="shadow-lg border-0">
        <CardContent className="p-8">
          <div className="flex items-center justify-center">
            <RefreshCw className="h-8 w-8 animate-spin text-primary" />
            <span className="ml-3 text-lg text-gray-600">{t("common.loading")}</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="shadow-lg border-0 bg-white/80 backdrop-blur-sm">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-xl">
            <Clock className="h-6 w-6 text-primary" />
            {t("attendance.attendanceRecords")} ({attendances.length})
          </CardTitle>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={onRefresh}
            className="bg-primary/10 border-primary/30 text-primary hover:bg-primary/15"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            {t("common.refresh")}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {attendances.length === 0 ? (
          <div className="text-center py-12">
            <Clock className="h-16 w-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              {t("attendance.noRecords")}
            </h3>
            <p className="text-gray-500">
              Sync with ZKTeco device to import attendance data
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {attendances.map((attendance) => (
              <div 
                key={attendance.id} 
                className="group bg-gradient-to-r from-white to-gray-50 rounded-xl border border-gray-100 p-6 hover:shadow-md transition-all duration-200 hover:border-primary/30"
              >
                <div className="flex items-center justify-between">
                  {/* Employee Info */}
                  <div className="flex items-center gap-4 flex-1">
                    <Avatar className="h-12 w-12 border-2 border-white shadow-md">
                      <AvatarFallback className="bg-gradient-to-r from-primary to-accent text-white font-semibold">
                        {attendance.employee_details?.fullname?.split(' ').map(n => n[0]).join('') || 'N/A'}
                      </AvatarFallback>
                    </Avatar>
                    
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-1">
                        <h3 className="font-semibold text-gray-900 text-lg">
                          {attendance.employee_details?.fullname || "N/A"}
                        </h3>
                        <div className="flex items-center gap-1">
                          {getVerificationIcon(attendance.verification_type)}
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-4 text-sm text-gray-600">
                        <span className="flex items-center gap-1">
                          <User className="h-3 w-3" />
                          {attendance.employee_details?.position || "N/A"}
                        </span>
                        {attendance.employee_device_id && (
                          <span className="bg-gray-100 px-2 py-1 rounded-full text-xs">
                            ID: {attendance.employee_device_id}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Time Info */}
                  <div className="flex items-center gap-6">
                    <div className="text-center">
                      <div className="text-lg font-bold text-primary">
                        {formatTime(attendance.check_in_time)}
                      </div>
                      <div className="text-xs text-gray-500 font-medium">
                        {t("attendance.checkIn")}
                      </div>
                    </div>
                    
                    <div className="text-center">
                      <div className="text-lg font-bold text-red-600">
                        {formatTime(attendance.check_out_time)}
                      </div>
                      <div className="text-xs text-gray-500 font-medium">
                        {t("attendance.checkOut")}
                      </div>
                    </div>
                    
                    <div className="text-center">
                      <div className="text-lg font-bold text-primary">
                        {typeof attendance.work_hours === 'number' ? attendance.work_hours.toFixed(1) : parseFloat(attendance.work_hours || '0').toFixed(1)}h
                      </div>
                      <div className="text-xs text-gray-500 font-medium">
                        {t("attendance.workHours")}
                      </div>
                    </div>
                    
                    <div className="text-center">
                      {getStatusBadge(attendance.status, attendance.is_late)}
                    </div>
                  </div>
                </div>

                {/* Additional Info */}
                {(attendance.notes || attendance.overtime_hours > 0) && (
                  <div className="mt-4 pt-4 border-t border-gray-100">
                    <div className="flex items-center gap-4 text-sm">
                      {attendance.overtime_hours > 0 && (
                        <span className="bg-accent/15 text-accent px-3 py-1 rounded-full font-medium">
                          Overtime: {typeof attendance.overtime_hours === 'number' ? attendance.overtime_hours.toFixed(1) : parseFloat(attendance.overtime_hours || '0').toFixed(1)}h
                        </span>
                      )}
                      {attendance.notes && (
                        <span className="text-gray-600 italic">
                          {attendance.notes}
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default AttendanceTable;