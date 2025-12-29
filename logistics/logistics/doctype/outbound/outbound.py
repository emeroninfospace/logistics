# Copyright (c) 2025, Emeron Infospace and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
import json
		


class Outbound(Document):

    def before_submit(self):
        self.create_logistics_transactions()
        self.update_job_orders_status()

    def before_cancel(self):
        self.update_logistics_transactions()
        self.update_job_orders_status()

    def validate(self):
        for item in self.items:
            if item.reference_id:
                job_order_rate = frappe.db.get_value("Job Order Item",item.order_item, "unit_price")

                if float(item.unit_price) < float(job_order_rate):
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

    def update_job_orders_status(self):
        job_orders = {item.reference_id for item in self.items if item.reference_id}

        for jo_name in job_orders:
            update_job_order_status(jo_name)


def update_job_order_status(job_order_name):
    jo = frappe.get_doc("Job Order", job_order_name)

    total_required = 0
    total_used = 0

    for jo_item in jo.items:
        required_qty = jo_item.qty or 0
        total_required += required_qty

        used_qty = frappe.db.sql("""
			SELECT ABS(SUM(oi.qty))
			FROM `tabOutbound Item` oi
			JOIN `tabOutbound` o ON o.name = oi.parent
			WHERE o.docstatus = 1
			AND oi.reference_id = %s
			AND oi.order_item = %s
			AND oi.item_code = %s
		""", (
			job_order_name, 
			jo_item.name,    
			jo_item.item_code
		))[0][0] or 0

   

        total_used += used_qty

    if total_used == 0:
        jo.status = "Pending"
    elif total_used < total_required:
        jo.status = "Partially Used"
    else:
        jo.status = "Completed"

    jo.save(ignore_permissions=True)




@frappe.whitelist()
def get_job_order_items(job_order):
	
	if isinstance(job_order, str):
		job_order = json.loads(job_order)
	
	items = frappe.get_all(
		'Job Order Item',
		filters={'parent': ['in', job_order]},
		fields=['name', 'parent', 'item_code', 'part_no', 'description', 'hs_code', 'coo', 'ref', 'unit_wt', 'gross_wt', 'qty', 'unit_price']
	)
	
	return items

@frappe.whitelist()
def make_commercial_invoice(order_name):

	order = frappe.get_doc("Outbound", order_name)

	si = frappe.get_doc({
		'doctype': 'Commercial Invoice',
		'posting_date': order.posting_date,
        'ship_to': order.ship_to,
        'ship_from': order.ship_from,
        'currency': order.currency,
        'incoterms': order.incoterms,
		'outbound': order.name,
        'total_units': order.total_qty,
        'total_weight': order.total_gross_wt,
        'subtotal': order.total_value,
        'grand_total': order.total_value,
        

	})
	for item in order.items:
		in_item = si.append("items", {})
		in_item.item = item.item_code
		in_item.qty = item.qty
		in_item.unit_price = item.unit_price
		in_item.part_number = item.part_no
		in_item.hs_code = item.hs_code
		in_item.coo = item.coo
		in_item.weight = item.gross_wt


	si.insert(ignore_permissions=True)

	return si.name