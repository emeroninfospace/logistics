# Copyright (c) 2025, Emeron Infospace and contributors
# For license information, please see license.txt


import frappe
from frappe.model.document import Document
from frappe import _
from frappe.utils import flt
from frappe.utils.xlsxutils import build_xlsx_response
from frappe.utils.xlsxutils import (
	read_xls_file_from_attached_file,
	read_xlsx_file_from_attached_file,
)
import json

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
            qty = float(item.qty) if item.qty else 0
            gross = float(item.gross_wt) if item.gross_wt else 0
            value = float(item.total_value) if item.total_value else 0
            unit_value = float(item.total_value) / float(item.qty)
            unit_wt = float(item.gross_wt) / float(item.qty)

            total_qty += qty
            total_gross += gross
            total_value += value
            item.unit_wt = unit_wt
            item.unit_price = unit_value

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


@frappe.whitelist()
def downlode_file(free_list=None):
	parent_doc = frappe.get_meta("Inbound Item")
	label=[]
	for field in parent_doc.fields:
		if field and field.fieldtype not in ['Section Break','Column Break'] and field.fieldname!="full_name":
			label.append(field.fieldname)
	data = [label]
	if free_list:
		free_list = json.loads(free_list)
		if not free_list:
			free_list = []
		for entry in free_list:
			row = []
			for header in data[0]:
				if header in entry:
					row.append(entry[header])
				else:
					row.append("")
			data.append(row)
	build_xlsx_response(data, "Inbound")

@frappe.whitelist()
def upload_file(data,free_list=None):
	import json
	if free_list:
		free_list = json.loads(free_list)
	data = json.loads(data)
	if "file_url" not in data: 
             frappe.throw(_("File URL missing in upload data"))

	df = read_xlsx_file_from_attached_file(file_url=data.get("file_url"))
	
	if not df:
		return [], []

	header = df[0]
	formatted_data = [dict(zip(header, row)) for row in df[1:] if row and any(row)]
	
	cleaned_data = []
	for row in formatted_data:
		cleaned_row = {}
		for key, value in row.items():
			if is_integer(value):
				cleaned_row[key] = str(value).strip()
			else:
				cleaned_row[key] = value
		cleaned_data.append(cleaned_row)
	
	return cleaned_data, header

def is_integer(value):
	return isinstance(value, int)

