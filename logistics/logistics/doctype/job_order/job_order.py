# Copyright (c) 2025, Emeron Infospace and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class JobOrder(Document):
	def before_submit(self):
		for item in self.items:
			logistics_transaction = frappe.get_doc({
				'doctype': 'Logistics Transaction',
				'customer': self.customer,
				'item': item.item_code,
				'hs_code': item.hs_code,
				'posting_date': self.posting_date,
				'status': 'In', 
				'qty': item.qty,
				'weight': item.gross_wt,
				'value': item.total_value,
				'reference_id': self.name
			})
			logistics_transaction.insert(ignore_permissions=True)

	def before_cancel(self):
		logistics_transactions = frappe.get_list(
			'Logistics Transaction',
			filters={
				'reference_id': self.name,
			}
		)
		for lt in logistics_transactions:
			frappe.delete_doc('Logistics Transaction', lt.name, ignore_permissions=True)

@frappe.whitelist()
def make_outbound(order_name):

    order = frappe.get_doc("Job Order", order_name)

    si = frappe.get_doc({
        'doctype': 'Outbound',
        'posting_date': order.posting_date,
        'job_type': order.job_type
    })

    for item in order.items:
        in_item = si.append("items", {})
        in_item.item_code = item.item_code
        in_item.qty = item.qty
        in_item.part_no = item.part_no
        in_item.unit_price = item.unit_price
        in_item.hs_code = item.hs_code
        in_item.unit_wt = item.unit_wt
        in_item.gross_wt = item.gross_wt
        in_item.coo = item.coo
        in_item.reference_id = order.name
        in_item.ref = item.ref
        in_item.description = item.description

    si.insert(ignore_permissions=True)

    return si.name
