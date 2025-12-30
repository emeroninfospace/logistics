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
        self.update_job_order_status()

    def before_cancel(self):
        self.update_logistics_transactions()
        self.update_job_order_status()

    def validate(self):
        for item in self.items:
            if item.reference_id:
                job_order_rate = frappe.db.get_value("Job Order Item",item.order_item, "unit_price")

                if flt(item.unit_price) < flt(job_order_rate):
                    frappe.throw(
                        f"""
                        Rate mismatch for Item <b>{item.item_code}</b><br>
                        Job Order Rate (<b>{job_order_rate}</b>) is higher than
                        Outbound Rate (<b>{item.unit_price}</b>).
                        """
                    )

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

    def update_job_order_status(self):
        job_orders = set(item.reference_id for item in self.items if item.reference_id)
        
        for job_order_id in job_orders:
            jo = frappe.get_doc('Job Order', job_order_id)
            
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
                
                for current_item in self.items:
                    if current_item.order_item == jo_item.name:
                        processed_qty += flt(current_item.qty)
                
                total_processed_qty += processed_qty
            
            if total_processed_qty <= 0:
                status = 'Pending'
            elif total_processed_qty >= total_job_order_qty:
                status = 'Completed'
            else:
                status = 'Partially'
            
            jo.db_set('status', status, update_modified=False)



@frappe.whitelist()
def get_job_order_items(job_order):
    if isinstance(job_order, str):
        job_order = json.loads(job_order)
    
    job_orders = frappe.get_all(
        "Job Order",
        filters={"name": ["in", job_order]},
        fields=["name", "boe_no"]
    )
    
    boe_map = {jo.name: jo.boe_no for jo in job_orders}
    
    items = frappe.get_all(
        "Job Order Item",
        filters={"parent": ["in", job_order]},
        fields=[
            "name",
            "parent",
            "item_code",
            "part_no",
            "description",
            "hs_code",
            "coo",
            "ref",
            "unit_wt",
            "gross_wt",
            "qty",
            "unit_price"
        ]
    )
    
    for item in items:
        item["boe_no"] = boe_map.get(item.parent)
        item["consumed_qty"] = get_consumed_qty(item.parent, item.item_code)
        item["balance_qty"] = item["qty"] - item["consumed_qty"]
    
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
def make_commercial_invoice(source_name, target_doc=None):
    def postprocess(source, target):
        target.run_method("set_missing_values")
        target.run_method("calculate_totals")

    doclist = get_mapped_doc(
        "Outbound",
        source_name,
        {
            "Outbound": {
                "doctype": "Commercial Invoice",
                "field_map": {   
                "total_qty": "total_units",
                "total_gross_wt": "total_weight",
                "total_value": "subtotal",
                "total_value": "grand_total",
                "inco_term": "incoterms",
                "bill_to": "ship_from",

                },
            },
            "Outbound Item": {
                "doctype": "Invoice Item",
                "field_map": {
                    "item_code": "item",
                    "description": "description",
                    "qty": "qty",
                    "part_no": "part_number",
                    "gross_wt": "weight",
                    "total_value": "extended_price",
                    "name": "outbound_item",
                    "parent": "outbound",
                },
            },
        },
        target_doc,
        postprocess=postprocess,
    )
    doclist.insert(ignore_permissions=True)

    return doclist


