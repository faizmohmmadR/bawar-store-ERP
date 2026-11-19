from decimal import Decimal

from django.db import transaction
from rest_framework import serializers

from api.models.data.journal import (
    AccountingSettings,
    GLAccount,
    JournalEntry,
    JournalLine,
)
from api.serializers.data.base import DataRootSerializer
from api.services.accounting import initialize_accounting_settings, is_accounting_ready


class GLAccountSerializer(DataRootSerializer):
    category_display = serializers.CharField(
        source='get_category_display', read_only=True)
    currency_details = serializers.SerializerMethodField()
    currency_code = serializers.SerializerMethodField()

    class Meta:
        model = GLAccount
        fields = '__all__'
        read_only_fields = ['is_system']

    def get_currency_code(self, obj):
        from api.models.data.currency import BASE_CURRENCY_ID, get_currency

        cid = obj.currency if obj.currency is not None else BASE_CURRENCY_ID
        c = get_currency(cid)
        return c['code'] if c else 'AFN'

    def get_currency_details(self, obj):
        from api.models.data.currency import BASE_CURRENCY_ID, currency_details

        cid = obj.currency if obj.currency is not None else BASE_CURRENCY_ID
        return currency_details(cid)

    def validate_code(self, value):
        code = (value or '').strip()
        if not code:
            raise serializers.ValidationError('Account code is required.')
        return code

    def validate_currency(self, value):
        from api.models.data.currency import BASE_CURRENCY_ID, CURRENCY_DEFINITIONS

        if value is None:
            return BASE_CURRENCY_ID
        if int(value) not in CURRENCY_DEFINITIONS:
            raise serializers.ValidationError('Invalid currency.')
        return int(value)

    def validate(self, data):
        from api.models.data.currency import BASE_CURRENCY_ID

        if self.instance and self.instance.is_system:
            protected = {'code', 'name', 'category', 'currency'}
            if protected.intersection(data.keys()):
                raise serializers.ValidationError(
                    'System accounts can only have description and active status updated.'
                )

        code = data.get('code', getattr(self.instance, 'code', None))
        currency = data.get(
            'currency',
            getattr(self.instance, 'currency',
                    None) if self.instance else BASE_CURRENCY_ID,
        )
        if currency is None:
            currency = BASE_CURRENCY_ID
            data['currency'] = currency
        qs = GLAccount.objects.filter(code=code, currency=currency)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError(
                {'code': 'An account with this code already exists for this currency.'}
            )
        return data

    def create(self, validated_data):
        from api.models.data.currency import BASE_CURRENCY_ID

        validated_data['is_system'] = False
        if validated_data.get('currency') is None:
            validated_data['currency'] = BASE_CURRENCY_ID
        return super().create(validated_data)


class JournalLineSerializer(DataRootSerializer):
    gl_account_details = serializers.SerializerMethodField()
    currency_details = serializers.SerializerMethodField()
    currency_code = serializers.SerializerMethodField()

    class Meta:
        model = JournalLine
        fields = '__all__'

    def get_gl_account_details(self, obj):
        if obj.gl_account:
            from api.models.data.currency import BASE_CURRENCY_ID, currency_details

            cid = (
                obj.gl_account.currency
                if obj.gl_account.currency is not None
                else BASE_CURRENCY_ID
            )
            return {
                'id': obj.gl_account.id,
                'code': obj.gl_account.code,
                'name': obj.gl_account.name,
                'category': obj.gl_account.category,
                'category_display': obj.gl_account.get_category_display(),
                'currency': cid,
                'currency_details': currency_details(cid),
            }
        return None

    def get_currency_details(self, obj):
        from api.models.data.currency import BASE_CURRENCY_ID, currency_details

        cid = obj.currency if obj.currency is not None else BASE_CURRENCY_ID
        return currency_details(cid)

    def get_currency_code(self, obj):
        from api.models.data.currency import BASE_CURRENCY_ID, get_currency

        cid = obj.currency if obj.currency is not None else BASE_CURRENCY_ID
        c = get_currency(cid)
        return c['code'] if c else 'AFN'


class JournalEntrySerializer(DataRootSerializer):
    lines = JournalLineSerializer(many=True, read_only=True)
    total_debit = serializers.DecimalField(
        max_digits=15, decimal_places=2, read_only=True)
    total_credit = serializers.DecimalField(
        max_digits=15, decimal_places=2, read_only=True)
    total_base_debit = serializers.DecimalField(
        max_digits=15, decimal_places=2, read_only=True)
    total_base_credit = serializers.DecimalField(
        max_digits=15, decimal_places=2, read_only=True)
    source_model = serializers.SerializerMethodField()
    native_currency = serializers.SerializerMethodField()
    is_mixed_currency = serializers.SerializerMethodField()

    class Meta:
        model = JournalEntry
        fields = '__all__'

    def get_source_model(self, obj):
        if obj.content_type:
            return obj.content_type.model
        return None

    def _line_currency_ids(self, obj):
        # Prefer prefetched lines (list/detail) to avoid N+1 queries.
        cache = getattr(obj, '_prefetched_objects_cache', None) or {}
        if 'lines' in cache:
            return [
                int(line.currency)
                for line in obj.lines.all()
                if line.currency is not None
            ]
        return [
            int(cid)
            for cid in obj.lines.values_list('currency', flat=True)
            if cid is not None
        ]

    def get_is_mixed_currency(self, obj):
        return len(set(self._line_currency_ids(obj))) > 1

    def get_native_currency(self, obj):
        from api.models.data.currency import currency_details

        ids = self._line_currency_ids(obj)
        unique = sorted(set(ids))
        if len(unique) == 1:
            return currency_details(unique[0])
        if len(unique) > 1:
            return {
                'id': None,
                'code': 'MIXED',
                'name': 'Multiple currencies',
                'symbol': '',
            }
        return None


class JournalLineWriteSerializer(serializers.ModelSerializer):
    id = serializers.IntegerField(required=False, allow_null=True)

    class Meta:
        model = JournalLine
        fields = [
            'id',
            'gl_account',
            'currency',
            'debit',
            'credit',
            'exchange_rate',
            'base_debit',
            'base_credit',
            'description',
        ]
        extra_kwargs = {
            'description': {'required': False, 'allow_blank': True, 'allow_null': True},
            'currency': {'required': False},
            'exchange_rate': {'required': False, 'allow_null': True},
            'base_debit': {'required': False, 'allow_null': True},
            'base_credit': {'required': False, 'allow_null': True},
        }


class JournalEntryWriteSerializer(serializers.ModelSerializer):
    lines = JournalLineWriteSerializer(many=True)
    total_base_debit = serializers.DecimalField(
        max_digits=15, decimal_places=2, read_only=True, required=False
    )
    total_base_credit = serializers.DecimalField(
        max_digits=15, decimal_places=2, read_only=True, required=False
    )

    class Meta:
        model = JournalEntry
        fields = [
            'entry_date',
            'reference_number',
            'description',
            'lines',
            'total_base_debit',
            'total_base_credit',
        ]

    def validate_lines(self, lines):
        from api.constants.gl_roles import is_currency_specific_gl_code
        from api.models.data.currency import BASE_CURRENCY_ID, get_currency
        from api.models.data.journal import GLAccount

        if len(lines) < 2:
            raise serializers.ValidationError(
                'At least two journal lines are required.')

        total_debit = sum(Decimal(str(line.get('debit') or 0))
                          for line in lines)
        total_credit = sum(Decimal(str(line.get('credit') or 0))
                           for line in lines)

        if total_debit == 0 and total_credit == 0:
            raise serializers.ValidationError(
                'Journal entry must have non-zero amounts.')

        if total_debit != total_credit:
            raise serializers.ValidationError(
                f'Debits ({total_debit}) must equal credits ({total_credit}).'
            )

        gl_ids = []
        for line in lines:
            gl_ref = line.get('gl_account')
            if gl_ref is None:
                continue
            gl_ids.append(getattr(gl_ref, 'pk', gl_ref))
        accounts = {
            a.id: a
            for a in GLAccount.objects.filter(id__in=gl_ids).only(
            )
        }
        # Phase 5: native currency lives on the line. Cash/Bank/Sarafi GLs may
        # differ from generic (home) GLs; line currencies must still match.
        line_currencies = set()
        for line in lines:
            debit = Decimal(str(line.get('debit') or 0))
            credit = Decimal(str(line.get('credit') or 0))
            if debit > 0 and credit > 0:
                raise serializers.ValidationError(
                    'Each line must have either debit or credit, not both.')
            if debit == 0 and credit == 0:
                raise serializers.ValidationError(
                    'Each line must have a debit or credit amount.')

            gl_ref = line.get('gl_account')
            if hasattr(gl_ref, 'pk'):
                gl = gl_ref
            else:
                gl = accounts.get(gl_ref)
            if not gl:
                raise serializers.ValidationError(
                    'Each line must reference a valid GL account.')
            line['gl_account'] = gl

            gl_cid = int(
                gl.currency if gl.currency is not None else BASE_CURRENCY_ID)
            raw_cid = line.get('currency')
            if raw_cid is None or raw_cid == '':
                if is_currency_specific_gl_code(gl.code):
                    cid = gl_cid
                else:
                    raise serializers.ValidationError(
                        'Each journal line must include currency when posting to a generic GL.'
                    )
            else:
                try:
                    cid = int(raw_cid)
                except (TypeError, ValueError):
                    raise serializers.ValidationError(
                        'Invalid journal line currency.')

            if is_currency_specific_gl_code(gl.code) and cid != gl_cid:
                code = (get_currency(gl_cid) or {}).get('code', str(gl_cid))
                raise serializers.ValidationError(
                    f'Line currency must match the {gl.code} cash/bank/sarafi book ({code}).'
                )

            line['currency'] = cid
            line_currencies.add(cid)

        if len(line_currencies) > 1:
            codes = sorted(
                (get_currency(c) or {}).get('code', str(c)) for c in line_currencies
            )
            raise serializers.ValidationError(
                f'Normal journals must use one native currency. Found: {", ".join(codes)}.'
            )

        return lines

    def validate_entry_date(self, value):
        from api.services.fiscal_year import assert_fiscal_year_open_for_date

        assert_fiscal_year_open_for_date(value)
        return value

    def _assert_manual_journal_editable(self, instance):
        """Auto / source-linked journals must not be silently rewritten."""
        if instance is None:
            return
        if instance.is_auto or instance.content_type_id:
            raise serializers.ValidationError(
                'Automatic or source-linked journal entries cannot be edited. '
                'Correct the source document, or post a reversing/adjustment journal.'
            )

    def validate(self, attrs):
        self._assert_manual_journal_editable(self.instance)
        return attrs

    @transaction.atomic
    def create(self, validated_data):
        from api.services.fiscal_year import get_fiscal_year_for_date

        lines_data = validated_data.pop('lines')
        entry_date = validated_data.get('entry_date')
        fiscal_year = get_fiscal_year_for_date(entry_date)
        entry = JournalEntry.objects.create(
            is_auto=False,
            fiscal_year=fiscal_year,
            **validated_data,
        )
        from api.services.accounting.journal_fx import prepare_posted_line

        for line_data in lines_data:
            line_data.pop('id', None)
            prepared = prepare_posted_line(
                line_data, source=None, entry_date=entry_date)
            JournalLine.objects.create(journal_entry=entry, **prepared)
        return entry

    @transaction.atomic
    def update(self, instance, validated_data):
        self._assert_manual_journal_editable(instance)
        lines_data = validated_data.pop('lines', None)

        from api.services.fiscal_year import assert_fiscal_year_open_for_date, get_fiscal_year_for_date

        for attr, value in validated_data.items():
            setattr(instance, attr, value)

        if 'entry_date' in validated_data:
            assert_fiscal_year_open_for_date(instance.entry_date)
            instance.fiscal_year = get_fiscal_year_for_date(
                instance.entry_date)

        # Manual journals stay manual (never flip an auto source journal here).
        instance.is_auto = False
        instance.save()

        if lines_data is not None:
            from api.services.accounting.journal_fx import prepare_posted_line

            instance.lines.all().delete()
            for line_data in lines_data:
                line_data.pop('id', None)
                prepared = prepare_posted_line(
                    line_data, source=None, entry_date=instance.entry_date
                )
                JournalLine.objects.create(journal_entry=instance, **prepared)

        return instance

    def to_representation(self, instance):
        return JournalEntrySerializer(instance, context=self.context).data


class AccountingSettingsSerializer(DataRootSerializer):
    is_ready = serializers.SerializerMethodField()
    current_fiscal_year_name = serializers.SerializerMethodField()

    class Meta:
        model = AccountingSettings
        fields = [
            'id',
            'usd_to_afn_rate',
            'fiscal_year_start_month',
            'fiscal_year_start_day',
            'current_fiscal_year',
            'current_fiscal_year_name',
            'is_configured',
            'is_ready',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['is_configured', 'current_fiscal_year']

    def get_is_ready(self, obj):
        request = self.context.get('request')
        if request is not None:
            user = getattr(request, 'user', None)
            return user is not None
        return False

    def get_current_fiscal_year_name(self, obj):
        if obj.current_fiscal_year_id:
            return obj.current_fiscal_year.name
        return None


class InitializeAccountingSerializer(serializers.Serializer):
    def create(self, validated_data):
        return initialize_accounting_settings()

    def to_representation(self, instance):
        return AccountingSettingsSerializer(instance).data
