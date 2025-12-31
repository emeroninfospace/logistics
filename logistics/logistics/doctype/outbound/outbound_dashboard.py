import frappe
from frappe import _

def get_data():
	return {
		"fieldname": "outbound",		
		"internal_links": {
			"Commercial Invoice": ["items", "outbound"],
			"Job Order": ["items", "reference_id"]
			
        },
		"transactions": [
			{"label": _("Reference"), "items": ["Commercial Invoice"]},
			{"label": _("Transactions"), "items": ["Job Order"]},
						
		]
    }