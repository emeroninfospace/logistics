# Copyright (c) 2026, Emeron Infospace and contributors
# For license information, please see license.txt

import frappe
from frappe.utils import flt

def execute(filters=None):
    columns = get_columns()
    data = get_data(filters)
    return columns, data

def get_columns():
    return [
        {"label": "Date", "fieldname": "date", "fieldtype": "Date", "width": 200},
        {"label": "Customer", "fieldname": "customer", "fieldtype": "Link", "options": "Customer", "width": 180},
        {"label": "Inbound ID", "fieldname": "inbound_id", "fieldtype": "Link", "options": "Inbound", "width": 140},
        {"label": "Invoice Number", "fieldname": "reference_no", "fieldtype": "Data", "width": 150},
        {"label": "Quantity", "fieldname": "quantity", "fieldtype": "Float", "width": 100},
        {"label": "Amount", "fieldname": "amount", "fieldtype": "Currency", "width": 120},
        {"label": "Charges", "fieldname": "charges", "fieldtype": "Currency", "width": 120},
    ]

def get_data(filters):
    conditions = []
    values = {}

    if filters.get("from_date"):
        conditions.append("i.posting_date >= %(from_date)s")
        values["from_date"] = filters.get("from_date")

    if filters.get("to_date"):
        conditions.append("i.posting_date <= %(to_date)s")
        values["to_date"] = filters.get("to_date")

    if filters.get("customer"):
        conditions.append("i.customer = %(customer)s")
        values["customer"] = filters.get("customer")

    if filters.get("reference_no"):
        conditions.append("i.ref = %(reference_no)s")
        values["reference_no"] = filters.get("reference_no")

    condition_sql = " and ".join(conditions)
    if condition_sql:
        condition_sql = "where " + condition_sql

    rows = frappe.db.sql(
        f"""
        select
            i.posting_date as date,
            i.customer as customer,
            i.name as inbound_id,
            i.ref as reference_no,
            sum(ii.qty) as quantity,
            sum(ii.qty * ii.unit_price) as amount
        from `tabInbound` i
        join `tabInbound Item` ii on ii.parent = i.name
        {condition_sql}
        group by i.name
        order by i.posting_date desc
        """,
        values,
        as_dict=True
    )

    for row in rows:
        charge_percentage = frappe.db.get_value(
            "Customer",
            row.customer,
            "custom_charge_percentage"
        ) or 0

        row.charges = flt(row.amount) * flt(charge_percentage) / 100

    return rows
