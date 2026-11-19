"""Recover missing opening prices without repricing already-consumed inventory."""
import csv
from decimal import Decimal, ROUND_HALF_UP
from django.core.management.base import BaseCommand
from django.db import transaction
from api.models.data.raw_materials import RawMaterialPurchaseItem, RawMaterialStock

class Command(BaseCommand):
    help = 'Recover missing AFN prices only where received quantities exactly match stock on hand. Dry run by default.'
    def add_arguments(self, parser):
        parser.add_argument('--apply', action='store_true')
        parser.add_argument('--report')
    @transaction.atomic
    def handle(self, *args, **options):
        stocks = RawMaterialStock.objects.filter(last_purchase_price__lte=0).select_related('raw_material').order_by('id')
        if options['apply']: stocks=stocks.select_for_update()
        rows=[]; recovered=0
        for stock in stocks:
            items=list(RawMaterialPurchaseItem.objects.filter(raw_material_id=stock.raw_material_id,purchase__status='received',purchase__deleted_at__isnull=True,quantity__gt=0).select_related('purchase'))
            quantity=sum((i.quantity for i in items),Decimal('0'))
            value=sum((i.quantity * (i.price_per_unit_base or i.price_per_unit * i.purchase.exchange_rate) for i in items),Decimal('0'))
            price=None
            reason='Actual remaining-stock cost required; purchases do not reconcile with stock on hand'
            if quantity > 0 and quantity == stock.quantity and value > 0:
                price=(value/quantity).quantize(Decimal('0.000001'),rounding=ROUND_HALF_UP)
                reason='Recovered weighted opening cost from unconsumed received purchases';recovered+=1
                if options['apply']:
                    stock.last_purchase_price=price
                    stock.last_purchase_date=max(i.purchase.purchase_date.date() for i in items)
                    stock.save(update_fields=['last_purchase_price','last_purchase_date','updated_at'])
            rows.append({'raw_material_id':stock.raw_material_id,'raw_material_name':stock.raw_material.name,'unit':stock.raw_material.unit,'quantity':str(stock.quantity),'avg_price_per_unit_afn':str(price) if price else '', 'result':reason})
        if options.get('report'):
            with open(options['report'],'w',encoding='utf-8-sig',newline='') as report:
                writer=csv.DictWriter(report,fieldnames=['raw_material_id','raw_material_name','unit','quantity','avg_price_per_unit_afn','result']);writer.writeheader();writer.writerows(rows)
        self.stdout.write(f"{'Applied' if options['apply'] else 'Dry run'}: checked={len(rows)}, recovered={recovered}, need_actual_cost={len(rows)-recovered}")
