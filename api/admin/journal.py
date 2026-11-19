"""Journal entry / line admin with GL-account filtering."""
from django.contrib import admin
from django.db.models import Prefetch
from django.utils.html import format_html

from api.admin.common import SoftDeleteModelAdmin
from api.models.data.journal import GLAccount, JournalEntry, JournalLine


class JournalAccountFilter(admin.SimpleListFilter):
    """Filter journal entries that contain at least one line for a GL account."""

    title = 'GL account'
    parameter_name = 'gl_account'

    def lookups(self, request, model_admin):
        accounts = (
            GLAccount.all_objects.filter(deleted_at__isnull=True)
            .order_by('code', 'currency')
            .only('id', 'code', 'name', 'currency')
        )
        return [(str(account.pk), str(account)) for account in accounts]

    def queryset(self, request, queryset):
        value = self.value()
        if not value:
            return queryset
        return queryset.filter(lines__gl_account_id=value, lines__deleted_at__isnull=True).distinct()


class JournalLineInline(admin.TabularInline):
    model = JournalLine
    extra = 0
    show_change_link = True
    autocomplete_fields = ('gl_account',)
    fields = (
        'gl_account',
        'currency',
        'debit',
        'credit',
        'exchange_rate',
        'base_debit',
        'base_credit',
        'needs_rate_review',
        'description',
    )
    readonly_fields = ()

    def get_queryset(self, request):
        qs = super().get_queryset(request)
        if hasattr(JournalLine, 'all_objects'):
            qs = JournalLine.all_objects.filter(deleted_at__isnull=True)
        return qs.select_related('gl_account')


@admin.register(GLAccount)
class GLAccountAdmin(SoftDeleteModelAdmin):
    list_display = ('code', 'name', 'category', 'currency', 'is_system', 'is_active')
    list_filter = ('category', 'currency', 'is_system', 'is_active')
    search_fields = ('code', 'name', 'description')
    ordering = ('code', 'currency')
    list_per_page = 50


@admin.register(JournalEntry)
class JournalEntryAdmin(SoftDeleteModelAdmin):
    list_display = (
        'id',
        'entry_date',
        'reference_number',
        'short_description',
        'is_auto',
        'is_closing_entry',
        'line_count',
        'total_debit_display',
        'total_credit_display',
        'source_label',
    )
    list_filter = (
        JournalAccountFilter,
        'is_auto',
        'is_closing_entry',
        'entry_date',
        'fiscal_year',
        'content_type',
    )
    search_fields = (
        'id',
        'reference_number',
        'description',
        'lines__description',
        'lines__gl_account__code',
        'lines__gl_account__name',
    )
    date_hierarchy = 'entry_date'
    ordering = ('-entry_date', '-id')
    list_select_related = ('fiscal_year', 'content_type')
    inlines = [JournalLineInline]
    autocomplete_fields = ('fiscal_year',)
    readonly_fields = ('content_type', 'object_id')
    list_per_page = 40

    def get_queryset(self, request):
        from django.db.models import Count, Q

        qs = super().get_queryset(request)
        return qs.prefetch_related(
            Prefetch(
                'lines',
                queryset=JournalLine.all_objects.filter(deleted_at__isnull=True).select_related('gl_account'),
            )
        ).annotate(
            _line_count=Count(
                'lines',
                distinct=True,
                filter=Q(lines__deleted_at__isnull=True),
            ),
        )

    def short_description(self, obj):
        text = (obj.description or '').strip()
        if len(text) > 60:
            return f'{text[:57]}…'
        return text or '—'

    short_description.short_description = 'Description'

    def line_count(self, obj):
        return getattr(obj, '_line_count', obj.lines.count())

    line_count.short_description = 'Lines'
    line_count.admin_order_field = '_line_count'

    def total_debit_display(self, obj):
        return obj.total_base_debit

    total_debit_display.short_description = 'Debit (AFN)'

    def total_credit_display(self, obj):
        return obj.total_base_credit

    total_credit_display.short_description = 'Credit (AFN)'

    def source_label(self, obj):
        if not obj.content_type_id or not obj.object_id:
            return '—'
        return format_html(
            '{} #{}',
            obj.content_type.model,
            obj.object_id,
        )

    source_label.short_description = 'Source'


@admin.register(JournalLine)
class JournalLineAdmin(SoftDeleteModelAdmin):
    list_display = (
        'id',
        'journal_entry',
        'entry_date',
        'gl_account',
        'currency',
        'debit',
        'credit',
        'base_debit',
        'base_credit',
        'needs_rate_review',
        'description',
    )
    list_filter = (
        'gl_account',
        'currency',
        'needs_rate_review',
        'journal_entry__entry_date',
        'journal_entry__is_auto',
        'journal_entry__is_closing_entry',
    )
    search_fields = (
        'description',
        'journal_entry__reference_number',
        'journal_entry__description',
        'gl_account__code',
        'gl_account__name',
        'journal_entry__id',
    )
    autocomplete_fields = ('journal_entry', 'gl_account')
    list_select_related = ('journal_entry', 'gl_account')
    date_hierarchy = 'journal_entry__entry_date'
    ordering = ('-journal_entry__entry_date', '-id')
    list_per_page = 50

    @admin.display(description='Entry date', ordering='journal_entry__entry_date')
    def entry_date(self, obj):
        return obj.journal_entry.entry_date if obj.journal_entry_id else '—'
