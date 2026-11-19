import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLanguage } from "@/contexts/LanguageContext";
import { Users, UserCheck, UserX, Clock, Calendar } from "lucide-react";
import { AttendanceSummary } from "@/types/attendance";

interface AttendanceSummaryCardProps {
  summary: AttendanceSummary;
}

const AttendanceSummaryCard: React.FC<AttendanceSummaryCardProps> = ({ summary }) => {
  const { t } = useLanguage();

  const summaryItems = [
    {
      title: t("attendance.summary.totalEmployees"),
      value: summary.total_employees,
      icon: Users,
      color: "text-primary",
      bgColor: "bg-primary/10"
    },
    {
      title: t("attendance.summary.present"),
      value: summary.present,
      icon: UserCheck,
      color: "text-primary",
      bgColor: "bg-primary/10"
    },
    {
      title: t("attendance.summary.absent"),
      value: summary.absent,
      icon: UserX,
      color: "text-red-600",
      bgColor: "bg-red-50"
    },
    {
      title: t("attendance.summary.onLeave"),
      value: summary.leave,
      icon: Calendar,
      color: "text-yellow-600",
      bgColor: "bg-yellow-50"
    },
    {
      title: t("attendance.summary.late"),
      value: summary.late,
      icon: Clock,
      color: "text-accent",
      bgColor: "bg-accent/10"
    }
  ];

  const attendanceRate = summary.total_employees > 0 
    ? ((summary.present / summary.total_employees) * 100).toFixed(1)
    : "0.0";

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
      {summaryItems.map((item, index) => {
        const Icon = item.icon;
        return (
          <Card key={index}>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${item.bgColor}`}>
                  <Icon className={`h-5 w-5 ${item.color}`} />
                </div>
                <div>
                  <div className="text-2xl font-bold">{item.value}</div>
                  <div className="text-sm text-muted-foreground">{item.title}</div>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
      
      {/* Attendance Rate Card */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-accent/10">
              <Users className="h-5 w-5 text-accent" />
            </div>
            <div>
              <div className="text-2xl font-bold">{attendanceRate}%</div>
              <div className="text-sm text-muted-foreground">
                {t("attendance.summary.attendanceRate")}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AttendanceSummaryCard;