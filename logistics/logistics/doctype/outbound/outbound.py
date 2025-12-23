# Copyright (c) 2025, Emeron Infospace and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
import json
		


class Outbound(Document):
	def on_submit(self):
		for item in self.items:
			exists = frappe.db.exists('Logistics Transaction', {
				'reference_id': item.reference_id,
				'item': item.item_code
			})
			if exists:
				continue

			customer = None
			if getattr(item, 'reference_id', None):
				try:
					jo = frappe.get_doc('Job Order', item.reference_id)
					customer = jo.customer
				except Exception:
					customer = None

			qty = -(abs(item.qty or 0))
			value = -(abs(item.total_value or 0))
			

			logistics_transaction = frappe.get_doc({
				'doctype': 'Logistics Transaction',
				'customer': customer,
				'item': item.item_code,
				'hs_code': getattr(item, 'hs_code', None) or None,
				'posting_date': self.posting_date,
				'status': 'Out',
				'qty': qty,
				'weight': -(abs(getattr(item, 'gross_wt', 0) or 0)),
				'value': value,
				'reference_id': item.reference_id
			})
			try:
				logistics_transaction.insert(ignore_permissions=True)
			except Exception as e:
				frappe.logger().error(f"Failed to insert Logistics Transaction for Outbound {self.name}, item {item.item_code}: {e}")

	def before_cancel(self):
		for item in self.items:
			logistics_transactions = frappe.get_list(
				'Logistics Transaction',
				filters={
					'reference_id': item.reference_id,
				},
				pluck='name'
			)
			for lt_name in logistics_transactions:
				try:
					frappe.delete_doc('Logistics Transaction', lt_name, ignore_permissions=True)
				except Exception as e:
					frappe.logger().error(f"Failed to delete Logistics Transaction {lt_name} for Outbound {self.name}: {e}")

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