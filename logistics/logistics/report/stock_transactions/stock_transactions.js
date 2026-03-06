// Copyright (c) 2025, Emeron Infospace and contributors
// For license information, please see license.txt

frappe.query_reports["Stock Transactions"] = {
	"filters": [
		{
		"fieldname": "customer",
		"fieldtype": "Link",
		"label": "Customer",
		"options": "Customer"
		},
		{
		"fieldname": "supplier",
		"fieldtype": "Link",
		"label": "Supplier",
		"options": "Supplier"
		},
		{
		"fieldname": "item",
		"fieldtype": "Link",
		"label": "Item",
		"options": "Item"
		},
		{
		"fieldname": "status",
		"fieldtype": "Select",
		"label": "Status",
		"options": "\nIn\nOut\nPartially Out"
		},
		{
		"fieldname": "from_date",
		"fieldtype": "Date",
		"label": "From Date"
		},
		{
		"fieldname": "to_date",
		"fieldtype": "Date",
		"label": "To Date"
		},
		{
		"fieldname": "reference_id",
		"fieldtype": "Link",
		"label": "Inbound",
		"options": "Inbound"
		},

	]
};
