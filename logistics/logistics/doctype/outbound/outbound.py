# Copyright (c) 2025, Emeron Infospace and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
import json
from frappe.model.mapper import get_mapped_doc
from frappe.utils import flt
		


class Outbound(Document):

    def before_submit(self):
        self.create_logistics_transactions()
        self.validate_boe()
     
    def before_cancel(self):
        self.update_logistics_transactions()
        

    def on_submit(self):
        self.update_inbound_item_balance()
        self.update_inbound_status()

    def on_cancel(self):
        self.update_inbound_item_balance()
        self.update_inbound_status()

    def validate(self):
        self.validate_unit_prices()

    def create_logistics_transactions(self):
        for item in self.items:
            if not item.reference_id:
                frappe.throw(
                    "Reference ID is required for all items to create Logistics Transaction."
                )

            exists = frappe.db.exists(
                "Logistics Transaction",
                {
                    "reference_id": item.reference_id,
                    "order_item": item.order_item,
                    "item": item.item_code,
                },
            )

            if exists:
                doc = frappe.get_doc("Logistics Transaction", exists)
                doc.out_qty = item.qty or 0
                doc.out_weight = item.gross_wt or 0
                doc.out_value = item.total_value or 0
                doc.outbound_id = self.name
                doc.outbound_item = item.name
                doc.save(ignore_permissions=True)

    def update_logistics_transactions(self):
        for item in self.items:
            if not item.reference_id:
                continue

            logistics_transactions = frappe.get_list(
                "Logistics Transaction",
                filters={
                    "reference_id": item.reference_id,
                    "order_item": item.order_item,
                    "item": item.item_code,
                },
                pluck="name",
            )

            for lt in logistics_transactions:
                lt_doc = frappe.get_doc("Logistics Transaction", lt)
                lt_doc.out_qty = 0
                lt_doc.out_weight = 0
                lt_doc.out_value = 0
                lt_doc.outbound_id = ""
                lt_doc.outbound_item = ""
                lt_doc.save(ignore_permissions=True)

    def update_inbound_status(self):
        job_orders = set(item.reference_id for item in self.items if item.reference_id)
        
        for job_order_id in job_orders:
            jo = frappe.get_doc('Inbound', job_order_id)
            
            total_job_order_qty = 0
            total_processed_qty = 0
            
            for jo_item in jo.items:
                total_job_order_qty += flt(jo_item.qty)
                
                processed = frappe.db.sql("""
                    SELECT IFNULL(SUM(oi.qty), 0) as processed_qty
                    FROM `tabOutbound Item` oi
                    INNER JOIN `tabOutbound` o ON oi.parent = o.name
                    WHERE oi.order_item = %s
                    AND o.docstatus = 1
                """, (jo_item.name,), as_dict=1)
                
                processed_qty = flt(processed[0].processed_qty) if processed else 0
                
                total_processed_qty += processed_qty
            
            if total_processed_qty <= 0:
                status = 'Pending'
            elif total_processed_qty >= total_job_order_qty:
                status = 'Completed'
            else:
                status = 'Partially'
            
            jo.db_set('status', status, update_modified=False)

    def validate_unit_prices(self):
        for item in self.items:
            if item.reference_id:
                inbound_item = frappe.db.get_value(
                    "Inbound Item",
                    item.order_item,
                    ["unit_price", "parent"],
                    as_dict=1
                )
                if not inbound_item:
                    continue

                inbound_parent = frappe.db.get_value(
                    "Inbound",
                    inbound_item.parent,
                    ["currency", "conversion_rate"],
                    as_dict=1
                )

                inbound_conv_rate  = flt(inbound_parent.conversion_rate) or 1
                inbound_currency   = inbound_parent.currency or "AED"
                is_foreign_inbound = inbound_currency != "AED"

                inbound_price_aed = (
                    flt(inbound_item.unit_price) * inbound_conv_rate
                    if is_foreign_inbound
                    else flt(inbound_item.unit_price)
                )

                outbound_conv_rate  = flt(self.conversion_rate) or 1
                outbound_currency   = self.currency or "AED"
                is_foreign_outbound = outbound_currency != "AED"

                outbound_price_aed = (
                    flt(item.unit_price) * outbound_conv_rate
                    if is_foreign_outbound
                    else flt(item.unit_price)
                )

                if outbound_price_aed < inbound_price_aed:
                    frappe.throw(
                        f"""
                        Rate mismatch for Item <b>{item.item_code}</b><br>
                        Inbound Rate (<b>{inbound_price_aed:.4f}</b>) is higher than
                        Outbound Rate (<b>{outbound_price_aed:.4f}</b>).
                        """
                    )

    def validate_boe(self):
        for item in self.items:
            if not item.boe_no:
                frappe.throw(f"BOE No is required for item {item.item_code}.")

    
    def update_inbound_item_balance(self):
        inbound_item_rows = set(
            item.order_item for item in self.items if item.order_item
        )

        for inbound_item_row in inbound_item_rows:

            inbound_qty = frappe.db.get_value(
                "Inbound Item",
                inbound_item_row,
                "qty"
            ) or 0

            issued_qty = frappe.db.sql("""
                SELECT IFNULL(SUM(oi.qty), 0)
                FROM `tabOutbound Item` oi
                INNER JOIN `tabOutbound` o ON o.name = oi.parent
                WHERE oi.order_item = %s
                AND o.docstatus = 1
            """, inbound_item_row)[0][0]

            balance_qty = flt(inbound_qty) - flt(issued_qty)

            if balance_qty < 0:
                frappe.throw(
                    f"Item Row {inbound_item_row}: "
                    f"Outbound qty exceeds Inbound qty"
                )

            frappe.db.set_value(
                "Inbound Item",
                inbound_item_row,
                "balance_qty",
                balance_qty,
                update_modified=False
            )




@frappe.whitelist()
def get_job_order_items(job_order):
    if isinstance(job_order, str):
        job_order = json.loads(job_order)
    
    job_orders = frappe.get_all(
        "Inbound",
        filters={"name": ["in", job_order]},
        fields=["name", "boe_no", "currency", "conversion_rate"]  # ✅ fetch currency info
    )
    
    boe_map      = {jo.name: jo.boe_no         for jo in job_orders}
    currency_map = {jo.name: jo.currency        for jo in job_orders}  # ✅
    rate_map     = {jo.name: jo.conversion_rate for jo in job_orders}  # ✅
    
    items = frappe.get_all(
        "Inbound Item",
        filters={"parent": ["in", job_order]},
        fields=[
            "name", "parent", "item_code", "part_no",
            "description", "hs_code", "coo", "ref",
            "unit_wt", "gross_wt", "qty", "unit_price",
            "hs_description", "uom"
        ]
    )
    
    for item in items:
        item["boe_no"]          = boe_map.get(item.parent)
        item["inbound_currency"]        = currency_map.get(item.parent, "AED")  # ✅
        item["inbound_conversion_rate"] = rate_map.get(item.parent, 1)          # ✅
        item["consumed_qty"]    = get_consumed_qty(item.parent, item.item_code)
        item["balance_qty"]     = item["qty"] - item["consumed_qty"]
    
    return items


def get_consumed_qty(job_order, item_code):
    consumed = frappe.db.sql("""
        SELECT IFNULL(SUM(qty), 0) as total_qty
        FROM `tabOutbound Item`
        WHERE reference_id = %s 
        AND item_code = %s
        AND docstatus < 2
    """, (job_order, item_code), as_dict=1)
    
    return consumed[0].total_qty if consumed else 0

@frappe.whitelist()
def get_consolidated_hs_rows(docname):
    doc = frappe.get_doc("Outbound", docname)
    consolidated = {}

    for item in doc.items:
        key = (item.hs_code or "N/A") + "||" + (item.coo or "N/A")

        if key not in consolidated:
            consolidated[key] = {
                "hs_code":     item.hs_code or "N/A",
                "description": item.material_description or item.item_code or "",
                "coo":         item.coo or "N/A",
                "qty":         flt(item.qty),
                "gross_wt":    flt(item.gross_wt),
                "total_value": flt(item.total_value)
            }
        else:
            consolidated[key]["qty"]         += flt(item.qty)
            consolidated[key]["gross_wt"]    += flt(item.gross_wt)
            consolidated[key]["total_value"] += flt(item.total_value)

    return list(consolidated.values())