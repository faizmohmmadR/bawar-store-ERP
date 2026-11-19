import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLanguage } from "@/contexts/LanguageContext";
import { useFormatAppDate } from '@/hooks/useFormatAppDate';
import { Calendar, Plus, Check, X, Clock } from "lucide-react";
import useFetchObjects from "@/api/useFetchObjects";
import useUpdate from "@/api/useUpdate";
import { EmployeeLeave } from "@/types/attendance";
import AddLeaveRequest from "./AddLeaveRequest";

const LeaveManagement: React.FC = () => {
  const { formatDate } = useFormatAppDate();
  const { t } = useLanguage();
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [searchTerm, setSearchTerm] = useState("");
  const [isAddOpen, setIsAddOpen] = useState(false);

  const { data: leaveData, refetch } = useFetchObjects<EmployeeLeave[]>({
    queryKey: ["employee-leaves", statusFilter, searchTerm],
    endpoint: "employee-leaves/",
    params: {
      status: statusFilter || undefined,
      search: searchTerm || undefined,
    },
  });

  const { handleUpdate } = useUpdate<{ status: string }>({
    queryKey: ["employee-leaves"],
  });

  const leaves = leaveData || [];

  const getStatusBadge = (status: string) => {
    const variants = {
      pending: "secondary",
      approved: "default",
      rejected: "destructive"
    };
    
    const labels = {
      pending: t("attendance.leaveStatus.pending"),
      approved: t("attendance.leaveStatus.approved"),
      rejected: t("attendance.leaveStatus.rejected")
    };

    return (
      <Badge variant={variants[status as keyof typeof variants] || "outline"}>
        {labels[status as keyof typeof labels] || status}
      </Badge>
    );
  };

  const handleApprove = async (leaveId: string) => {
    await handleUpdate(leaveId, { status: "approved" });
    refetch();
  };

  const handleReject = async (leaveId: string) => {
    await handleUpdate(leaveId, { status: "rejected" });
    refetch();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">{t("attendance.leaveManagement")}</h1>
          <p className="text-muted-foreground">{t("attendance.subtitle")}</p>
        </div>
        <Button onClick={() => setIsAddOpen(true)}>
          <Plus className="h-4 w-4" />
          {t("attendance.addLeaveRequest")}
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            {t("attendance.filters")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-sm font-medium">{t("attendance.status")}</label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <SelectValue placeholder={t("attendance.allStatuses")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("attendance.allStatuses")}</SelectItem>
                  <SelectItem value="pending">{t("attendance.leaveStatus.pending")}</SelectItem>
                  <SelectItem value="approved">{t("attendance.leaveStatus.approved")}</SelectItem>
                  <SelectItem value="rejected">{t("attendance.leaveStatus.rejected")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">{t("attendance.search")}</label>
              <Input
                placeholder={t("attendance.searchPlaceholder")}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div className="flex items-end">
              <Button variant="outline" onClick={() => {
                setStatusFilter("");
                setSearchTerm("");
              }}>
                {t("common.reset")}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Leave Requests List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            {t("attendance.leaveRequests")} ({leaves.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {leaves.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                {t("attendance.noRecords")}
              </div>
            ) : (
              leaves.map((leave) => (
                <div key={leave.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50">
                  <div className="flex items-center gap-4">
                    <div className="text-2xl">📅</div>
                    <div>
                      <div className="font-semibold">
                        {leave.employee_details?.fullname || "N/A"}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {leave.employee_details?.position}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {formatDate(leave.start_date)} – {formatDate(leave.end_date)}
                      </div>
                      {leave.reason && (
                        <div className="text-sm text-muted-foreground mt-1">
                          Reason: {leave.reason}
                        </div>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-4">
                    <div className="text-center">
                      <div className="text-sm font-medium">
                        {leave.leave_duration || "N/A"}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {t("attendance.leaveDuration")}
                      </div>
                    </div>
                    
                    <div>
                      {getStatusBadge(leave.status)}
                    </div>
                    
                    {leave.status === "pending" && (
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleApprove(leave.id)}
                          className="text-primary hover:text-primary"
                        >
                          <Check className="h-4 w-4 mr-1" />
                          {t("attendance.approveLeave")}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleReject(leave.id)}
                          className="text-red-600 hover:text-red-700"
                        >
                          <X className="h-4 w-4 mr-1" />
                          {t("attendance.rejectLeave")}
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* Add Leave Request Modal */}
      <AddLeaveRequest
        isOpen={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        onSuccess={() => {
          refetch();
          setIsAddOpen(false);
        }}
      />
    </div>
  );
};

export default LeaveManagement;
