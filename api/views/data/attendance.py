from rest_framework.decorators import action
from rest_framework.response import Response
from django.db.models import Q, Count, Avg
from datetime import datetime, timedelta
from api.models.data.attendance import Attendance, EmployeeLeave
from api.serializers.data.attendance import AttendanceSerializer, EmployeeLeaveSerializer
from api.views.data.base import DataRootViewSet

class AttendanceViewSet(DataRootViewSet):
    queryset = Attendance.objects.select_related('employee').all()
    permission_module = 'attendance'
    serializer_class = AttendanceSerializer
    filterset_fields = ["employee", "date", "status", "verification_type", "device_id"]
    search_fields = ["employee__full_name", "employee__phone", "employee_device_id", "notes"]

    def get_queryset(self):
        qs = super().get_queryset()
        return qs
    
    @action(detail=False, methods=['get'])
    def daily_summary(self, request):
        """Get daily attendance summary"""
        from api.utils.date_filters import date_range_params, normalize_date_from
        from django.utils import timezone
        from api.services.report_period import get_report_timezone
        raw_date = request.query_params.get('date')
        start, end = date_range_params(request)
        attendances = self.filter_queryset(self.get_queryset())
        if raw_date:
            date = normalize_date_from(raw_date).astimezone(get_report_timezone()).date()
            attendances = attendances.filter(date=date)
        elif start is None and end is None:
            date = timezone.localdate(timezone=get_report_timezone())
            attendances = attendances.filter(date=date)
        else:
            date = end.astimezone(get_report_timezone()).date() if end else None
        summary = {
            'total_employees': attendances.count(),
            'present': attendances.filter(status='present').count(),
            'absent': attendances.filter(status='absent').count(),
            'leave': attendances.filter(status='leave').count(),
            'late': attendances.filter(status='late').count(),
            'date': date
        }
        return Response(summary)
    
    @action(detail=False, methods=['post'])
    def bulk_import(self, request):
        """Bulk import attendance data from ZKTeco device"""
        data = request.data.get('attendance_records', [])
        created_count = 0
        
        for record in data:
            attendance, created = Attendance.objects.get_or_create(
                employee_id=record.get('employee_id'),
                date=record.get('date'),
                defaults={
                    'check_in_time': record.get('check_in_time'),
                    'check_out_time': record.get('check_out_time'),
                    'device_id': record.get('device_id'),
                    'employee_device_id': record.get('employee_device_id'),
                    'verification_type': record.get('verification_type', 'fingerprint'),
                }
            )
            if created:
                created_count += 1
        
        return Response({'message': f'{created_count} records imported successfully'})

class EmployeeLeaveViewSet(DataRootViewSet):
    queryset = EmployeeLeave.objects.select_related('employee').all()
    permission_module = 'attendance'
    serializer_class = EmployeeLeaveSerializer
    filterset_fields = ["employee", "status"]
    search_fields = ["employee__full_name", "employee__phone", "reason"]

    def get_queryset(self):
        qs = super().get_queryset()
        return qs
    
    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        """Approve leave request"""
        leave = self.get_object()
        leave.status = 'approved'
        leave.save()
        return Response({'message': 'Leave request approved'})
    
    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        """Reject leave request"""
        leave = self.get_object()
        leave.status = 'rejected'
        leave.save()
        return Response({'message': 'Leave request rejected'})