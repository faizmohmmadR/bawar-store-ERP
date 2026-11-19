from django.db import models
from django.utils import timezone
from api.models.data.base import BaseModel
from api.models.data.employee import Employee   


class Attendance(BaseModel):
    employee = models.ForeignKey(
        Employee,
        on_delete=models.CASCADE,
        related_name='attendances'
    )
    date = models.DateField()
    status = models.CharField(max_length=20, choices=[
        ('present', 'Present'),
        ('absent', 'Absent'),
        ('leave', 'Leave'),
        ('holiday', 'Holiday'),
        ('late', 'Late'),
    ], default='present')
    check_in_time = models.TimeField(blank=True, null=True)
    check_out_time = models.TimeField(blank=True, null=True)
    # ZKTeco device fields
    device_id = models.CharField(max_length=50, blank=True, null=True)
    employee_device_id = models.CharField(max_length=50, blank=True, null=True)  # Employee ID in device
    verification_type = models.CharField(max_length=20, choices=[
        ('fingerprint', 'Fingerprint'),
        ('face', 'Face Recognition'),
        ('card', 'Card'),
        ('password', 'Password'),
        ('manual', 'Manual Entry'),
    ], default='fingerprint')
    work_hours = models.DecimalField(max_digits=5, decimal_places=2, default=0.0)
    overtime_hours = models.DecimalField(max_digits=5, decimal_places=2, default=0.0)
    break_time = models.DecimalField(max_digits=5, decimal_places=2, default=0.0)
    notes = models.TextField(blank=True, null=True)
    
    class Meta:
        unique_together = ['employee', 'date']
        ordering = ['-date', '-check_in_time']
    
    def save(self, *args, **kwargs):
        # Calculate work hours if both check-in and check-out times are present
        if self.check_in_time and self.check_out_time:
            check_in_datetime = timezone.datetime.combine(self.date, self.check_in_time)
            check_out_datetime = timezone.datetime.combine(self.date, self.check_out_time)
            
            # Handle overnight shifts
            if self.check_out_time < self.check_in_time:
                check_out_datetime += timezone.timedelta(days=1)
            
            work_duration = check_out_datetime - check_in_datetime
            total_hours = work_duration.total_seconds() / 3600
            
            # Subtract break time
            self.work_hours = max(0, total_hours - float(self.break_time))
            
            # Calculate overtime (assuming 8 hours is standard)
            standard_hours = 8.0
            self.overtime_hours = max(0, self.work_hours - standard_hours)
        
        super().save(*args, **kwargs)
    
    def __str__(self):
        return f"{self.employee.full_name} - {self.date} - {self.status}"
    
    
    
class EmployeeLeave(BaseModel):
    employee = models.ForeignKey(
        Employee,
        on_delete=models.CASCADE,
        related_name='leave_requests'
    )
    start_date = models.DateField()
    end_date = models.DateField()
    reason = models.TextField(blank=True, null=True)
    status = models.CharField(max_length=20, choices=[
        ('pending', 'Pending'),
        ('approved', 'Approved'),
        ('rejected', 'Rejected'),
    ], default='pending')
    
    def __str__(self):
        return f"{self.employee.full_name} - {self.start_date} to {self.end_date} - {self.status}"
