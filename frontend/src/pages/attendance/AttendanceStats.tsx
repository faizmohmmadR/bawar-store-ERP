import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { useLanguage } from "@/contexts/LanguageContext";
import { 
  Users, 
  UserCheck, 
  UserX, 
  Clock, 
  Calendar,
  TrendingUp,
  AlertTriangle
} from "lucide-react";
import { AttendanceSummary } from "@/types/attendance";

interface AttendanceStatsProps {
  summary: AttendanceSummary;
}

const AttendanceStats: React.FC<AttendanceStatsProps> = ({ summary }) => {
  const { t } = useLanguage();

  const attendanceRate = summary.total_employees > 0 
    ? ((summary.present / summary.total_employees) * 100).toFixed(1)
    : "0.0";

  const stats = [
    {
      title: t("attendance.summary.totalEmployees"),
      value: summary.total_employees,
      icon: Users,
      color: "from-primary to-primary-dark",
      bgColor: "bg-primary/10",
      textColor: "text-primary",
      change: "+2.5%",
      changeType: "positive"
    },
    {
      title: t("attendance.summary.present"),
      value: summary.present,
      icon: UserCheck,
      color: "from-primary to-primary-dark",
      bgColor: "bg-primary/10",
      textColor: "text-primary",
      change: "+5.2%",
      changeType: "positive"
    },
    {
      title: t("attendance.summary.absent"),
      value: summary.absent,
      icon: UserX,
      color: "from-red-500 to-red-600",
      bgColor: "bg-red-50",
      textColor: "text-red-700",
      change: "-1.8%",
      changeType: "negative"
    },
    {
      title: t("attendance.summary.onLeave"),
      value: summary.leave,
      icon: Calendar,
      color: "from-yellow-500 to-yellow-600",
      bgColor: "bg-yellow-50",
      textColor: "text-yellow-700",
      change: "+0.5%",
      changeType: "neutral"
    },
    {
      title: t("attendance.summary.late"),
      value: summary.late,
      icon: Clock,
      color: "from-accent to-accent",
      bgColor: "bg-accent/10",
      textColor: "text-accent",
      change: "-2.1%",
      changeType: "positive"
    },
    {
      title: t("attendance.summary.attendanceRate"),
      value: `${attendanceRate}%`,
      icon: TrendingUp,
      color: "from-accent to-accent",
      bgColor: "bg-accent/10",
      textColor: "text-accent",
      change: "+3.2%",
      changeType: "positive"
    }
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
      {stats.map((stat, index) => {
        const Icon = stat.icon;
        return (
          <Card key={index} className="relative overflow-hidden border-0 shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1">
            <CardContent className="p-6">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className={`inline-flex p-3 rounded-xl bg-gradient-to-r ${stat.color} mb-4`}>
                    <Icon className="h-6 w-6 text-white" />
                  </div>
                  
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-gray-600 leading-tight">
                      {stat.title}
                    </p>
                    <div className="flex items-end gap-2">
                      <p className="text-3xl font-bold text-gray-900">
                        {typeof stat.value === 'string' ? stat.value : stat.value.toLocaleString()}
                      </p>
                    </div>
                    
                    <div className="flex items-center gap-1">
                      <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                        stat.changeType === 'positive' 
                          ? 'bg-primary/15 text-primary' 
                          : stat.changeType === 'negative'
                          ? 'bg-red-100 text-red-700'
                          : 'bg-gray-100 text-gray-700'
                      }`}>
                        {stat.change}
                      </span>
                      <span className="text-xs text-gray-500">vs last period</span>
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Decorative gradient */}
              <div className={`absolute top-0 right-0 w-20 h-20 bg-gradient-to-br ${stat.color} opacity-10 rounded-bl-full`} />
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};

export default AttendanceStats;