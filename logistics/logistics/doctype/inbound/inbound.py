# Copyright (c) 2025, Emeron Infospace and contributors
# For license information, please see license.txt


import frappe
from frappe.model.document import Document
from frappe import _
from frappe.utils import flt


class Inbound(Document):
    def before_save(self):
        self.calculate_totals()
    
    def before_submit(self):
        self.status = "Pending"
        for item in self.items:
            logistics_transaction = frappe.get_doc({
                'doctype': 'Logistics Transaction',
                'customer': self.customer,
                'item': item.item_code,
                'hs_code': item.hs_code,
                'posting_date': self.posting_date,
                'in_qty': item.qty,
                'in_weight': item.gross_wt,
                'in_value': item.total_value,
                'reference_id': self.name,
                'order_item': item.name
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
    
    def calculate_totals(self):
        total_qty = 0
        total_value = 0
        total_gross = 0
        
        for item in self.items:
            total_qty += item.qty or 0
            total_gross += item.gross_wt or 0
            total_value += item.total_value or 0
        
        self.total_qty = total_qty
        self.total_gross_wt = total_gross
        self.total_value = total_value


@frappe.whitelist()
def make_outbound(order_name):
    order = frappe.get_doc("Inbound", order_name)

    si = frappe.new_doc("Outbound")
    si.posting_date = order.posting_date
    si.job_type = order.job_type
    si.cargo_chanel = order.cargo_chanel
    total_qty = 0
    total_value = 0
    total_gross_wt = 0

    processed_map = frappe.db.sql(
        """
        SELECT order_item, SUM(qty) AS processed_qty
        FROM `tabOutbound Item`
        WHERE reference_id = %s
          AND parent IN (
              SELECT name FROM `tabOutbound`
              WHERE docstatus != 2
          )
        GROUP BY order_item
        """,
        order_name,
        as_dict=True
    )

    processed_qty_dict = {
        d.order_item: flt(d.processed_qty) for d in processed_map
    }

    for item in order.items:
        processed_qty = processed_qty_dict.get(item.name, 0)
        remaining_qty = flt(item.qty) - processed_qty

        if remaining_qty <= 0:
            continue

        line_value = remaining_qty * flt(item.unit_price)
        line_gross_wt = remaining_qty * flt(item.unit_wt)

        si.append("items", {
            "item_code": item.item_code,
            "qty": remaining_qty,
            "part_no": item.part_no,
            "uom":item.uom,
            "unit_price": item.unit_price,
            "hs_code": item.hs_code,
            "unit_wt": item.unit_wt,
            "gross_wt": line_gross_wt,
            "coo": item.coo,
            "reference_id": order.name,
            "order_item": item.name,
            "ref": item.ref,
            "description": item.description,
            "boe_no": order.boe_no,
            "total_value": line_value,
        })
        total_qty += remaining_qty
        total_value += line_value
        total_gross_wt += line_gross_wt

    si.total_qty = total_qty
    si.total_value = total_value
    si.total_gross_wt = total_gross_wt

    if not si.items:
        frappe.msgprint(_("No items to outbound. All items already outbounded."))
        return None

    si.insert(ignore_permissions=True)
    return si.name
