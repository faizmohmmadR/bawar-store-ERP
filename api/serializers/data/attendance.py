from rest_framework import serializers
from api.models.data.attendance import Attendance, EmployeeLeave
from api.serializers.data.base import DataRootSerializer

class AttendanceSerializer(DataRootSerializer):
    employee_details = serializers.SerializerMethodField()
    work_duration = serializers.SerializerMethodField()
    is_late = serializers.SerializerMethodField()
    
    class Meta:
        model = Attendance
        fields = "__all__"
    
    def get_employee_details(self, obj):
        if obj.employee:
            return {
                "id": obj.employee.id,
                "fullname": obj.employee.full_name,
                "employee_id": getattr(obj.employee, 'employee_id', None),
            }
        return None
    
    def get_work_duration(self, obj):
        if obj.check_in_time and obj.check_out_time:
            return f"{obj.work_hours:.2f} hours"
        return "N/A"
    
    def get_is_late(self, obj):
        # Assuming work starts at 9:00 AM
        if obj.check_in_time and obj.status == 'present':
            from datetime import time
            work_start_time = time(9, 0)  # 9:00 AM
            return obj.check_in_time > work_start_time
        return False

class EmployeeLeaveSerializer(DataRootSerializer):
    employee_details = serializers.SerializerMethodField()
    leave_duration = serializers.SerializerMethodField()
    
    class Meta:
        model = EmployeeLeave
        fields = "__all__"
    
    def get_employee_details(self, obj):
        if obj.employee:
            return {
                "id": obj.employee.id,
                "fullname": obj.employee.full_name,
            }
        return None
    
    def get_leave_duration(self, obj):
        if obj.start_date and obj.end_date:
            duration = (obj.end_date - obj.start_date).days + 1
            return f"{duration} day{'s' if duration != 1 else ''}"
        return "N/A"