# Copyright (c) 2025, Emeron Infospace and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class JobOrder(Document):
	pass

@frappe.whitelist()
def make_sales_invoice(order_name):

    order = frappe.get_doc("Job Order", order_name)
  
    si = frappe.get_doc({
        'doctype': 'Sales Invoice',
        'posting_date': order.posting_date,
        'company': order.company,
        'customer': order.customer
    })
    for item in order.items:
        in_item = si.append("items", {})
        in_item.item_code = item.item_code
        in_item.qty = item.qty
        in_item.rate = item.unit_price

    si.insert(ignore_permissions=True)

    return si.name