# Copyright (c) 2025, Emeron Infospace and contributors
# For license information, please see license.txt

import frappe

def execute(filters=None):
    columns = get_columns()
    data = get_data(filters)
    return columns, data

def get_columns():
    return [
        {
            "label": "Customer",
            "fieldname": "customer",
            "fieldtype": "Link",
            "options": "Customer",
            "width": 120
        },
        {
            "label": "Supplier",
            "fieldname": "supplier",
            "fieldtype": "Link",
            "options": "Supplier",
            "width": 120
        },
        {
            "label": "Item",
            "fieldname": "item",
            "fieldtype": "Link",
            "options": "Item",
            "width": 120
        },
        {
            "label": "H.S Code",
            "fieldname": "hs_code",
            "fieldtype": "Data",
            "width": 120
        },
        {
            "label": "In Quantity",
            "fieldname": "in_qty",
            "fieldtype": "Float",
            "width": 120
        },
        {
            "label": "In Weight",
            "fieldname": "in_weight",
            "fieldtype": "Float",
            "width": 120
        },
        {
            "label": "In Value",
            "fieldname": "in_value",
            "fieldtype": "Currency",
            "width": 120
        },
        {
            "label": "Out Quantity",
            "fieldname": "out_qty",
            "fieldtype": "Float",
            "width": 120
        },
        {
            "label": "Out Weight",
            "fieldname": "out_weight",
            "fieldtype": "Float",
            "width": 120
        },
        {
            "label": "Out Value",
            "fieldname": "out_value",
            "fieldtype": "Currency",
            "width": 120
        },
        {
            "label": "Balance Quantity",
            "fieldname": "balance_qty",
            "fieldtype": "Float",
            "width": 140
        },
        {
            "label": "Balance Weight",
            "fieldname": "balance_weight",
            "fieldtype": "Float",
            "width": 140
        },
        {
            "label": "Balance Value",
            "fieldname": "balance_value",
            "fieldtype": "Currency",
            "width": 140
        },
        {
            "label": "Posting Date",
            "fieldname": "posting_date",
            "fieldtype": "Date",
            "width": 100
        },
        {
            "label": "Time",
            "fieldname": "time",
            "fieldtype": "Time",
            "width": 100
        },
        {
            "label": "Job Order",
            "fieldname": "reference_id",
            "fieldtype": "Link",
            "options": "Job Order",
            "width": 120
        },
        {
            "label": "Outbound",
            "fieldname": "outbound_id",
            "fieldtype": "Link",
            "options": "Outbound",
            "width": 120
        },
        {
            "label": "Transaction ID",
            "fieldname": "name",
            "fieldtype": "Link",
            "options": "Logistics Transaction",
            "width": 120
        },
    ]

def get_data(filters):
    if not filters:
        filters = {}
    
    query = """
        SELECT
            name,
            customer,
            supplier,
            item,
            hs_code,
            in_qty,
            in_weight,
            in_value,
            out_qty,
            out_weight,
            out_value,
            (IFNULL(in_qty, 0) - IFNULL(out_qty, 0)) as balance_qty,
            (IFNULL(in_weight, 0) - IFNULL(out_weight, 0)) as balance_weight,
            (IFNULL(in_value, 0) - IFNULL(out_value, 0)) as balance_value,
            posting_date,
            time,
            reference_id,
            outbound_id
        FROM `tabLogistics Transaction`
        WHERE docstatus != 2
    """
    
    if filters.get("customer"):
        query += f" AND customer = {frappe.db.escape(filters['customer'])}"
    
    if filters.get("supplier"):
        query += f" AND supplier = {frappe.db.escape(filters['supplier'])}"
    
    if filters.get("item"):
        query += f" AND item = {frappe.db.escape(filters['item'])}"
    
    if filters.get("status"):
        query += f" AND status = {frappe.db.escape(filters['status'])}"
    
    if filters.get("from_date"):
        query += f" AND posting_date >= {frappe.db.escape(filters['from_date'])}"
    
    if filters.get("to_date"):
        query += f" AND posting_date <= {frappe.db.escape(filters['to_date'])}"
        
    if filters.get("reference_id"):
        query += f" AND reference_id = {frappe.db.escape(filters['reference_id'])}"
    
    query += " ORDER BY posting_date DESC, time DESC"
    
    data = frappe.db.sql(query, as_dict=True)
    
    return data
