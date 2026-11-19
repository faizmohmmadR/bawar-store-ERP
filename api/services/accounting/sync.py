"""Auto-post journal entries from business transactions (per-currency books)."""
import logging
from decimal import Decimal

from django.utils import timezone

from api.models.data.currency import BASE_CURRENCY_ID
from api.services.accounting.amounts import (
    amount_native,
    cogs_base,
    cogs_in_txn_currency,
    d,
    source_currency_id,
)
from api.services.accounting.coa import (
    ensure_accounting_ready,
    get_payment_asset_account,
    gl_for_source,
)
from api.services.accounting.posting import delete_journal_for_source, replace_journal_for_source
from api.services.accounting.totals import (
    recalculate_return_totals,
    recalculate_sale_totals,
    sync_order_paid_amount,
)

logger = logging.getLogger(__name__)

SKIP_JOURNAL_STATUSES = frozenset({'draft', 'cancelled'})


def _should_post_journal(source):
    status = getattr(source, 'status', None)
    if status and status in SKIP_JOURNAL_STATUSES:
        return False
    return True


def _ready(obj):
    return ensure_accounting_ready(
        currency_id=source_currency_id(obj),
    )


def _cost_in_base(amount, currency_id, at_datetime=None):
    """Convert a native unit cost into AFN for inventory / COGS / damage journals."""
    from api.utils.currency import convert_currency

    return convert_currency(amount, currency_id, BASE_CURRENCY_ID, at_datetime)


def _item_unit_cost(sales_item):
    """Per-piece cost in AFN (base); unit_cost snapshot is always stored in AFN."""
    if sales_item.cost_is_known or d(sales_item.unit_cost) > 0:
        return d(sales_item.unit_cost)
    stock = sales_item.stock
    if stock and stock.buy_price:
        sale = sales_item.sales
        return _cost_in_base(
            stock.buy_price,
            stock.currency,
            getattr(sale, 'sale_date', None),
        )
    return Decimal('0')


def _cogs_pieces_for_item(item):
    from api.utils.packaging import sales_item_pieces

    return sales_item_pieces(item)


def _calculate_cogs_for_sale(sale):
    from api.models.data.sales import SalesItems
    total_cost = Decimal('0')
    for item in sale.sales_items.select_related('stock', 'raw_material_stock').all():
        unit_cost = _item_unit_cost(item)
        if item.sale_source == SalesItems.SOURCE_TANK:
            quantity = d(
                item.quantity if item.unit == SalesItems.UNIT_KG
                else item.liter_amount
            )
            if unit_cost > 0 and quantity > 0:
                total_cost += unit_cost * quantity
            continue
        if item.sale_source == SalesItems.SOURCE_RAW_MATERIAL:
            from api.services.raw_material_sales import raw_stock_quantity
            quantity = raw_stock_quantity(item)
            if unit_cost > 0 and quantity > 0:
                total_cost += unit_cost * quantity
            continue
        pieces = _cogs_pieces_for_item(item)
        if unit_cost > 0 and pieces > 0:
            total_cost += unit_cost * pieces
    return total_cost


def _calculate_cogs_for_return(return_order):
    """Mirror sale COGS: tank kg/L, raw-material qty, finished-goods pieces."""
    from api.models.data.sales import SalesItems

    total_cost = Decimal('0')
    for item in return_order.return_items.select_related(
        'sales_item__stock',
        'sales_item__raw_material_stock',
    ).all():
        sales_item = item.sales_item
        unit_cost = _item_unit_cost(sales_item)
        if unit_cost <= 0:
            continue

        if sales_item.sale_source == SalesItems.SOURCE_TANK:
            if sales_item.unit == SalesItems.UNIT_KG:
                quantity = d(item.quantity_kg) or d(item.liter_amount)
            else:
                quantity = d(item.liter_amount)
            if quantity > 0:
                total_cost += unit_cost * quantity
            continue

        if sales_item.sale_source == SalesItems.SOURCE_RAW_MATERIAL:
            if sales_item.unit == SalesItems.UNIT_KG:
                quantity = d(item.quantity_kg) or d(item.liter_amount)
            else:
                quantity = d(item.liter_amount) or d(item.quantity_kg)
            if quantity > 0:
                from api.services.raw_material_sales import raw_stock_quantity
                total_cost += unit_cost * raw_stock_quantity(sales_item) * quantity / d(sales_item.quantity)
            continue

        # Returned lot snapshots retain the actual cost even when a sale spans prices.
        if item.batch_returns:
            total_cost += sum((d(row['quantity']) * d(row['unit_cost_afn'])
                              for row in item.batch_returns), Decimal('0'))
            continue
        # Finished-goods returns store piece qty in liter_amount.
        pieces = d(item.liter_amount)
        if pieces > 0:
            total_cost += unit_cost * pieces
    return total_cost


def _calculate_commission_afn_for_sale(sale):
    """Sum of line commissions in AFN (commission is never FX-converted)."""
    from api.serializers.data.sales import sales_item_commission_total

    total = Decimal('0')
    for item in sale.sales_items.all():
        total += sales_item_commission_total(item)
    return total


def sync_sales_journal(sale):
    if not _ready(sale):
        return
    if sale.vendor_id:
        from api.services.vendor_goods import sync_vendor_goods_journal
        recalculate_sale_totals(sale)
        sync_vendor_goods_journal(sale, _calculate_cogs_for_sale(sale))
        return
    if not _should_post_journal(sale):
        delete_journal_for_source(sale)
        return

    recalculate_sale_totals(sale)
    sale.refresh_from_db(
        fields=['total_amount', 'total_amount_base', 'exchange_rate'])
    total = amount_native(sale, 'total_amount')
    cogs = cogs_in_txn_currency(
        sale, cogs_base(_calculate_cogs_for_sale(sale)))

    # Employee product sale: goods settle wages — Dr payroll expense / Cr revenue (no AR/cash).
    if sale.employee_id and not sale.is_free and total > 0:
        debit_gl = gl_for_source('payroll_expense', sale)
        debit_description = 'Salary paid in goods'
    else:
        debit_gl = gl_for_source('accounts_receivable', sale)
        debit_description = 'Accounts receivable'

    lines = [
        {'gl_account': debit_gl, 'debit': total, 'credit': Decimal(
            '0'), 'description': debit_description},
        {'gl_account': gl_for_source('sales_revenue', sale), 'debit': Decimal(
            '0'), 'credit': total, 'description': 'Sales revenue'},
    ]
    if cogs > 0:
        lines.extend([
            {'gl_account': gl_for_source('free_distribution' if sale.is_free else 'cogs', sale), 'debit': cogs, 'credit': Decimal(
                '0'), 'description': 'Free goods distribution' if sale.is_free else 'Cost of goods sold'},
            {'gl_account': gl_for_source('inventory', sale), 'debit': Decimal(
                '0'), 'credit': cogs, 'description': 'Inventory reduction'},
        ])

    # replace_all clears prior sale + commission accrual journals for this sale.
    replace_journal_for_source(
        sale,
        entry_date=sale.sale_date,
        reference_number=sale.invoice_number,
        description=sale.notes or f'Sales {sale.invoice_number}',
        lines=lines,
    )

    # Accrue commission in AFN (always), independent of invoice currency.
    commission_ref = f'{sale.invoice_number}-COMM'
    commission_afn = _calculate_commission_afn_for_sale(sale)
    if commission_afn > 0 and sale.salesman_id:
        if not ensure_accounting_ready(currency_id=BASE_CURRENCY_ID):
            # Keep the main sale journal; drop any stale commission accrual.
            _drop_journal_ref(sale, commission_ref)
            return

        class _AfnCtx:
            pass

        afn_ctx = _AfnCtx()
        afn_ctx.currency = BASE_CURRENCY_ID
        salesman_name = getattr(
            getattr(sale, 'salesman', None), 'name', '') or 'salesman'
        replace_journal_for_source(
            sale,
            entry_date=sale.sale_date,
            reference_number=commission_ref,
            description=f'Commission accrual — {salesman_name} ({sale.invoice_number})',
            replace_all=False,
            lines=[
                {
                    'gl_account': gl_for_source('commission_expense', afn_ctx),
                    'debit': commission_afn,
                    'credit': Decimal('0'),
                    'currency': BASE_CURRENCY_ID,
                    'exchange_rate': Decimal('1'),
                    'base_debit': commission_afn,
                    'base_credit': Decimal('0'),
                    'description': f'Commission expense — {salesman_name}',
                },
                {
                    'gl_account': gl_for_source('commission_payable', afn_ctx),
                    'debit': Decimal('0'),
                    'credit': commission_afn,
                    'currency': BASE_CURRENCY_ID,
                    'exchange_rate': Decimal('1'),
                    'base_debit': Decimal('0'),
                    'base_credit': commission_afn,
                    'description': f'Commission payable — {salesman_name}',
                },
            ],
        )
    else:
        _drop_journal_ref(sale, commission_ref)


def sync_return_journal(return_order):
    """
    Credit note + optional cash refund without double-counting.

    Customer return:
      Dr Sales Returns  = total
      Cr AR             = total - refund
      Cr Cash           = refund

    Employee goods return:
      Dr Sales Returns  = total
      Cr Payroll expense = total
    """
    if not _ready(return_order):
        return
    if not _should_post_journal(return_order):
        delete_journal_for_source(return_order)
        return

    recalculate_return_totals(return_order)
    return_order.refresh_from_db(
        fields=['total_amount', 'total_amount_base',
                'refund_amount', 'refund_amount_base', 'exchange_rate']
    )
    total = amount_native(return_order, 'total_amount')
    refund = amount_native(return_order, 'refund_amount')
    if refund > total:
        refund = total
    employee_goods_return = bool(return_order.sales.employee_id)
    ar_credit = total - refund
    cogs = cogs_in_txn_currency(return_order, cogs_base(
        _calculate_cogs_for_return(return_order)))

    lines = [
        {
            'gl_account': gl_for_source('sales_returns', return_order),
            'debit': total,
            'credit': Decimal('0'),
            'description': 'Sales return',
        },
    ]
    if employee_goods_return:
        lines.append({
            'gl_account': gl_for_source('payroll_expense', return_order),
            'debit': Decimal('0'),
            'credit': total,
            'description': 'Reduce salary paid in goods',
        })
    elif ar_credit > 0:
        lines.append({
            'gl_account': gl_for_source('accounts_receivable', return_order),
            'debit': Decimal('0'),
            'credit': ar_credit,
            'description': 'Reduce receivable',
        })
    if refund > 0:
        lines.append({
            'gl_account': gl_for_source('cash', return_order),
            'debit': Decimal('0'),
            'credit': refund,
            'description': 'Cash refund to customer',
        })

    if cogs > 0:
        lines.extend([
            {'gl_account': gl_for_source('inventory', return_order), 'debit': cogs, 'credit': Decimal(
                '0'), 'description': 'Inventory restoration'},
            {'gl_account': gl_for_source('free_distribution' if return_order.sales.is_free else 'cogs', return_order), 'debit': Decimal(
                '0'), 'credit': cogs, 'description': 'COGS reversal'},
        ])

    replace_journal_for_source(
        return_order,
        entry_date=return_order.return_date,
        reference_number=return_order.return_number,
        description=return_order.notes or f'Return {return_order.return_number}',
        lines=lines,
    )


def sync_expense_journal(expense):
    if getattr(expense, 'deleted_at', None) is not None:
        delete_journal_for_source(expense)
        return
    if not _ready(expense):
        return
    amount = amount_native(expense, 'amount')
    if amount <= 0:
        delete_journal_for_source(expense)
        return
    method = getattr(expense, 'payment_method', None) or 'cash'
    cash_account = get_payment_asset_account(
        method,

        currency_id=source_currency_id(expense),
    )
    method_label = method.replace('_', ' ').title()
    replace_journal_for_source(
        expense,
        entry_date=expense.expense_date,
        reference_number=f'EXP-{expense.id}',
        description=expense.description or f'Expense {expense.category.name}',
        lines=[
            {
                'gl_account': gl_for_source('operating_expense', expense),
                'debit': amount,
                'credit': Decimal('0'),
                'description': expense.category.name,
            },
            {
                'gl_account': cash_account,
                'debit': Decimal('0'),
                'credit': amount,
                'description': f'Paid via {method_label}',
            },
        ],
    )


def sync_withdrawal_journal(withdrawal):
    """Owner draw: Dr Owner's Draw (equity) · Cr the selected Cash/Bank/Sarafi GL."""
    if getattr(withdrawal, 'deleted_at', None) is not None:
        delete_journal_for_source(withdrawal)
        return
    if not _ready(withdrawal):
        return
    amount = amount_native(withdrawal, 'amount')
    if amount <= 0:
        delete_journal_for_source(withdrawal)
        return
    asset_account = getattr(withdrawal, 'gl_account', None)
    if asset_account is None:
        method = getattr(withdrawal, 'payment_method', None) or 'cash'
        asset_account = get_payment_asset_account(
            method,

            currency_id=source_currency_id(withdrawal),
        )
    draw_account = gl_for_source('owner_draw', withdrawal)
    acct_label = f'{asset_account.code} {asset_account.name}' if asset_account else 'Cash'
    replace_journal_for_source(
        withdrawal,
        entry_date=withdrawal.withdrawal_date,
        reference_number=withdrawal.reference_number or f'WD-{withdrawal.id}',
        description=withdrawal.description or f'Owner withdrawal from {acct_label}',
        lines=[
            {
                'gl_account': draw_account,
                'debit': amount,
                'credit': Decimal('0'),
                'description': "Owner's draw",
            },
            {
                'gl_account': asset_account,
                'debit': Decimal('0'),
                'credit': amount,
                'description': acct_label,
            },
        ],
    )


def sync_payroll_journal(payroll):
    if getattr(payroll, 'deleted_at', None) is not None:
        delete_journal_for_source(payroll)
        return
    if not _ready(payroll):
        return
    amount = amount_native(
        payroll, 'net_salary') or amount_native(payroll, 'amount')
    if amount <= 0:
        delete_journal_for_source(payroll)
        return

    method = getattr(payroll, 'payment_method', None) or 'cash'
    # Goods settlements are posted on the linked sale (expense ↔ revenue); avoid double cash/expense.
    if method == 'goods' or getattr(payroll, 'source_sale_id', None):
        delete_journal_for_source(payroll)
        return

    if payroll.payroll_type == 'advance':
        debit_account = gl_for_source('employee_advance', payroll)
        debit_description = 'Employee advance'
        reference_prefix = 'ADV'
    else:
        debit_account = gl_for_source('payroll_expense', payroll)
        debit_description = 'Payroll expense'
        reference_prefix = 'PAY'

    cash_account = get_payment_asset_account(
        method,
        currency_id=source_currency_id(payroll),
    )
    method_label = method.replace('_', ' ').title()

    replace_journal_for_source(
        payroll,
        entry_date=payroll.payment_date,
        reference_number=(
            (payroll.reference_number or '').strip()
            or f'{reference_prefix}-{payroll.id}'
        ),
        description=payroll.notes or f'{payroll.get_payroll_type_display()} {payroll.month} {payroll.year}',
        lines=[
            {'gl_account': debit_account, 'debit': amount,
                'credit': Decimal('0'), 'description': debit_description},
            {
                'gl_account': cash_account,
                'debit': Decimal('0'),
                'credit': amount,
                'description': f'Paid via {method_label}',
            },
        ],
    )


def _drop_journal_ref(source, reference_number):
    from django.contrib.contenttypes.models import ContentType
    from api.models.data.journal import JournalEntry

    JournalEntry.objects.filter(
        content_type=ContentType.objects.get_for_model(source),
        object_id=source.pk,
        is_auto=True,
        reference_number=reference_number,
    ).delete()


def sync_loan_journal(loan):
    if not _ready(loan):
        return
    if getattr(loan, 'source_payment_id', None):
        # Created by intermediary-credit payment. Liability is recognized on payment journal.
        delete_journal_for_source(loan)
        return
    amount = amount_native(loan, 'amount')
    method = getattr(loan, 'payment_method', None) or 'cash'
    asset_account = get_payment_asset_account(
        method,

        currency_id=source_currency_id(loan),
    )
    method_label = method.replace('_', ' ').title()

    # Use context-aware GL accounts based on loaner type
    # Customer loans → AR/AP (trade operations)
    # Vendor loans → Loan Receivable/Payable (financing)
    loaner_type = getattr(loan, 'loaner_type', 'customer')
    if loaner_type == 'customer':
        loan_recv = gl_for_source('accounts_receivable', loan)
        loan_pay = gl_for_source('accounts_payable', loan)
        recv_label = 'Customer loan receivable'
        pay_label = 'Customer loan payable'
    else:  # vendor
        loan_recv = gl_for_source('loan_receivable', loan)
        loan_pay = gl_for_source('loan_payable', loan)
        recv_label = 'Vendor loan receivable'
        pay_label = 'Vendor loan payable'

    if loan.is_opening_balance:
        obe_account = gl_for_source('opening_balance_equity', loan)
        if not obe_account:
            raise ValueError(
                f'Opening balance equity account missing for loan {loan.pk}')
        if loan.loan_type == 'loan_in':
            lines = [
                {'gl_account': obe_account, 'debit': amount, 'credit': Decimal(
                    '0'), 'description': 'Opening balance equity'},
                {'gl_account': loan_pay, 'debit': Decimal(
                    '0'), 'credit': amount, 'description': f'Opening {pay_label}'},
            ]
        else:
            lines = [
                {'gl_account': loan_recv, 'debit': amount, 'credit': Decimal(
                    '0'), 'description': f'Opening {recv_label}'},
                {'gl_account': obe_account, 'debit': Decimal(
                    '0'), 'credit': amount, 'description': 'Opening balance equity'},
            ]
        description = loan.notes or f'Opening balance loan {loan.get_loan_type_display()}'
    elif loan.loan_type == 'loan_in':
        lines = [
            {'gl_account': asset_account, 'debit': amount, 'credit': Decimal(
                '0'), 'description': f'{method_label} received'},
            {'gl_account': loan_pay, 'debit': Decimal(
                '0'), 'credit': amount, 'description': pay_label},
        ]
        description = loan.notes or f'Loan {loan.get_loan_type_display()} via {method_label}'
    else:
        lines = [
            {'gl_account': loan_recv, 'debit': amount,
                'credit': Decimal('0'), 'description': recv_label},
            {'gl_account': asset_account, 'debit': Decimal(
                '0'), 'credit': amount, 'description': f'{method_label} paid'},
        ]
        description = loan.notes or f'Loan {loan.get_loan_type_display()} via {method_label}'

    replace_journal_for_source(
        loan,
        entry_date=loan.loan_date,
        reference_number=loan.bill_number or f'LOAN-{loan.id}',
        description=description,
        lines=lines,
    )


def sync_loan_payment_journal(payment):
    from api.services.accounting.fx import (
        MONETARY_PAYABLE,
        MONETARY_RECEIVABLE,
        annotate_settlement_lines,
        carrying_rate,
        settlement_rate,
    )

    loan = payment.loan
    currency_id = source_currency_id(loan)
    if not ensure_accounting_ready(currency_id=currency_id):
        return

    amount = amount_native(payment, 'amount')
    if amount <= 0:
        delete_journal_for_source(payment)
        return
    method = getattr(payment, 'payment_method', None) or getattr(
        loan, 'payment_method', None) or 'cash'
    asset_account = get_payment_asset_account(
        method,

        currency_id=currency_id,
    )
    method_label = method.replace('_', ' ').title()

    # Use context-aware GL accounts based on loaner type
    # Customer loans → AR/AP (trade operations)
    # Vendor loans → Loan Receivable/Payable (financing)
    loaner_type = getattr(loan, 'loaner_type', 'customer')
    if loaner_type == 'customer':
        loan_recv = gl_for_source('accounts_receivable', loan)
        loan_pay = gl_for_source('accounts_payable', loan)
        recv_desc = 'Customer loan collection'
        pay_desc = 'Customer loan repayment'
    else:  # vendor
        loan_recv = gl_for_source('loan_receivable', loan)
        loan_pay = gl_for_source('loan_payable', loan)
        recv_desc = 'Vendor loan collection'
        pay_desc = 'Vendor loan repayment'

    carry = carrying_rate(loan, currency_id)
    settle = settlement_rate(payment, currency_id, payment.payment_date)

    if loan.loan_type == 'loan_in':
        lines = annotate_settlement_lines(

            currency_id=currency_id,
            native_amount=amount,
            cash_gl=asset_account,
            monetary_gl=loan_pay,
            monetary_kind=MONETARY_PAYABLE,
            carrying_rate_value=carry,
            settlement_rate_value=settle,
            cash_is_debit=False,
            cash_description=f'{method_label} paid',
            monetary_description=pay_desc,
        )
    else:
        lines = annotate_settlement_lines(

            currency_id=currency_id,
            native_amount=amount,
            cash_gl=asset_account,
            monetary_gl=loan_recv,
            monetary_kind=MONETARY_RECEIVABLE,
            carrying_rate_value=carry,
            settlement_rate_value=settle,
            cash_is_debit=True,
            cash_description=f'{method_label} received',
            monetary_description=recv_desc,
        )

    replace_journal_for_source(
        payment,
        entry_date=payment.payment_date,
        reference_number=payment.reference_number or payment.bill_number or f'LPAY-{payment.id}',
        description=payment.notes or f'Loan payment for {loan} via {method_label}',
        lines=lines,
    )


def sync_payment_journal(payment):
    if payment.is_advance or payment.is_credit_application:
        from api.services.accounting.payment_credit import sync_credit_payment_journal
        return sync_credit_payment_journal(payment)
    from api.services.accounting.fx import (
        MONETARY_PAYABLE,
        MONETARY_RECEIVABLE,
        annotate_settlement_lines,
        carrying_rate,
        settlement_rate,
    )

    related_object = payment.content_object
    if not related_object:
        return
    # GFK caches the related instance; refresh so status/totals match the DB.
    if hasattr(related_object, 'refresh_from_db'):
        related_object.refresh_from_db()
    currency_id = source_currency_id(payment)
    if getattr(payment, 'currency', None) is None:
        currency_id = source_currency_id(related_object)

    if not ensure_accounting_ready(currency_id=currency_id):
        return

    amount = amount_native(payment, 'amount')
    sync_order_paid_amount(related_object)
    if amount <= 0:
        delete_journal_for_source(payment)
        return
    method = getattr(payment, 'payment_method', None) or 'cash'

    class _Ctx:
        pass

    ctx = _Ctx()
    ctx.currency = currency_id

    if method == 'intermediary_credit':
        # Legacy purchase intermediary payments are no longer posted.
        delete_journal_for_source(payment)
        return
    asset_account = get_payment_asset_account(
        method,
        currency_id=currency_id,
    )
    method_label = {'cash': 'Cash', 'bank': 'Bank',
                    'sarafi': 'Sarafi'}.get(method, 'Cash')

    carry = carrying_rate(related_object, currency_id)
    settle = settlement_rate(payment, currency_id, payment.payment_date)

    if payment.payment_type == 'sale':
        from api.models.data.sales import Sales
        if not isinstance(related_object, Sales):
            return
        lines = annotate_settlement_lines(
            currency_id=currency_id,
            native_amount=amount,
            cash_gl=asset_account,
            monetary_gl=gl_for_source('accounts_receivable', ctx),
            monetary_kind=MONETARY_RECEIVABLE,
            carrying_rate_value=carry,
            settlement_rate_value=settle,
            cash_is_debit=True,
            cash_description=f'Payment received via {method_label}',
            monetary_description='Reduce receivable',
        )
    elif payment.payment_type == 'purchase':
        from api.models.data.raw_materials import RawMaterialPurchase
        if not isinstance(related_object, RawMaterialPurchase):
            return
        # AP is only recognized when the purchase is received; settle only then.
        if related_object.status != 'received':
            delete_journal_for_source(payment)
            return
        lines = annotate_settlement_lines(
            currency_id=currency_id,
            native_amount=amount,
            cash_gl=asset_account,
            monetary_gl=gl_for_source('accounts_payable', ctx),
            monetary_kind=MONETARY_PAYABLE,
            carrying_rate_value=carry,
            settlement_rate_value=settle,
            cash_is_debit=False,
            cash_description=f'Payment paid via {method_label}',
            monetary_description='Reduce payable',
        )
    else:
        return

    replace_journal_for_source(
        payment,
        entry_date=payment.payment_date,
        reference_number=payment.reference_number or f'PAY-{payment.id}',
        description=payment.notes or f'{payment.payment_type.title()} payment ({method_label})',
        lines=lines,
    )


def sync_stock_adjustment_journal(source, *, reason='Adjustment', old_piece_amount=0, old_buy_price=0):
    from api.models.data.stock_adjustment import StockAdjustment

    if isinstance(source, StockAdjustment):
        adj = source
        if adj.adjustment_type == StockAdjustment.ADJUSTMENT_TYPE_TRANSFER:
            # Transfers stay inside Inventory (1100); clear any prior loss/gain JE.
            delete_journal_for_source(adj)
            return
        batch = adj.inventory_batch
        if not ensure_accounting_ready(currency_id=BASE_CURRENCY_ID):
            return

        qty_change = d(adj.quantity_change)
        if qty_change == 0:
            delete_journal_for_source(adj)
            return
        unit_cost = _cost_in_base(
            d(adj.unit_cost) if adj.unit_cost is not None else (
                d(batch.unit_cost) if batch else Decimal('0')),
            getattr(batch, 'currency', None) or BASE_CURRENCY_ID,
            adj.adjustment_date,
        )
        value_change = qty_change * unit_cost
        if value_change == 0:
            delete_journal_for_source(adj)
            return

        class _Proxy:
            pass

        proxy = _Proxy()
        proxy.currency = BASE_CURRENCY_ID

        inv_account = gl_for_source('inventory', proxy)
        # Gains → other income; losses → stock adjustment expense (never credit an expense account).
        gain_account = gl_for_source('other_income', proxy) or gl_for_source(
            'opening_balance_equity', proxy
        )
        loss_account = gl_for_source('stock_adjustment', proxy) or gl_for_source(
            'operating_expense', proxy
        )
        reason_text = adj.reason or adj.get_adjustment_type_display()

        if value_change > 0:
            lines = [
                {
                    'gl_account': inv_account,
                    'debit': value_change,
                    'credit': Decimal('0'),
                    'description': f'Stock increase - {reason_text}',
                },
                {
                    'gl_account': gain_account,
                    'debit': Decimal('0'),
                    'credit': value_change,
                    'description': f'Stock adjustment gain - {reason_text}',
                },
            ]
        else:
            abs_val = abs(value_change)
            lines = [
                {
                    'gl_account': loss_account,
                    'debit': abs_val,
                    'credit': Decimal('0'),
                    'description': f'Stock loss - {reason_text}',
                },
                {
                    'gl_account': inv_account,
                    'debit': Decimal('0'),
                    'credit': abs_val,
                    'description': f'Stock decrease - {reason_text}',
                },
            ]

        replace_journal_for_source(
            adj,
            entry_date=adj.adjustment_date,
            reference_number=adj.reference_number or f'STK-ADJ-{adj.id}',
            description=f'Stock adjustment ({reason_text}) - Batch {batch.batch_number if batch else adj.id}',
            lines=lines,
        )
        return

    stock = source

    class _StockCtx:
        pass

    ctx = _StockCtx()
    ctx.currency = BASE_CURRENCY_ID
    if not ensure_accounting_ready(currency_id=BASE_CURRENCY_ID):
        return

    new_pieces = d(stock.piece_amount)
    new_price = _cost_in_base(
        d(stock.buy_price),
        getattr(stock, 'currency', None) or BASE_CURRENCY_ID,
        getattr(stock, 'updated_at', None),
    )
    old_pieces = d(old_piece_amount)
    old_price = _cost_in_base(
        d(old_buy_price),
        getattr(stock, 'currency', None) or BASE_CURRENCY_ID,
        getattr(stock, 'updated_at', None),
    )
    piece_diff = new_pieces - old_pieces
    if piece_diff == 0:
        return
    # Direct stock edit is inflow-only; outflows use sales / write-off / adjustments.
    if piece_diff < 0:
        return
    avg_price = old_price if old_pieces > 0 else new_price
    value_change = piece_diff * avg_price
    if value_change == 0:
        return

    inv_account = gl_for_source('inventory', ctx)
    # Opening / qty top-ups are balance-sheet equity, not P&L expense credits.
    equity_account = gl_for_source('opening_balance_equity', ctx)
    loss_account = gl_for_source('stock_adjustment', ctx) or gl_for_source(
        'operating_expense', ctx
    )

    if value_change > 0:
        lines = [
            {
                'gl_account': inv_account,
                'debit': value_change,
                'credit': Decimal('0'),
                'description': f'Stock increase - {reason}',
            },
            {
                'gl_account': equity_account,
                'debit': Decimal('0'),
                'credit': value_change,
                'description': f'Opening / inventory capitalization - {reason}',
            },
        ]
    else:
        abs_val = abs(value_change)
        lines = [
            {
                'gl_account': loss_account,
                'debit': abs_val,
                'credit': Decimal('0'),
                'description': f'Stock loss - {reason}',
            },
            {
                'gl_account': inv_account,
                'debit': Decimal('0'),
                'credit': abs_val,
                'description': f'Stock decrease - {reason}',
            },
        ]

    replace_journal_for_source(
        stock,
        entry_date=stock.updated_at or stock.created_at,
        reference_number=f'STK-ADJ-{stock.id}',
        description=f'Stock adjustment for {stock.product.name}',
        lines=lines,
    )


def sync_inventory_batch_journal(batch):
    if getattr(batch, '_skip_batch_journal', False):
        return
    if not ensure_accounting_ready(currency_id=BASE_CURRENCY_ID):
        return

    value = d(batch.remaining_pieces) * _cost_in_base(
        d(batch.unit_cost),
        getattr(batch, 'currency', None) or BASE_CURRENCY_ID,
        getattr(batch, 'created_at', None),
    )
    if value <= 0:
        delete_journal_for_source(batch)
        return

    class _Proxy:
        pass

    proxy = _Proxy()
    proxy.currency = BASE_CURRENCY_ID

    replace_journal_for_source(
        batch,
        entry_date=batch.created_at or batch.updated_at,
        reference_number=batch.batch_number,
        description=f'Opening stock - {batch.product.name}',
        lines=[
            {'gl_account': gl_for_source('inventory', proxy), 'debit': value, 'credit': Decimal(
                '0'), 'description': 'Opening inventory'},
            {'gl_account': gl_for_source('opening_balance_equity', proxy), 'debit': Decimal(
                '0'), 'credit': value, 'description': 'Opening balance equity'},
        ],
    )


def sync_stock_transfer_journal(transfer):
    """
    No-op for now: stock transfers move quantity within the same Inventory (1100)
    account, so a GL entry would net to zero. Keep the hook for a future clearing
    account if multi-warehouse valuation is introduced.
    """
    return None


def sync_equipment_journal(equipment):
    """
    Post fixed-asset journals through the existing accounting engine.

    new_purchase: Dr Fixed Assets · Cr Cash/Bank/Sarafi
    opening / owner_contribution: Dr Fixed Assets · Cr Acc Dep · Cr Opening Balance Equity
    expense: skip — linked Expense posts operating expense instead
    """
    if not _ready(equipment):
        return

    acq = _equipment_acquisition_type(equipment)
    if acq == 'expense':
        delete_journal_for_source(equipment)
        return

    amount = d(equipment.quantity) * d(equipment.unit_cost)
    if amount <= 0:
        delete_journal_for_source(equipment)
        return

    if acq in ('opening', 'owner_contribution'):
        equity_label = (
            'Owner capital contribution'
            if acq == 'owner_contribution'
            else 'Opening balance equity'
        )
        description = equipment.notes or (
            f'Owner contribution: {equipment.name}'
            if acq == 'owner_contribution'
            else f'Opening equipment: {equipment.name}'
        )
        lines = _equipment_opening_asset_lines(
            equipment,
            amount=amount,
            equity_description=equity_label,
        )
    else:
        asset_account = gl_for_source('fixed_asset', equipment)
        if not asset_account:
            raise ValueError(
                f'Fixed asset account missing for equipment {equipment.pk}')
        method = getattr(equipment, 'payment_method', None) or 'cash'
        cash_account = get_payment_asset_account(
            method,

            currency_id=source_currency_id(equipment),
        )
        if not cash_account:
            raise ValueError(
                f'Payment account missing for equipment {equipment.pk}')
        method_label = method.replace('_', ' ').title()
        lines = [
            {
                'gl_account': asset_account,
                'debit': amount,
                'credit': Decimal('0'),
                'description': 'Equipment purchase',
            },
            {
                'gl_account': cash_account,
                'debit': Decimal('0'),
                'credit': amount,
                'description': f'Paid via {method_label}',
            },
        ]
        description = equipment.notes or f'Equipment purchase: {equipment.name}'

    from datetime import date as date_cls, datetime, time
    from django.contrib.contenttypes.models import ContentType
    from api.models.data.journal import JournalEntry

    acquired = getattr(equipment, 'acquired_date', None)
    if not acquired:
        entry_date = timezone.now()
    elif isinstance(acquired, datetime):
        entry_date = (
            acquired
            if timezone.is_aware(acquired)
            else timezone.make_aware(acquired, timezone.get_current_timezone())
        )
    elif isinstance(acquired, date_cls):
        entry_date = timezone.make_aware(
            datetime.combine(acquired, time.min),
            timezone.get_current_timezone(),
        )
    else:
        entry_date = timezone.now()

    # Stable acquisition ref so serial edits do not orphan prior JEs.
    # Preserve monthly depreciation journals (DEP-EQ-{pk}-YYYYMM) and
    # yearly depreciation journals (DEP-YEARLY-{pk}-YYYY) which are owned
    # by EquipmentDepreciation instances, not by Equipment.
    acquisition_ref = f'EQ-{equipment.id}'
    monthly_dep_prefix = f'DEP-EQ-{equipment.pk}-'
    yearly_dep_prefix = f'DEP-YEARLY-{equipment.pk}-'
    JournalEntry.objects.filter(
        content_type=ContentType.objects.get_for_model(equipment),
        object_id=equipment.pk,
        is_auto=True,
    ).exclude(
        reference_number__startswith=monthly_dep_prefix,
    ).exclude(
        reference_number__startswith=yearly_dep_prefix,
    ).delete()

    replace_journal_for_source(
        equipment,
        entry_date=entry_date,
        reference_number=acquisition_ref,
        description=description,
        replace_all=False,
        lines=lines,
    )


def _equipment_acquisition_type(equipment):
    acq = getattr(equipment, 'acquisition_type', None)
    if acq:
        return acq
    if getattr(equipment, 'record_as_expense', False):
        return 'expense'
    if getattr(equipment, 'is_opening_balance', False):
        return 'opening'
    return 'new_purchase'


def _equipment_opening_asset_lines(equipment, *, amount, equity_description='Opening balance equity'):
    """Dr Fixed Asset · Cr Accumulated Depreciation · Cr Opening Balance Equity (NBV)."""
    acc_dep = min(
        d(getattr(equipment, 'accumulated_depreciation', 0) or 0), amount)
    nbv = amount - acc_dep

    asset_account = gl_for_source('fixed_asset', equipment)
    if not asset_account:
        raise ValueError(
            f'Fixed asset account missing for equipment {equipment.pk}')

    lines = [
        {
            'gl_account': asset_account,
            'debit': amount,
            'credit': Decimal('0'),
            'description': 'Fixed asset cost',
        },
    ]

    if acc_dep > 0:
        acc_account = gl_for_source('accumulated_depreciation', equipment)
        if not acc_account:
            raise ValueError(
                f'Accumulated depreciation account missing for equipment {equipment.pk}',
            )
        lines.append(
            {
                'gl_account': acc_account,
                'debit': Decimal('0'),
                'credit': acc_dep,
                'description': 'Accumulated depreciation',
            },
        )

    if nbv > 0:
        equity_account = gl_for_source('opening_balance_equity', equipment)
        if not equity_account:
            raise ValueError(
                f'Opening balance equity account missing for equipment {equipment.pk}',
            )
        lines.append(
            {
                'gl_account': equity_account,
                'debit': Decimal('0'),
                'credit': nbv,
                'description': equity_description,
            },
        )

    return lines


def sync_batch_allocation_journal(allocation):
    """
    No-op: COGS/inventory is posted on the sale journal using unit_cost snapshots.
    Keeping this symbol so allocation signals do not crash.
    """
    return None


def sync_salesman_commission_payment_journal(payment):
    """
    Settle accrued commission payable in AFN:
      Dr Commission Payable (2200)
      Cr Cash / Bank / Sarafi
    """
    if not ensure_accounting_ready(currency_id=BASE_CURRENCY_ID):
        return

    amount = amount_native(payment, 'amount')
    if amount <= 0:
        delete_journal_for_source(payment)
        return

    method = getattr(payment, 'payment_method', None) or 'cash'
    asset_account = get_payment_asset_account(
        method, currency_id=BASE_CURRENCY_ID)
    method_label = {'cash': 'Cash', 'bank': 'Bank',
                    'sarafi': 'Sarafi'}.get(method, 'Cash')
    salesman_name = getattr(
        getattr(payment, 'salesman', None), 'name', '') or 'salesman'

    class _AfnCtx:
        pass

    ctx = _AfnCtx()
    ctx.currency = BASE_CURRENCY_ID

    replace_journal_for_source(
        payment,
        entry_date=payment.payment_date,
        reference_number=payment.reference_number or f'SCP-{payment.id}',
        description=payment.notes or f'Commission payment to {salesman_name} via {method_label}',
        lines=[
            {
                'gl_account': gl_for_source('commission_payable', ctx),
                'debit': amount,
                'credit': Decimal('0'),
                'description': f'Reduce commission payable — {salesman_name}',
            },
            {
                'gl_account': asset_account,
                'debit': Decimal('0'),
                'credit': amount,
                'description': f'Paid via {method_label}',
            },
        ],
    )


def sync_raw_material_purchase_journal(purchase):
    """
    Received raw-material purchase:
      Dr Inventory (1100)
      Cr Accounts Payable (2000)

    Draft / cancelled / pending purchases do not post. Inventory value stays in
    1100 through process → tank → packing; sale COGS credits inventory later.
    """
    if not _ready(purchase):
        return

    status = getattr(purchase, 'status', None)
    if status != 'received':
        delete_journal_for_source(purchase)
        _resync_payments_for_order(purchase, payment_type='purchase')
        return

    total = amount_native(purchase, 'total_amount')
    if total <= 0:
        delete_journal_for_source(purchase)
        _resync_payments_for_order(purchase, payment_type='purchase')
        return

    vendor_name = getattr(
        getattr(purchase, 'vendor', None), 'name', '') or 'vendor'
    replace_journal_for_source(
        purchase,
        entry_date=purchase.purchase_date,
        reference_number=purchase.invoice_number or f'RMP-{purchase.id}',
        description=purchase.notes or f'Raw material purchase {purchase.invoice_number} ({vendor_name})',
        lines=[
            {
                'gl_account': gl_for_source('inventory', purchase),
                'debit': total,
                'credit': Decimal('0'),
                'description': 'Raw material inventory',
            },
            {
                'gl_account': gl_for_source('accounts_payable', purchase),
                'debit': Decimal('0'),
                'credit': total,
                'description': f'Accounts payable - {vendor_name}',
            },
        ],
    )
    _resync_payments_for_order(purchase, payment_type='purchase')


def sync_raw_material_stock_opening_journal(stock, *, value=None):
    """
    Direct / opening raw-material stock (not purchase-received):
      Dr Inventory (1100)
      Cr Opening Balance Equity

    Purchase inflows are owned by sync_raw_material_purchase_journal. Call this
    only from the direct stock API or repair tooling — never from purchase
    reconciliation (that would double-count).
    """
    if getattr(stock, 'deleted_at', None) is not None:
        delete_journal_for_source(stock)
        return

    class _Proxy:
        pass

    proxy = _Proxy()
    proxy.currency = BASE_CURRENCY_ID
    if not ensure_accounting_ready(currency_id=BASE_CURRENCY_ID):
        return

    if value is None:
        qty = d(stock.quantity)
        price = d(stock.last_purchase_price)
        value = qty * price if qty > 0 and price > 0 else Decimal('0')
    else:
        value = d(value)

    if value <= 0:
        delete_journal_for_source(stock)
        return

    name = getattr(getattr(stock, 'raw_material', None), 'name', None) or f'stock {stock.pk}'
    entry_date = (
        getattr(stock, 'last_purchase_date', None)
        or getattr(stock, 'updated_at', None)
        or getattr(stock, 'created_at', None)
        or timezone.now()
    )
    replace_journal_for_source(
        stock,
        entry_date=entry_date,
        reference_number=f'RM-OPEN-{stock.pk}',
        description=f'Opening raw material stock - {name}',
        lines=[
            {
                'gl_account': gl_for_source('inventory', proxy),
                'debit': value,
                'credit': Decimal('0'),
                'description': 'Opening raw material inventory',
            },
            {
                'gl_account': gl_for_source('opening_balance_equity', proxy),
                'debit': Decimal('0'),
                'credit': value,
                'description': 'Opening balance equity',
            },
        ],
    )


def _resync_payments_for_order(order, *, payment_type):
    """Re-post payment journals after the parent order status/totals change."""
    from django.contrib.contenttypes.models import ContentType
    from api.models.data.payment import Payment

    ct = ContentType.objects.get_for_model(order)
    for payment in Payment.objects.filter(
        content_type=ct,
        object_id=order.pk,
        payment_type=payment_type,
    ):
        sync_payment_journal(payment)


def sync_packing_run_journal(run):
    """
    Packing reclassifies value already capitalized in Inventory (1100):
    tank liquid + packaging RM → finished goods. With a single inventory
    account the entry nets to zero, so we only clean up any prior journal.
    Finished batches must set _skip_batch_journal to avoid Opening Equity.
    """
    delete_journal_for_source(run)
    return None


def sync_stock_bottle_damage_journal(damage):
    """
    Damaged filled bottles: finished stock leaves sellable lots (batch skip),
    salvageable liquid stays in inventory as tank liquid, spilled/packaging
    value is written off.

    Dr Stock Adjustments (loss) · Cr Inventory
      for bottle_inventory_value − returned_liquid_cost
    """
    from api.models.data.currency import BASE_CURRENCY_ID

    if getattr(damage, 'deleted_at', None):
        delete_journal_for_source(damage)
        return None

    class _Ctx:
        pass

    ctx = _Ctx()
    ctx.currency = BASE_CURRENCY_ID
    if not ensure_accounting_ready(currency_id=BASE_CURRENCY_ID):
        return None

    bottle_value = Decimal('0')
    for src in (damage.bottle_sources or []):
        bottle_value += d(src.get('bottle_count')) * d(src.get('unit_cost_afn'))
    if bottle_value <= 0 and damage.bottle_count and damage.capacity_kg:
        # Fallback when sources lack unit costs.
        bottle_value = d(damage.bottle_count) * d(damage.liquid_unit_cost_afn) * d(damage.capacity_kg)

    returned = d(damage.returned_liquid_cost_afn)
    loss = bottle_value - returned
    if loss <= 0:
        delete_journal_for_source(damage)
        return None

    inv_account = gl_for_source('inventory', ctx)
    loss_account = gl_for_source('stock_adjustment', ctx) or gl_for_source(
        'operating_expense', ctx
    )
    product_name = getattr(getattr(damage, 'product', None), 'name', None) or f'#{damage.product_id}'
    lines = [
        {
            'gl_account': loss_account,
            'debit': loss,
            'credit': Decimal('0'),
            'description': (
                f'Bottle damage loss · {damage.bottle_count} × {product_name}'
            ),
        },
        {
            'gl_account': inv_account,
            'debit': Decimal('0'),
            'credit': loss,
            'description': (
                f'Inventory relief · bottle damage #{damage.pk}'
            ),
        },
    ]
    replace_journal_for_source(
        damage,
        entry_date=getattr(damage, 'recorded_at', None) or timezone.now(),
        reference_number=f'BOTTLE-DMG-{damage.pk}',
        description=(
            f'Damaged bottles · spilled {d(damage.damaged_liquid_kg)} kg · '
            f'returned {d(damage.remaining_liquid_kg)} kg to tank'
        ),
        lines=lines,
    )
    return None


def sync_storage_tank_leak_journal(leak):
    """Write off leaked tank liquid: Dr stock adjustment · Cr inventory."""
    from api.models.data.currency import BASE_CURRENCY_ID

    if getattr(leak, 'deleted_at', None):
        delete_journal_for_source(leak)
        return None

    class _Ctx:
        pass

    ctx = _Ctx()
    ctx.currency = BASE_CURRENCY_ID
    if not ensure_accounting_ready(currency_id=BASE_CURRENCY_ID):
        return None

    loss = d(leak.total_cost_afn)
    if loss <= 0:
        delete_journal_for_source(leak)
        return None

    inv_account = gl_for_source('inventory', ctx)
    loss_account = gl_for_source('stock_adjustment', ctx) or gl_for_source(
        'operating_expense', ctx
    )
    tank_name = getattr(getattr(leak, 'storage_tank', None), 'name', None) or f'#{leak.storage_tank_id}'
    lines = [
        {
            'gl_account': loss_account,
            'debit': loss,
            'credit': Decimal('0'),
            'description': f'Tank leak loss · {d(leak.quantity_kg)} kg · {tank_name}',
        },
        {
            'gl_account': inv_account,
            'debit': Decimal('0'),
            'credit': loss,
            'description': f'Inventory relief · tank leak #{leak.pk}',
        },
    ]
    replace_journal_for_source(
        leak,
        entry_date=getattr(leak, 'recorded_at', None) or timezone.now(),
        reference_number=f'TANK-LEAK-{leak.pk}',
        description=f'Storage tank leak · {d(leak.quantity_kg)} kg from {tank_name}',
        lines=lines,
    )
    return None
