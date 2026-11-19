import { Route } from 'react-router-dom';
import AttendanceList from '@/pages/attendance/AttendanceList';
import { AddAttendanceRoute, EditAttendanceRoute, AddLeaveRequestRoute } from '@/pages/attendance/AttendanceFormRoutes';
import AttendanceReports from '@/pages/attendance/AttendanceReports';
import LeaveManagement from '@/pages/attendance/LeaveManagement';

export const attendanceRoutes = (
  <>
    <Route path="attendance" element={<AttendanceList />} />
    <Route path="attendance/add" element={<AddAttendanceRoute />} />
    <Route path="attendance/:id/edit" element={<EditAttendanceRoute />} />
    <Route path="attendance/reports" element={<AttendanceReports />} />
    <Route path="attendance/leave" element={<LeaveManagement />} />
    <Route path="attendance/leave/add" element={<AddLeaveRequestRoute />} />
  </>
);